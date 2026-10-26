// Bancada de testes: prepara a pasta de dados do Node-RED (backend/test/.bench/nr)
// com um fluxo de login de teste (imita o fluxo real), os fluxos gerados e a
// configuração MySQL local. Uso exclusivo em testes — nada disto vai para produção.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, ".bench", "nr");
fs.mkdirSync(OUT, { recursive: true });

const admin = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "smart-office-admin-api-v4.json")));
const device = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "smart-office-device-api-v2.json")));

// Imita o login real: cookie smart_office_admin + global smartOfficeAdminSessions
const LOGIN = `
const crypto = global.get('crypto');
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const sessions = global.get('smartOfficeAdminSessions') || {};
const route = msg.req.method + ' ' + msg.req.route.path;
const cookie = String(msg.req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('smart_office_admin='));
const token = cookie ? cookie.split('=')[1] : '';
msg.headers = { 'Cache-Control': 'no-store' };
if (route === 'POST /api/admin/login') {
  const b = msg.payload || {};
  if (b.username !== 'DevTeam' || sha(b.password || '') !== env.get('BENCH_ADMIN_SHA256')) {
    msg.statusCode = 401; msg.payload = { success: false, error: 'invalid_credentials' }; return msg;
  }
  const t = crypto.randomBytes(32).toString('hex');
  sessions[sha(t)] = Date.now() + 30 * 60000; global.set('smartOfficeAdminSessions', sessions);
  msg.cookies = { smart_office_admin: { value: t, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 1800000 } };
  msg.payload = { success: true, authenticated: true, admin: { username: 'DevTeam', displayName: 'DevTeam' } }; return msg;
}
const valid = /^[a-f0-9]{64}$/.test(token) && sessions[sha(token)] > Date.now();
if (route === 'GET /api/admin/session') {
  msg.statusCode = valid ? 200 : 401;
  msg.payload = valid ? { success: true, authenticated: true, admin: { username: 'DevTeam', displayName: 'DevTeam' } } : { success: false, authenticated: false };
  return msg;
}
if (route === 'POST /api/admin/logout') {
  if (token) { delete sessions[sha(token)]; global.set('smartOfficeAdminSessions', sessions); }
  msg.cookies = { smart_office_admin: null }; msg.payload = { success: true }; return msg;
}
if (route === 'POST /__bench/expire') { global.set('smartOfficeAdminSessions', {}); msg.payload = { ok: true }; return msg; }
`;

const tab = { id: "benchlogintab0001", type: "tab", label: "Bench login (imita o fluxo real)" };
const fn = { id: "benchloginfn00001", type: "function", z: tab.id, name: "login", func: LOGIN, outputs: 1, wires: [["benchloginres0001"]] };
const res = { id: "benchloginres0001", type: "http response", z: tab.id, statusCode: "", headers: {}, wires: [] };
const ins = [["post", "/api/admin/login"], ["get", "/api/admin/session"], ["post", "/api/admin/logout"], ["post", "/__bench/expire"]]
  .map(([m, u], i) => ({ id: "benchin" + String(i).padStart(10, "0"), type: "http in", z: tab.id, url: u, method: m, wires: [[fn.id]] }));
const mysqlCfg = { id: "96426fc49ec39659", type: "MySQLdatabase", name: "Smart office (bench)", host: "so-bench-db", port: "3306", db: "smart_office", tz: "", charset: "UTF8" };

fs.writeFileSync(path.join(OUT, "flows.json"), JSON.stringify([tab, fn, res, ...ins, mysqlCfg, ...admin, ...device], null, 1));
fs.writeFileSync(path.join(OUT, "flows_cred.json"), JSON.stringify({ "96426fc49ec39659": { user: "root", password: "bench-only" } }));
fs.writeFileSync(path.join(OUT, "settings.js"), `// Bancada de testes — não é a configuração de produção.
module.exports = {
  flowFile: "flows.json",
  credentialSecret: false,
  uiPort: 1880,
  httpAdminRoot: "/red",
  httpNodeRoot: "/",
  httpNodeCors: {
    origin: "http://localhost:5173",
    methods: "GET,PUT,POST,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization,X-CSRF-Token",
    credentials: true,
    optionsSuccessStatus: 204,
  },
  functionGlobalContext: { crypto: require("crypto") },
};
`);
console.log("bench preparado em", OUT);
