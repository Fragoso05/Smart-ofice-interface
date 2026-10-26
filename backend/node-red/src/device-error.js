// ============================================================
// Smart Office — API dos dispositivos v2: tratamento de erros
// ============================================================

const dev = msg._dev || {};
const code = (msg.error && (msg.error.code || (msg.error.source && msg.error.source.code))) || '';
const text = String((msg.error && msg.error.message) || '');

msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

// Reenvio de um evento já gravado (mesmo eventId): o ESP32 pode retirá-lo da fila
if (dev.ctx && dev.ctx.duplicateOk && (code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(text))) {
  msg.statusCode = 200;
  msg.payload = { success: true, logged: true, duplicate: true };
  return msg;
}

node.error(`Erro MySQL (dispositivos ${dev.route || '?'} / ${dev.step || '?'}): ${text}`, msg);
msg.statusCode = 500;
msg.payload = dev.route === 'POST /api/access/card'
  ? { success: false, authorized: false, action: 'deny', reason: 'server_error' }
  : { success: false, error: 'database_error' };
return msg;
