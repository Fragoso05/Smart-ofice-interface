// ============================================================
// Smart Office — Admin API v4: tratamento de erros (nó catch → função)
// Converte erros MySQL em respostas JSON legíveis, sem expor SQL.
// ============================================================

const api = msg._api || {};
const code = (msg.error && (msg.error.code || (msg.error.source && msg.error.source.code))) || '';
const text = String((msg.error && msg.error.message) || '');

msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

// A escrita já foi confirmada; só a auditoria falhou → devolver o resultado real
if (api.auditing && api.response) {
  node.warn(`Auditoria não registada (${api.route}): ${text}`);
  msg.statusCode = api.response[0];
  msg.payload = api.response[1];
  return msg;
}

if (code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(text)) {
  const [error, message] = (api.ctx && api.ctx.duplicate) || ['duplicate_entry', 'Registo duplicado.'];
  msg.statusCode = 409;
  msg.payload = { success: false, error, message };
  return msg;
}

if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_SP_DOES_NOT_EXIST'].includes(code) ||
    /doesn't exist|Unknown column/i.test(text)) {
  node.error(`Esquema MySQL desatualizado (${api.route || '?'}): ${text}`, msg);
  msg.statusCode = 500;
  msg.payload = { success: false, error: 'schema_outdated', message: 'Base de dados desatualizada: executar backend/sql/001_device_management.sql.' };
  return msg;
}

node.error(`Erro MySQL (${api.route || '?'} / ${api.step || '?'}): ${text}`, msg);
msg.statusCode = 500;
msg.payload = { success: false, error: 'database_error', message: 'Erro na base de dados (MySQL). Consultar o Debug do Node-RED.' };
return msg;
