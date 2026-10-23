# Área administrativa — contrato da API (Node-RED)

Este documento descreve o que o frontend (`js/adminApi.js`) espera do backend
Node-RED em `https://support.smartcitycaboverde.hostingersite.com`.

O frontend **nunca simula respostas**: se um endpoint não existir, a vista
mostra «Funcionalidade indisponível» e o resto da interface continua a funcionar.
Em **Definições → Verificar endpoints** é possível ver, no próprio painel, quais
os endpoints GET já disponíveis.

## 1. Estado verificado em 21/10/2026

| Endpoint | Estado |
|---|---|
| `GET /api/access/register/status` | **Existe.** Lê o parâmetro `?id=` (o frontend envia `id` e `registrationId`). Erros: `registration_id_required`, `registration_not_found`. |
| `GET /api/admin/session`, `/api/access/dashboard`, `/users`, `/cards`, `/rooms`, `/devices`, `/permissions`, `/logs`, `/logs/export`, `/api/door/status` | **Em falta** (`Cannot GET …`). |
| `POST /api/admin/login`, `/logout`, `/api/access/register/start`, `/register/cancel`, `/api/door/open`, `PATCH …` | Não verificado: não foram feitos pedidos de escrita em produção. |
| CORS | Atualmente `Access-Control-Allow-Origin: *`, sem `Allow-Credentials`, sem `PATCH` e sem `X-CSRF-Token`. **Tem de ser alterado** (ver §2.3) para o login funcionar. |

## 2. Convenções

### 2.1 Formato

* Pedidos e respostas em JSON (`Content-Type: application/json`).
* Erro: código HTTP adequado + corpo `{ "success": false, "error": "<codigo>", "message": "<opcional>" }`.
* Um `404` **com** JSON é tratado como «não encontrado»; um `404` sem JSON (página
  padrão do Node-RED) é tratado como «endpoint inexistente».
* Listas: `{ "items": [...], "total": 123, "page": 1, "pageSize": 10 }`.
  O frontend também aceita a chave com o nome do recurso (`users`, `cards`, `logs`, …).
* Datas em ISO 8601 UTC (`2026-10-21T09:12:00Z`). O frontend converte para o fuso do
  escritório (predefinição `Atlantic/Cape_Verde`, configurável em Definições) e envia
  `tz=` nos filtros para o backend interpretar datas/horas no mesmo fuso.

Códigos de erro com mensagem própria na interface: `invalid_credentials`,
`too_many_attempts`, `session_expired`, `csrf_invalid`, `forbidden`,
`registration_id_required`, `registration_not_found`, `card_already_registered`,
`device_offline`, `device_not_found`, `user_not_found`, `validation_error`.

### 2.2 Sessão e CSRF

* `POST /api/admin/login` cria a sessão e devolve o cookie:
  `Set-Cookie: so_admin=<id aleatório>; HttpOnly; Secure; SameSite=None; Path=/api; Max-Age=1800`
  * `SameSite=None` é obrigatório enquanto o site (`*.vercel.app`) e a API
    (`*.hostingersite.com`) estiverem em domínios diferentes. Se ambos passarem a
    subdomínios do mesmo domínio (ex.: `painel.empresa.cv` e `api.empresa.cv`), usar `SameSite=Lax`/`Strict`.
* A resposta do login e de `GET /api/admin/session` inclui `csrfToken`.
  O frontend guarda-o **só em memória** e envia-o em `X-CSRF-Token` em todos os
  pedidos `POST`/`PATCH`. O backend deve rejeitar com `403 csrf_invalid` se faltar ou não corresponder à sessão.
* O backend deve também validar o cabeçalho `Origin` contra a lista de origens permitidas.
* `401` em qualquer pedido → o painel volta ao ecrã de login («sessão expirou»).
* `403` → mensagem «Não tem permissão».

### 2.3 CORS (obrigatório)

Para cada pedido (incluindo `OPTIONS`):

