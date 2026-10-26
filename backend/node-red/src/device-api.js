// ============================================================
// Smart Office — API dos dispositivos v2 (função Node-RED)
// Usada apenas pelos ESP32. Contrato compatível com SmartOffice_ESP32_RC522_v2.
//
// Entrada 1: http in   | Entrada 2: saída do nó MySQL
// Saída 1: MySQL       | Saída 2: http response
//
// Autenticação do dispositivo: se o dispositivo tiver credencial gerada no
// painel, o cabeçalho X-Device-Key tem de corresponder (SHA-256). Dispositivos
// sem credencial continuam a funcionar (modo de transição), mas aparecem no
// painel como "Sem credencial".
// ============================================================

const crypto = global.get('crypto');
const ONLINE_THROTTLE_SEC = 20;
const OFFICE_OFFSET_MIN = (() => {
  const v = parseInt(env.get('SMART_OFFICE_UTC_OFFSET_MINUTES'), 10);
  return Number.isInteger(v) && Math.abs(v) <= 840 ? v : -60;
})();
const OFFX = `(${OFFICE_OFFSET_MIN} - TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()))`;

function respond(status, body) {
  msg.statusCode = status;
  msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  msg.payload = body;
  delete msg.topic;
  return [null, msg];
}

function query(sql, params, next) {
  msg._dev.step = next;
  msg.topic = sql;
  msg.payload = params || [];
  return [msg, null];
}

const str = (v, max) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const bool = (v) => v === true || v === 1 || v === '1';

// Verifica a chave do dispositivo contra a linha de access_devices
function keyOk(row) {
  if (!row || !row.credentialHash) return true;
  const key = String((msg.req.headers || {})['x-device-key'] || '');
  if (!key || !crypto) return false;
  const digest = crypto.createHash('sha256').update(key).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(row.credentialHash)));
}

const DEVICE_ROW = `
SELECT device_id AS deviceId, hardware_id AS hardwareId, approval_status AS approvalStatus, active,
       door_id AS doorId, credential_hash AS credentialHash
  FROM access_devices WHERE device_id = ?`;

// Janela horária diária (aceita janelas que atravessam a meia-noite)
function insideWindow(now, from, to) {
  if (!from || !to) return true;
  const t = String(now).slice(0, 8);
  const f = String(from).slice(0, 8);
  const e = String(to).slice(0, 8);
  return f <= e ? (t >= f && t <= e) : (t >= f || t <= e);
}

