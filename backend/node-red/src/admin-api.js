// ============================================================
// Smart Office — Admin API v4 (função Node-RED)
//
// Entrada 1: http in (pedido do painel)   → valida sessão e inicia a rota
// Entrada 2: saída do nó MySQL            → continua a rota no passo seguinte
// Saída 1: nó MySQL (msg.topic = SQL, msg.payload = parâmetros)
// Saída 2: http response
//
// Sessão: igual ao fluxo v3 — cookie "smart_office_admin" (64 hex) cujo
// SHA-256 é chave de global "smartOfficeAdminSessions" → expiração (ms).
// Escritas: só aceites de origens explícitas (cabeçalho Origin).
// ============================================================

const crypto = global.get('crypto');

const ALLOWED_ORIGINS = String(env.get('SMART_OFFICE_ALLOWED_ORIGINS') || 'https://smart-office-self.vercel.app')
  .split(',').map((s) => s.trim()).filter(Boolean);
const ONLINE_WINDOW_SEC = 90;
const OFFICE_OFFSET_MIN = (() => {
  const v = parseInt(env.get('SMART_OFFICE_UTC_OFFSET_MINUTES'), 10);
  return Number.isInteger(v) && Math.abs(v) <= 840 ? v : -60; // Cabo Verde: UTC-1
})();
const REGISTRATION_TTL_SEC = 120;

// Converte uma coluna DATETIME/TIMESTAMP da sessão MySQL para a hora do escritório
const OFFX = `(${OFFICE_OFFSET_MIN} - TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()))`;
const local = (col) => `(${col} + INTERVAL ${OFFX} MINUTE)`;

// ------------------------------------------------------------
// Utilitários
// ------------------------------------------------------------

function respond(status, body, headers) {
  msg.statusCode = status;
  msg.headers = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers || {});
  msg.payload = body;
  delete msg.topic;
  return [null, msg];
}

function fail(status, error, message, extra) {
  return respond(status, Object.assign({ success: false, error, message }, extra || {}));
}

function query(sql, params, next) {
  msg._api.step = next;
  msg.topic = sql;
  msg.payload = params || [];
  return [msg, null];
}

const bool = (v) => v === true || v === 1 || v === '1';
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isId = (v) => /^[a-z0-9][a-z0-9._-]{1,79}$/.test(v);
const isDeviceId = (v) => /^[a-z0-9][a-z0-9._-]{2,63}$/.test(v);
const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const posInt = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};
const affected = (rows) => Number(rows && rows.affectedRows) || 0;

function readersCsv(value) {
  if (!Array.isArray(value)) return null;
  const list = [...new Set(value.filter((r) => r === 'outside' || r === 'inside'))];
  return list.length ? list.join(',') : null;
}

function configJson(value) {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const json = JSON.stringify(value);
  return json.length <= 4000 ? json : undefined;
}