```
Access-Control-Allow-Origin: https://<projeto>.vercel.app      ← origem exata, nunca "*"
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-CSRF-Token
Access-Control-Expose-Headers: Content-Disposition, X-CSRF-Token
Vary: Origin
```

Manter uma lista explícita de origens (domínio de produção Vercel + `http://localhost:*`
apenas em desenvolvimento) e devolver a origem do pedido só se estiver na lista.
Os endpoints usados pelo ESP32 não precisam de CORS.

## 3. Administração

### `POST /api/admin/login`

```json
{ "username": "DevTeam", "password": "…" }
```

Resposta `200`:

```json
{
  "success": true,
  "authenticated": true,
  "admin": { "username": "DevTeam", "displayName": "DevTeam", "permissions": ["door.open", "users.write"] },
  "csrfToken": "…"
}
```

Erros: `401 invalid_credentials`, `429 too_many_attempts`.
Requisitos: password guardada com **argon2id** ou **bcrypt (custo ≥ 12)**; comparação
em tempo constante; limitar tentativas por IP e por utilizador; registar na auditoria.

### `GET /api/admin/session`

`200 { "authenticated": true, "admin": {…}, "csrfToken": "…" }` ou `401 session_expired`.

### `POST /api/admin/logout`

Invalida a sessão no servidor e apaga o cookie (`Max-Age=0`). `200 { "success": true }`.

### Permissões

Se `admin.permissions` vier preenchido, o botão «Abrir porta» só fica ativo com
`door.open` (ou `*`). Se não vier, a interface não esconde nada e o backend decide.
**O backend tem sempre de validar as permissões**; o frontend só ajusta a apresentação.

### Administrador inicial `DevTeam`

A palavra-passe **não** está no repositório nem no frontend. Sugestão de configuração única:

1. Definir no Node-RED (Hostinger) a variável de ambiente `ADMIN_BOOTSTRAP_PASSWORD`.
2. Um fluxo de arranque verifica se a tabela `admins` está vazia; se estiver, cria
   `DevTeam` com `argon2id(ADMIN_BOOTSTRAP_PASSWORD)` e regista o evento na auditoria.
3. Remover a variável de ambiente após o primeiro arranque e alterar a palavra-passe.

## 4. Registo RFID

### `POST /api/access/register/start`

```json
{
  "name": "Utilizador Exemplo",
  "contact": "9000000",
  "userId": 12,
  "deviceId": "esp32-door-01",
  "readerId": "outside",
  "doorId": "main-door",
  "permissions": { "canEnter": true, "canExit": true },
  "schedule": { "from": "08:00", "to": "18:00", "tz": "Atlantic/Cape_Verde" },
  "active": true
}
```

* `userId` só existe quando se associa um cartão a um utilizador existente.
* `schedule` é `null` quando não há restrição de horário.

Resposta: `200 { "success": true, "registrationId": "…", "status": "waiting", "expiresAt": "…" }`.
Erros: `409 device_offline`, `404 device_not_found`, `400 validation_error`.

### `GET /api/access/register/status?id=…&registrationId=…`

```json
{ "success": true, "registrationId": "…", "status": "completed", "uid": "04F3A9C2", "user": { "id": 31, "name": "Utilizador Exemplo" } }
```

`status`: `waiting` → `card_received` → `saving` → `completed`, ou um estado final
`duplicate` (incluir `ownerName`), `expired`, `device_offline`, `cancelled`, `error`.

**`completed` só pode ser devolvido depois do `COMMIT` da transação MySQL.**
O frontend nunca mostra «Registo concluído» sem este estado.

### `POST /api/access/register/cancel`

`{ "registrationId": "…" }` → `200 { "success": true, "status": "cancelled" }`.
Se este endpoint não existir, o frontend avisa que o registo continua ativo até expirar e continua a acompanhar o estado.

## 5. Gestão

