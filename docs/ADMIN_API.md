# Área administrativa — endpoints (Node-RED)

Contrato entre o painel (`js/adminApi.js`) e o Node-RED em
`https://support.smartcitycaboverde.com`. A implementação de referência está em
[`backend/`](../backend/README.md): dois fluxos Node-RED importáveis e uma migração SQL.

O painel **nunca simula respostas**. Se um endpoint faltar, a vista mostra
«Funcionalidade indisponível» (ou o aviso de CORS, ver §2.4) e o resto continua a funcionar.
**Definições → Verificar endpoints** lista, no próprio painel, os GET disponíveis.

## 1. Estado em produção (verificado a 26/10/2026, só com pedidos GET/OPTIONS)

| Área | Estado |
|---|---|
| `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/admin/logout` | Existem (fluxo de login atual, não incluído no repositório). |
| `GET /api/access/dashboard`, `/users`, `/cards`, `/devices`, `/rooms`, `/permissions`, `/logs` | Existem (fluxo v3). Respondem `401 session_expired` sem sessão. |
| `PATCH` de `users`, `cards`, `permissions` | Definidos no fluxo v3, mas **bloqueados pelo navegador**: o CORS do Node-RED não autoriza `PATCH` (§2.3). |
| Dispositivos IoT (criar/editar/aprovar/credenciais), salas (criar/editar), tipos | **Em falta** → Admin API v4. |
| `register/start`, `register/status`, `register/cancel` | **Em falta** no servidor atual → Admin API v4. |
| Protocolo ESP32 (`/api/device/register`, `/api/device/:id/command`, `/api/access/register/card`, `/api/access/card`, `/api/access/event`, `/api/health`) | **Em falta** no servidor atual (`Cannot GET …`). O firmware v2 aponta para este servidor → Dispositivos v2. |
| `GET /api/access/logs/export` | Em falta → Admin API v4 (o painel gera o CSV no navegador enquanto não existir). |
| `POST /api/door/open`, `GET /api/door/status` | **Em falta e fora do âmbito** (§7). |

## 2. Convenções

### 2.1 Formato

* JSON. Erro: código HTTP + `{ "success": false, "error": "<codigo>", "message": "<texto>" }`.
* Listas: `{ "<recurso>": [...], "total": 42, "page": 1, "pageSize": 10 }`.
* Booleanos podem chegar como `0/1` (MySQL); o painel normaliza.
* Datas: as do MySQL, convertidas pelo Node-RED para ISO 8601. Filtros de data/hora
  são interpretados na hora do escritório (Cabo Verde, UTC−1; variável
  `SMART_OFFICE_UTC_OFFSET_MINUTES`).

| HTTP | Significado | O painel mostra |
|---|---|---|
| 400 / 422 | dados inválidos (`validation_error`, `reader_unavailable`) | «Dados inválidos: …» com a mensagem do servidor |
| 401 | sessão inexistente/expirada | volta ao login |
| 403 | origem não autorizada / sem permissão | «Permissão insuficiente» |
| 404 + JSON | registo inexistente (`device_not_found`, …) | «Não encontrado» |
| 409 | conflito (`device_offline`, `device_disabled`, `card_already_registered`, `device_exists`, `room_in_use`, …) | mensagem específica |
| 500 | `database_error` / `schema_outdated` | «Erro na base de dados» |

### 2.2 Sessão e proteção de escritas

* Cookie `smart_office_admin` (64 hex, `HttpOnly`), criado pelo login atual. O Node-RED
  guarda `SHA-256(token) → expiração` em `global.smartOfficeAdminSessions`.
* O painel usa `credentials: "include"` em todos os pedidos e não guarda passwords nem
  tokens em `localStorage`.
* **CSRF:** as escritas só são aceites se o cabeçalho `Origin` estiver na lista
  `SMART_OFFICE_ALLOWED_ORIGINS` (predefinição `https://smart-office-self.vercel.app`).
  Se o login passar a devolver `csrfToken`, o painel envia-o em `X-CSRF-Token`.

### 2.3 CORS — correção obrigatória no `server.js` da Hostinger