function parseJson(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function audit(action, target, details, response) {
  msg._api.response = response;
  msg._api.auditing = true;
  const headers = msg.req.headers || {};
  return query(
    'INSERT INTO access_admin_audit (session_ref, action, target, details, ip, origin) VALUES (?, ?, ?, ?, ?, ?)',
    [msg._api.sessionRef, action, target ? String(target).slice(0, 120) : null, details ? JSON.stringify(details).slice(0, 4000) : null,
      String(headers['x-forwarded-for'] || msg.req.ip || '').split(',')[0].trim().slice(0, 64), String(headers.origin || '').slice(0, 190)],
    'auditDone'
  );
}

// ------------------------------------------------------------
// SQL partilhado
// ------------------------------------------------------------

const DEVICE_SELECT = `
SELECT d.id, d.device_id AS deviceId, d.name, d.device_type AS type, t.label AS typeLabel,
       COALESCE(t.rfid_capable, 0) AS rfidCapable, d.door_id AS roomId, r.name AS roomName,
       d.hardware_id AS hardwareId, d.description, d.approval_status AS approvalStatus, d.active,
       d.readers, d.config, d.firmware_version AS firmwareVersion, d.ip_address AS ipAddress,
       d.wifi_rssi AS wifiRssi, d.last_seen AS lastSeen,
       TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) AS secondsSinceSeen,
       (d.last_seen IS NOT NULL AND d.last_seen >= NOW() - INTERVAL ${ONLINE_WINDOW_SEC} SECOND) AS online,
       (d.credential_hash IS NOT NULL) AS hasCredential, d.credential_created_at AS credentialCreatedAt,
       d.created_at AS createdAt
  FROM access_devices d
  LEFT JOIN access_device_types t ON t.id = d.device_type
  LEFT JOIN access_rooms r ON r.id = d.door_id`;

function formatDevice(d) {
  return {
    id: d.id,
    deviceId: d.deviceId,
    name: d.name,
    type: d.type,
    typeLabel: d.typeLabel || d.type,
    rfidCapable: bool(d.rfidCapable),
    roomId: d.roomId,
    roomName: d.roomName || d.roomId,
    hardwareId: d.hardwareId,
    description: d.description,
    approvalStatus: d.approvalStatus,
    active: bool(d.active),
    online: bool(d.online),
    readers: d.readers ? String(d.readers).split(',').filter(Boolean) : [],
    config: parseJson(d.config, {}),
    firmwareVersion: d.firmwareVersion,
    ipAddress: d.ipAddress,
    wifiRssi: d.wifiRssi,
    lastSeen: d.lastSeen,
    secondsSinceSeen: d.secondsSinceSeen === null || d.secondsSinceSeen === undefined ? null : Number(d.secondsSinceSeen),
    hasCredential: bool(d.hasCredential),
    credentialCreatedAt: d.credentialCreatedAt,
    createdAt: d.createdAt,
  };
}

const LOG_FROM = `
  FROM access_logs l
  LEFT JOIN access_cards c ON c.uid = l.uid
  LEFT JOIN access_users u ON u.id = COALESCE(l.user_id, c.user_id)
  LEFT JOIN access_rooms r ON r.id = l.door_id`;

const LOG_COLUMNS = `
SELECT l.id, l.created_at AS timestamp, COALESCE(l.user_id, c.user_id) AS userId, l.uid,
       l.device_id AS deviceId, l.reader_id AS readerId, l.door_id AS roomId,
       COALESCE(r.name, l.door_id) AS roomName, l.decision AS result, l.reason, l.source,
       u.name AS userName`;

function logFilters(q) {
  const where = [];
  const params = [];
  const add = (sql, ...values) => { where.push(sql); params.push(...values); };
  const text = str(q.q, 80);
  if (text) add('u.name LIKE ?', `%${text}%`);
  if (posInt(q.userId)) add('COALESCE(l.user_id, c.user_id) = ?', posInt(q.userId));
  if (str(q.roomId, 100)) add('l.door_id = ?', str(q.roomId, 100));
  if (str(q.deviceId, 64)) add('l.device_id = ?', str(q.deviceId, 64));
  if (q.readerId === 'outside' || q.readerId === 'inside') add('l.reader_id = ?', q.readerId);
  if (q.direction === 'in') add("l.reader_id = 'outside'");
  if (q.direction === 'out') add("l.reader_id = 'inside'");
  if (q.result === 'allowed') add("l.decision = 'granted'");
  if (q.result === 'denied') add("l.decision = 'denied'");
  if (isDate(q.dateFrom)) add(`DATE(${local('l.created_at')}) >= ?`, q.dateFrom);
  if (isDate(q.dateTo)) add(`DATE(${local('l.created_at')}) <= ?`, q.dateTo);
  if (isTime(q.timeFrom)) add(`TIME(${local('l.created_at')}) >= ?`, `${q.timeFrom}:00`);
  if (isTime(q.timeTo)) add(`TIME(${local('l.created_at')}) <= ?`, `${q.timeTo}:59`);
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function officeDateParts(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return ['', ''];
  const shifted = new Date(d.getTime() + OFFICE_OFFSET_MIN * 60000).toISOString();
  return [`${shifted.slice(8, 10)}/${shifted.slice(5, 7)}/${shifted.slice(0, 4)}`, shifted.slice(11, 16)];
}

function page(q) {
  const p = Math.max(1, Math.min(100000, parseInt(q.page, 10) || 1));
  const size = Math.max(1, Math.min(200, parseInt(q.pageSize, 10) || 10));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

// ------------------------------------------------------------
// Rotas: cada uma recebe (step, rows, ctx) e devolve query(...) ou respond(...)
// ------------------------------------------------------------

const ROUTES = {

  // ---------------- Dashboard ----------------
  'GET /api/access/dashboard'(step, rows, ctx) {
    if (step === 'start') {
      const today = `DATE(${local('created_at')}) = DATE(${local('NOW()')})`;
      return query(`
SELECT
 (SELECT COUNT(*) FROM access_users WHERE active = 1) AS activeUsers,
 (SELECT COUNT(*) FROM access_logs WHERE decision = 'granted' AND reader_id = 'outside' AND ${today}) AS entriesToday,
 (SELECT COUNT(*) FROM access_logs WHERE decision = 'granted' AND reader_id = 'inside' AND ${today}) AS exitsToday,
 (SELECT COUNT(*) FROM access_logs WHERE decision = 'denied' AND ${today}) AS deniedToday,
 (SELECT COUNT(*) FROM access_devices WHERE approval_status = 'approved' AND active = 1
     AND last_seen >= NOW() - INTERVAL ${ONLINE_WINDOW_SEC} SECOND) AS devicesOnline,
 (SELECT COUNT(*) FROM access_devices WHERE approval_status = 'approved' AND active = 1
     AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL ${ONLINE_WINDOW_SEC} SECOND)) AS devicesOffline,
 (SELECT COUNT(*) FROM access_devices WHERE approval_status = 'pending') AS devicesPending,
 (SELECT COUNT(*) FROM access_rooms) AS doorsCount`, [], 'recent');
    }
    if (step === 'recent') {
      const r = rows[0] || {};
      ctx.stats = {};
      Object.keys(r).forEach((k) => { ctx.stats[k] = Number(r[k]) || 0; });
      return query(`${LOG_COLUMNS} ${LOG_FROM} ORDER BY l.created_at DESC, l.id DESC LIMIT 8`, [], 'cards');
    }
    if (step === 'cards') {
      ctx.recent = rows;
      return query(`
SELECT c.id, c.uid, c.active, c.created_at AS createdAt, u.id AS userId, u.name AS userName
  FROM access_cards c LEFT JOIN access_users u ON u.id = c.user_id
 ORDER BY c.created_at DESC, c.id DESC LIMIT 5`, [], 'done');
    }
    return respond(200, { success: true, stats: ctx.stats, recent: ctx.recent, recentCards: rows });
  },

  // ---------------- Utilizadores ----------------
  'GET /api/access/users'(step, rows, ctx, req) {
    const q = req.query;
    if (step === 'start') {
      const status = String(q.status || '');
      if (!['', 'active', 'inactive'].includes(status)) return fail(400, 'validation_error', 'Filtro de estado inválido.');
      const text = str(q.q, 80);
      ctx.where = ` WHERE (u.name LIKE ? OR COALESCE(u.contact, '') LIKE ?)
        AND (? = '' OR (? = 'active' AND u.active = 1) OR (? = 'inactive' AND u.active = 0))`;
      ctx.params = [`%${text}%`, `%${text}%`, status, status, status];
      if (posInt(q.id)) { ctx.where += ' AND u.id = ?'; ctx.params.push(posInt(q.id)); }
      ctx.page = page(q);
      return query(`SELECT COUNT(*) AS total FROM access_users u ${ctx.where}`, ctx.params, 'list');
    }
    if (step === 'list') {
      ctx.total = Number(rows[0] && rows[0].total) || 0;
      return query(`
SELECT u.id, u.name, u.contact, u.email, u.active, u.created_at AS createdAt,
       (SELECT COUNT(*) FROM access_cards c WHERE c.user_id = u.id) AS cardCount,
       (SELECT GROUP_CONCAT(DISTINCT COALESCE(r.name, p.door_id) SEPARATOR ',')
          FROM access_cards c JOIN access_permissions p ON p.card_id = c.id
          LEFT JOIN access_rooms r ON r.id = p.door_id
         WHERE c.user_id = u.id) AS rooms
  FROM access_users u ${ctx.where}
 ORDER BY u.id DESC LIMIT ? OFFSET ?`, [...ctx.params, ctx.page.pageSize, ctx.page.offset], 'done');
    }
    return respond(200, { success: true, users: rows.map((u) => Object.assign({}, u, { active: bool(u.active) })), total: ctx.total, page: ctx.page.page, pageSize: ctx.page.pageSize });
  },

  'POST /api/access/users'(step, rows, ctx, req) {
    const b = req.body;
    if (step === 'start') {
      const name = str(b.name || b.fullName, 150);
      if (name.length < 2) return fail(400, 'validation_error', 'Nome obrigatório.');
      ctx.name = name;
      return query('INSERT INTO access_users (name, contact, email, active) VALUES (?, ?, ?, ?)',
        [name, str(b.contact, 100) || null, str(b.email, 190) || null, b.active === false ? 0 : 1], 'done');
    }
    if (step === 'done') {
      const user = { id: Number(rows.insertId), name: ctx.name };
      return audit('user.create', user.id, { name: ctx.name }, [201, { success: true, user }]);
    }
  },

  'PATCH /api/access/users/:id'(step, rows, ctx, req) {
    const b = req.body;
    const id = posInt(req.params.id);
    if (step === 'start') {
      if (!id) return fail(400, 'validation_error', 'ID inválido.');
      if (b.revokeCards === true) {
        if (b.active !== false) return fail(400, 'validation_error', 'A revogação requer active=false.');
        return query('UPDATE access_users u LEFT JOIN access_cards c ON c.user_id = u.id SET u.active = 0, c.active = 0 WHERE u.id = ?', [id], 'done');
      }
      const sets = [];
      const params = [];
      if (typeof b.name === 'string') {
        const v = b.name.trim();
        if (v.length < 2 || v.length > 150) return fail(400, 'validation_error', 'Nome inválido.');
        sets.push('name = ?'); params.push(v);
      }
      if (typeof b.contact === 'string') { sets.push('contact = ?'); params.push(b.contact.trim().slice(0, 100) || null); }
      if (typeof b.email === 'string') { sets.push('email = ?'); params.push(b.email.trim().slice(0, 190) || null); }
      if (typeof b.active === 'boolean') { sets.push('active = ?'); params.push(b.active ? 1 : 0); }
      if (!sets.length) return fail(400, 'validation_error', 'Sem campos para atualizar.');
      return query(`UPDATE access_users SET ${sets.join(', ')} WHERE id = ?`, [...params, id], 'done');
    }
    if (step === 'done') {
      if (!affected(rows)) return fail(404, 'user_not_found', 'Utilizador não encontrado.');
      return audit(b.revokeCards ? 'user.revoke' : 'user.update', id, b, [200, { success: true, updated: true }]);
    }
  },

  // ---------------- Cartões ----------------
  'GET /api/access/cards'(step, rows, ctx, req) {
    const q = req.query;
    if (step === 'start') {
      const where = [];
      const params = [];
      if (posInt(q.userId)) { where.push('c.user_id = ?'); params.push(posInt(q.userId)); }
      if (str(q.uid, 50)) { where.push('c.uid LIKE ?'); params.push(`%${str(q.uid, 50).toUpperCase()}%`); }
      if (str(q.user, 80)) { where.push('u.name LIKE ?'); params.push(`%${str(q.user, 80)}%`); }
      if (q.status === 'active') where.push('c.active = 1');
      if (q.status === 'revoked' || q.status === 'inactive') where.push('c.active = 0');
      ctx.where = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      ctx.params = params;
      ctx.page = page(q);
      return query(`SELECT COUNT(*) AS total FROM access_cards c LEFT JOIN access_users u ON u.id = c.user_id ${ctx.where}`, params, 'list');
    }
    if (step === 'list') {
      ctx.total = Number(rows[0] && rows[0].total) || 0;
      return query(`
SELECT c.id, c.user_id AS userId, c.uid, c.active, c.created_at AS createdAt, u.name AS userName,
       (SELECT GROUP_CONCAT(DISTINCT COALESCE(r.name, p.door_id) SEPARATOR ',')
          FROM access_permissions p LEFT JOIN access_rooms r ON r.id = p.door_id
         WHERE p.card_id = c.id) AS permissions,
       (SELECT MAX(l.created_at) FROM access_logs l WHERE l.uid = c.uid) AS lastUsedAt
  FROM access_cards c LEFT JOIN access_users u ON u.id = c.user_id ${ctx.where}
 ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...ctx.params, ctx.page.pageSize, ctx.page.offset], 'done');
    }
    const cards = rows.map((c) => Object.assign({}, c, { active: bool(c.active), status: bool(c.active) ? 'active' : 'revoked' }));
    return respond(200, { success: true, cards, total: ctx.total, page: ctx.page.page, pageSize: ctx.page.pageSize });
  },

  'PATCH /api/access/cards/:id'(step, rows, ctx, req) {
    const id = posInt(req.params.id);
    const status = String(req.body.status || '').toLowerCase();
    if (step === 'start') {
      if (!id) return fail(400, 'validation_error', 'ID inválido.');
      if (!['revoked', 'inactive', 'active'].includes(status)) return fail(400, 'validation_error', 'Estado do cartão inválido.');
      return query('UPDATE access_cards SET active = ? WHERE id = ?', [status === 'active' ? 1 : 0, id], 'done');
    }
    if (step === 'done') {
      if (!affected(rows)) return fail(404, 'not_found', 'Cartão não encontrado.');
      return audit('card.status', id, { status }, [200, { success: true, updated: true, status: status === 'active' ? 'active' : 'revoked' }]);
    }
  },

  // ---------------- Permissões (por utilizador + sala) ----------------
  'GET /api/access/permissions'(step, rows, ctx, req) {
    const userId = posInt(req.query.userId);
    if (step === 'start') {
      return query(`
SELECT MIN(p.id) AS id, c.user_id AS userId, p.door_id AS roomId, COALESCE(r.name, p.door_id) AS roomName,
       MAX(p.can_enter) AS canEnter, MAX(p.can_exit) AS canExit,
       MIN(p.time_from) AS timeFrom, MAX(p.time_to) AS timeTo
  FROM access_permissions p
  JOIN access_cards c ON c.id = p.card_id
  LEFT JOIN access_rooms r ON r.id = p.door_id
 WHERE (? = 0 OR c.user_id = ?)
 GROUP BY c.user_id, p.door_id, r.name
 ORDER BY c.user_id, roomName LIMIT 500`, [userId, userId], 'done');
    }
    const permissions = rows.map((p) => Object.assign({}, p, {
      canEnter: bool(p.canEnter),
      canExit: bool(p.canExit),
      schedule: p.timeFrom ? { from: String(p.timeFrom).slice(0, 5), to: String(p.timeTo || '').slice(0, 5) } : null,
    }));
    return respond(200, { success: true, permissions });
  },

  // :id = ID do utilizador. Cria a permissão nos cartões que ainda não a têm e atualiza todos.
  'PATCH /api/access/permissions/:id'(step, rows, ctx, req) {
    const b = req.body;
    const userId = posInt(req.params.id);
    const roomId = str(b.roomId || b.doorId, 100);
    if (step === 'start') {
      if (!userId) return fail(400, 'validation_error', 'ID de utilizador inválido.');
      if (!roomId || typeof b.canEnter !== 'boolean' || typeof b.canExit !== 'boolean') {
        return fail(400, 'validation_error', 'roomId, canEnter e canExit são obrigatórios.');
      }
      return query('SELECT (SELECT COUNT(*) FROM access_rooms WHERE id = ?) AS roomExists, (SELECT COUNT(*) FROM access_cards WHERE user_id = ?) AS cards',
        [roomId, userId], 'insert');
    }
    if (step === 'insert') {
      const r = rows[0] || {};
      if (!Number(r.roomExists)) return fail(404, 'room_not_found', 'Sala/porta inexistente.');
      if (!Number(r.cards)) return fail(409, 'user_without_cards', 'O utilizador não tem cartões associados.');
      return query(`
INSERT INTO access_permissions (card_id, door_id, can_enter, can_exit)
SELECT c.id, ?, ?, ? FROM access_cards c
 WHERE c.user_id = ? AND NOT EXISTS (SELECT 1 FROM access_permissions p WHERE p.card_id = c.id AND p.door_id = ?)`,
      [roomId, b.canEnter ? 1 : 0, b.canExit ? 1 : 0, userId, roomId], 'update');
    }
    if (step === 'update') {
      return query(`
UPDATE access_permissions p JOIN access_cards c ON c.id = p.card_id
   SET p.can_enter = ?, p.can_exit = ?
 WHERE c.user_id = ? AND p.door_id = ?`, [b.canEnter ? 1 : 0, b.canExit ? 1 : 0, userId, roomId], 'done');
    }
    return audit('permission.update', `${userId}:${roomId}`, { canEnter: b.canEnter, canExit: b.canExit },
      [200, { success: true, updated: true, permission: { userId, roomId, canEnter: b.canEnter, canExit: b.canExit } }]);
  },

  // ---------------- Salas / portas ----------------
  'GET /api/access/rooms'(step, rows) {
    if (step === 'start') {
      return query(`
SELECT r.id, r.id AS doorId, r.name, r.description, r.created_at AS createdAt,
       (SELECT COUNT(*) FROM access_devices d WHERE d.door_id = r.id) AS deviceCount
  FROM access_rooms r ORDER BY r.name`, [], 'done');
    }
    return respond(200, { success: true, rooms: rows.map((r) => Object.assign({}, r, { deviceCount: Number(r.deviceCount) || 0 })) });
  },

  'POST /api/access/rooms'(step, rows, ctx, req) {
    const b = req.body;
    const id = str(b.id, 100).toLowerCase();
    const name = str(b.name, 100);
    if (step === 'start') {
      if (!isId(id)) return fail(422, 'validation_error', 'Identificador inválido (minúsculas, números, "-", "_" ou ".").');
      if (name.length < 2) return fail(422, 'validation_error', 'Nome da sala obrigatório.');
      ctx.duplicate = ['room_exists', 'Já existe uma sala/porta com esse identificador.'];
      return query('INSERT INTO access_rooms (id, name, description) VALUES (?, ?, ?)', [id, name, str(b.description, 255) || null], 'done');
    }
    return audit('room.create', id, { name }, [201, { success: true, room: { id, doorId: id, name, description: str(b.description, 255) || null, deviceCount: 0 } }]);
  },

  'PATCH /api/access/rooms/:id'(step, rows, ctx, req) {
    const b = req.body;
    const id = str(req.params.id, 100);
    if (step === 'start') {
      const sets = [];
      const params = [];
      if (typeof b.name === 'string') {
        const v = b.name.trim();
        if (v.length < 2 || v.length > 100) return fail(422, 'validation_error', 'Nome inválido.');
        sets.push('name = ?'); params.push(v);
      }
      if (typeof b.description === 'string') { sets.push('description = ?'); params.push(b.description.trim().slice(0, 255) || null); }
      ctx.newId = typeof b.newId === 'string' ? b.newId.trim().toLowerCase() : '';
      if (ctx.newId && ctx.newId !== id) {
        if (!isId(ctx.newId)) return fail(422, 'validation_error', 'Novo identificador inválido.');
        sets.push('id = ?'); params.push(ctx.newId);
      }
      if (!sets.length) return fail(400, 'validation_error', 'Sem campos para atualizar.');
      ctx.sets = sets;
      ctx.params = params;
      ctx.duplicate = ['room_exists', 'Já existe uma sala/porta com esse identificador.'];
      if (ctx.newId && ctx.newId !== id) {
        // Só se pode mudar o identificador enquanto nada o referencia
        return query(`SELECT (SELECT COUNT(*) FROM access_devices WHERE door_id = ?) + (SELECT COUNT(*) FROM access_permissions WHERE door_id = ?)
          + (SELECT COUNT(*) FROM access_registration_requests WHERE door_id = ? AND status = 'waiting_card') AS refs`, [id, id, id], 'update');
      }
      return query(`UPDATE access_rooms SET ${sets.join(', ')} WHERE id = ?`, [...params, id], 'done');
    }
    if (step === 'update') {
      if (Number(rows[0] && rows[0].refs) > 0) {
        return fail(409, 'room_in_use', 'Não é possível mudar o identificador: existem dispositivos ou permissões associados. Altere apenas o nome.');
      }
      return query(`UPDATE access_rooms SET ${ctx.sets.join(', ')} WHERE id = ?`, [...ctx.params, id], 'done');
    }
    if (!affected(rows)) return fail(404, 'room_not_found', 'Sala/porta inexistente.');
    return audit('room.update', id, b, [200, { success: true, updated: true, room: { id: ctx.newId || id } }]);
  },

  // ---------------- Dispositivos ----------------
  'GET /api/access/device-types'(step, rows) {
    if (step === 'start') {
      return query('SELECT id, label, category, rfid_capable AS rfidCapable, config_schema AS configSchema FROM access_device_types WHERE active = 1 ORDER BY sort_order, label', [], 'done');
    }
    return respond(200, { success: true, types: rows.map((t) => ({ id: t.id, label: t.label, category: t.category, rfidCapable: bool(t.rfidCapable), configSchema: parseJson(t.configSchema, []) })) });
  },

  'GET /api/access/devices'(step, rows, ctx, req) {
    const q = req.query;
    if (step === 'start') {
      const where = [];
      const params = [];
      const text = str(q.q, 80);
      if (text) { where.push('(d.name LIKE ? OR d.device_id LIKE ? OR COALESCE(d.ip_address, \'\') LIKE ?)'); params.push(`%${text}%`, `%${text}%`, `%${text}%`); }
      if (/^[a-z0-9_]{2,40}$/.test(q.type || '')) { where.push('d.device_type = ?'); params.push(q.type); }
      if (str(q.roomId, 100)) { where.push('d.door_id = ?'); params.push(str(q.roomId, 100)); }
      if (q.status === 'active') where.push("d.approval_status = 'approved' AND d.active = 1");
      if (q.status === 'inactive') where.push("d.approval_status = 'approved' AND d.active = 0");
      if (['pending', 'rejected', 'revoked'].includes(q.status)) { where.push('d.approval_status = ?'); params.push(q.status); }
      if (q.connection === 'online') where.push(`d.last_seen >= NOW() - INTERVAL ${ONLINE_WINDOW_SEC} SECOND`);
      if (q.connection === 'offline') where.push(`(d.last_seen IS NULL OR d.last_seen < NOW() - INTERVAL ${ONLINE_WINDOW_SEC} SECOND)`);
      if (q.rfid === '1') where.push('COALESCE(t.rfid_capable, 0) = 1');
      return query(`${DEVICE_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
 ORDER BY (d.approval_status = 'pending') DESC, d.name, d.device_id LIMIT 500`, params, 'done');
    }
    return respond(200, { success: true, devices: rows.map(formatDevice), onlineWindowSec: ONLINE_WINDOW_SEC });
  },

  'POST /api/access/devices'(step, rows, ctx, req) {
    const b = req.body;
    if (step === 'start') {
      const deviceId = str(b.deviceId, 64).toLowerCase();
      const name = str(b.name, 100);
      const type = str(b.type, 40);
      const roomId = str(b.roomId, 100) || null;
      const hardwareId = str(b.hardwareId, 100) || null;
      const config = configJson(b.config === undefined ? {} : b.config);
      if (!isDeviceId(deviceId)) return fail(422, 'validation_error', 'ID do dispositivo inválido (3–64 caracteres: minúsculas, números, ".", "-", "_").');
      if (name.length < 2) return fail(422, 'validation_error', 'Nome do dispositivo obrigatório.');
      if (!/^[a-z0-9_]{2,40}$/.test(type)) return fail(422, 'validation_error', 'Tipo de dispositivo inválido.');
      if (hardwareId && !/^[A-Za-z0-9:._-]{4,100}$/.test(hardwareId)) return fail(422, 'validation_error', 'Identificador de hardware inválido.');
      if (config === undefined) return fail(422, 'validation_error', 'Configuração inválida.');
      ctx.deviceId = deviceId;
      ctx.duplicate = ['device_exists', 'Já existe um dispositivo com esse ID ou identificador de hardware.'];
      return query(`
INSERT INTO access_devices (device_id, name, device_type, door_id, hardware_id, description, approval_status, active, online, readers, config)
SELECT ?, ?, t.id, ?, ?, ?, 'approved', ?, 0, ?, ?
  FROM access_device_types t
 WHERE t.id = ? AND (? IS NULL OR EXISTS (SELECT 1 FROM access_rooms r WHERE r.id = ?))`,
      [deviceId, name, roomId, hardwareId, str(b.description, 255) || null, b.active === false ? 0 : 1,
        readersCsv(b.readers) || 'outside', config, type, roomId, roomId], 'reload');
    }
    if (step === 'reload') {
      if (!affected(rows)) return fail(422, 'validation_error', 'Tipo de dispositivo ou sala/porta inexistente.');
      ctx.id = Number(rows.insertId);
      return query(`${DEVICE_SELECT} WHERE d.id = ?`, [ctx.id], 'done');
    }
    const device = rows[0] ? formatDevice(rows[0]) : { id: ctx.id, deviceId: ctx.deviceId };
    return audit('device.create', ctx.deviceId, { name: device.name, type: device.type, roomId: device.roomId }, [201, { success: true, device }]);
  },

  'PATCH /api/access/devices/:id'(step, rows, ctx, req) {
    const b = req.body;
    const id = posInt(req.params.id);
    if (step === 'start') {
      if (!id) return fail(400, 'validation_error', 'ID inválido.');
      const sets = [];
      const params = [];
      const where = ['d.id = ?'];
      const whereParams = [id];
      if (typeof b.name === 'string') {
        const v = b.name.trim();
        if (v.length < 2 || v.length > 100) return fail(422, 'validation_error', 'Nome inválido.');
        sets.push('d.name = ?'); params.push(v);
      }
      if (typeof b.type === 'string') {
        if (!/^[a-z0-9_]{2,40}$/.test(b.type)) return fail(422, 'validation_error', 'Tipo inválido.');
        sets.push('d.device_type = ?'); params.push(b.type);
        where.push('EXISTS (SELECT 1 FROM access_device_types t WHERE t.id = ?)'); whereParams.push(b.type);
      }
      if (b.roomId === null || typeof b.roomId === 'string') {
        const roomId = b.roomId ? b.roomId.trim().slice(0, 100) : null;
        sets.push('d.door_id = ?'); params.push(roomId);
        if (roomId) { where.push('EXISTS (SELECT 1 FROM access_rooms r WHERE r.id = ?)'); whereParams.push(roomId); }
      }
      if (b.hardwareId === null || typeof b.hardwareId === 'string') {
        const hw = b.hardwareId ? b.hardwareId.trim() : '';
        if (hw && !/^[A-Za-z0-9:._-]{4,100}$/.test(hw)) return fail(422, 'validation_error', 'Identificador de hardware inválido.');
        sets.push('d.hardware_id = ?'); params.push(hw || null);
      }
      if (b.description === null || typeof b.description === 'string') { sets.push('d.description = ?'); params.push(b.description ? b.description.trim().slice(0, 255) || null : null); }
      if (Array.isArray(b.readers)) {
        const csv = readersCsv(b.readers);
        if (!csv) return fail(422, 'validation_error', 'Indique pelo menos um leitor (outside/inside).');
        sets.push('d.readers = ?'); params.push(csv);
      }
      if (b.config !== undefined) {
        const cfg = configJson(b.config);
        if (cfg === undefined) return fail(422, 'validation_error', 'Configuração inválida.');
        sets.push('d.config = ?'); params.push(cfg);
      }
      if (typeof b.active === 'boolean') {
        sets.push('d.active = ?'); params.push(b.active ? 1 : 0);
        // Só dispositivos aprovados podem ser ativados
        if (b.active) where.push("d.approval_status = 'approved'");
      }
      if (!sets.length) return fail(400, 'validation_error', 'Sem campos para atualizar.');
      ctx.duplicate = ['device_exists', 'Esse identificador de hardware já pertence a outro dispositivo.'];
      return query(`UPDATE access_devices d SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`, [...params, ...whereParams], 'check');
    }
    if (step === 'check') {
      if (affected(rows)) return query(`${DEVICE_SELECT} WHERE d.id = ?`, [id], 'done');
      return query('SELECT approval_status AS approvalStatus FROM access_devices WHERE id = ?', [id], 'explain');
    }
    if (step === 'explain') {
      if (!rows.length) return fail(404, 'device_not_found', 'Dispositivo não encontrado.');
      if (b.active === true && rows[0].approvalStatus !== 'approved') return fail(409, 'device_not_approved', 'O dispositivo tem de ser aprovado antes de ser ativado.');
      return fail(422, 'validation_error', 'Tipo de dispositivo ou sala/porta inexistente.');
    }
    const device = formatDevice(rows[0]);
    return audit('device.update', device.deviceId, b, [200, { success: true, device }]);
  },

  // Ações: approve | reject | revoke | credentials
  'POST /api/access/devices/:id/:action'(step, rows, ctx, req) {
    const id = posInt(req.params.id);
    const action = String(req.params.action || '');
    if (step === 'start') {
      if (!id) return fail(400, 'validation_error', 'ID inválido.');
      if (action === 'approve') {
        const active = req.body.active === false ? 0 : 1;
        return query("UPDATE access_devices SET approval_status = 'approved', active = ? WHERE id = ? AND approval_status IN ('pending', 'rejected', 'revoked')", [active, id], 'check');
      }
      if (action === 'reject') {
        return query("UPDATE access_devices SET approval_status = 'rejected', active = 0 WHERE id = ? AND approval_status = 'pending'", [id], 'check');
      }
      if (action === 'revoke') {
        return query("UPDATE access_devices SET approval_status = 'revoked', active = 0, credential_hash = NULL, credential_created_at = NULL WHERE id = ? AND approval_status <> 'revoked'", [id], 'check');
      }
      if (action === 'credentials') {
        if (!crypto || typeof crypto.randomBytes !== 'function') return fail(503, 'server_config', 'Gerador criptográfico indisponível no servidor.');
        // A chave só existe em memória até ser devolvida uma vez; na BD fica apenas o SHA-256
        ctx.secret = crypto.randomBytes(24).toString('hex');
        const hash = crypto.createHash('sha256').update(ctx.secret).digest('hex');
        return query("UPDATE access_devices SET credential_hash = ?, credential_created_at = NOW() WHERE id = ? AND approval_status = 'approved'", [hash, id], 'check');
      }
      return fail(404, 'not_found', 'Ação desconhecida.');
    }
    if (step === 'check') {
      if (affected(rows)) return query(`${DEVICE_SELECT} WHERE d.id = ?`, [id], 'done');
      return query('SELECT approval_status AS approvalStatus FROM access_devices WHERE id = ?', [id], 'explain');
    }
    if (step === 'explain') {
      if (!rows.length) return fail(404, 'device_not_found', 'Dispositivo não encontrado.');
      const s = rows[0].approvalStatus;
      if (action === 'credentials') return fail(409, 'device_not_approved', 'Só é possível gerar credenciais para dispositivos aprovados.');
      return fail(409, 'invalid_state', `Ação "${action}" não permitida no estado atual (${s}).`);
    }
    const device = formatDevice(rows[0]);
    const body = { success: true, device };
    if (action === 'credentials') {
      body.credential = {
        deviceKey: ctx.secret,
        header: 'X-Device-Key',
        instructions: 'Copie esta chave para DEVICE_API_KEY no firmware do ESP32. Não volta a ser mostrada; gere uma nova se a perder.',
      };
    }
    return audit(`device.${action}`, device.deviceId, null, [200, body]);
  },

  // Teste de comunicação: lê o último heartbeat registado pelo dispositivo
  'GET /api/access/devices/:id/status'(step, rows, ctx, req) {
    const id = posInt(req.params.id);
    if (step === 'start') {
      if (!id) return fail(400, 'validation_error', 'ID inválido.');
      return query(`${DEVICE_SELECT} WHERE d.id = ?`, [id], 'done');
    }
    if (!rows.length) return fail(404, 'device_not_found', 'Dispositivo não encontrado.');
    const d = formatDevice(rows[0]);
    let message;
    if (d.secondsSinceSeen === null) message = 'O dispositivo nunca comunicou com o servidor.';
    else if (d.online) message = `Comunicação OK: último contacto há ${d.secondsSinceSeen} s.`;
    else message = `Sem comunicação há ${d.secondsSinceSeen} s (limite ${ONLINE_WINDOW_SEC} s).`;
    return respond(200, { success: true, online: d.online, secondsSinceSeen: d.secondsSinceSeen, lastSeen: d.lastSeen,
      ipAddress: d.ipAddress, firmwareVersion: d.firmwareVersion, wifiRssi: d.wifiRssi, onlineWindowSec: ONLINE_WINDOW_SEC, message, device: d });
  },

  // ---------------- Histórico ----------------
  'GET /api/access/logs'(step, rows, ctx, req) {
    const q = req.query;
    if (step === 'start') {
      ctx.filter = logFilters(q);
      ctx.page = page(q);
      return query(`SELECT COUNT(*) AS total ${LOG_FROM}${ctx.filter.sql}`, ctx.filter.params, 'list');
    }
    if (step === 'list') {
      ctx.total = Number(rows[0] && rows[0].total) || 0;
      const order = q.order === 'asc' ? 'ASC' : 'DESC';
      return query(`${LOG_COLUMNS} ${LOG_FROM}${ctx.filter.sql} ORDER BY l.created_at ${order}, l.id ${order} LIMIT ? OFFSET ?`,
        [...ctx.filter.params, ctx.page.pageSize, ctx.page.offset], 'done');
    }
    return respond(200, { success: true, logs: rows, total: ctx.total, page: ctx.page.page, pageSize: ctx.page.pageSize });
  },

  'GET /api/access/logs/export'(step, rows, ctx, req) {
    const q = req.query;
    if (step === 'start') {
      const filter = logFilters(q);
      const order = q.order === 'asc' ? 'ASC' : 'DESC';
      return query(`${LOG_COLUMNS} ${LOG_FROM}${filter.sql} ORDER BY l.created_at ${order}, l.id ${order} LIMIT 10000`, filter.params, 'done');
    }
    const header = ['Data', 'Hora', 'Utilizador', 'UID', 'Sala', 'Dispositivo', 'Leitor', 'Movimento', 'Resultado', 'Motivo'];
    const lines = [header].concat(rows.map((r) => {
      const [date, time] = officeDateParts(r.timestamp);
      const move = r.readerId === 'outside' ? 'Entrada' : r.readerId === 'inside' ? 'Saída' : 'Leitura';
      return [date, time, r.userName || 'Cartão desconhecido', r.uid, r.roomName, r.deviceId, r.readerId, move,
        r.result === 'granted' ? 'Permitido' : r.result === 'denied' ? 'Negado' : r.result, r.reason];
    })).map((cols) => cols.map(csvCell).join(','));
    const today = officeDateParts(new Date())[0].split('/').reverse().join('-');
    return respond(200, '﻿' + lines.join('\r\n') + '\r\n', {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="acessos_${today}.csv"`,
    });
  },

  // ---------------- Registo RFID (painel) ----------------
  'POST /api/access/register/start'(step, rows, ctx, req) {
    const b = req.body;
    if (step === 'start') {
      const deviceId = str(b.deviceId, 64);
      const readerId = b.readerId === 'inside' ? 'inside' : 'outside';
      const userId = b.userId === undefined || b.userId === null ? 0 : posInt(b.userId);
      const name = str(b.name, 150);
      const doorId = str(b.doorId, 100);
      const perms = b.permissions || {};
      const schedule = b.schedule && typeof b.schedule === 'object' ? b.schedule : null;
      if (b.userId !== undefined && b.userId !== null && !userId) return fail(422, 'validation_error', 'Utilizador inválido.');
      if (!userId && name.length < 2) return fail(422, 'validation_error', 'Nome completo obrigatório.');
      if (!deviceId) return fail(422, 'validation_error', 'Escolha o dispositivo de registo.');
      if (!doorId) return fail(422, 'validation_error', 'Escolha a sala ou porta.');
      if (perms.canEnter !== true && perms.canExit !== true) return fail(422, 'validation_error', 'Selecione pelo menos uma permissão (entrada ou saída).');
      if (schedule && (!isTime(schedule.from) || !isTime(schedule.to) || schedule.from === schedule.to)) {
        return fail(422, 'validation_error', 'Horário permitido inválido.');
      }
      Object.assign(ctx, {
        deviceId, readerId, userId, name, doorId, schedule,
        contact: str(b.contact, 100) || null,
        email: str(b.email, 190) || null,
        canEnter: perms.canEnter === true ? 1 : 0,
        canExit: perms.canExit === true ? 1 : 0,
        active: b.active === false ? 0 : 1,
      });
      return query(`
SELECT d.device_id AS deviceId, d.approval_status AS approvalStatus, d.active, d.readers,
       COALESCE(t.rfid_capable, 0) AS rfidCapable,
       (d.last_seen IS NOT NULL AND d.last_seen >= NOW() - INTERVAL ${ONLINE_WINDOW_SEC} SECOND) AS online,
       (SELECT COUNT(*) FROM access_rooms WHERE id = ?) AS roomExists,
       (SELECT COUNT(*) FROM access_users WHERE id = ?) AS userExists
  FROM access_devices d LEFT JOIN access_device_types t ON t.id = d.device_type
 WHERE d.device_id = ?`, [ctx.doorId, ctx.userId, ctx.deviceId], 'supersede');
    }
    if (step === 'supersede') {
      const d = rows[0];
      if (!d) return fail(404, 'device_not_found', 'Dispositivo de registo inexistente.');
      if (d.approvalStatus !== 'approved') return fail(409, 'device_not_approved', 'O dispositivo ainda não foi aprovado.');
      if (!bool(d.active)) return fail(409, 'device_disabled', 'O dispositivo está desativado.');
      if (!bool(d.rfidCapable)) return fail(422, 'reader_unavailable', 'Este dispositivo não tem leitor RFID.');
      const readers = String(d.readers || 'outside').split(',');
      if (!readers.includes(ctx.readerId)) return fail(422, 'reader_unavailable', `O leitor "${ctx.readerId}" não está instalado neste dispositivo.`);
      if (!bool(d.online)) return fail(409, 'device_offline', 'O ESP32 está offline (sem heartbeat recente).');
      if (!Number(d.roomExists)) return fail(404, 'room_not_found', 'Sala/porta inexistente.');
      if (ctx.userId && !Number(d.userExists)) return fail(404, 'user_not_found', 'Utilizador não encontrado.');
      // Um leitor atende um registo de cada vez: pedidos anteriores ficam cancelados
      return query("UPDATE access_registration_requests SET status = 'cancelled', error_code = 'superseded' WHERE device_id = ? AND status = 'waiting_card'", [ctx.deviceId], 'insert');
    }
    if (step === 'insert') {
      ctx.registrationId = `reg-${Date.now()}-${crypto && crypto.randomBytes ? crypto.randomBytes(6).toString('hex') : Math.floor(Math.random() * 1e9)}`;
      return query(`
INSERT INTO access_registration_requests
 (id, device_id, reader_id, name, contact, email, status, expires_at, user_id, door_id, can_enter, can_exit, user_active, time_from, time_to)
VALUES (?, ?, ?, ?, ?, ?, 'waiting_card', NOW() + INTERVAL ${REGISTRATION_TTL_SEC} SECOND, ?, ?, ?, ?, ?, ?, ?)`,
      [ctx.registrationId, ctx.deviceId, ctx.readerId, ctx.name || '(utilizador existente)', ctx.contact, ctx.email,
        ctx.userId || null, ctx.doorId, ctx.canEnter, ctx.canExit, ctx.active,
        ctx.schedule ? `${ctx.schedule.from}:00` : null, ctx.schedule ? `${ctx.schedule.to}:00` : null], 'done');
    }
    return audit('registration.start', ctx.registrationId, { deviceId: ctx.deviceId, userId: ctx.userId || null, doorId: ctx.doorId },
      [201, { success: true, registrationId: ctx.registrationId, status: 'waiting_card', deviceId: ctx.deviceId,
        expiresAt: new Date(Date.now() + REGISTRATION_TTL_SEC * 1000).toISOString(), message: 'Aproxime o cartão do leitor' }]);
  },

  'GET /api/access/register/status'(step, rows, ctx, req) {
    const id = str(req.query.id || req.query.registrationId, 80);
    if (step === 'start') {
      if (!id) return fail(400, 'registration_id_required', 'Identificador de registo em falta.');
      return query(`
SELECT q.id, q.device_id AS deviceId, q.reader_id AS readerId, q.name, q.uid, q.status, q.error_code AS errorCode,
       q.expires_at AS expiresAt, q.completed_at AS completedAt, q.user_id AS userId, q.card_id AS cardId,
       q.door_id AS doorId, COALESCE(r.name, q.door_id) AS roomName, d.name AS deviceName,
       (q.status = 'waiting_card' AND q.expires_at <= NOW()) AS isExpired,
       (d.last_seen IS NOT NULL AND d.last_seen >= NOW() - INTERVAL ${ONLINE_WINDOW_SEC} SECOND) AS deviceOnline,
       u.name AS userName, ou.name AS ownerName
  FROM access_registration_requests q
  LEFT JOIN access_devices d ON d.device_id = q.device_id
  LEFT JOIN access_rooms r ON r.id = q.door_id
  LEFT JOIN access_users u ON u.id = q.user_id
  LEFT JOIN access_cards oc ON q.status = 'duplicate' AND oc.uid = q.uid
  LEFT JOIN access_users ou ON ou.id = oc.user_id
 WHERE q.id = ? LIMIT 1`, [id], 'done');
    }
    if (!rows.length) return fail(404, 'registration_not_found', 'Sessão de registo não encontrada.');
    const r = rows[0];
    const status = bool(r.isExpired) ? 'expired' : r.status;
    return respond(200, {
      success: true, registrationId: r.id, status, errorCode: r.errorCode, uid: r.uid,
      name: r.userName || r.name, user: r.userId ? { id: r.userId, name: r.userName || r.name } : null, cardId: r.cardId,
      deviceId: r.deviceId, deviceName: r.deviceName, readerId: r.readerId, doorId: r.doorId, roomName: r.roomName,
      deviceOnline: bool(r.deviceOnline), ownerName: r.ownerName, expiresAt: r.expiresAt, completedAt: r.completedAt,
    });
  },

  'POST /api/access/register/cancel'(step, rows, ctx, req) {
    const id = str(req.body.registrationId || req.body.id, 80);
    if (step === 'start') {
      if (!id) return fail(400, 'registration_id_required', 'Identificador de registo em falta.');
      return query("UPDATE access_registration_requests SET status = 'cancelled', error_code = 'cancelled_by_admin' WHERE id = ? AND status = 'waiting_card'", [id], 'check');
    }
    if (step === 'check') {
      if (affected(rows)) return audit('registration.cancel', id, null, [200, { success: true, status: 'cancelled' }]);
      return query('SELECT status FROM access_registration_requests WHERE id = ?', [id], 'done');
    }
    if (!rows.length) return fail(404, 'registration_not_found', 'Sessão de registo não encontrada.');
    // Ex.: o cartão foi gravado entretanto — o painel deve mostrar o estado real
    return fail(409, 'registration_not_cancellable', `O registo já não pode ser cancelado (estado: ${rows[0].status}).`, { status: rows[0].status });
  },
};

// ------------------------------------------------------------
// Execução
// ------------------------------------------------------------

if (!msg._api) {
  const route = `${String(msg.req.method || '').toUpperCase()} ${msg.req.route && msg.req.route.path}`;
  if (!ROUTES[route]) return fail(404, 'not_found', 'Rota inexistente.');
  if (!crypto || typeof crypto.createHash !== 'function') return fail(503, 'server_config', 'Crypto indisponível no servidor.');

  const sessions = global.get('smartOfficeAdminSessions') || {};
  const cookies = String((msg.req.headers || {}).cookie || '').split(';').map((x) => x.trim());
  const found = cookies.find((x) => x.startsWith('smart_office_admin='));
  const token = found ? found.substring('smart_office_admin='.length) : '';
  const digest = /^[a-f0-9]{64}$/.test(token) ? crypto.createHash('sha256').update(token).digest('hex') : '';
  if (!digest || !sessions[digest] || sessions[digest] <= Date.now()) {
    return fail(401, 'session_expired', 'Sessão administrativa necessária.');
  }

  const method = String(msg.req.method).toUpperCase();
  const origin = (msg.req.headers || {}).origin || '';
  if (method !== 'GET' && !ALLOWED_ORIGINS.includes(origin)) {
    return fail(403, 'forbidden', 'Origem não autorizada.');
  }

  msg._api = { route, step: 'start', ctx: {}, sessionRef: digest.slice(0, 12) };
}

const api = msg._api;
const rows = api.step === 'start' ? [] : msg.payload;

if (api.step === 'auditDone') {
  const [status, body] = api.response;
  return respond(status, body);
}

const req = {
  query: msg.req.query || {},
  params: msg.req.params || {},
  body: msg._body || (msg._body = (msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload) && api.step === 'start') ? msg.payload : {}),
};

return ROUTES[api.route](api.step, rows, api.ctx, req);