### `GET /api/access/users?q=&status=active|inactive&page=1&pageSize=10`

Item: `{ "id", "name", "contact", "cardCount", "rooms": ["Principal"], "active", "createdAt" }`

### `POST /api/access/users`

Cria um utilizador sem cartão (`{ name, contact, active }`). O fluxo normal de criação é o registo RFID (§4).

### `PATCH /api/access/users/:id`

Campos aceites: `name`, `contact`, `active`, `revokeCards` (revoga todos os cartões).
Resposta: `{ "success": true, "user": {…} }`. Registar na auditoria (admin da sessão, antes/depois).

### `GET /api/access/cards?uid=&user=&userId=&status=&page=&pageSize=`

Item: `{ "id", "uid", "userId", "userName", "status": "active|suspended|revoked|lost", "permissions": ["Principal"], "createdAt", "lastUsedAt" }`

### `PATCH /api/access/cards/:id`

`{ "status": "revoked" }`. Transferir um cartão entre utilizadores exige `{ "userId": <novo>, "transfer": true }` explícito; sem isso devolver `409 card_already_registered`.

### `GET /api/access/rooms`

`{ "rooms": [{ "id": "main-door", "name": "Principal", "doorId": "main-door" }] }`

### `GET /api/access/devices`

```json
{ "devices": [{
  "deviceId": "esp32-door-01", "name": "Porta principal",
  "roomId": "main-door", "roomName": "Principal",
  "online": true, "lastSeen": "2026-10-21T09:12:00Z",
  "readers": ["outside", "inside"],
  "relayState": "off",
  "doorState": null,
  "origin": "remote"
}] }
```

`doorState`: `null` sem sensor; `"open"`/`"closed"` com sensor. Se `online` não vier, o
frontend considera online quando `lastSeen` tem menos de 90 s.

### `GET /api/access/permissions?userId=…`

`{ "permissions": [{ "id", "userId", "roomId", "roomName", "canEnter", "canExit", "schedule": { "from", "to" } }] }`

### `PATCH /api/access/permissions/:userId`

Upsert por (utilizador, sala): `{ "roomId": "meeting", "canEnter": true, "canExit": false }`.

## 6. Histórico e dashboard

### `GET /api/access/dashboard?tz=…`

```json
{ "activeUsers": 24, "entriesToday": 58, "exitsToday": 43, "deniedToday": 3, "recent": [ /* eventos, ver abaixo */ ] }
```

«Hoje» calculado no fuso `tz`. Se `recent` faltar, o frontend usa `GET /api/access/logs?pageSize=8`.

### `GET /api/access/logs`

Parâmetros (todos opcionais e combináveis):
`q` (nome), `userId`, `roomId`, `deviceId`, `readerId` (`outside|inside`),
`direction` (`in|out`), `result` (`allowed|denied`), `dateFrom`, `dateTo` (`YYYY-MM-DD`),
`timeFrom`, `timeTo` (`HH:MM`), `tz`, `sort=timestamp`, `order` (`asc|desc`), `page`, `pageSize` (≤ 200).

Evento:

```json
{
  "id": 981, "timestamp": "2026-10-21T09:12:00Z",
  "userName": "Ana Silva", "uid": "04A1B201",
  "roomId": "main-door", "roomName": "Principal",
  "deviceId": "esp32-door-01", "readerId": "outside",
  "direction": "in", "result": "allowed", "reason": null,
  "passageConfirmed": false
}
```

`passageConfirmed` só é `true` quando um sensor físico confirma a passagem. Sem isso,
a interface mostra «Entrada · autorizada · sem sensor», e não uma entrada confirmada.

### `GET /api/access/logs/export`

Mesmos filtros (sem paginação). Responde `text/csv; charset=utf-8` com
`Content-Disposition: attachment`. Se não existir, o frontend gera o CSV no
navegador a partir das páginas reais de `/api/access/logs` (máx. 10 000 linhas).

## 7. Controlo remoto da porta