```js
httpNodeCors: {
  origin: "https://smart-office-self.vercel.app",
  methods: "GET,PUT,POST,PATCH,DELETE,OPTIONS",   // ← falta PATCH hoje
  allowedHeaders: "Content-Type,Authorization,X-CSRF-Token",
  credentials: true,
  optionsSuccessStatus: 204
},
functionGlobalContext: { crypto: require("crypto") },  // usado pelos fluxos
```

Reiniciar o Node-RED depois de alterar.

### 2.4 Endpoints inexistentes aparecem como CORS no navegador

O Node-RED responde a rotas inexistentes com um `404` **sem** cabeçalhos CORS. O navegador
não deixa ler essa resposta, por isso o painel mostra «Pedido bloqueado (CORS)» com as duas
causas possíveis (endpoint em falta ou método não autorizado). Para confirmar qual é:
`curl -i -H "Origin: https://smart-office-self.vercel.app" https://support.smartcitycaboverde.com/<rota>`.

## 3. Admin API v4 (painel, requer sessão)

`backend/node-red/smart-office-admin-api-v4.json`

| Método | Rota | Corpo / parâmetros | Resposta |
|---|---|---|---|
| GET | `/api/access/dashboard` | — | `stats{activeUsers, entriesToday, exitsToday, deniedToday, devicesOnline, devicesOffline, devicesPending, doorsCount}`, `recent[]`, `recentCards[]` |
| GET | `/api/access/users` | `q, status, id, page, pageSize` | `users[], total` |
| POST | `/api/access/users` | `name, contact, email, active` | `201 user{id}` |
| PATCH | `/api/access/users/:id` | `name, contact, email, active, revokeCards` | `updated` |
| GET | `/api/access/cards` | `uid, user, userId, status, page, pageSize` | `cards[]` (com `lastUsedAt`), `total` |
| PATCH | `/api/access/cards/:id` | `status: active\|revoked` | `updated` |
| GET | `/api/access/permissions` | `userId` | `permissions[]` agrupadas por sala |
| PATCH | `/api/access/permissions/:userId` | `roomId, canEnter, canExit` | cria nos cartões em falta e atualiza todos |
| GET | `/api/access/rooms` | — | `rooms[]` com `deviceCount` |
| POST | `/api/access/rooms` | `id, name, description` | `201`; `409 room_exists` |
| PATCH | `/api/access/rooms/:id` | `name, description, newId` | `409 room_in_use` se mudar o ID de uma sala usada |
| GET | `/api/access/device-types` | — | `types[]{id, label, rfidCapable, configSchema[]}` |
| GET | `/api/access/devices` | `q, type, status, connection, roomId, rfid=1` | `devices[]` (ver abaixo) |
| POST | `/api/access/devices` | `deviceId, name, type, roomId, hardwareId, description, active, readers[], config{}` | `201 device`; `409 device_exists` |
| PATCH | `/api/access/devices/:id` | mesmos campos (exceto `deviceId`) | `device` atualizado; `409 device_not_approved` ao ativar um pendente |
| POST | `/api/access/devices/:id/approve` · `reject` · `revoke` | — | `device` atualizado |
| POST | `/api/access/devices/:id/credentials` | — | `device`, `credential{deviceKey, header}` — **a chave só é devolvida uma vez** |
| GET | `/api/access/devices/:id/status` | — | `online, secondsSinceSeen, message` (teste de comunicação) |
| GET | `/api/access/logs` | `q, userId, roomId, deviceId, readerId, direction, result, dateFrom, dateTo, timeFrom, timeTo, order, page, pageSize` | `logs[], total` |
| GET | `/api/access/logs/export` | mesmos filtros | `text/csv` (máx. 10 000 linhas) |
| POST | `/api/access/register/start` | `name, contact, userId?, deviceId, readerId, doorId, permissions{canEnter,canExit}, schedule{from,to}\|null, active` | `201 registrationId, expiresAt` |
| GET | `/api/access/register/status` | `id` (ou `registrationId`) | `status, uid, name, deviceName, roomName, deviceOnline, ownerName, errorCode` |
| POST | `/api/access/register/cancel` | `registrationId` | `cancelled`; `409 registration_not_cancellable` + `status` real |

