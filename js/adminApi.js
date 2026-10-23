// ============================================================
// CLIENTE REST DA ÁREA ADMINISTRATIVA (controlo de acessos RFID)
//
// Configuração central da API + função única de pedidos HTTP.
// Nenhuma credencial é guardada aqui: a sessão vive num cookie HttpOnly
// definido pelo backend, e o token CSRF só existe em memória.
// ============================================================

const AdminApi = (() => {

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  // Pode ser sobreposta antes de carregar este ficheiro, por exemplo:
  // <script>window.SMART_OFFICE_ADMIN_API = "https://api.exemplo.com";</script>
  const CONFIG = {
    baseUrl: (window.SMART_OFFICE_ADMIN_API || "https://support.smartcitycaboverde.com").replace(/\/+$/, ""),
    timeoutMs: 12000,
    retries: 2,           // só para GET (operações seguras/idempotentes)
    retryDelayMs: 600,
    csrfHeader: "X-CSRF-Token",
  };

  const ENDPOINTS = {
    login: "/api/admin/login",
    session: "/api/admin/session",
    logout: "/api/admin/logout",

    registerStart: "/api/access/register/start",
    registerStatus: "/api/access/register/status",
    registerCancel: "/api/access/register/cancel",

    users: "/api/access/users",
    cards: "/api/access/cards",
    rooms: "/api/access/rooms",
    devices: "/api/access/devices",
    permissions: "/api/access/permissions",

    dashboard: "/api/access/dashboard",
    logs: "/api/access/logs",
    logsExport: "/api/access/logs/export",

    doorOpen: "/api/door/open",
    doorStatus: "/api/door/status",
  };

  // Mensagens legíveis para códigos de erro devolvidos pelo Node-RED ({ success:false, error:"..." })
  const ERROR_MESSAGES = {
    invalid_credentials: "Utilizador ou palavra-passe incorretos.",
    too_many_attempts: "Demasiadas tentativas. Aguarde alguns minutos.",
    session_expired: "A sessão expirou. Inicie sessão novamente.",
    csrf_invalid: "Pedido rejeitado (CSRF). Recarregue a sessão.",
    forbidden: "Não tem permissão para esta operação.",
    registration_id_required: "Identificador de registo em falta.",
    registration_not_found: "Sessão de registo não encontrada ou expirada.",
    card_already_registered: "Este cartão já está registado.",
    device_offline: "O dispositivo ESP32 está offline.",
    device_not_found: "Dispositivo desconhecido.",
    user_not_found: "Utilizador não encontrado.",
    validation_error: "Dados inválidos.",
  };

  // ============================================================
  // ERROS
  // ============================================================

  // kind: "network" | "timeout" | "unavailable" | "unauthorized" | "forbidden" | "http" | "parse" | "aborted"
  class ApiError extends Error {
    constructor(message, { kind = "http", status = 0, code = null, data = null, endpoint = "" } = {}) {
      super(message);
      this.name = "ApiError";
      this.kind = kind;
      this.status = status;
      this.code = code;
      this.data = data;
      this.endpoint = endpoint;
    }
  }

  // ============================================================
  // ESTADO EM MEMÓRIA (nunca em localStorage)
  // ============================================================

  let csrfToken = null;
  let unauthorizedHandler = null;
  const inflight = new Map();

  function setCsrfToken(token) {
    csrfToken = token || null;
  }

  function onUnauthorized(handler) {
    unauthorizedHandler = handler;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  function buildUrl(path, query) {
    const url = new URL(CONFIG.baseUrl + path);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        url.searchParams.set(key, String(value));
      });
    }
    return url.toString();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRetryable(error) {
    return error.kind === "network" || error.kind === "timeout" || [502, 503, 504].includes(error.status);
  }

  async function readBody(response) {
    const contentType = response.headers.get("content-type") || "";
    if (response.status === 204) return { json: null, text: "" };
    const text = await response.text();
    if (contentType.includes("application/json")) {
      try {
        return { json: JSON.parse(text), text };
      } catch (_) {
        throw new ApiError("Resposta JSON inválida do servidor.", { kind: "parse", status: response.status });
      }
    }
    return { json: null, text };
  }

  function messageFor(code, fallback) {
    return (code && ERROR_MESSAGES[code]) || fallback;
  }

  // ============================================================
  // PEDIDO ÚNICO
  // ============================================================

  async function singleRequest(method, path, { query, body, timeoutMs, signal, responseType }) {
    const url = buildUrl(path, query);
    const endpoint = `${method} ${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs || CONFIG.timeoutMs);
    const onExternalAbort = () => controller.abort("aborted");
    if (signal) {
      if (signal.aborted) controller.abort("aborted");
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const headers = { Accept: responseType === "blob" ? "text/csv, application/json" : "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && csrfToken) headers[CONFIG.csrfHeader] = csrfToken;

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: "include", // cookie de sessão HttpOnly
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (networkError) {
      const reason = controller.signal.reason;
      if (reason === "timeout") {
        throw new ApiError("O servidor demorou demasiado a responder.", { kind: "timeout", endpoint });
      }
      if (reason === "aborted") {
        throw new ApiError("Pedido cancelado.", { kind: "aborted", endpoint });
      }
      throw new ApiError("Sem ligação ao servidor de automação.", { kind: "network", endpoint });
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onExternalAbort);
    }

    const headerToken = response.headers.get(CONFIG.csrfHeader);
    if (headerToken) setCsrfToken(headerToken);

    if (responseType === "blob" && response.ok) {
      return { blob: await response.blob(), headers: response.headers };
    }

    const { json, text } = await readBody(response);
    const code = json && typeof json.error === "string" ? json.error : null;
    const serverMessage = json && (json.message || (code && ERROR_MESSAGES[code] ? null : code));

    if (response.status === 401) {
      const error = new ApiError(messageFor(code, "Sessão inválida ou expirada."), { kind: "unauthorized", status: 401, code, data: json, endpoint });
      if (unauthorizedHandler && path !== ENDPOINTS.login && path !== ENDPOINTS.session) {
        unauthorizedHandler(error);
      }
      throw error;
    }

    if (response.status === 403) {
      throw new ApiError(messageFor(code, "Não tem permissão para esta operação."), { kind: "forbidden", status: 403, code, data: json, endpoint });
    }

    // Node-RED devolve "Cannot GET /api/..." (HTML) quando o endpoint não existe.
    // Um 404 com JSON é um "não encontrado" real (ex.: utilizador inexistente).
    if ((response.status === 404 && !json) || response.status === 501) {
      throw new ApiError(`Funcionalidade indisponível: o endpoint ${endpoint} ainda não existe no servidor.`, { kind: "unavailable", status: response.status, endpoint });
    }

    if (!response.ok) {
      throw new ApiError(messageFor(code, serverMessage || `Erro do servidor (${response.status}).`), { kind: "http", status: response.status, code, data: json || text, endpoint });
    }

    if (json && json.success === false) {
      throw new ApiError(messageFor(code, serverMessage || "O servidor recusou o pedido."), { kind: "http", status: response.status, code, data: json, endpoint });
    }

    if (json && typeof json.csrfToken === "string") setCsrfToken(json.csrfToken);

    return json !== null ? json : text;
  }

  // ============================================================
  // FUNÇÃO CENTRAL: timeout, retry (só GET), proteção contra duplicados
  // ============================================================

  async function request(method, path, options = {}) {
    const upper = method.toUpperCase();
    const key = options.dedupe === false ? null : `${upper} ${buildUrl(path, options.query)} ${options.body ? JSON.stringify(options.body) : ""}`;

    // Pedido idêntico já em curso (ex.: duplo toque num botão) → reutiliza a mesma promessa
    if (key && inflight.has(key)) return inflight.get(key);

    const maxRetries = upper === "GET" ? (options.retries ?? CONFIG.retries) : 0;

    const run = (async () => {
      let attempt = 0;
      for (;;) {
        try {
          return await singleRequest(upper, path, options);
        } catch (error) {
          if (attempt >= maxRetries || !isRetryable(error) || options.signal?.aborted) throw error;
          attempt += 1;
          await wait(CONFIG.retryDelayMs * attempt);
        }
      }
    })();

    if (key) {
      inflight.set(key, run);
      run.finally(() => inflight.delete(key)).catch(() => {});
    }

    return run;
  }

  const get = (path, query, options = {}) => request("GET", path, { ...options, query });
  const post = (path, body, options = {}) => request("POST", path, { ...options, body: body ?? {} });
  const patch = (path, body, options = {}) => request("PATCH", path, { ...options, body: body ?? {} });

  function withId(base, id) {
    return `${base}/${encodeURIComponent(id)}`;
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================

  return {
    CONFIG,
    ENDPOINTS,
    ApiError,
    setCsrfToken,
    onUnauthorized,
    request,

    // Administração
    login: (username, password) => post(ENDPOINTS.login, { username, password }, { dedupe: false }),
    session: (options) => get(ENDPOINTS.session, null, { retries: 0, ...options }),
    logout: () => post(ENDPOINTS.logout, {}, { timeoutMs: 5000 }),

    // Registo RFID
    // O endpoint existente lê "?id="; enviamos também "registrationId" para o contrato documentado.
    registerStart: (payload) => post(ENDPOINTS.registerStart, payload),
    registerStatus: (registrationId, options) => get(ENDPOINTS.registerStatus, { id: registrationId, registrationId }, { retries: 0, ...options }),
    registerCancel: (registrationId) => post(ENDPOINTS.registerCancel, { registrationId }),

    // Gestão
    listUsers: (query, options) => get(ENDPOINTS.users, query, options),
    createUser: (payload) => post(ENDPOINTS.users, payload),
    updateUser: (id, payload) => patch(withId(ENDPOINTS.users, id), payload),
    listCards: (query, options) => get(ENDPOINTS.cards, query, options),
    updateCard: (id, payload) => patch(withId(ENDPOINTS.cards, id), payload),
    listRooms: (options) => get(ENDPOINTS.rooms, null, options),
    listDevices: (options) => get(ENDPOINTS.devices, null, options),
    listPermissions: (query, options) => get(ENDPOINTS.permissions, query, options),
    updatePermission: (id, payload) => patch(withId(ENDPOINTS.permissions, id), payload),

    // Histórico e dashboard
    dashboard: (query, options) => get(ENDPOINTS.dashboard, query, options),
    listLogs: (query, options) => get(ENDPOINTS.logs, query, options),
    exportLogs: (query, options) => request("GET", ENDPOINTS.logsExport, { ...options, query, responseType: "blob", timeoutMs: 30000 }),

    // Controlo remoto
    openDoor: (deviceId, duration) => post(ENDPOINTS.doorOpen, { deviceId, duration }, { dedupe: true }),
    doorStatus: (query, options) => get(ENDPOINTS.doorStatus, query, { retries: 0, ...options }),
  };

})();