### `POST /api/door/open`

`{ "deviceId": "esp32-door-01", "duration": 4000 }`. O administrador é identificado
**pela sessão**; qualquer campo `requestedBy` enviado pelo navegador deve ser ignorado/rejeitado.
Validar a permissão `door.open`, limitar `duration` (ex.: 1000–10000 ms) e registar na auditoria.

Resposta: `202 { "success": true, "commandId": "…", "status": "queued" }`. Erro: `409 device_offline`.

### `GET /api/door/status?commandId=…&deviceId=…`

`{ "status": "queued|accepted|executed|failed|timeout|offline", "doorState": null }`

* `accepted`: o ESP32 levantou o comando em `/api/device/command`.
* `executed`: o ESP32 confirmou em `POST /api/door/ack`.
* A interface mostra «Comando de abertura executado» e só mostra «Porta aberta» se `doorState === "open"` (sensor físico).

## 8. Protocolo do dispositivo (ESP32) — não usado pelo frontend

`POST /api/access/card`, `POST /api/access/register/card`,
`GET /api/device/command?deviceId=…` (devolve `REGISTER_CARD` com `registrationId`,
ou `OPEN_DOOR` com `commandId`/`duration`), `POST /api/door/ack`, `POST /api/door/state`.
Devem autenticar o dispositivo (ex.: token por dispositivo em cabeçalho, guardado no ESP32 e no servidor, nunca no frontend).

Nota: o UID do cartão é um identificador, não uma credencial segura; pode ser clonado.
Para portas sensíveis considerar cartões com autenticação criptográfica (ex.: DESFire EV2/EV3).

## 9. Esquema MySQL sugerido

```sql
CREATE TABLE admins (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL, permissions JSON NOT NULL, active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE admin_sessions (id CHAR(64) PRIMARY KEY, admin_id INT NOT NULL, csrf_token CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (admin_id) REFERENCES admins(id));
CREATE TABLE access_users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, contact VARCHAR(40),
  active TINYINT(1) DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE rooms (id VARCHAR(64) PRIMARY KEY, name VARCHAR(80) NOT NULL);
CREATE TABLE devices (id VARCHAR(64) PRIMARY KEY, name VARCHAR(80), room_id VARCHAR(64), readers JSON,
  last_seen DATETIME, relay_state VARCHAR(16), door_state VARCHAR(16) NULL, origin VARCHAR(16),
  FOREIGN KEY (room_id) REFERENCES rooms(id));
CREATE TABLE cards (id INT AUTO_INCREMENT PRIMARY KEY, uid VARCHAR(32) NOT NULL UNIQUE, user_id INT NOT NULL,
  status ENUM('active','suspended','revoked','lost') DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL, FOREIGN KEY (user_id) REFERENCES access_users(id));
CREATE TABLE permissions (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, room_id VARCHAR(64) NOT NULL,
  can_enter TINYINT(1) DEFAULT 0, can_exit TINYINT(1) DEFAULT 0, schedule_from TIME NULL, schedule_to TIME NULL,
  UNIQUE KEY (user_id, room_id));
CREATE TABLE access_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, ts DATETIME(3) NOT NULL, uid VARCHAR(32),
  user_id INT NULL, room_id VARCHAR(64), device_id VARCHAR(64), reader_id VARCHAR(16), direction ENUM('in','out'),
  result ENUM('allowed','denied'), reason VARCHAR(120), passage_confirmed TINYINT(1) DEFAULT 0,
  INDEX (ts), INDEX (user_id, ts), INDEX (room_id, ts));
CREATE TABLE audit_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, ts DATETIME(3) NOT NULL, admin_id INT, action VARCHAR(64),
  target VARCHAR(64), details JSON, ip VARCHAR(45));
```

`cards.uid UNIQUE` impede que o mesmo cartão fique associado a dois utilizadores.
O registo (§4) deve inserir utilizador, cartão e permissões numa única transação.