const ROUTES = {

  // Heartbeat / registo do próprio ESP32 (chamado a cada 60 s)
  'POST /api/device/register'(step, rows, ctx, b) {
    if (step === 'start') {
      ctx.deviceId = str(b.deviceId, 64);
      ctx.hardwareId = str(b.hardwareId, 100);
      if (!ctx.deviceId || !ctx.hardwareId) return respond(400, { success: false, error: 'deviceId_and_hardwareId_required' });
      return query(DEVICE_ROW, [ctx.deviceId], 'upsert');
    }
    if (step === 'upsert') {
      const d = rows[0];
      const rssi = Number.isFinite(Number(b.wifiRssi)) ? Number(b.wifiRssi) : null;
      if (!d) {
        // Dispositivo desconhecido: fica pendente até ser aprovado no painel
        ctx.state = { approvalStatus: 'pending', active: false, doorId: null };
        return query(`
INSERT INTO access_devices (device_id, hardware_id, name, door_id, device_type, approval_status, active, online,
                            firmware_version, ip_address, wifi_rssi, readers, last_seen)
VALUES (?, ?, ?, NULL, 'esp32_rfid', 'pending', 0, 1, ?, ?, ?, 'outside', NOW())`,
        [ctx.deviceId, ctx.hardwareId, str(b.name, 100) || ctx.deviceId, str(b.firmwareVersion, 40) || null,
          str(b.ipAddress, 45) || null, rssi], 'done');
      }
      if (!keyOk(d)) return respond(401, { success: false, error: 'device_auth_failed' });
      if (d.hardwareId && d.hardwareId.toUpperCase() !== ctx.hardwareId.toUpperCase()) {
        node.warn(`Hardware diferente para ${ctx.deviceId}: esperado ${d.hardwareId}, recebido ${ctx.hardwareId}`);
        return respond(409, { success: false, error: 'hardware_mismatch' });
      }
      ctx.state = { approvalStatus: d.approvalStatus, active: bool(d.active), doorId: d.doorId };
      // Nunca reativa nem renomeia: o estado administrativo pertence ao painel
      return query(`
UPDATE access_devices
   SET online = 1, last_seen = NOW(), hardware_id = COALESCE(hardware_id, ?),
       firmware_version = ?, ip_address = ?, wifi_rssi = ?
 WHERE device_id = ?`, [ctx.hardwareId, str(b.firmwareVersion, 40) || null, str(b.ipAddress, 45) || null, rssi, ctx.deviceId], 'done');
    }
    const s = ctx.state;
    return respond(200, { success: true, registered: true, deviceId: ctx.deviceId, doorId: s.doorId,
      approved: s.approvalStatus === 'approved', active: s.approvalStatus === 'approved' && s.active, approvalStatus: s.approvalStatus });
  },

  // Polling de comandos (a cada 2 s). Atualiza o heartbeat no máximo a cada 20 s.
  'GET /api/device/:deviceId/command'(step, rows, ctx) {
    if (step === 'start') {
      ctx.deviceId = str(msg.req.params.deviceId, 64);
      if (!ctx.deviceId) return respond(400, { success: false, error: 'device_required' });
      return query(`
SELECT d.device_id AS deviceId, d.approval_status AS approvalStatus, d.active, d.credential_hash AS credentialHash,
       q.id AS registrationId, q.reader_id AS readerId
  FROM access_devices d
  LEFT JOIN access_registration_requests q
    ON q.device_id = d.device_id AND q.status = 'waiting_card' AND q.expires_at > NOW()
 WHERE d.device_id = ?
 ORDER BY q.created_at ASC LIMIT 1`, [ctx.deviceId], 'touch');
    }
    if (step === 'touch') {
      const d = rows[0];
      if (!d) return respond(404, { success: false, error: 'device_not_registered' });
      if (!keyOk(d)) return respond(401, { success: false, error: 'device_auth_failed' });
      ctx.command = d.approvalStatus === 'approved' && bool(d.active) && d.registrationId
        ? { type: 'REGISTER_CARD', registrationId: d.registrationId, readerId: d.readerId }
        : null;
      return query(`UPDATE access_devices SET online = 1, last_seen = NOW()
 WHERE device_id = ? AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL ${ONLINE_THROTTLE_SEC} SECOND)`, [ctx.deviceId], 'done');
    }
    return respond(200, { success: true, command: ctx.command });
  },

  // O ESP32 leu o cartão durante um registo
  'POST /api/access/register/card'(step, rows, ctx, b) {
    if (step === 'start') {
      ctx.registrationId = str(b.registrationId, 80);
      ctx.deviceId = str(b.deviceId, 64);
      ctx.uid = str(b.uid, 50).toUpperCase();
      if (!ctx.registrationId || !ctx.deviceId || !/^[0-9A-F]{4,32}$/.test(ctx.uid)) {
        return respond(400, { success: false, registered: false, error: 'registrationId_deviceId_uid_required' });
      }
      return query(DEVICE_ROW, [ctx.deviceId], 'call');
    }
    if (step === 'call') {
      if (!rows[0]) return respond(404, { success: false, registered: false, error: 'device_not_registered' });
      if (!keyOk(rows[0])) return respond(401, { success: false, registered: false, error: 'device_auth_failed' });
      return query('CALL register_access_card(?, ?, ?, ?)', [ctx.registrationId, ctx.deviceId, str(b.readerId, 20) || 'outside', ctx.uid], 'done');
    }
    const find = (v) => {
      if (Array.isArray(v)) { for (const item of v) { const f = find(item); if (f) return f; } return null; }
      return v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'success') ? v : null;
    };
    const r = find(rows);
    if (!r) return respond(500, { success: false, registered: false, error: 'invalid_database_response' });
    if (Number(r.success) !== 1) {
      const status = r.error_code === 'card_already_registered' ? 409 : r.error_code === 'database_error' ? 500 : 404;
      return respond(status, { success: false, registered: false, error: r.error_code || 'registration_failed' });
    }
    return respond(201, { success: true, registered: true, registrationId: ctx.registrationId, uid: r.uid,
      user: { id: r.user_id, name: r.name }, cardId: r.card_id, doorId: r.door_id });
  },

  // Decisão de acesso (cartão aproximado fora do modo de registo)
  'POST /api/access/card'(step, rows, ctx, b) {
    if (step === 'start') {
      ctx.req = { deviceId: str(b.deviceId, 64), readerId: str(b.readerId, 20), uid: str(b.uid, 50).toUpperCase() };
      if (!ctx.req.deviceId || !ctx.req.readerId || !ctx.req.uid) {
        return respond(400, { success: false, authorized: false, action: 'deny', reason: 'invalid_request' });
      }
      return query(`
SELECT d.device_id AS deviceId, d.door_id AS doorId, d.active AS deviceActive, d.approval_status AS approvalStatus,
       d.credential_hash AS credentialHash,
       c.id AS cardId, c.active AS cardActive, u.id AS userId, u.name, u.active AS userActive,
       p.can_enter AS canEnter, p.can_exit AS canExit, p.time_from AS timeFrom, p.time_to AS timeTo,
       TIME(NOW() + INTERVAL ${OFFX} MINUTE) AS officeTime
  FROM access_devices d
  LEFT JOIN access_cards c ON c.uid = ?
  LEFT JOIN access_users u ON u.id = c.user_id
  LEFT JOIN access_permissions p ON p.card_id = c.id AND p.door_id = d.door_id
 WHERE d.device_id = ? LIMIT 1`, [ctx.req.uid, ctx.req.deviceId], 'done');
    }
    const r = ctx.req;
    const deny = (reason, user) => respond(200, { success: true, authorized: false, action: 'deny', led: 'red', buzzer: 'deny',
      reason, uid: r.uid, deviceId: r.deviceId, readerId: r.readerId, user: user || null });
    const c = rows[0];
    if (!c) return deny('device_not_registered');
    if (!keyOk(c)) return respond(401, { success: false, authorized: false, action: 'deny', reason: 'device_auth_failed' });
    if (c.approvalStatus !== 'approved' || !bool(c.deviceActive)) return deny('device_disabled');
    if (!c.cardId) return deny('card_not_found');
    if (!bool(c.cardActive)) return deny('card_disabled');
    if (!bool(c.userActive)) return deny('user_disabled', c.name);
    const allowed = (r.readerId === 'outside' && bool(c.canEnter)) || (r.readerId === 'inside' && bool(c.canExit));
    if (!allowed) return deny('permission_denied', c.name);
    if (!insideWindow(c.officeTime, c.timeFrom, c.timeTo)) return deny('outside_schedule', c.name);
    return respond(200, { success: true, authorized: true, action: 'open', duration: 4000, led: 'green', buzzer: 'success',
      uid: r.uid, deviceId: r.deviceId, readerId: r.readerId, doorId: c.doorId, user: { id: c.userId, name: c.name } });
  },

  // Registo de auditoria enviado pelo ESP32 depois de cada decisão
  'POST /api/access/event'(step, rows, ctx, b) {
    if (step === 'start') {
      ctx.deviceId = str(b.deviceId, 64);
      ctx.decision = str(b.decision, 20);
      if (!ctx.deviceId || !['granted', 'denied', 'error'].includes(ctx.decision)) {
        return respond(400, { success: false, error: 'invalid_event' });
      }
      return query(DEVICE_ROW, [ctx.deviceId], 'insert');
    }
    if (step === 'insert') {
      const d = rows[0];
      if (!d) return respond(404, { success: false, error: 'device_not_registered' });
      if (!keyOk(d)) return respond(401, { success: false, error: 'device_auth_failed' });
      const uid = str(b.uid, 50).toUpperCase() || null;
      ctx.duplicateOk = true;
      return query(`
INSERT INTO access_logs (event_id, uid, device_id, reader_id, door_id, decision, reason, source, user_id, card_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?,
        (SELECT user_id FROM access_cards WHERE uid = ? LIMIT 1),
        (SELECT id FROM access_cards WHERE uid = ? LIMIT 1))`,
      [str(b.eventId, 120) || null, uid, ctx.deviceId, str(b.readerId, 20) || null, d.doorId || str(b.doorId, 100) || null,
        ctx.decision, str(b.reason, 120) || null, str(b.source, 20) || 'rfid', uid, uid], 'done');
    }
    return respond(200, { success: true, logged: true });
  },

  'GET /api/health'() {
    return respond(200, { success: true, service: 'smart-office-access', status: 'online', timestamp: new Date().toISOString() });
  },
};

if (!msg._dev) {
  const route = `${String(msg.req.method || '').toUpperCase()} ${msg.req.route && msg.req.route.path}`;
  if (!ROUTES[route]) return respond(404, { success: false, error: 'not_found' });
  const body = msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload) ? msg.payload : {};
  msg._dev = { route, step: 'start', ctx: {}, body };
}

const dev = msg._dev;
return ROUTES[dev.route](dev.step, dev.step === 'start' ? [] : msg.payload, dev.ctx, dev.body);