Dispositivo: `id` (numérico, usado nos PATCH), `deviceId`, `name`, `type`, `typeLabel`,
`rfidCapable`, `roomId`, `roomName`, `approvalStatus` (`pending|approved|rejected|revoked`),
`active`, `online`, `secondsSinceSeen`, `lastSeen`, `readers[]`, `ipAddress`,
`firmwareVersion`, `wifiRssi`, `hardwareId`, `hasCredential`, `config`.

* **Ativo/Inativo** = decisão do administrador. **Online/Offline** = heartbeat nos últimos 90 s.
* Erros de `register/start`, verificados antes de criar o pedido: `device_not_found` (404),
  `device_not_approved`, `device_disabled`, `device_offline` (409), `reader_unavailable`
  (422, sem leitor RFID ou leitor não instalado), `room_not_found`, `user_not_found` (404).
* Estados de `register/status`: `waiting_card` → `completed`, ou `duplicate`, `expired`,
  `cancelled` (`errorCode: superseded` se outro registo o substituiu), `error`
  (`errorCode: device_disabled | database_error | user_not_found | door_not_defined`).
  `completed` só existe depois do `COMMIT` no MySQL.

Todas as escritas ficam em `access_admin_audit`.

## 4. Dispositivos v2 (ESP32, sem sessão)

`backend/node-red/smart-office-device-api-v2.json`. Contrato igual ao do firmware
`SmartOffice_ESP32_RC522_v2`: o firmware não precisa de alterações.

| Método | Rota | Notas |
|---|---|---|
| POST | `/api/device/register` | Heartbeat a cada 60 s. Dispositivo desconhecido → criado como **pendente**. Nunca reativa nem renomeia (antes forçava `active=1`). MAC diferente → `409 hardware_mismatch`. |
| GET | `/api/device/:deviceId/command` | Polling a cada 2 s; devolve `REGISTER_CARD` só a dispositivos aprovados e ativos. Atualiza o heartbeat no máximo a cada 20 s. |
| POST | `/api/access/register/card` | Chama `register_access_card` (migração). |
| POST | `/api/access/card` | Decisão de acesso: aprovação, estado, permissão e **janela horária**. |
| POST | `/api/access/event` | Grava `user_id`/`card_id` (antes ficavam vazios → «Cartão desconhecido»). Reenvio do mesmo `eventId` → 200. |
| GET | `/api/health` | — |

**Credencial do dispositivo:** se o painel gerou uma credencial, o ESP32 tem de enviar
`X-Device-Key` (o firmware já o faz com `DEVICE_API_KEY`). Sem credencial, o dispositivo
continua a funcionar (transição), e o painel mostra «Sem credencial».

## 5. Base de dados

`backend/sql/001_device_management.sql`, idempotente:

* novas tabelas `access_device_types` (10 tipos), `access_rooms` (preenchida a partir dos `door_id` existentes) e `access_admin_audit`;
* novas colunas em `access_devices` (tipo, aprovação, leitores, configuração, credencial), em `access_registration_requests` (sala, permissões, horário, utilizador existente) e em `access_permissions` (`time_from`, `time_to`);
* `register_access_card` substituído (mesma assinatura): usa os dados do formulário e marca `duplicate`/`expired`/`error` para o painel ver.

Os dispositivos existentes ficam `approved` e ativos, por isso nada deixa de funcionar.

## 6. Ainda indisponível

| Funcionalidade | Porquê | O painel |
|---|---|---|
| Abrir porta remotamente (`POST /api/door/open`, `GET /api/door/status`) | O firmware v2 ignora deliberadamente `OPEN_DOOR`. É preciso um comando autenticado no firmware e no fluxo. | Pede confirmação e depois mostra «Abertura remota indisponível — nenhum comando foi confirmado». |
| Teste de comunicação ativo (ping) | O firmware não responde a comandos de teste | «Testar comunicação» lê o último heartbeat |
| Permissões administrativas por utilizador admin | O login atual não devolve `permissions` | O painel não esconde nada; o backend decide |

## 7. Notas de segurança

* O UID de um cartão RC522/PN532 pode ser copiado. Para portas sensíveis, usar cartões com autenticação criptográfica (ex.: DESFire EV2/EV3).
* As credenciais de dispositivo são geradas no servidor (`crypto.randomBytes`), guardadas apenas como SHA-256 e mostradas uma única vez. O painel nunca as gera.
* O frontend nunca fala com o ESP32: painel → Node-RED → MySQL/ESP32.
