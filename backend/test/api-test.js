// Teste de API ponta-a-ponta: painel (sessão admin) + ESP32 simulado → Node-RED real → MariaDB 11.8
const B = "http://localhost:1880";
const ORIGIN = "http://localhost:5173";
let cookie = "";
const results = [];
const check = (name, cond, extra = "") => { results.push(cond); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra); };

async function call(method, path, body, { origin = ORIGIN, headers = {}, auth = true } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...(auth && cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set && set.startsWith("smart_office_admin=")) cookie = set.split(";")[0];
  const type = res.headers.get("content-type") || "";
  const data = type.includes("json") ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}
// ESP32: sem cookie nem Origin, com X-Device-Key opcional
const esp = (method, path, body, key) => call(method, path, body, { origin: null, auth: false, headers: key ? { "X-Device-Key": key } : {} });
const heartbeat = (deviceId, hw, key) => esp("POST", "/api/device/register", { deviceId, hardwareId: hw, name: deviceId, doorId: "main-door", firmwareVersion: "rc522-v2.0", ipAddress: "192.168.1.77", wifiRssi: -60 }, key);

(async () => {
  // --- Autenticação / CORS
  let r = await call("GET", "/api/access/devices");
  check("sem sessão → 401 session_expired", r.status === 401 && r.data.error === "session_expired");
  r = await call("POST", "/api/admin/login", { username: "DevTeam", password: "errada" });
  check("login inválido → 401", r.status === 401);
  r = await call("POST", "/api/admin/login", { username: "DevTeam", password: "bench-pass-123" });
  check("login DevTeam", r.status === 200 && cookie.startsWith("smart_office_admin="));
  const pre = await fetch(B + "/api/access/devices/1", { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type,x-csrf-token" } });
  check("preflight PATCH permitido (settings.js com PATCH)", /PATCH/.test(pre.headers.get("access-control-allow-methods") || "") && pre.headers.get("access-control-allow-credentials") === "true");

  // --- Leituras existentes
  r = await call("GET", "/api/access/dashboard");
  check("dashboard com stats + dispositivos", r.status === 200 && r.data.stats.activeUsers === 2 && "devicesOnline" in r.data.stats && r.data.stats.doorsCount === 1, JSON.stringify(r.data).slice(0, 300));
  check("dashboard: logs antigos com nome (join por UID)", r.data.recent.some((l) => l.userName === "Ana Silva"), JSON.stringify(r.data.recent));
  r = await call("GET", "/api/access/devices");
  const legacy = r.data.devices.find((d) => d.deviceId === "esp32-door-01");
  check("dispositivo existente continua aprovado/ativo", legacy && legacy.approvalStatus === "approved" && legacy.active === true);
  check("online calculado pelo heartbeat (último há 2 h → offline)", legacy && legacy.online === false && legacy.secondsSinceSeen > 7000, JSON.stringify(legacy));
  r = await call("GET", "/api/access/device-types");
  check("10 tipos de dispositivo com esquema", r.data.types.length === 10 && r.data.types[0].configSchema.length > 0);

  // --- Escritas: Origin obrigatório
  r = await call("POST", "/api/access/rooms", { id: "sala-x", name: "X" }, { origin: "https://evil.example" });
  check("escrita de origem não autorizada → 403", r.status === 403);

  // --- Salas
  r = await call("POST", "/api/access/rooms", { id: "sala-reunioes", name: "Sala de reuniões" });
  check("criar sala", r.status === 201, JSON.stringify(r.data));
  r = await call("POST", "/api/access/rooms", { id: "sala-reunioes", name: "Outra" });
  check("sala duplicada → 409 room_exists", r.status === 409 && r.data.error === "room_exists");
  r = await call("PATCH", "/api/access/rooms/main-door", { newId: "porta-principal" });
  check("mudar ID de sala em uso → 409 room_in_use", r.status === 409 && r.data.error === "room_in_use");
  r = await call("PATCH", "/api/access/rooms/main-door", { name: "Entrada principal" });
  check("renomear sala", r.status === 200);

  // --- Adicionar ESP32 pelo painel
  r = await call("POST", "/api/access/devices", { deviceId: "esp32-door-02", name: "Porta reuniões", type: "esp32_rfid", roomId: "sala-reunioes", readers: ["outside"], active: false, config: { readerModel: "RC522", relayDurationMs: 3000 } });
  check("adicionar dispositivo", r.status === 201 && r.data.device.deviceId === "esp32-door-02" && r.data.device.active === false, JSON.stringify(r.data));
  const dev2 = r.data.device;
  r = await call("POST", "/api/access/devices", { deviceId: "esp32-door-02", name: "Dup", type: "esp32_rfid" });
  check("ID duplicado → 409 device_exists", r.status === 409 && r.data.error === "device_exists");
  r = await call("POST", "/api/access/devices", { deviceId: "x1-bad", name: "Mau tipo", type: "nao_existe" });
  check("tipo inexistente → 422", r.status === 422);
  r = await call("POST", "/api/access/devices", { deviceId: "BAD ID", name: "x", type: "other" });
  check("ID inválido → 422", r.status === 422);
  r = await call("PATCH", `/api/access/devices/${dev2.id}`, { active: true });
  check("ativar dispositivo (estado devolvido pelo servidor)", r.status === 200 && r.data.device.active === true);

  // --- ESP32 desconhecido → pendente; aprovar / rejeitar
  r = await heartbeat("esp32-novo-01", "11:22:33:44:55:66");
  check("heartbeat de dispositivo desconhecido → aceite como pendente", r.status === 200 && r.data.approvalStatus === "pending" && r.data.approved === false);
  r = await call("GET", "/api/access/devices?status=pending");
  const pending = r.data.devices.find((d) => d.deviceId === "esp32-novo-01");
  check("aparece na lista como pendente e online", pending && pending.online === true);
  r = await call("PATCH", `/api/access/devices/${pending.id}`, { active: true });
  check("ativar pendente sem aprovar → 409 device_not_approved", r.status === 409 && r.data.error === "device_not_approved");
  r = await call("POST", `/api/access/devices/${pending.id}/reject`);
  check("rejeitar pendente", r.status === 200 && r.data.device.approvalStatus === "rejected");
  r = await call("POST", `/api/access/devices/${pending.id}/approve`);
  check("aprovar (após rejeição)", r.status === 200 && r.data.device.approvalStatus === "approved" && r.data.device.active === true);

  // --- Credenciais
  r = await heartbeat("esp32-door-02", "AA:BB:CC:00:00:02");
  check("heartbeat do novo ESP32 (sem chave, modo transição)", r.status === 200 && r.data.approved === true && r.data.active === true);
  r = await call("POST", `/api/access/devices/${dev2.id}/credentials`);
  const key = r.data.credential && r.data.credential.deviceKey;
  check("gerar credencial (devolvida uma vez, ≥16 car.)", r.status === 200 && key && key.length >= 16 && r.data.device.hasCredential === true);
  r = await heartbeat("esp32-door-02", "AA:BB:CC:00:00:02");
  check("heartbeat sem chave após credencial → 401", r.status === 401 && r.data.error === "device_auth_failed");
  r = await heartbeat("esp32-door-02", "AA:BB:CC:00:00:02", "chave-errada-1234567890");
  check("heartbeat com chave errada → 401", r.status === 401);
  r = await heartbeat("esp32-door-02", "AA:BB:CC:00:00:02", key);
  check("heartbeat com chave certa → 200", r.status === 200);
  r = await heartbeat("esp32-door-02", "FF:FF:FF:FF:FF:FF", key);
  check("MAC diferente → 409 hardware_mismatch", r.status === 409);

  // --- Registo RFID completo (painel ↔ Node-RED ↔ ESP32)
  r = await call("POST", "/api/access/register/start", { name: "Rita Lopes", contact: "9300000", deviceId: "esp32-door-02", readerId: "outside", doorId: "sala-reunioes", permissions: { canEnter: true, canExit: false }, schedule: { from: "00:00", to: "23:59" }, active: true });
  check("register/start → 201 waiting_card", r.status === 201 && r.data.status === "waiting_card", JSON.stringify(r.data));
  const regId = r.data.registrationId;
  r = await esp("GET", "/api/device/esp32-door-02/command", undefined, key);
  check("ESP32 recebe REGISTER_CARD", r.data.command && r.data.command.type === "REGISTER_CARD" && r.data.command.registrationId === regId && r.data.command.readerId === "outside");
  r = await call("GET", `/api/access/register/status?id=${regId}&registrationId=${regId}`);
  check("status: a aguardar cartão, leitor online", r.data.status === "waiting_card" && r.data.deviceOnline === true);
  r = await esp("POST", "/api/access/register/card", { registrationId: regId, deviceId: "esp32-door-02", readerId: "outside", uid: "04f3a9c2" }, key);
  check("ESP32 envia UID → registered:true", r.status === 201 && r.data.registered === true && r.data.uid === "04F3A9C2", JSON.stringify(r.data));
  r = await call("GET", `/api/access/register/status?id=${regId}`);
  check("status completed com nome, UID e dispositivo", r.data.status === "completed" && r.data.uid === "04F3A9C2" && r.data.name === "Rita Lopes" && r.data.deviceName === "Porta reuniões", JSON.stringify(r.data));
  const newUserId = r.data.user && r.data.user.id;
  r = await call("GET", "/api/access/cards?uid=04F3A9C2");
  check("cartão aparece em Cartões", r.data.cards.length === 1 && r.data.cards[0].userName === "Rita Lopes");
  r = await call("GET", `/api/access/permissions?userId=${newUserId}`);
  check("permissões do formulário gravadas (sala, só entrada, horário)", r.data.permissions.length === 1 && r.data.permissions[0].roomId === "sala-reunioes" && r.data.permissions[0].canEnter && !r.data.permissions[0].canExit && r.data.permissions[0].schedule.from === "00:00", JSON.stringify(r.data.permissions));
  r = await esp("GET", "/api/device/esp32-door-02/command", undefined, key);
  check("comando volta a null depois do registo", r.data.command === null);

  // Associar cartão a utilizador existente
  r = await call("POST", "/api/access/register/start", { userId: 2, deviceId: "esp32-door-02", readerId: "outside", doorId: "sala-reunioes", permissions: { canEnter: true, canExit: true } });
  const reg2 = r.data.registrationId;
  await esp("POST", "/api/access/register/card", { registrationId: reg2, deviceId: "esp32-door-02", readerId: "outside", uid: "0A0B0C0D" }, key);
  r = await call("GET", `/api/access/register/status?id=${reg2}`);
  check("associar cartão a utilizador existente (sem criar novo)", r.data.status === "completed" && r.data.user.id === 2 && r.data.name === "João Costa", JSON.stringify(r.data));

  // Duplicado
  r = await call("POST", "/api/access/register/start", { name: "Duplicado", deviceId: "esp32-door-02", readerId: "outside", doorId: "sala-reunioes", permissions: { canEnter: true, canExit: true } });
  const reg3 = r.data.registrationId;
  r = await esp("POST", "/api/access/register/card", { registrationId: reg3, deviceId: "esp32-door-02", readerId: "outside", uid: "04A1B201" }, key);
  check("cartão duplicado → 409 para o ESP32", r.status === 409 && r.data.error === "card_already_registered");
  r = await call("GET", `/api/access/register/status?id=${reg3}`);
  check("painel vê 'duplicate' com o dono", r.data.status === "duplicate" && r.data.ownerName === "Ana Silva", JSON.stringify(r.data));

  // Cancelar
  r = await call("POST", "/api/access/register/start", { name: "Cancelar", deviceId: "esp32-door-02", readerId: "outside", doorId: "sala-reunioes", permissions: { canEnter: true, canExit: true } });
  const reg4 = r.data.registrationId;
  r = await call("POST", "/api/access/register/cancel", { registrationId: reg4 });
  check("cancelar registo", r.status === 200 && r.data.status === "cancelled");
  r = await esp("GET", "/api/device/esp32-door-02/command", undefined, key);
  check("após cancelar, ESP32 não recebe comando", r.data.command === null);
  r = await call("POST", "/api/access/register/cancel", { registrationId: regId });
  check("cancelar registo já concluído → 409 com estado real", r.status === 409 && r.data.status === "completed");

  // Erros específicos no start
  r = await call("POST", "/api/access/register/start", { name: "X Y", deviceId: "esp32-door-01", readerId: "outside", doorId: "main-door", permissions: { canEnter: true } });
  check("ESP32 sem heartbeat → 409 device_offline", r.status === 409 && r.data.error === "device_offline");
  r = await call("POST", "/api/access/register/start", { name: "X Y", deviceId: "esp32-door-02", readerId: "inside", doorId: "sala-reunioes", permissions: { canEnter: true } });
  check("leitor inexistente → 422 reader_unavailable", r.status === 422 && r.data.error === "reader_unavailable");
  r = await call("POST", "/api/access/register/start", { name: "X Y", deviceId: "nao-existe", readerId: "outside", doorId: "main-door", permissions: { canEnter: true } });
  check("dispositivo inexistente → 404 device_not_found", r.status === 404 && r.data.error === "device_not_found");
  r = await call("POST", "/api/access/register/start", { name: "", deviceId: "esp32-door-02", readerId: "outside", doorId: "sala-reunioes", permissions: { canEnter: true } });
  check("nome em falta → 422 validation_error", r.status === 422);

  // --- Acesso e histórico
  r = await esp("POST", "/api/access/card", { eventId: "t-1", deviceId: "esp32-door-02", readerId: "outside", uid: "04F3A9C2" }, key);
  check("acesso com cartão novo (entrada) → open", r.data.authorized === true && r.data.action === "open" && r.data.user.name === "Rita Lopes", JSON.stringify(r.data));
  r = await esp("POST", "/api/access/event", { eventId: "esp32-door-02-boot-1", uid: "04F3A9C2", deviceId: "esp32-door-02", readerId: "outside", doorId: "main-door", decision: "granted", reason: "access_granted", source: "rfid" }, key);
  check("evento gravado", r.status === 200 && r.data.logged === true);
  r = await esp("POST", "/api/access/event", { eventId: "esp32-door-02-boot-1", uid: "04F3A9C2", deviceId: "esp32-door-02", readerId: "outside", decision: "granted" }, key);
  check("reenvio do mesmo evento → 200 (idempotente)", r.status === 200 && r.data.duplicate === true);
  r = await call("GET", "/api/access/logs?deviceId=esp32-door-02&result=allowed&direction=in");
  check("histórico filtrado mostra o evento com utilizador e sala do dispositivo", r.data.total === 1 && r.data.logs[0].userName === "Rita Lopes" && r.data.logs[0].roomName === "Sala de reuniões", JSON.stringify(r.data.logs));
  r = await call("GET", `/api/access/logs?dateFrom=2000-01-01&dateTo=2000-01-02`);
  check("filtro de datas", r.data.total === 0);
  r = await call("GET", "/api/access/logs/export?deviceId=esp32-door-02");
  check("exportação CSV do servidor", r.status === 200 && /text\/csv/.test(r.headers.get("content-type")) && r.data.includes("Rita Lopes"));

  // --- Desativar / revogar
  r = await call("PATCH", `/api/access/devices/${dev2.id}`, { active: false });
  check("desativar dispositivo", r.data.device.active === false);
  await heartbeat("esp32-door-02", "AA:BB:CC:00:00:02", key);
  r = await call("GET", "/api/access/devices?q=esp32-door-02");
  check("heartbeat NÃO reativa o dispositivo", r.data.devices[0].active === false && r.data.devices[0].online === true);
  r = await esp("POST", "/api/access/card", { deviceId: "esp32-door-02", readerId: "outside", uid: "04F3A9C2" }, key);
  check("dispositivo desativado nega acesso", r.data.authorized === false && r.data.reason === "device_disabled");
  r = await call("POST", "/api/access/register/start", { name: "X Y", deviceId: "esp32-door-02", readerId: "outside", doorId: "sala-reunioes", permissions: { canEnter: true } });
  check("registo num dispositivo desativado → 409 device_disabled", r.status === 409 && r.data.error === "device_disabled");
  r = await call("POST", `/api/access/devices/${dev2.id}/revoke`);
  check("revogar dispositivo (remove credencial)", r.data.device.approvalStatus === "revoked" && r.data.device.hasCredential === false);
  r = await call("GET", `/api/access/devices/${dev2.id}/status`);
  check("teste de comunicação devolve heartbeat", r.status === 200 && r.data.online === true && typeof r.data.message === "string");

  // --- Utilizadores / cartões / permissões
  r = await call("PATCH", `/api/access/permissions/1`, { roomId: "sala-reunioes", canEnter: true, canExit: false });
  check("permissão nova (upsert) para utilizador 1", r.status === 200);
  r = await call("GET", `/api/access/permissions?userId=1`);
  check("utilizador 1 tem agora 2 salas", r.data.permissions.length === 2);
  r = await call("PATCH", `/api/access/users/1`, { contact: "9111111" });
  check("editar utilizador", r.status === 200);
  r = await call("GET", "/api/access/users?q=Ana");
  check("lista de utilizadores com total e salas por nome", r.data.total === 1 && r.data.users[0].contact === "9111111" && /Entrada principal/.test(r.data.users[0].rooms), JSON.stringify(r.data.users));
  r = await call("PATCH", "/api/access/cards/1", { status: "revoked" });
  check("revogar cartão", r.status === 200);
  r = await call("GET", "/api/access/cards?status=revoked");
  check("filtro de cartões revogados", r.data.cards.some((c) => c.uid === "04A1B201"));

  // --- Sessão expirada
  await call("POST", "/__bench/expire", {});
  r = await call("GET", "/api/access/users");
  check("sessão expirada → 401", r.status === 401);

  const fails = results.filter((x) => !x).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
