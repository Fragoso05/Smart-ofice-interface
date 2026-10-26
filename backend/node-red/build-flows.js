#!/usr/bin/env node
// Gera os ficheiros de fluxo Node-RED (importáveis) a partir de src/*.js.
// Uso: node backend/node-red/build-flows.js
// Os fluxos usam o nó de configuração MySQL já existente no Node-RED da
// Hostinger ("Smart office", id 96426fc49ec39659): nenhuma credencial é exportada.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SRC = path.join(__dirname, "src");
const MYSQL_CONFIG_ID = "96426fc49ec39659";

const id = (seed) => crypto.createHash("sha1").update(seed).digest("hex").slice(0, 16);
const read = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

function buildFlow({ key, label, info, routes, apiFile, errorFile, apiName, errorName }) {
  const tab = id(`${key}:tab`);
  const fnId = id(`${key}:function`);
  const sqlId = id(`${key}:mysql`);
  const resId = id(`${key}:response`);
  const catchId = id(`${key}:catch`);
  const errId = id(`${key}:error`);

  const httpIns = routes.map(([method, url], i) => ({
    id: id(`${key}:in:${method}:${url}`),
    type: "http in",
    z: tab,
    name: `${method} ${url}`,
    url,
    method: method.toLowerCase(),
    upload: false,
    skipBodyParsing: false,
    swaggerDoc: "",
    x: 200,
    y: 60 + i * 44,
    wires: [[fnId]],
  }));

  const middle = 60 + (routes.length * 44) / 2;

  return [
    { id: tab, type: "tab", label, disabled: false, info },
    ...httpIns,
    {
      id: fnId, type: "function", z: tab, name: apiName, func: read(apiFile),
      outputs: 2, timeout: 0, noerr: 0, initialize: "", finalize: "", libs: [],
      x: 560, y: middle, wires: [[sqlId], [resId]],
    },
    {
      id: sqlId, type: "mysql", z: tab, mydb: MYSQL_CONFIG_ID, name: "MySQL Smart Office (existente)",
      x: 860, y: middle - 60, wires: [[fnId]],
    },
    {
      id: resId, type: "http response", z: tab, name: "Resposta HTTP", statusCode: "", headers: {},
      x: 880, y: middle + 40, wires: [],
    },
    {
      id: catchId, type: "catch", z: tab, name: "Erros MySQL / função", scope: [sqlId, fnId], uncaught: false,
      x: 560, y: middle + 140, wires: [[errId]],
    },
    {
      id: errId, type: "function", z: tab, name: errorName, func: read(errorFile),
      outputs: 1, timeout: 0, noerr: 0, initialize: "", finalize: "", libs: [],
      x: 820, y: middle + 140, wires: [[resId]],
    },
  ];
}

const ADMIN_ROUTES = [
  ["GET", "/api/access/dashboard"],
  ["GET", "/api/access/users"],
  ["POST", "/api/access/users"],
  ["PATCH", "/api/access/users/:id"],
  ["GET", "/api/access/cards"],
  ["PATCH", "/api/access/cards/:id"],
  ["GET", "/api/access/permissions"],
  ["PATCH", "/api/access/permissions/:id"],
  ["GET", "/api/access/rooms"],
  ["POST", "/api/access/rooms"],
  ["PATCH", "/api/access/rooms/:id"],
  ["GET", "/api/access/device-types"],
  ["GET", "/api/access/devices"],
  ["POST", "/api/access/devices"],
  ["PATCH", "/api/access/devices/:id"],
  ["POST", "/api/access/devices/:id/:action"],
  ["GET", "/api/access/devices/:id/status"],
  ["GET", "/api/access/logs"],
  ["GET", "/api/access/logs/export"],
  ["POST", "/api/access/register/start"],
  ["GET", "/api/access/register/status"],
  ["POST", "/api/access/register/cancel"],
];

const DEVICE_ROUTES = [
  ["POST", "/api/device/register"],
  ["GET", "/api/device/:deviceId/command"],
  ["POST", "/api/access/register/card"],
  ["POST", "/api/access/card"],
  ["POST", "/api/access/event"],
  ["GET", "/api/health"],
];

const flows = {
  "smart-office-admin-api-v4.json": buildFlow({
    key: "so-admin-v4",
    label: "Smart Office Admin API v4",
    info: "API do painel administrativo (sessão DevTeam). Substitui os separadores Admin GET / Consultas / v3.\nGerado por backend/node-red/build-flows.js — não editar à mão.",
    routes: ADMIN_ROUTES,
    apiFile: "admin-api.js",
    errorFile: "admin-error.js",
    apiName: "Admin API v4",
    errorName: "Erros Admin API",
  }),
  "smart-office-device-api-v2.json": buildFlow({
    key: "so-device-v2",
    label: "Smart Office Dispositivos v2",
    info: "API usada pelos ESP32 (heartbeat, comandos, registo de cartão, acesso, eventos). Substitui o fluxo RFID anterior.\nGerado por backend/node-red/build-flows.js — não editar à mão.",
    routes: DEVICE_ROUTES,
    apiFile: "device-api.js",
    errorFile: "device-error.js",
    apiName: "Dispositivos API v2",
    errorName: "Erros Dispositivos API",
  }),
};

for (const [file, nodes] of Object.entries(flows)) {
  const out = path.join(__dirname, file);
  fs.writeFileSync(out, JSON.stringify(nodes, null, 2) + "\n");
  console.log(`${file}: ${nodes.length} nós`);
}
