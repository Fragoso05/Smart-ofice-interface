// ============================================================
// ÁREA ADMINISTRATIVA — CONTROLO DE ACESSOS RFID
//
// Vive dentro da mesma index.html (secção #admin). Todas as vistas são
// renderizadas por JS a partir da API; nada aqui inventa dados ou sucesso.
// ============================================================

const AdminApp = (() => {

  const DEFAULT_TZ = "Atlantic/Cape_Verde";
  const PAGE_SIZE = 10;
  const REGISTER_POLL_MS = 1500;
  const REGISTER_FALLBACK_TIMEOUT_MS = 90 * 1000;
  const DOOR_POLL_MS = 1000;
  const DOOR_TIMEOUT_MS = 20 * 1000;
  const DOOR_OPEN_DURATION_MS = 4000;
  const EXPORT_MAX_ROWS = 10000;
  const DEVICE_ONLINE_WINDOW_SEC = 90; // igual ao ONLINE_WINDOW_SEC do Node-RED

  // ============================================================
  // ÍCONES
  // ============================================================

  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  const ICON = {
    shield: svg(`<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>`),
    dashboard: svg(`<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>`),
    users: svg(`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>`),
    rfid: svg(`<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/>`),
    card: svg(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>`),
    door: svg(`<path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h7v18"/><path d="M14 3l4 1.5V21"/><path d="M11 12v1"/>`),
    history: svg(`<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>`),
    settings: svg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`),
    home: svg(`<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>`),
    logout: svg(`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>`),
    entry: svg(`<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>`),
    exit: svg(`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>`),
    denied: svg(`<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M12 8v4M12 16h.01"/>`),
    ok: svg(`<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>`),
    fail: svg(`<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>`),
    alert: svg(`<path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 10v4M12 17h.01"/>`),
    refresh: svg(`<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>`),
    download: svg(`<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>`),
    plus: svg(`<path d="M12 5v14M5 12h14"/>`),
    back: svg(`<path d="M15 18l-6-6 6-6"/>`),
    wifiOff: svg(`<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>`),
    clock: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>`),
    sort: svg(`<path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4"/>`),
    iot: svg(`<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>`),
    key: svg(`<circle cx="7.5" cy="15.5" r="4"/><path d="M10.5 12.5L20 3M16 7l3 3M14 9l2 2"/>`),
    edit: svg(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>`),
    power: svg(`<path d="M12 3v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/>`),
    pulse: svg(`<path d="M3 12h4l3-8 4 16 3-8h4"/>`),
    link: svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  };

  const VIEWS = [
    { id: "dashboard", label: "Dashboard", title: "Controlo de acessos", icon: "dashboard" },
    { id: "users", label: "Utilizadores", title: "Utilizadores", icon: "users" },
    { id: "register", label: "Acessos RFID", title: "Registo RFID", icon: "rfid" },
    { id: "cards", label: "Cartões", title: "Cartões RFID", icon: "card" },
    { id: "rooms", label: "Salas e portas", title: "Salas e portas", icon: "door" },
    { id: "devices", label: "Dispositivos IoT", title: "Dispositivos IoT", icon: "iot" },
    { id: "permissions", label: "Permissões", title: "Permissões por sala", icon: "key" },
    { id: "history", label: "Histórico", title: "Histórico de acessos", icon: "history" },
    { id: "settings", label: "Definições", title: "Definições", icon: "settings" },
  ];

  // ============================================================
  // ESTADO
  // ============================================================

  let isOpen = false;
  let exitHandler = null;
  let currentView = null;
  let viewController = null;
  let viewCleanups = [];
  let els = {};

  // ============================================================
  // HELPERS GERAIS
  // ============================================================

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function h(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function wait(ms, signal) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }

  function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function first(...values) {
    return values.find((v) => v !== undefined && v !== null && v !== "");
  }

  function isAbort(error) {
    return error && (error.kind === "aborted" || error.name === "AbortError");
  }

  // ============================================================
  // DATAS NO FUSO DO ESCRITÓRIO
  // ============================================================

  function officeTz() {
    return AdminAuth.loadPrefs().timezone || DEFAULT_TZ;
  }

  function parseDate(value) {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function fmt(value, options) {
    const date = parseDate(value);
    if (!date) return "—";
    try {
      return new Intl.DateTimeFormat("pt-PT", { timeZone: officeTz(), hourCycle: "h23", ...options }).format(date);
    } catch (_) {
      return date.toLocaleString("pt-PT");
    }
  }

  const fmtDay = (v) => fmt(v, { day: "2-digit", month: "2-digit" });
  const fmtTime = (v) => fmt(v, { hour: "2-digit", minute: "2-digit" });
  const fmtFull = (v) => fmt(v, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtDate = (v) => fmt(v, { day: "2-digit", month: "2-digit", year: "numeric" });

  function fmtRelative(value) {
    const date = parseDate(value);
    if (!date) return "Nunca";
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 0) return fmtFull(value);
    if (seconds < 60) return `há ${seconds} s`;
    if (seconds < 3600) return `há ${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `há ${Math.round(seconds / 3600)} h`;
    return fmtFull(value);
  }

  // YYYY-MM-DD no fuso do escritório (offsetDays: -1 = ontem)
  function isoDayInTz(offsetDays = 0) {
    const date = new Date(Date.now() + offsetDays * 86400000);
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: officeTz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    } catch (_) {
      return date.toISOString().slice(0, 10);
    }
  }

  // ============================================================
  // NORMALIZAÇÃO DAS RESPOSTAS DA API (tolerante a nomes de campos)
  // ============================================================

  function toPage(data, key) {
    const items = Array.isArray(data) ? data : (data && (data[key] || data.items || data.data || data.rows)) || [];
    const totalRaw = data && !Array.isArray(data) ? first(data.total, data.count) : undefined;
    const total = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : null;
    return { items, total };
  }

  function normalizeDirection(value, readerId) {
    const v = String(value || "").toLowerCase();
    if (["in", "entry", "entrada", "enter"].includes(v)) return "in";
    if (["out", "exit", "saida", "saída"].includes(v)) return "out";
    if (readerId === "outside") return "in";
    if (readerId === "inside") return "out";
    return null;
  }

  // Booleanos vindos do MySQL chegam como 0/1
  function flag(value, fallback = false) {
    if (value === true || value === 1 || value === "1" || value === "true") return true;
    if (value === false || value === 0 || value === "0" || value === "false") return false;
    return fallback;
  }

  function normalizeEvent(e) {
    const resultRaw = String(first(e.result, e.status) ?? "").toLowerCase();
    const allowed = e.allowed !== undefined && e.allowed !== null ? flag(e.allowed)
      : e.granted !== undefined && e.granted !== null ? flag(e.granted)
      : ["allowed", "granted", "permitido", "ok", "success"].includes(resultRaw);
    return {
      id: first(e.id, e.logId),
      timestamp: first(e.timestamp, e.createdAt, e.created_at, e.time, e.date),
      userName: first(e.userName, e.user_name, e.user && e.user.name, e.name),
      uid: first(e.uid, e.cardUid, e.card_uid),
      room: first(e.roomName, e.room_name, e.room && e.room.name, e.room, e.doorName, e.roomId, e.doorId),
      deviceId: first(e.deviceId, e.device_id),
      readerId: first(e.readerId, e.reader_id),
      direction: normalizeDirection(first(e.direction, e.movement, e.event), first(e.readerId, e.reader_id)),
      allowed,
      reason: first(e.reason, e.denyReason, e.message),
      // Só é "confirmado" quando um sensor físico de porta/passagem o indicar
      confirmed: e.passageConfirmed === true || e.physicalConfirmed === true || e.confirmed === true,
    };
  }

  function normalizeUser(u) {
    const rooms = first(u.rooms, u.roomNames, u.authorizedRooms);
    const statusRaw = String(first(u.status) ?? "").toLowerCase();
    return {
      id: first(u.id, u.userId, u.user_id),
      name: first(u.name, u.fullName, u.full_name, "—"),
      contact: first(u.contact, u.phone) ?? "",
      cardCount: Number(first(u.cardCount, u.cardsCount, u.cards_count, Array.isArray(u.cards) ? u.cards.length : undefined, 0)),
      rooms: Array.isArray(rooms) ? rooms.map((r) => (typeof r === "string" ? r : first(r.name, r.id))) : rooms ? String(rooms).split(",") : [],
      active: u.active !== undefined && u.active !== null ? flag(u.active, true) : statusRaw ? statusRaw === "active" : true,
      createdAt: first(u.createdAt, u.created_at, u.registeredAt),
      raw: u,
    };
  }

  function normalizeCard(c) {
    const perms = first(c.permissions, c.rooms);
    const status = c.status ? String(c.status).toLowerCase()
      : c.active !== undefined && c.active !== null ? (flag(c.active, true) ? "active" : "revoked")
      : "active";
    return {
      id: first(c.id, c.cardId, c.uid),
      uid: first(c.uid, c.cardUid, "—"),
      userId: first(c.userId, c.user_id, c.user && c.user.id),
      userName: first(c.userName, c.user_name, c.user && c.user.name),
      createdAt: first(c.createdAt, c.created_at, c.registeredAt),
      status,
      permissions: Array.isArray(perms) ? perms.map((p) => (typeof p === "string" ? p : first(p.roomName, p.name, p.roomId))).join(", ") : String(first(perms, "—")).replace(/,/g, ", "),
      lastUsedAt: first(c.lastUsedAt, c.last_used_at, c.lastSeen),
    };
  }

  function normalizeRoom(r) {
    return {
      id: first(r.id, r.roomId, r.doorId),
      name: first(r.name, r.roomName, r.id),
      doorId: first(r.doorId, r.door_id, r.id),
      description: first(r.description) ?? "",
      deviceCount: Array.isArray(r.devices) ? r.devices.length : first(r.deviceCount, r.devicesCount),
    };
  }

  // Ativo/Inativo é configuração; Online/Offline é a comunicação real (heartbeat)
  function normalizeDevice(d) {
    const lastSeen = first(d.lastSeen, d.lastSeenAt, d.last_seen, d.lastCommunication);
    const lastSeenDate = parseDate(lastSeen);
    const seconds = d.secondsSinceSeen !== undefined && d.secondsSinceSeen !== null ? Number(d.secondsSinceSeen)
      : lastSeenDate ? Math.round((Date.now() - lastSeenDate.getTime()) / 1000) : null;
    // Preferir a idade do heartbeat: a coluna "online" antiga nunca volta a 0
    const online = d.secondsSinceSeen !== undefined && d.online !== undefined ? flag(d.online)
      : seconds !== null ? seconds <= DEVICE_ONLINE_WINDOW_SEC
      : flag(d.online) || String(d.status || "").toLowerCase() === "online";
    const readersRaw = Array.isArray(d.readers) ? d.readers : d.readers ? String(d.readers).split(",") : [];
    const readers = readersRaw.map((r) => (typeof r === "string" ? r.trim() : first(r.readerId, r.id))).filter(Boolean);
    const doorRaw = first(d.doorState, d.door_state, d.doorSensor);
    const approval = String(first(d.approvalStatus, d.approval_status, "approved")).toLowerCase();
    const type = first(d.type, d.deviceType, d.device_type);
    let config = d.config;
    if (typeof config === "string") {
      try { config = JSON.parse(config); } catch (_) { config = {}; }
    }
    return {
      id: first(d.deviceId, d.device_id, d.id),
      dbId: first(d.id !== undefined && d.deviceId !== undefined ? d.id : undefined, d.dbId),
      name: first(d.name, d.label, d.deviceId, d.id),
      type: type || null,
      typeLabel: first(d.typeLabel, type),
      // Sem tipo (API antiga) assume-se ESP32 RFID, como no firmware atual
      rfidCapable: d.rfidCapable !== undefined ? flag(d.rfidCapable) : !type || type === "esp32_rfid" || type === "rfid_reader",
      roomId: first(d.roomId, d.room_id, d.room && d.room.id, d.doorId, d.door_id),
      roomName: first(d.roomName, d.room_name, d.room && d.room.name, d.roomId, d.doorId, d.door_id),
      doorId: first(d.doorId, d.door_id, d.roomId),
      approvalStatus: approval,
      active: flag(d.active, true),
      online,
      secondsSinceSeen: seconds,
      lastSeen,
      readers: readers.length ? readers : ["outside"],
      hardwareId: first(d.hardwareId, d.hardware_id) ?? "",
      description: first(d.description) ?? "",
      ipAddress: first(d.ipAddress, d.ip_address) ?? "",
      firmwareVersion: first(d.firmwareVersion, d.firmware_version) ?? "",
      wifiRssi: first(d.wifiRssi, d.wifi_rssi),
      hasCredential: d.hasCredential === undefined ? null : flag(d.hasCredential),
      config: config && typeof config === "object" ? config : {},
      relay: first(d.relayState, d.relay_state, d.relay),
      door: doorRaw ? String(doorRaw).toLowerCase() : null,
      origin: first(d.origin, d.connection, d.source),
    };
  }

  // Dispositivo apto para registar cartões: aprovado, ativo e com leitor RFID
  function isRegistrationReader(d) {
    return d.rfidCapable && d.active && d.approvalStatus === "approved";
  }

  // ============================================================
  // ESTADOS DE INTERFACE: carregamento, vazio, erro, toast, diálogo
  // ============================================================

  function loadingHtml(label = "A carregar…") {
    return `<div class="adm-state adm-state--loading"><span class="adm-spinner"></span><span>${esc(label)}</span></div>`;
  }

  function emptyHtml(text) {
    return `<div class="adm-state adm-state--empty">${esc(text)}</div>`;
  }

  function errorTitle(error) {
    if (error.kind === "unavailable") return "Funcionalidade indisponível";
    if (error.kind === "cors") return "Pedido bloqueado (CORS)";
    if (error.kind === "network") return "Sem ligação ao servidor";
    if (error.kind === "timeout") return "O servidor não respondeu";
    if (error.kind === "forbidden") return "Permissão insuficiente";
    if (error.status === 400 || error.status === 422) return "Dados inválidos";
    if (error.status === 404) return "Não encontrado";
    if (error.status === 409) return "Operação não permitida";
    if (error.code === "database_error" || error.code === "schema_outdated") return "Erro na base de dados";
    return "Erro do servidor";
  }

  // Mensagem curta para toasts: título + detalhe quando acrescenta informação
  function errorText(error) {
    const title = errorTitle(error);
    return error.message && !error.message.startsWith(title) ? `${title}: ${error.message}` : error.message || title;
  }

  // Mostra o erro num slot, com botão "Tentar novamente" opcional
  function showError(slot, error, retry) {
    if (isAbort(error) || error.kind === "unauthorized") return;
    const unavailable = error.kind === "unavailable";
    slot.innerHTML = `
      <div class="adm-state adm-state--${unavailable ? "unavailable" : "error"}">
        <span class="adm-state__icon">${unavailable ? ICON.alert : error.kind === "network" || error.kind === "timeout" ? ICON.wifiOff : ICON.fail}</span>
        <div class="adm-state__body">
          <strong>${esc(errorTitle(error))}</strong>
          <span>${esc(error.message || "Erro desconhecido.")}</span>
        </div>
        ${retry ? `<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-retry>${ICON.refresh}Tentar novamente</button>` : ""}
      </div>`;
    if (retry) slot.querySelector("[data-retry]").addEventListener("click", retry);
  }

  function toast(message, kind = "info") {
    const item = h(`<div class="adm-toast__item adm-toast__item--${kind}">${esc(message)}</div>`);
    els.toast.appendChild(item);
    // No ecrã de 5" no máximo duas mensagens visíveis
    while (els.toast.children.length > 2) els.toast.firstElementChild.remove();
    setTimeout(() => item.classList.add("is-leaving"), 3600);
    setTimeout(() => item.remove(), 4000);
  }

  function openDialog(html) {
    els.dialogCard.innerHTML = html;
    els.dialog.classList.remove("hidden");
    return els.dialogCard;
  }

  function closeDialog() {
    els.dialog.classList.add("hidden");
    els.dialogCard.innerHTML = "";
  }

  function confirmDialog({ title, message, details = [], confirmLabel = "Confirmar", danger = false }) {
    return new Promise((resolve) => {
      const card = openDialog(`
        <div class="adm-dialog__title">${esc(title)}</div>
        <div class="adm-dialog__text">${esc(message)}</div>
        ${details.length ? `<dl class="adm-dialog__details">${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
        <div class="adm-dialog__actions">
          <button type="button" class="adm-btn adm-btn--ghost" data-answer="no">Cancelar</button>
          <button type="button" class="adm-btn ${danger ? "adm-btn--danger" : "adm-btn--primary"}" data-answer="yes">${esc(confirmLabel)}</button>
        </div>`);
      card.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-answer]");
        if (!btn) return;
        closeDialog();
        resolve(btn.dataset.answer === "yes");
      });
    });
  }

  // Executa uma ação de escrita com o botão bloqueado (evita duplo envio)
  async function withBusy(button, label, fn) {
    if (!button || button.disabled) return undefined;
    const original = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-busy");
    button.textContent = label;
    try {
      return await fn();
    } finally {
      button.disabled = false;
      button.classList.remove("is-busy");
      button.innerHTML = original;
    }
  }

  function pagerHtml(page, total, itemCount) {
    const pages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
    const hasNext = pages !== null ? page < pages : itemCount === PAGE_SIZE;
    if (page <= 1 && !hasNext) return "";
    return `
      <div class="adm-pager">
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Anterior</button>
        <span>Página ${page}${pages !== null ? ` de ${pages}` : ""}</span>
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-page="${page + 1}" ${hasNext ? "" : "disabled"}>Seguinte ›</button>
      </div>`;
  }

  function resultBadge(allowed) {
    return allowed
      ? `<span class="adm-result adm-result--ok">${ICON.ok}Permitido</span>`
      : `<span class="adm-result adm-result--fail">${ICON.fail}Negado</span>`;
  }

  // Sem sensor físico, um evento é uma leitura/autorização — não uma passagem confirmada
  function directionLabel(direction) {
    return direction === "in" ? "Entrada" : direction === "out" ? "Saída" : "Leitura";
  }

  function movementHtml(ev) {
    const label = directionLabel(ev.direction);
    let caption;
    if (!ev.allowed) caption = "tentativa";
    else if (ev.confirmed) caption = "passagem confirmada";
    else caption = "autorizada · sem sensor";
    return `<span class="adm-move">${label}<small>${caption}</small></span>`;
  }

  function statusPill(active, onLabel = "Ativo", offLabel = "Inativo") {
    return `<span class="adm-pill ${active ? "adm-pill--ok" : "adm-pill--off"}">${active ? onLabel : offLabel}</span>`;
  }

  const CARD_STATUS = {
    active: ["Ativo", "ok"],
    revoked: ["Revogado", "fail"],
    suspended: ["Suspenso", "warn"],
    lost: ["Perdido", "warn"],
    inactive: ["Inativo", "off"],
  };

  function cardStatusPill(status) {
    const [label, tone] = CARD_STATUS[status] || [status, "off"];
    return `<span class="adm-pill adm-pill--${tone}">${esc(label)}</span>`;
  }

  // ============================================================
  // DADOS DE REFERÊNCIA (salas e dispositivos), com cache curta
  // ============================================================

  let refCache = null;

  function invalidateRefData() {
    refCache = null;
  }

  async function loadRefData(force = false) {
    if (!force && refCache && Date.now() - refCache.at < 60 * 1000) return refCache;
    const [rooms, devices] = await Promise.allSettled([AdminApi.listRooms(), AdminApi.listDevices()]);
    refCache = {
      at: Date.now(),
      rooms: rooms.status === "fulfilled" ? toPage(rooms.value, "rooms").items.map(normalizeRoom) : null,
      roomsError: rooms.status === "rejected" ? rooms.reason : null,
      devices: devices.status === "fulfilled" ? toPage(devices.value, "devices").items.map(normalizeDevice) : null,
      devicesError: devices.status === "rejected" ? devices.reason : null,
    };
    return refCache;
  }

  function roomOptions(rooms, selected, allLabel) {
    return (allLabel ? `<option value="">${esc(allLabel)}</option>` : "") +
      (rooms || []).map((r) => `<option value="${esc(r.id)}" ${String(r.id) === String(selected) ? "selected" : ""}>${esc(r.name)}</option>`).join("");
  }

  function deviceOptions(devices, selected, allLabel) {
    return (allLabel ? `<option value="">${esc(allLabel)}</option>` : "") +
      (devices || []).map((d) => `<option value="${esc(d.id)}" ${String(d.id) === String(selected) ? "selected" : ""}>${esc(d.name)}${d.name !== d.id ? ` (${esc(d.id)})` : ""}${d.online ? "" : " — offline"}</option>`).join("");
  }

  // ============================================================
  // VISTA: DASHBOARD
  // ============================================================

  async function renderDashboard(root, ctx) {
    root.innerHTML = `
      <p class="adm-subtitle" data-slot="updated">Dados do servidor · fuso ${esc(officeTz())}</p>
      <div class="adm-stats" data-slot="stats">${loadingHtml()}</div>
      <div data-slot="devices"></div>
      <div class="adm-section-head">
        <h2>Últimas tentativas de acesso</h2>
        <span class="adm-chip adm-chip--live">Tempo real</span>
      </div>
      <div data-slot="recent"></div>
      <div data-slot="cards"></div>`;

    const statsSlot = root.querySelector('[data-slot="stats"]');
    const devicesSlot = root.querySelector('[data-slot="devices"]');
    const recentSlot = root.querySelector('[data-slot="recent"]');
    const cardsSlot = root.querySelector('[data-slot="cards"]');
    const updatedSlot = root.querySelector('[data-slot="updated"]');

    const statCard = (label, value, icon, tone = "", view = "") => `
      <div class="adm-stat ${tone} ${view ? "adm-stat--link" : ""}" ${view ? `data-go="${view}" role="button" tabindex="0"` : ""}>
        <div class="adm-stat__head"><span>${esc(label)}</span>${ICON[icon]}</div>
        <div class="adm-stat__value">${value === null || value === undefined ? "—" : esc(value)}</div>
      </div>`;

    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-go]");
      if (target) go(target.dataset.go, target.dataset.status ? { status: target.dataset.status } : {});
    });

    async function load() {
      let data;
      try {
        data = await AdminApi.dashboard({ tz: officeTz() }, { signal: ctx.signal });
      } catch (error) {
        if (ctx.signal.aborted) return;
        showError(statsSlot, error, load);
        recentSlot.innerHTML = "";
        return;
      }
      if (ctx.signal.aborted) return;

      const s = (data && (data.stats || data)) || {};
      statsSlot.innerHTML =
        statCard("Utilizadores ativos", first(s.activeUsers, s.active_users), "users") +
        statCard("Entradas hoje", first(s.entriesToday, s.entries_today), "entry") +
        statCard("Saídas hoje", first(s.exitsToday, s.exits_today), "exit") +
        statCard("Acessos negados hoje", first(s.deniedToday, s.denied_today), "denied", "adm-stat--danger");

      // Indicadores de dispositivos só quando o backend os fornece (Admin API v4)
      if (s.devicesOnline !== undefined) {
        const pending = Number(s.devicesPending) || 0;
        devicesSlot.innerHTML = `
          <div class="adm-section-head"><h2>Dispositivos e portas</h2>
            ${pending ? `<button type="button" class="adm-chip adm-chip--warn" data-go="devices" data-status="pending">${pending} pendente(s) de aprovação</button>` : ""}
          </div>
          <div class="adm-stats adm-stats--3">
            ${statCard("Dispositivos online", s.devicesOnline, "pulse", "adm-stat--ok", "devices")}
            ${statCard("Dispositivos offline", s.devicesOffline, "wifiOff", Number(s.devicesOffline) ? "adm-stat--warn" : "", "devices")}
            ${statCard("Portas disponíveis", s.doorsCount, "door", "", "rooms")}
          </div>`;
      }

      updatedSlot.textContent = `Atualizado às ${fmtTime(new Date())} · fuso ${officeTz()}`;

      if (Array.isArray(data && data.recentCards)) {
        cardsSlot.innerHTML = `
          <div class="adm-section-head"><h2>Últimos cartões registados</h2>
            <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-go="cards">Ver cartões</button>
          </div>
          ${data.recentCards.length ? `<ul class="adm-list">${data.recentCards.map((c) => {
            const card = normalizeCard(c);
            return `<li class="adm-list__item"><div><span class="adm-td-main">${esc(card.userName || "—")}</span><small class="adm-mono">${esc(card.uid)}</small></div>
              <div class="adm-list__right"><small>${esc(fmtFull(card.createdAt))}</small>${cardStatusPill(card.status)}</div></li>`;
          }).join("")}</ul>` : emptyHtml("Ainda não existem cartões registados.")}`;
      }

      let recent = data && Array.isArray(data.recent) ? data.recent : null;
      if (!recent) {
        try {
          recent = toPage(await AdminApi.listLogs({ page: 1, pageSize: 8, sort: "timestamp", order: "desc", tz: officeTz() }, { signal: ctx.signal }), "logs").items;
        } catch (error) {
          if (!ctx.signal.aborted) showError(recentSlot, error, load);
          return;
        }
      }
      if (ctx.signal.aborted) return;
      recentSlot.innerHTML = eventsTableHtml(recent.map(normalizeEvent), { compact: true, empty: "Ainda não existem eventos de acesso registados." });
    }

    recentSlot.innerHTML = loadingHtml();
    await load();
    // 3 consultas leves por minuto: suficiente para "tempo real" sem sobrecarregar o Pi
    ctx.every(load, 60 * 1000);
  }

  function eventsTableHtml(events, { compact = false, empty = "Sem resultados.", sortOrder = null } = {}) {
    if (!events.length) return emptyHtml(empty);
    const sortIndicator = sortOrder ? `<button type="button" class="adm-sort" data-sort title="Ordenar por data">${sortOrder === "asc" ? "▲" : "▼"}</button>` : "";
    return `
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr>
            <th>Data / Hora ${sortIndicator}</th>
            <th>Utilizador</th>
            <th>Sala</th>
            ${compact ? "" : `<th class="adm-hide-sm">Movimento</th>`}
            <th>Resultado</th>
          </tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr>
                <td class="adm-td-date"><span>${esc(fmtDay(ev.timestamp))}</span><small>${esc(fmtTime(ev.timestamp))}</small></td>
                <td>
                  <span class="adm-td-main">${esc(ev.userName || "Cartão desconhecido")}</span>
                  <small>${compact ? directionLabel(ev.direction) : esc(ev.uid ? `UID ${ev.uid}` : "")}</small>
                </td>
                <td>${esc(ev.room || "—")}${ev.deviceId && !compact ? `<small>${esc(ev.deviceId)}${ev.readerId ? ` · ${esc(ev.readerId)}` : ""}</small>` : ""}</td>
                ${compact ? "" : `<td class="adm-hide-sm">${movementHtml(ev)}</td>`}
                <td>${resultBadge(ev.allowed)}${!ev.allowed && ev.reason ? `<small>${esc(ev.reason)}</small>` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  // ============================================================
  // VISTA: UTILIZADORES
  // ============================================================

  async function renderUsers(root, ctx) {
    const state = { q: "", status: "", page: 1 };

    root.innerHTML = `
      <div class="adm-toolbar">
        <input type="search" class="adm-input adm-toolbar__grow" placeholder="Pesquisar por nome ou contacto…" data-field="q" maxlength="80">
        <select class="adm-input" data-field="status">
          <option value="">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <button type="button" class="adm-btn adm-btn--primary" data-action="new">${ICON.plus}Novo registo</button>
      </div>
      <div data-slot="results"></div>`;

    const slot = root.querySelector('[data-slot="results"]');

    async function load() {
      slot.innerHTML = loadingHtml();
      let page;
      try {
        page = toPage(await AdminApi.listUsers({ q: state.q, status: state.status, page: state.page, pageSize: PAGE_SIZE }, { signal: ctx.signal }), "users");
      } catch (error) {
        if (!ctx.signal.aborted) showError(slot, error, load);
        return;
      }
      if (ctx.signal.aborted) return;

      const users = page.items.map(normalizeUser);
      if (!users.length) {
        slot.innerHTML = emptyHtml(state.q || state.status ? "Nenhum utilizador corresponde à pesquisa." : "Ainda não existem utilizadores registados.");
        return;
      }

      slot.innerHTML = `
        <div class="adm-table-wrap">
          <table class="adm-table adm-table--click">
            <thead><tr>
              <th>ID</th><th>Nome</th><th class="adm-hide-sm">Contacto</th><th>Cartões</th>
              <th>Salas</th><th>Estado</th><th class="adm-hide-sm">Registo</th>
            </tr></thead>
            <tbody>
              ${users.map((u, i) => `
                <tr data-index="${i}">
                  <td class="adm-mono">${esc(u.id)}</td>
                  <td class="adm-td-main">${esc(u.name)}</td>
                  <td class="adm-hide-sm">${esc(u.contact || "—")}</td>
                  <td>${esc(u.cardCount)}</td>
                  <td>${esc(u.rooms.join(", ") || "—")}</td>
                  <td>${statusPill(u.active)}</td>
                  <td class="adm-hide-sm">${esc(fmtDate(u.createdAt))}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        ${pagerHtml(state.page, page.total, users.length)}`;

      slot.querySelectorAll("tr[data-index]").forEach((row) => {
        row.addEventListener("click", () => go("userDetail", { user: users[Number(row.dataset.index)] }));
      });
    }

    const reload = debounce(() => { state.page = 1; load(); }, 350);
    root.querySelector('[data-field="q"]').addEventListener("input", (e) => { state.q = e.target.value.trim(); reload(); });
    root.querySelector('[data-field="status"]').addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; load(); });
    root.querySelector('[data-action="new"]').addEventListener("click", () => go("register"));
    slot.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      state.page = Number(btn.dataset.page);
      load();
    });

    await load();
  }

  // ============================================================
  // VISTA: DETALHE DO UTILIZADOR
  // ============================================================

  async function renderUserDetail(root, ctx) {
    let user = ctx.params.user;
    if (!user) return go("users");

    root.innerHTML = `
      <button type="button" class="adm-link-back" data-action="back">${ICON.back}Utilizadores</button>
      <div class="adm-grid-2">
        <section class="adm-panel">
          <div class="adm-panel__head"><h2>Dados pessoais</h2><span data-slot="status">${statusPill(user.active)}</span></div>
          <form class="adm-form" data-form="profile" novalidate>
            <label class="adm-field"><span>ID</span><input class="adm-input" value="${esc(user.id)}" disabled></label>
            <label class="adm-field"><span>Nome completo</span><input class="adm-input" name="fullName" value="${esc(user.name)}" maxlength="80" required></label>
            <label class="adm-field"><span>Contacto</span><input class="adm-input" name="contact" value="${esc(user.contact)}" maxlength="40"></label>
            <div class="adm-form__actions">
              <button type="submit" class="adm-btn adm-btn--primary">Guardar alterações</button>
            </div>
          </form>
          <div class="adm-form__actions adm-form__actions--split">
            <button type="button" class="adm-btn adm-btn--ghost" data-action="toggle">${user.active ? "Desativar utilizador" : "Ativar utilizador"}</button>
            <button type="button" class="adm-btn adm-btn--danger" data-action="revoke">Revogar acesso</button>
          </div>
        </section>

        <section class="adm-panel">
          <div class="adm-panel__head"><h2>Cartões associados</h2>
            <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-action="add-card">${ICON.plus}Associar cartão</button>
          </div>
          <div data-slot="cards">${loadingHtml()}</div>
        </section>
      </div>

      <section class="adm-panel">
        <div class="adm-panel__head"><h2>Permissões por sala</h2></div>
        <div data-slot="perms">${loadingHtml()}</div>
      </section>

      <section class="adm-panel">
        <div class="adm-panel__head"><h2>Histórico de acessos</h2>
          <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-action="full-history">Ver tudo</button>
        </div>
        <div data-slot="history">${loadingHtml()}</div>
      </section>`;

    const $ = (sel) => root.querySelector(sel);

    $('[data-action="back"]').addEventListener("click", () => go("users"));
    $('[data-action="add-card"]').addEventListener("click", () => go("register", { user }));
    $('[data-action="full-history"]').addEventListener("click", () => go("history", { userName: user.name }));

    function applyUser(updated) {
      if (updated && typeof updated === "object" && (updated.user || updated.id)) {
        user = { ...user, ...normalizeUser(updated.user || updated) };
      }
      $('[data-slot="status"]').innerHTML = statusPill(user.active);
      $('[data-action="toggle"]').textContent = user.active ? "Desativar utilizador" : "Ativar utilizador";
    }

    $('[data-form="profile"]').addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = form.fullName.value.trim();
      const contact = form.contact.value.trim();
      if (name.length < 2) return toast("Indique o nome completo.", "error");
      await withBusy(form.querySelector('[type="submit"]'), "A guardar…", async () => {
        try {
          const result = await AdminApi.updateUser(user.id, { name, contact });
          user = { ...user, name, contact };
          applyUser(result);
          toast("Dados atualizados.", "ok");
        } catch (error) {
          toast(errorText(error), "error");
        }
      });
    });

    $('[data-action="toggle"]').addEventListener("click", async (event) => {
      const next = !user.active;
      const ok = await confirmDialog({
        title: next ? "Ativar utilizador" : "Desativar utilizador",
        message: next ? "O utilizador volta a poder usar os seus cartões ativos." : "Os cartões deste utilizador deixam de abrir portas até ser reativado.",
        details: [["Utilizador", user.name]],
        confirmLabel: next ? "Ativar" : "Desativar",
        danger: !next,
      });
      if (!ok) return;
      await withBusy(event.target, "A guardar…", async () => {
        try {
          const result = await AdminApi.updateUser(user.id, { active: next });
          user.active = next;
          applyUser(result);
          toast(next ? "Utilizador ativado." : "Utilizador desativado.", "ok");
        } catch (error) {
          toast(errorText(error), "error");
        }
      });
    });

    $('[data-action="revoke"]').addEventListener("click", async (event) => {
      const ok = await confirmDialog({
        title: "Revogar acesso",
        message: "Desativa o utilizador e revoga todos os cartões associados. Esta ação fica registada na auditoria.",
        details: [["Utilizador", user.name], ["Cartões", String(user.cardCount)]],
        confirmLabel: "Revogar acesso",
        danger: true,
      });
      if (!ok) return;
      await withBusy(event.target, "A revogar…", async () => {
        try {
          const result = await AdminApi.updateUser(user.id, { active: false, revokeCards: true });
          user.active = false;
          applyUser(result);
          toast("Acesso revogado.", "ok");
          loadCards();
        } catch (error) {
          toast(errorText(error), "error");
        }
      });
    });

    // --- Cartões
    const cardsSlot = $('[data-slot="cards"]');
    async function loadCards() {
      cardsSlot.innerHTML = loadingHtml();
      let cards;
      try {
        cards = toPage(await AdminApi.listCards({ userId: user.id, pageSize: 50 }, { signal: ctx.signal }), "cards").items.map(normalizeCard);
      } catch (error) {
        if (!ctx.signal.aborted) showError(cardsSlot, error, loadCards);
        return;
      }
      if (ctx.signal.aborted) return;
      if (!cards.length) {
        cardsSlot.innerHTML = emptyHtml("Sem cartões associados.");
        return;
      }
      cardsSlot.innerHTML = `<ul class="adm-list">${cards.map((c) => `
        <li class="adm-list__item">
          <div><span class="adm-mono">${esc(c.uid)}</span><small>Última utilização: ${esc(fmtRelative(c.lastUsedAt))}</small></div>
          <div class="adm-list__right">${cardStatusPill(c.status)}
            ${c.status !== "revoked" ? `<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-revoke-card="${esc(c.id)}" data-uid="${esc(c.uid)}">Revogar</button>` : ""}
          </div>
        </li>`).join("")}</ul>`;
    }
    cardsSlot.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-revoke-card]");
      if (!btn) return;
      if (await revokeCard(btn, btn.dataset.revokeCard, btn.dataset.uid, user.name)) loadCards();
    });

    // --- Permissões (upsert por utilizador + sala)
    const permsSlot = $('[data-slot="perms"]');
    const loadPerms = () => mountPermissionEditor(permsSlot, user, ctx);

    // --- Histórico
    const historySlot = $('[data-slot="history"]');
    async function loadHistory() {
      historySlot.innerHTML = loadingHtml();
      try {
        const page = toPage(await AdminApi.listLogs({ userId: user.id, page: 1, pageSize: 10, sort: "timestamp", order: "desc", tz: officeTz() }, { signal: ctx.signal }), "logs");
        if (ctx.signal.aborted) return;
        historySlot.innerHTML = eventsTableHtml(page.items.map(normalizeEvent), { empty: "Sem acessos registados para este utilizador." });
      } catch (error) {
        if (!ctx.signal.aborted) showError(historySlot, error, loadHistory);
      }
    }

    await Promise.all([loadCards(), loadPerms(), loadHistory()]);
  }

  // Editor de permissões por sala (usado no detalhe do utilizador e na vista Permissões).
  // Cada alteração é gravada de imediato e revertida se o servidor não confirmar.
  async function mountPermissionEditor(slot, user, ctx) {
    slot.innerHTML = loadingHtml();
    let perms;
    let ref;
    try {
      [perms, ref] = await Promise.all([
        AdminApi.listPermissions({ userId: user.id }, { signal: ctx.signal }),
        loadRefData(),
      ]);
    } catch (error) {
      if (!ctx.signal.aborted) showError(slot, error, () => mountPermissionEditor(slot, user, ctx));
      return;
    }
    if (ctx.signal.aborted) return;

    const list = toPage(perms, "permissions").items;
    const byRoom = new Map(list.map((p) => [String(first(p.roomId, p.room_id, p.doorId)), p]));
    const rooms = ref.rooms || list.map((p) => ({ id: first(p.roomId, p.room_id, p.doorId), name: first(p.roomName, p.room_name, p.roomId) }));

    if (!rooms.length) {
      slot.innerHTML = emptyHtml("Não existem salas registadas no servidor.");
      return;
    }

    slot.innerHTML = `<ul class="adm-list">${rooms.map((room) => {
      const p = byRoom.get(String(room.id)) || {};
      const canEnter = flag(first(p.canEnter, p.can_enter));
      const canExit = flag(first(p.canExit, p.can_exit));
      const schedule = p.schedule && p.schedule.from ? `${p.schedule.from}–${p.schedule.to}` : first(p.scheduleFrom) ? `${p.scheduleFrom}–${p.scheduleTo}` : "";
      return `
        <li class="adm-list__item" data-room="${esc(room.id)}">
          <div><span class="adm-td-main">${esc(room.name)}</span>${schedule ? `<small>Horário: ${esc(schedule)}</small>` : ""}</div>
          <div class="adm-list__right">
            <label class="adm-toggle"><input type="checkbox" data-perm="canEnter" ${canEnter ? "checked" : ""}><span>Entrada</span></label>
            <label class="adm-toggle"><input type="checkbox" data-perm="canExit" ${canExit ? "checked" : ""}><span>Saída</span></label>
          </div>
        </li>`;
    }).join("")}</ul>`;

    slot.onchange = async (event) => {
      const input = event.target.closest("[data-perm]");
      if (!input) return;
      const row = input.closest("[data-room]");
      const payload = {
        roomId: row.dataset.room,
        canEnter: row.querySelector('[data-perm="canEnter"]').checked,
        canExit: row.querySelector('[data-perm="canExit"]').checked,
      };
      row.querySelectorAll("input").forEach((i) => (i.disabled = true));
      try {
        await AdminApi.updatePermission(user.id, payload);
        toast("Permissões atualizadas.", "ok");
      } catch (error) {
        input.checked = !input.checked; // reverte — o servidor não confirmou
        toast(errorText(error), "error");
      } finally {
        row.querySelectorAll("input").forEach((i) => (i.disabled = false));
      }
    };
  }

  // ============================================================
  // VISTA: PERMISSÕES (escolher utilizador → permissões por sala)
  // ============================================================

  async function renderPermissions(root, ctx) {
    root.innerHTML = `
      <div class="adm-note">${ICON.key}<span>As permissões aplicam-se a todos os cartões do utilizador. Escolha um utilizador para editar entrada e saída em cada sala/porta.</span></div>
      <div class="adm-toolbar">
        <input type="search" class="adm-input adm-toolbar__grow" placeholder="Pesquisar utilizador…" data-field="q" maxlength="80" value="${esc(ctx.params.q || "")}">
      </div>
      <div class="adm-grid-2 adm-grid-2--perm">
        <section class="adm-panel"><div class="adm-panel__head"><h2>Utilizadores</h2></div><div data-slot="users">${loadingHtml()}</div></section>
        <section class="adm-panel"><div class="adm-panel__head"><h2 data-slot="who">Permissões</h2></div><div data-slot="perms">${emptyHtml("Escolha um utilizador.")}</div></section>
      </div>`;

    const usersSlot = root.querySelector('[data-slot="users"]');
    const permsSlot = root.querySelector('[data-slot="perms"]');
    const who = root.querySelector('[data-slot="who"]');
    let users = [];

    async function load(q) {
      usersSlot.innerHTML = loadingHtml();
      try {
        users = toPage(await AdminApi.listUsers({ q, page: 1, pageSize: 20 }, { signal: ctx.signal }), "users").items.map(normalizeUser);
      } catch (error) {
        if (!ctx.signal.aborted) showError(usersSlot, error, () => load(q));
        return;
      }
      if (ctx.signal.aborted) return;
      usersSlot.innerHTML = users.length
        ? `<ul class="adm-list adm-list--pick">${users.map((u, i) => `
            <li><button type="button" class="adm-pick" data-index="${i}">
              <span><span class="adm-td-main">${esc(u.name)}</span><small>${esc(u.cardCount)} cartão(ões)</small></span>${statusPill(u.active)}
            </button></li>`).join("")}</ul>`
        : emptyHtml("Nenhum utilizador encontrado.");
    }

    usersSlot.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-index]");
      if (!btn) return;
      usersSlot.querySelectorAll(".adm-pick").forEach((b) => b.classList.toggle("is-active", b === btn));
      const user = users[Number(btn.dataset.index)];
      who.textContent = user.name;
      mountPermissionEditor(permsSlot, user, ctx);
      // No ecrã pequeno o editor fica por baixo da lista
      permsSlot.closest(".adm-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    const reload = debounce((q) => load(q), 350);
    root.querySelector('[data-field="q"]').addEventListener("input", (e) => reload(e.target.value.trim()));
    await load(ctx.params.q || "");
  }

  async function revokeCard(button, cardId, uid, userName) {
    const ok = await confirmDialog({
      title: "Revogar cartão",
      message: "O cartão deixa de abrir qualquer porta. Para voltar a usá-lo terá de ser registado de novo.",
      details: [["UID", uid], ["Utilizador", userName || "—"]],
      confirmLabel: "Revogar cartão",
      danger: true,
    });
    if (!ok) return false;
    return withBusy(button, "A revogar…", async () => {
      try {
        await AdminApi.updateCard(cardId, { status: "revoked" });
        toast("Cartão revogado.", "ok");
        return true;
      } catch (error) {
        toast(errorText(error), "error");
        return false;
      }
    });
  }

  // ============================================================
  // VISTA: REGISTO RFID (novo utilizador ou novo cartão)
  // ============================================================

  const REG_STATES = {
    starting: { label: "A iniciar registo…", tone: "busy", step: 1 },
    waiting: { label: "A aguardar cartão RFID — aproxime o cartão ao leitor.", tone: "busy", step: 2 },
    received: { label: "Cartão recebido.", tone: "busy", step: 3 },
    saving: { label: "A guardar dados…", tone: "busy", step: 4 },
    completed: { label: "Registo concluído.", tone: "ok", step: 5, terminal: true },
    duplicate: { label: "Cartão já registado.", tone: "fail", terminal: true },
    expired: { label: "Tempo de registo esgotado.", tone: "warn", terminal: true },
    offline: { label: "ESP32 offline — o leitor não está a comunicar.", tone: "fail", terminal: true },
    disabled: { label: "Dispositivo desativado.", tone: "fail", terminal: true },
    reader: { label: "Leitor não disponível.", tone: "fail", terminal: true },
    error: { label: "Erro do servidor.", tone: "fail", terminal: true },
    cancelled: { label: "Registo cancelado.", tone: "warn", terminal: true },
  };

  function normalizeRegStatus(raw) {
    const v = String(raw || "").toLowerCase();
    if (["waiting", "pending", "waiting_card", "started", "queued"].includes(v)) return "waiting";
    if (["card_received", "card_read", "received"].includes(v)) return "received";
    if (["saving", "processing"].includes(v)) return "saving";
    if (["completed", "complete", "done", "success", "registered"].includes(v)) return "completed";
    if (["duplicate", "card_already_registered", "already_registered"].includes(v)) return "duplicate";
    if (["expired", "timeout", "timed_out"].includes(v)) return "expired";
    if (["device_offline", "offline"].includes(v)) return "offline";
    if (["cancelled", "canceled"].includes(v)) return "cancelled";
    if (["error", "failed"].includes(v)) return "error";
    return "waiting";
  }

  // Erro de pedido → estado do painel, com título específico (nunca "sem ligação" para um erro HTTP)
  function regStateForError(error) {
    const byCode = {
      device_offline: "offline",
      device_disabled: "disabled",
      device_not_approved: "disabled",
      reader_unavailable: "reader",
      card_already_registered: "duplicate",
      registration_not_found: "expired",
    };
    if (byCode[error.code]) return [byCode[error.code], { message: error.message }];
    return ["error", { label: `${errorTitle(error)}.`, message: error.message }];
  }

  // Estado "error" gravado pelo procedimento MySQL (campo errorCode)
  function regErrorInfo(code) {
    const map = {
      device_disabled: ["disabled", "O dispositivo foi desativado durante o registo."],
      database_error: ["error", "Erro na base de dados (MySQL): o cartão não foi gravado.", "Erro na base de dados."],
      user_not_found: ["error", "O utilizador escolhido já não existe."],
      door_not_defined: ["error", "O dispositivo não tem sala/porta associada."],
    };
    const [state, message, label] = map[code] || ["error", code ? `Código: ${code}` : null];
    return [state, { message, label }];
  }

  async function renderRegister(root, ctx) {
    const existingUser = ctx.params.user || null;

    root.innerHTML = `
      ${existingUser ? `<button type="button" class="adm-link-back" data-action="back">${ICON.back}${esc(existingUser.name)}</button>` : ""}
      <div class="adm-grid-2 adm-grid-2--register">
        <section class="adm-panel">
          <div class="adm-panel__head"><h2>${existingUser ? "Associar novo cartão" : "Novo utilizador e cartão"}</h2></div>
          <div data-slot="ref"></div>
          <form class="adm-form" data-form="register" novalidate>
            ${existingUser ? `
              <div class="adm-note">Cartão para <strong>${esc(existingUser.name)}</strong> (ID ${esc(existingUser.id)})</div>` : `
              <label class="adm-field"><span>Nome completo</span><input class="adm-input" name="fullName" maxlength="80" required autocomplete="off"></label>
              <label class="adm-field"><span>Contacto</span><input class="adm-input" name="contact" maxlength="40" inputmode="tel" autocomplete="off"></label>`}
            <div class="adm-form__row">
              <label class="adm-field"><span>Dispositivo de registo</span><span data-slot="device-field">${loadingHtml("Leitores…")}</span></label>
              <label class="adm-field"><span>Sala ou porta</span><span data-slot="room-field">${loadingHtml("Salas…")}</span></label>
            </div>
            <div class="adm-device-hint" data-slot="device-hint"></div>
            <div class="adm-form__row">
              <label class="adm-field"><span>Leitor</span>
                <select class="adm-input" name="readerId">
                  <option value="outside">Exterior (outside) — entrada</option>
                  <option value="inside">Interior (inside) — saída</option>
                </select>
              </label>
              <label class="adm-field"><span>Estado inicial</span>
                <select class="adm-input" name="active">
                  <option value="true">Autorização ativa</option>
                  <option value="false">Autorização inativa</option>
                </select>
              </label>
            </div>
            <div class="adm-field"><span>Permissões</span>
              <div class="adm-form__inline">
                <label class="adm-toggle"><input type="checkbox" name="canEnter" checked><span>Entrada</span></label>
                <label class="adm-toggle"><input type="checkbox" name="canExit" checked><span>Saída</span></label>
                <label class="adm-toggle"><input type="checkbox" name="useSchedule"><span>Restringir horário</span></label>
              </div>
            </div>
            <div class="adm-form__row hidden" data-slot="schedule">
              <label class="adm-field"><span>Das</span><input class="adm-input" type="time" name="scheduleFrom" value="08:00"></label>
              <label class="adm-field"><span>Até</span><input class="adm-input" type="time" name="scheduleTo" value="18:00"></label>
            </div>
            <div class="adm-form__actions">
              <button type="submit" class="adm-btn adm-btn--primary adm-btn--lg" data-action="submit">${ICON.rfid}Iniciar registo RFID</button>
            </div>
          </form>
        </section>
        <section class="adm-panel" data-slot="progress">
          <div class="adm-panel__head"><h2>Estado do registo</h2></div>
          <div class="adm-state adm-state--empty">Preencha os dados e toque em «Iniciar registo RFID».</div>
        </section>
      </div>`;

    const $ = (sel) => root.querySelector(sel);
    const form = $('[data-form="register"]');
    const progress = $('[data-slot="progress"]');
    const refSlot = $('[data-slot="ref"]');
    const hint = $('[data-slot="device-hint"]');
    let readers = [];
    let rooms = [];
    let noReaders = false;
    let noRooms = false;

    if (existingUser) $('[data-action="back"]').addEventListener("click", () => go("userDetail", { user: existingUser }));
    form.useSchedule.addEventListener("change", () => $('[data-slot="schedule"]').classList.toggle("hidden", !form.useSchedule.checked));
    refSlot.addEventListener("click", (event) => {
      const link = event.target.closest("[data-go]");
      if (link) go(link.dataset.go);
    });

    // Leitores e salas vêm da API. Só se escreve o ID à mão se a própria API falhar.
    const ref = await loadRefData(true);
    if (ctx.signal.aborted) return;
    const roomField = $('[data-slot="room-field"]');
    const deviceField = $('[data-slot="device-field"]');
    rooms = ref.rooms || [];
    readers = (ref.devices || []).filter(isRegistrationReader);

    if (rooms.length) {
      roomField.innerHTML = `<select class="adm-input" name="doorId">${roomOptions(rooms)}</select>`;
    } else if (ref.roomsError) {
      roomField.innerHTML = `<input class="adm-input" name="doorId" placeholder="ex.: main-door" maxlength="64" autocomplete="off">`;
    } else {
      roomField.innerHTML = `<select class="adm-input" name="doorId"><option value="">Sem salas</option></select>`;
      noRooms = true;
    }

    if (ref.devicesError) {
      deviceField.innerHTML = `<input class="adm-input" name="deviceId" placeholder="ex.: esp32-door-01" maxlength="64" autocomplete="off">`;
      refSlot.innerHTML = `<div class="adm-note adm-note--warn">${ICON.alert}<span>${esc(errorText(ref.devicesError))} Introduza o identificador do leitor manualmente.</span></div>`;
    } else if (!readers.length) {
      deviceField.innerHTML = `<select class="adm-input" name="deviceId"><option value="">Nenhum leitor</option></select>`;
      refSlot.innerHTML = `
        <div class="adm-note adm-note--warn">${ICON.alert}<span>Nenhum leitor RFID disponível. Adicione ou ative um dispositivo na gestão de dispositivos.
          <button type="button" class="adm-inline-link" data-go="devices">${ICON.iot}Dispositivos IoT</button></span></div>`;
      noReaders = true;
    } else {
      deviceField.innerHTML = `<select class="adm-input" name="deviceId">${readers.map((d) => `
        <option value="${esc(d.id)}">${esc(d.name)}${d.name !== d.id ? ` (${esc(d.id)})` : ""}${d.online ? "" : " — offline"}</option>`).join("")}</select>`;
    }
    if (noRooms) {
      refSlot.insertAdjacentHTML("beforeend", `<div class="adm-note adm-note--warn">${ICON.alert}<span>Não existem salas/portas. <button type="button" class="adm-inline-link" data-go="rooms">${ICON.door}Criar sala</button></span></div>`);
    }

    // Ao escolher o leitor: sala associada, leitores instalados e estado da ligação
    function syncDevice() {
      const device = readers.find((d) => d.id === (form.deviceId && form.deviceId.value));
      if (!device) {
        hint.innerHTML = "";
        return;
      }
      if (device.roomId && form.doorId.tagName === "SELECT" && rooms.some((r) => String(r.id) === String(device.roomId))) {
        form.doorId.value = device.roomId;
      }
      const previous = form.readerId.value;
      form.readerId.innerHTML = device.readers.map((r) => `<option value="${esc(r)}">${r === "outside" ? "Exterior (outside) — entrada" : r === "inside" ? "Interior (inside) — saída" : esc(r)}</option>`).join("");
      if (device.readers.includes(previous)) form.readerId.value = previous;
      hint.innerHTML = device.online
        ? `<span class="adm-dot adm-dot--ok"></span>Online · último contacto ${esc(fmtRelative(device.lastSeen))}`
        : `<span class="adm-dot adm-dot--fail"></span>Offline · ${device.lastSeen ? `último contacto ${esc(fmtRelative(device.lastSeen))}` : "nunca comunicou"}. Ligue o ESP32 antes de iniciar.`;
    }
    if (form.deviceId.tagName === "SELECT") form.deviceId.addEventListener("change", syncDevice);
    syncDevice();

    // Sem leitores ou sem salas o registo não pode começar
    function setFormEnabled(enabled) {
      form.querySelectorAll("input, select, button").forEach((el) => (el.disabled = !enabled));
      if (noReaders || noRooms) {
        form.querySelector("[data-action=submit]").disabled = true;
        form.deviceId.disabled = form.deviceId.disabled || noReaders;
        form.doorId.disabled = form.doorId.disabled || noRooms;
      }
    }
    setFormEnabled(true);

    let active = null; // { registrationId, controller }

    function renderProgress(stateKey, info = {}) {
      const st = REG_STATES[stateKey];
      const steps = ["Dados enviados", "A aguardar cartão", "Cartão recebido", "A guardar dados", "Concluído"];
      const failedTerminal = st.terminal && stateKey !== "completed";
      progress.innerHTML = `
        <div class="adm-panel__head"><h2>Estado do registo</h2></div>
        <div class="adm-progress adm-progress--${st.tone}">
          <div class="adm-progress__icon">${stateKey === "waiting" ? `<span class="adm-pulse">${ICON.rfid}</span>` : st.tone === "ok" ? ICON.ok : st.tone === "busy" ? `<span class="adm-spinner adm-spinner--lg"></span>` : stateKey === "offline" ? ICON.wifiOff : ICON.alert}</div>
          <div class="adm-progress__label">${esc(info.label || st.label)}</div>
          ${info.message ? `<div class="adm-progress__detail">${esc(info.message)}</div>` : ""}
          ${info.warning ? `<div class="adm-progress__detail adm-progress__detail--warn">${esc(info.warning)}</div>` : ""}
        </div>
        ${failedTerminal ? "" : `<ol class="adm-steps">${steps.map((label, i) => {
          const n = i + 1;
          const cls = n < st.step ? "is-done" : n === st.step ? (stateKey === "completed" ? "is-done" : "is-current") : "";
          return `<li class="${cls}">${esc(label)}</li>`;
        }).join("")}</ol>`}
        ${stateKey === "completed" ? `
          <dl class="adm-dialog__details">
            <dt>Nome</dt><dd>${esc(info.name || "—")}</dd>
            <dt>UID</dt><dd class="adm-mono">${esc(info.uid || "—")}</dd>
            <dt>Dispositivo</dt><dd>${esc(info.device || "—")}</dd>
            <dt>Permissões</dt><dd>${esc(info.permissions || "—")}</dd>
          </dl>` : ""}
        ${stateKey === "duplicate" && info.owner ? `<div class="adm-progress__detail">Associado a: ${esc(info.owner)}</div>` : ""}
        <div class="adm-form__actions">
          ${st.terminal
            ? `<button type="button" class="adm-btn adm-btn--primary" data-action="again">Novo registo</button>
               ${stateKey === "completed" ? `<button type="button" class="adm-btn adm-btn--ghost" data-action="to-cards">Ver cartões</button>` : ""}
               <button type="button" class="adm-btn adm-btn--ghost" data-action="to-users">Ver utilizadores</button>`
            : `<button type="button" class="adm-btn adm-btn--danger" data-action="cancel" ${stateKey === "starting" || stateKey === "saving" ? "disabled" : ""}>Cancelar registo</button>`}
        </div>`;
      setFormEnabled(st.terminal);
    }

    progress.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "again") {
        if (existingUser) return go("register", { user: existingUser });
        form.reset();
        setFormEnabled(true);
        syncDevice();
        $('[data-slot="schedule"]').classList.add("hidden");
        progress.innerHTML = `<div class="adm-panel__head"><h2>Estado do registo</h2></div><div class="adm-state adm-state--empty">Pronto para um novo registo.</div>`;
      } else if (btn.dataset.action === "to-users") {
        go("users");
      } else if (btn.dataset.action === "to-cards") {
        go("cards");
      } else if (btn.dataset.action === "cancel" && active) {
        await withBusy(btn, "A cancelar…", async () => {
          try {
            await AdminApi.registerCancel(active.registrationId);
            active.controller.abort();
            active = null;
            renderProgress("cancelled", { message: "O pedido foi cancelado no servidor; o leitor sai do modo de registo." });
          } catch (error) {
            // Sem confirmação do servidor o registo pode continuar ativo — continuamos a acompanhar
            if (error.code === "registration_not_cancellable") toast(`${error.message} A mostrar o estado real…`, "info");
            else if (error.kind === "unavailable") toast("Cancelamento indisponível no servidor. O registo continua ativo até expirar.", "error");
            else toast(`Não foi possível cancelar: ${errorText(error)}`, "error");
          }
        });
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (active) return;

      const name = existingUser ? existingUser.name : form.fullName.value.trim();
      const contact = existingUser ? existingUser.contact : form.contact.value.trim();
      const deviceId = form.deviceId.value.trim();
      const doorId = form.doorId.value.trim();
      const canEnter = form.canEnter.checked;
      const canExit = form.canExit.checked;
      const device = readers.find((d) => d.id === deviceId);

      if (!existingUser && name.length < 2) return toast("Indique o nome completo.", "error");
      if (!deviceId) return toast("Escolha o dispositivo de registo.", "error");
      if (!doorId) return toast("Escolha a sala ou porta.", "error");
      if (!canEnter && !canExit) return toast("Selecione pelo menos uma permissão (entrada ou saída).", "error");
      if (form.useSchedule.checked && form.scheduleFrom.value === form.scheduleTo.value) return toast("O horário inicial e final não podem ser iguais.", "error");

      const payload = {
        ...(existingUser ? { userId: existingUser.id } : {}),
        name,
        contact,
        deviceId,
        readerId: form.readerId.value,
        doorId,
        permissions: { canEnter, canExit },
        schedule: form.useSchedule.checked ? { from: form.scheduleFrom.value, to: form.scheduleTo.value, tz: officeTz() } : null,
        active: form.active.value === "true",
      };
      const readerLabel = form.readerId.value === "inside" ? "interior" : "exterior";
      const roomLabel = form.doorId.selectedOptions ? form.doorId.selectedOptions[0].textContent : doorId;
      const permissionsText = [canEnter && "Entrada", canExit && "Saída"].filter(Boolean).join(" e ") + ` · ${roomLabel}` +
        (payload.schedule ? ` · ${payload.schedule.from}–${payload.schedule.to}` : "");

      renderProgress("starting");
      // No ecrã de 480px o painel de estado fica abaixo do formulário
      progress.scrollIntoView({ behavior: "smooth", block: "start" });
      let started;
      try {
        started = await AdminApi.registerStart(payload);
      } catch (error) {
        if (ctx.signal.aborted || error.kind === "unauthorized") return;
        const [key, info] = regStateForError(error);
        renderProgress(key, info);
        return;
      }
      if (ctx.signal.aborted) return;

      const registrationId = first(started && started.registrationId, started && started.id);
      if (!registrationId) {
        renderProgress("error", { message: "O servidor não devolveu um registrationId." });
        return;
      }

      active = { registrationId, controller: new AbortController() };
      const localAbort = active.controller.signal;
      const stopAll = () => active && active.controller.abort();
      ctx.signal.addEventListener("abort", stopAll, { once: true });

      const waitingMessage = `Leitor: ${device ? device.name : deviceId} · ${readerLabel}`;
      renderProgress("waiting", { message: waitingMessage });
      const expires = parseDate(first(started.expiresAt, started.expires_at));
      const deadline = (expires ? expires.getTime() : Date.now() + REGISTER_FALLBACK_TIMEOUT_MS) + 5000;
      let lastState = "waiting";
      let lastWarning = null;
      let errors = 0;

      while (!localAbort.aborted) {
        await wait(REGISTER_POLL_MS, localAbort);
        if (localAbort.aborted) break;

        let data;
        try {
          data = await AdminApi.registerStatus(registrationId, { signal: localAbort });
          errors = 0;
        } catch (error) {
          if (localAbort.aborted || error.kind === "unauthorized") break;
          if (error.code === "registration_not_found") {
            renderProgress("expired", { message: error.message });
            break;
          }
          errors += 1;
          if (errors >= 3) {
            renderProgress("error", { label: `${errorTitle(error)}.`, message: `${error.message} O estado do registo é desconhecido — confirme na lista de cartões.` });
            break;
          }
          continue;
        }

        let stateKey = normalizeRegStatus(first(data && data.status, data && data.state));
        const card = (data && data.card) || {};
        const info = {
          name: first(data && data.user && data.user.name, data && data.name, name),
          uid: first(data && data.uid, card.uid),
          device: `${first(data && data.deviceName, device && device.name, deviceId)} (${first(data && data.deviceId, deviceId)})`,
          permissions: permissionsText,
          owner: first(data && data.ownerName, data && data.existingUser && data.existingUser.name),
          message: stateKey === "waiting" ? waitingMessage : null,
        };
        if (stateKey === "error") {
          const [mapped, extra] = regErrorInfo(data && data.errorCode);
          stateKey = mapped;
          Object.assign(info, extra);
        }
        if (stateKey === "cancelled" && data && data.errorCode === "superseded") {
          info.message = "Foi iniciado outro registo neste leitor.";
        }
        // O leitor deixou de comunicar: avisa, mas continua à espera (pode voltar)
        info.warning = stateKey === "waiting" && data && data.deviceOnline === false
          ? "O leitor deixou de comunicar com o servidor. Verifique a alimentação e o Wi-Fi do ESP32."
          : null;

        if (stateKey !== lastState || info.warning !== lastWarning || REG_STATES[stateKey].terminal) renderProgress(stateKey, info);
        lastState = stateKey;
        lastWarning = info.warning;

        if (REG_STATES[stateKey].terminal) {
          if (stateKey === "completed") invalidateRefData();
          break;
        }

        if (Date.now() > deadline) {
          renderProgress("expired", { message: "O cartão não foi apresentado a tempo." });
          AdminApi.registerCancel(registrationId).catch(() => {});
          break;
        }
      }

      // Saiu da vista a meio do registo → pede cancelamento (melhor esforço)
      if (ctx.signal.aborted && !REG_STATES[lastState].terminal) {
        AdminApi.registerCancel(registrationId).catch(() => {});
      }
      ctx.signal.removeEventListener("abort", stopAll);
      active = null;
    });
  }

  // ============================================================
  // VISTA: CARTÕES
  // ============================================================

  async function renderCards(root, ctx) {
    const state = { uid: "", user: "", status: "", page: 1 };

    root.innerHTML = `
      <div class="adm-note">${ICON.alert}<span>O UID identifica o cartão, mas não é uma credencial criptograficamente segura: pode ser copiado. Revogue imediatamente cartões perdidos.</span></div>
      <div class="adm-toolbar">
        <input type="search" class="adm-input adm-toolbar__grow" placeholder="Pesquisar UID…" data-field="uid" maxlength="40" autocapitalize="characters">
        <input type="search" class="adm-input" placeholder="Utilizador…" data-field="user" maxlength="80">
        <select class="adm-input" data-field="status">
          <option value="">Todos os estados</option>
          <option value="active">Ativos</option>
          <option value="suspended">Suspensos</option>
          <option value="revoked">Revogados</option>
        </select>
        <button type="button" class="adm-btn adm-btn--primary" data-action="new">${ICON.plus}Registar cartão</button>
      </div>
      <div data-slot="results"></div>`;

    const slot = root.querySelector('[data-slot="results"]');
    let cards = [];

    async function load() {
      slot.innerHTML = loadingHtml();
      let page;
      try {
        page = toPage(await AdminApi.listCards({ uid: state.uid, user: state.user, status: state.status, page: state.page, pageSize: PAGE_SIZE }, { signal: ctx.signal }), "cards");
      } catch (error) {
        if (!ctx.signal.aborted) showError(slot, error, load);
        return;
      }
      if (ctx.signal.aborted) return;

      cards = page.items.map(normalizeCard);
      if (!cards.length) {
        slot.innerHTML = emptyHtml(state.uid || state.user || state.status ? "Nenhum cartão corresponde aos filtros." : "Ainda não existem cartões registados.");
        return;
      }

      slot.innerHTML = `
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>UID</th><th>Utilizador</th><th class="adm-hide-sm">Registo</th><th>Estado</th><th class="adm-hide-sm">Permissões</th><th>Última utilização</th><th></th></tr></thead>
            <tbody>
              ${cards.map((c, i) => `
                <tr>
                  <td class="adm-mono">${esc(c.uid)}</td>
                  <td>${esc(c.userName || "—")}</td>
                  <td class="adm-hide-sm">${esc(fmtDate(c.createdAt))}</td>
                  <td>${cardStatusPill(c.status)}</td>
                  <td class="adm-hide-sm">${esc(c.permissions)}</td>
                  <td>${esc(fmtRelative(c.lastUsedAt))}</td>
                  <td class="adm-td-actions">${c.status !== "revoked" ? `<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-revoke="${i}">Revogar</button>` : ""}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        ${pagerHtml(state.page, page.total, cards.length)}`;
    }

    const reload = debounce(() => { state.page = 1; load(); }, 350);
    root.querySelector('[data-field="uid"]').addEventListener("input", (e) => { state.uid = e.target.value.trim(); reload(); });
    root.querySelector('[data-field="user"]').addEventListener("input", (e) => { state.user = e.target.value.trim(); reload(); });
    root.querySelector('[data-field="status"]').addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; load(); });
    root.querySelector('[data-action="new"]').addEventListener("click", () => go("register"));
    slot.addEventListener("click", async (event) => {
      const pageBtn = event.target.closest("[data-page]");
      if (pageBtn && !pageBtn.disabled) {
        state.page = Number(pageBtn.dataset.page);
        return load();
      }
      const revokeBtn = event.target.closest("[data-revoke]");
      if (revokeBtn) {
        const card = cards[Number(revokeBtn.dataset.revoke)];
        if (await revokeCard(revokeBtn, card.id, card.uid, card.userName)) load();
      }
    });

    await load();
  }

  // ============================================================
  // VISTA: SALAS E PORTAS (dispositivos dinâmicos + abertura remota)
  // ============================================================

  const DOOR_STATES = {
    sending: { label: "Pedido enviado…", tone: "busy" },
    queued: { label: "A aguardar dispositivo…", tone: "busy" },
    accepted: { label: "Comando aceite pelo dispositivo…", tone: "busy" },
    executed: { label: "Comando de abertura executado", tone: "ok", terminal: true },
    opened: { label: "Porta aberta (confirmado pelo sensor)", tone: "ok", terminal: true },
    timeout: { label: "Tempo esgotado", tone: "warn", terminal: true },
    offline: { label: "Dispositivo offline", tone: "fail", terminal: true },
    unconfirmed: { label: "Abertura não confirmada", tone: "warn", terminal: true },
    unavailable: { label: "Abertura remota indisponível", tone: "warn", terminal: true },
  };

  function normalizeDoorStatus(data) {
    const v = String(first(data && data.status, data && data.state) ?? "").toLowerCase();
    const sensor = String(first(data && data.doorState, data && data.door_state) ?? "").toLowerCase();
    if (["executed", "done", "completed", "acked", "ack"].includes(v)) return sensor === "open" ? "opened" : "executed";
    if (["accepted", "delivered", "sent", "in_progress"].includes(v)) return "accepted";
    if (["queued", "pending", "waiting"].includes(v)) return "queued";
    if (["timeout", "expired"].includes(v)) return "timeout";
    if (["offline", "device_offline"].includes(v)) return "offline";
    if (["failed", "error", "not_confirmed", "unconfirmed"].includes(v)) return "unconfirmed";
    return "queued";
  }

  // Tipos que comandam um trinco (dispositivos sem tipo = API antiga = ESP32 de porta)
  const DOOR_DEVICE_TYPES = ["esp32_rfid", "door_controller"];
  const canDriveDoor = (d) => !d.type || DOOR_DEVICE_TYPES.includes(d.type);

  // Formulário dentro do diálogo: onSubmit(form) devolve true para fechar.
  // Erros do servidor ficam visíveis no próprio diálogo.
  function formDialog({ title, body, submitLabel = "Guardar", danger = false, onSubmit }) {
    const card = openDialog(`
      <form class="adm-form" data-form="dialog" novalidate>
        <div class="adm-dialog__title">${esc(title)}</div>
        ${body}
        <div class="adm-login__msg adm-login__msg--error hidden" data-slot="dialog-error" role="alert"></div>
        <div class="adm-dialog__actions">
          <button type="button" class="adm-btn adm-btn--ghost" data-dialog-cancel>Cancelar</button>
          <button type="submit" class="adm-btn ${danger ? "adm-btn--danger" : "adm-btn--primary"}">${esc(submitLabel)}</button>
        </div>
      </form>`);
    const form = card.querySelector("form");
    const errorSlot = card.querySelector('[data-slot="dialog-error"]');
    card.querySelector("[data-dialog-cancel]").addEventListener("click", closeDialog);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorSlot.classList.add("hidden");
      await withBusy(form.querySelector('[type="submit"]'), "A guardar…", async () => {
        try {
          if (await onSubmit(form)) closeDialog();
        } catch (error) {
          if (error.kind === "unauthorized") return closeDialog();
          errorSlot.textContent = errorText(error);
          errorSlot.classList.remove("hidden");
        }
      });
    });
    const firstInput = form.querySelector("input:not([disabled]), select");
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
    return form;
  }

  const readerChips = (readers) => readers.map((r) => `<span class="adm-chip">${esc(r === "outside" ? "Exterior" : r === "inside" ? "Interior" : r)}</span>`).join(" ");

  function connectionPill(d) {
    if (d.approvalStatus !== "approved") return `<span class="adm-pill adm-pill--warn">${esc(APPROVAL_LABEL[d.approvalStatus] || d.approvalStatus)}</span>`;
    return statusPill(d.online, "Online", "Offline");
  }

  async function renderRooms(root, ctx) {
    root.innerHTML = `
      <div class="adm-toolbar">
        <button type="button" class="adm-btn adm-btn--primary" data-action="new-room">${ICON.plus}Nova sala/porta</button>
        <button type="button" class="adm-btn adm-btn--ghost" data-action="refresh">${ICON.refresh}Atualizar</button>
      </div>
      <div data-slot="rooms">${loadingHtml()}</div>
      <div data-slot="unassigned"></div>`;

    const roomsSlot = root.querySelector('[data-slot="rooms"]');
    const unassignedSlot = root.querySelector('[data-slot="unassigned"]');
    const expanded = new Set(); // salas com "Eventos recentes" aberto
    let devices = [];
    let rooms = [];

    function deviceRow(d) {
      const i = devices.indexOf(d);
      return `
        <li class="adm-list__item">
          <div><span class="adm-td-main">${esc(d.name)}</span><small class="adm-mono">${esc(d.id)}</small>
            <small>${readerChips(d.readers)} · ${esc(fmtRelative(d.lastSeen))}</small></div>
          <div class="adm-list__right">
            ${connectionPill(d)}${d.approvalStatus === "approved" && !d.active ? statusPill(false) : ""}
            ${canDriveDoor(d) && d.approvalStatus === "approved" && d.active
              ? `<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-open="${i}" ${AdminAuth.can("door.open") ? "" : "disabled title=\"Sem permissão de abertura remota\""}>${ICON.door}Abrir porta</button>`
              : ""}
            <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-device="${i}">Detalhes</button>
          </div>
        </li>`;
    }

    async function loadEvents(roomId) {
      const slot = roomsSlot.querySelector(`[data-events="${CSS.escape(roomId)}"]`);
      if (!slot) return;
      slot.innerHTML = loadingHtml();
      try {
        const page = toPage(await AdminApi.listLogs({ roomId, page: 1, pageSize: 5, sort: "timestamp", order: "desc", tz: officeTz() }, { signal: ctx.signal }), "logs");
        if (!ctx.signal.aborted) slot.innerHTML = eventsTableHtml(page.items.map(normalizeEvent), { compact: true, empty: "Sem eventos nesta sala/porta." });
      } catch (error) {
        if (!ctx.signal.aborted) showError(slot, error, () => loadEvents(roomId));
      }
    }

    async function load() {
      const ref = await loadRefData(true);
      if (ctx.signal.aborted) return;
      devices = ref.devices || [];
      rooms = ref.rooms || [];

      if (ref.roomsError) {
        showError(roomsSlot, ref.roomsError, load);
      } else if (!rooms.length) {
        roomsSlot.innerHTML = emptyHtml("Ainda não existem salas/portas. Crie a primeira com «Nova sala/porta».");
      } else {
        roomsSlot.innerHTML = `<div class="adm-rooms">${rooms.map((r, i) => {
          const inRoom = devices.filter((d) => String(d.roomId) === String(r.id));
          const online = inRoom.filter((d) => d.online && d.active && d.approvalStatus === "approved").length;
          const readers = [...new Set(inRoom.flatMap((d) => (d.rfidCapable ? d.readers : [])))];
          return `
            <article class="adm-panel adm-room">
              <div class="adm-panel__head">
                <div class="adm-room__title"><h2>${esc(r.name)}</h2><small class="adm-mono">${esc(r.id)}</small></div>
                <div class="adm-list__right">
                  <span class="adm-chip">${inRoom.length} dispositivo(s)</span>
                  ${inRoom.length ? statusPill(online > 0, `${online} online`, "Offline") : ""}
                </div>
              </div>
              ${r.description ? `<p class="adm-hint">${esc(r.description)}</p>` : ""}
              <div class="adm-room__readers">Leitores: ${readers.length ? readerChips(readers) : `<span class="adm-hint">nenhum leitor RFID associado</span>`}</div>
              ${ref.devicesError ? "" : inRoom.length ? `<ul class="adm-list">${inRoom.map(deviceRow).join("")}</ul>` : emptyHtml("Sem dispositivos associados.")}
              <div class="adm-form__actions">
                <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-edit-room="${i}">${ICON.edit}Editar</button>
                <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-assign="${i}">${ICON.link}Associar dispositivo</button>
                <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-events-toggle="${i}">${ICON.history}${expanded.has(String(r.id)) ? "Ocultar eventos" : "Eventos recentes"}</button>
              </div>
              <div data-events="${esc(r.id)}" class="${expanded.has(String(r.id)) ? "" : "hidden"}"></div>
            </article>`;
        }).join("")}</div>`;
        expanded.forEach((id) => loadEvents(id));
      }

      if (ref.devicesError) {
        showError(unassignedSlot, ref.devicesError, load);
        return;
      }
      const unassigned = devices.filter((d) => !d.roomId || !rooms.some((r) => String(r.id) === String(d.roomId)));
      unassignedSlot.innerHTML = unassigned.length ? `
        <div class="adm-section-head"><h2>Dispositivos sem sala</h2></div>
        <section class="adm-panel"><ul class="adm-list">${unassigned.map(deviceRow).join("")}</ul></section>` : "";
    }

    function roomDialog(room) {
      formDialog({
        title: room ? "Editar sala/porta" : "Nova sala/porta",
        body: `
          <label class="adm-field"><span>Nome</span><input class="adm-input" name="name" maxlength="100" value="${esc(room ? room.name : "")}" required></label>
          <label class="adm-field"><span>Identificador</span><input class="adm-input adm-mono" name="id" maxlength="100" value="${esc(room ? room.id : "")}" placeholder="ex.: sala-reunioes" autocapitalize="off" spellcheck="false"></label>
          ${room ? `<p class="adm-hint">O identificador só pode ser alterado enquanto nenhum dispositivo ou permissão o usar.</p>` : `<p class="adm-hint">Minúsculas, números, «-», «_» ou «.». É usado pelos ESP32 e pelas permissões.</p>`}
          <label class="adm-field"><span>Descrição (opcional)</span><input class="adm-input" name="description" maxlength="255" value="${esc(room ? room.description : "")}"></label>`,
        onSubmit: async (form) => {
          const name = form.name.value.trim();
          const id = form.id.value.trim().toLowerCase();
          const description = form.description.value.trim();
          if (name.length < 2) throw new AdminApi.ApiError("Indique o nome da sala/porta.", { status: 422 });
          if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(id)) throw new AdminApi.ApiError("Identificador inválido (minúsculas, números, «-», «_» ou «.»).", { status: 422 });
          if (room) {
            const patch = { name, description };
            if (id !== String(room.id)) patch.newId = id;
            await AdminApi.updateRoom(room.id, patch);
            toast("Sala/porta atualizada.", "ok");
          } else {
            await AdminApi.createRoom({ id, name, description });
            toast("Sala/porta criada.", "ok");
          }
          invalidateRefData();
          load();
          return true;
        },
      });
    }

    function assignDialog(room) {
      const candidates = devices.filter((d) => d.approvalStatus === "approved" && String(d.roomId) !== String(room.id));
      if (!candidates.length) {
        toast("Não há dispositivos aprovados por associar. Adicione um em Dispositivos IoT.", "info");
        return;
      }
      const form = formDialog({
        title: `Associar a ${room.name}`,
        body: `
          <label class="adm-field"><span>Dispositivo</span>
            <select class="adm-input" name="device">${candidates.map((d, i) => `<option value="${i}">${esc(d.name)} (${esc(d.id)})${d.roomName ? ` — em ${esc(d.roomName)}` : ""}</option>`).join("")}</select>
          </label>
          <div class="adm-field" data-slot="readers"><span>Leitores RFID instalados</span>
            <div class="adm-form__inline">
              <label class="adm-toggle"><input type="checkbox" name="outside"><span>Exterior (entrada)</span></label>
              <label class="adm-toggle"><input type="checkbox" name="inside"><span>Interior (saída)</span></label>
            </div>
          </div>`,
        submitLabel: "Associar",
        onSubmit: async (f) => {
          const device = candidates[Number(f.device.value)];
          const patch = { roomId: room.id };
          if (device.rfidCapable) {
            const readers = ["outside", "inside"].filter((r) => f[r].checked);
            if (!readers.length) throw new AdminApi.ApiError("Indique pelo menos um leitor.", { status: 422 });
            patch.readers = readers;
          }
          await AdminApi.updateDevice(device.dbId, patch);
          toast(`${device.name} associado a ${room.name}.`, "ok");
          invalidateRefData();
          load();
          return true;
        },
      });
      const sync = () => {
        const d = candidates[Number(form.device.value)];
        form.querySelector('[data-slot="readers"]').classList.toggle("hidden", !d.rfidCapable);
        form.outside.checked = d.readers.includes("outside");
        form.inside.checked = d.readers.includes("inside");
      };
      form.device.addEventListener("change", sync);
      sync();
    }

    root.querySelector('[data-action="new-room"]').addEventListener("click", () => roomDialog(null));
    root.querySelector('[data-action="refresh"]').addEventListener("click", (e) => withBusy(e.currentTarget, "A atualizar…", load));
    root.addEventListener("click", (event) => {
      const t = event.target.closest("[data-open], [data-device], [data-edit-room], [data-assign], [data-events-toggle]");
      if (!t || t.disabled) return;
      if (t.dataset.open !== undefined) return openDoorFlow(devices[Number(t.dataset.open)], load);
      if (t.dataset.device !== undefined) return go("deviceDetail", { device: devices[Number(t.dataset.device)] });
      if (t.dataset.editRoom !== undefined) return roomDialog(rooms[Number(t.dataset.editRoom)]);
      if (t.dataset.assign !== undefined) return assignDialog(rooms[Number(t.dataset.assign)]);
      const room = rooms[Number(t.dataset.eventsToggle)];
      const id = String(room.id);
      const slot = roomsSlot.querySelector(`[data-events="${CSS.escape(id)}"]`);
      if (expanded.has(id)) {
        expanded.delete(id);
        slot.classList.add("hidden");
        t.innerHTML = `${ICON.history}Eventos recentes`;
      } else {
        expanded.add(id);
        slot.classList.remove("hidden");
        t.innerHTML = `${ICON.history}Ocultar eventos`;
        loadEvents(id);
      }
    });

    await load();
    ctx.every(load, 30 * 1000);
  }

  async function openDoorFlow(device, onDone) {
    const doorName = device.roomName || device.doorId || device.name;
    const ok = await confirmDialog({
      title: "Abrir porta",
      message: device.online
        ? "O trinco será acionado remotamente. Confirme que pretende abrir esta porta."
        : "Atenção: o dispositivo aparenta estar offline. O comando poderá não ser executado.",
      details: [["Porta", doorName], ["Dispositivo", `${device.name} (${device.id})`], ["Duração", `${DOOR_OPEN_DURATION_MS / 1000} s`]],
      confirmLabel: "Abrir porta",
      danger: true,
    });
    if (!ok) return;

    const controller = new AbortController();
    viewCleanups.push(() => controller.abort()); // sair da vista deixa de acompanhar
    let finished = false;

    const card = openDialog(`<div data-slot="door-status"></div>`);
    const slot = card.querySelector('[data-slot="door-status"]');

    function render(key, message) {
      const st = DOOR_STATES[key];
      slot.innerHTML = `
        <div class="adm-progress adm-progress--${st.tone}">
          <div class="adm-progress__icon">${st.tone === "busy" ? `<span class="adm-spinner adm-spinner--lg"></span>` : st.tone === "ok" ? ICON.ok : key === "offline" ? ICON.wifiOff : ICON.alert}</div>
          <div class="adm-progress__label">${esc(st.label)}</div>
          <div class="adm-progress__detail">${esc(message || `${doorName} · ${device.id}`)}</div>
        </div>
        <div class="adm-dialog__actions">
          <button type="button" class="adm-btn ${st.terminal ? "adm-btn--primary" : "adm-btn--ghost"}" data-close>${st.terminal ? "Fechar" : "Deixar de acompanhar"}</button>
        </div>`;
      if (st.terminal) finished = true;
    }

    card.addEventListener("click", (event) => {
      if (!event.target.closest("[data-close]")) return;
      controller.abort();
      closeDialog();
      if (onDone) onDone();
    });

    render("sending");
    let started;
    try {
      started = await AdminApi.openDoor(device.id, DOOR_OPEN_DURATION_MS);
    } catch (error) {
      if (error.kind === "unauthorized") return closeDialog();
      if (error.code === "device_offline") return render("offline", error.message);
      // Nenhum comando foi enviado: não dizer "não confirmada"
      if (error.kind === "unavailable" || error.kind === "cors") {
        return render("unavailable", `O backend ainda não disponibiliza a API segura de abertura (POST /api/door/open). Nenhum comando foi confirmado.${error.kind === "cors" ? ` (${error.message})` : ""}`);
      }
      if (error.kind === "forbidden" || error.status === 400 || error.status === 422) return render("unavailable", errorText(error));
      return render("unconfirmed", errorText(error));
    }

    const commandId = first(started && started.commandId, started && started.id);
    render(normalizeDoorStatus(started));
    if (finished) return;

    const deadline = Date.now() + DOOR_TIMEOUT_MS;
    let errors = 0;
    while (!controller.signal.aborted && !finished) {
      await wait(DOOR_POLL_MS, controller.signal);
      if (controller.signal.aborted) return;
      if (Date.now() > deadline) {
        render("timeout", "O dispositivo não confirmou a execução dentro do tempo limite.");
        return;
      }
      try {
        const data = await AdminApi.doorStatus({ commandId, deviceId: device.id }, { signal: controller.signal });
        errors = 0;
        const key = normalizeDoorStatus(data);
        render(key, key === "executed" ? "O ESP32 confirmou o acionamento do trinco. Sem sensor de porta, a abertura física não é verificada." : null);
      } catch (error) {
        if (controller.signal.aborted || error.kind === "unauthorized") return;
        if (error.kind === "unavailable") {
          render("unconfirmed", "O servidor aceitou o pedido, mas não é possível consultar a confirmação (GET /api/door/status indisponível).");
          return;
        }
        errors += 1;
        if (errors >= 3) {
          render("unconfirmed", error.message);
          return;
        }
      }
    }
  }

  // ============================================================
  // VISTA: DISPOSITIVOS IOT
  // Ativo/Inativo = decisão do administrador. Online/Offline = heartbeat real.
  // ============================================================

  const APPROVAL_LABEL = { pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado", revoked: "Revogado" };

  let typesCache = null;

  // Tipos vêm da tabela access_device_types: um tipo novo não exige alterar o frontend
  async function loadDeviceTypes() {
    if (typesCache) return typesCache;
    const data = await AdminApi.listDeviceTypes();
    typesCache = toPage(data, "types").items.map((t) => ({
      id: t.id,
      label: first(t.label, t.id),
      rfidCapable: flag(t.rfidCapable),
      configSchema: Array.isArray(t.configSchema) ? t.configSchema : [],
    }));
    return typesCache;
  }

  function adminStatePill(d) {
    if (d.approvalStatus !== "approved") {
      const tone = d.approvalStatus === "pending" ? "warn" : "fail";
      return `<span class="adm-pill adm-pill--${tone}">${esc(APPROVAL_LABEL[d.approvalStatus] || d.approvalStatus)}</span>`;
    }
    return statusPill(d.active, "Ativo", "Inativo");
  }

  function lastSeenText(d) {
    if (!d.lastSeen && d.secondsSinceSeen === null) return "Nunca comunicou";
    if (d.secondsSinceSeen !== null && d.secondsSinceSeen < 3600) return d.secondsSinceSeen < 60 ? `há ${d.secondsSinceSeen} s` : `há ${Math.round(d.secondsSinceSeen / 60)} min`;
    return fmtRelative(d.lastSeen);
  }

  // Ações rápidas partilhadas pela lista e pelo detalhe. Devolve o dispositivo atualizado
  // pelo servidor (nunca muda o estado local sem confirmação).
  async function deviceQuickAction(device, action, button) {
    const confirmations = {
      deactivate: { title: "Desativar dispositivo", message: "O dispositivo deixa de autorizar acessos e de registar cartões até ser reativado.", confirmLabel: "Desativar", danger: true },
      reject: { title: "Rejeitar dispositivo", message: "O dispositivo fica bloqueado. Poderá aprová-lo mais tarde, se necessário.", confirmLabel: "Rejeitar", danger: true },
      revoke: { title: "Revogar dispositivo", message: "Bloqueia o dispositivo e apaga a sua credencial. Para voltar a usá-lo terá de o aprovar e gerar nova credencial.", confirmLabel: "Revogar", danger: true },
      approve: { title: "Aprovar dispositivo", message: "O dispositivo passa a poder autorizar acessos e registar cartões.", confirmLabel: "Aprovar" },
    };
    const c = confirmations[action];
    if (c && !(await confirmDialog({ ...c, details: [["Dispositivo", `${device.name} (${device.id})`], ["Sala/porta", device.roomName || "—"]] }))) return null;
    const labels = { activate: "A ativar…", deactivate: "A desativar…", approve: "A aprovar…", reject: "A rejeitar…", revoke: "A revogar…" };
    return withBusy(button, labels[action] || "A guardar…", async () => {
      try {
        const result = action === "activate" || action === "deactivate"
          ? await AdminApi.updateDevice(device.dbId, { active: action === "activate" })
          : await AdminApi.deviceAction(device.dbId, action);
        const updated = normalizeDevice((result && result.device) || {});
        invalidateRefData();
        const done = { activate: "Dispositivo ativado.", deactivate: "Dispositivo desativado.", approve: "Dispositivo aprovado.", reject: "Dispositivo rejeitado.", revoke: "Dispositivo revogado." };
        toast(done[action], "ok");
        return updated.id ? updated : null;
      } catch (error) {
        toast(errorText(error), "error");
        return null;
      }
    });
  }

  async function renderDevices(root, ctx) {
    const filters = { q: "", type: "", status: ctx.params.status || "", connection: "" };

    root.innerHTML = `
      <div class="adm-stats adm-stats--5" data-slot="stats">${loadingHtml()}</div>
      <div class="adm-toolbar">
        <input type="search" class="adm-input adm-toolbar__grow" placeholder="Pesquisar nome, ID ou IP…" data-field="q" maxlength="80">
        <select class="adm-input" data-field="type"><option value="">Todos os tipos</option></select>
        <select class="adm-input" data-field="status">
          <option value="">Todos os estados</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="pending">Pendentes</option>
          <option value="rejected">Rejeitados</option>
          <option value="revoked">Revogados</option>
        </select>
        <select class="adm-input" data-field="connection">
          <option value="">Online e offline</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
        <button type="button" class="adm-btn adm-btn--primary" data-action="add">${ICON.plus}Adicionar dispositivo</button>
      </div>
      <div data-slot="results"></div>`;

    const statsSlot = root.querySelector('[data-slot="stats"]');
    const slot = root.querySelector('[data-slot="results"]');
    root.querySelector('[data-field="status"]').value = filters.status;
    let devices = [];
    let shown = [];

    const stat = (label, value, icon, tone, status) => `
      <button type="button" class="adm-stat adm-stat--link ${tone}" data-filter-status="${status}">
        <div class="adm-stat__head"><span>${esc(label)}</span>${ICON[icon]}</div>
        <div class="adm-stat__value">${esc(value)}</div>
      </button>`;

    function matches(d) {
      const q = filters.q.toLowerCase();
      if (q && ![d.name, d.id, d.ipAddress].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      if (filters.type && d.type !== filters.type) return false;
      if (filters.status === "active" && !(d.approvalStatus === "approved" && d.active)) return false;
      if (filters.status === "inactive" && !(d.approvalStatus === "approved" && !d.active)) return false;
      if (["pending", "rejected", "revoked"].includes(filters.status) && d.approvalStatus !== filters.status) return false;
      if (filters.connection === "online" && !d.online) return false;
      if (filters.connection === "offline" && d.online) return false;
      return true;
    }

    function renderTable() {
      shown = devices.filter(matches);
      if (!devices.length) {
        slot.innerHTML = emptyHtml("Ainda não existem dispositivos. Use «Adicionar dispositivo» ou ligue um ESP32: aparece aqui como pendente.");
        return;
      }
      if (!shown.length) {
        slot.innerHTML = emptyHtml("Nenhum dispositivo corresponde aos filtros.");
        return;
      }
      slot.innerHTML = `
        <div class="adm-table-wrap">
          <table class="adm-table adm-table--devices">
            <thead><tr>
              <th>Nome</th><th class="adm-hide-md">Tipo</th><th>Sala/porta</th><th>Estado</th><th>Ligação</th>
              <th class="adm-hide-md">IP</th><th class="adm-hide-md">Última comunicação</th><th></th>
            </tr></thead>
            <tbody>
              ${shown.map((d, i) => `
                <tr class="${d.approvalStatus === "pending" ? "is-pending" : ""}">
                  <td><span class="adm-td-main">${esc(d.name)}</span><small class="adm-mono">${esc(d.id)}</small></td>
                  <td class="adm-hide-md">${esc(d.typeLabel || "—")}</td>
                  <td>${esc(d.roomName || "—")}</td>
                  <td>${adminStatePill(d)}</td>
                  <td>${statusPill(d.online, "Online", "Offline")}<small class="adm-show-md">${esc(lastSeenText(d))}</small></td>
                  <td class="adm-hide-md adm-mono">${esc(d.ipAddress || "—")}</td>
                  <td class="adm-hide-md">${esc(lastSeenText(d))}</td>
                  <td class="adm-td-actions">
                    ${d.approvalStatus === "pending"
                      ? `<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-act="approve" data-i="${i}">Aprovar</button>
                         <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="reject" data-i="${i}">Rejeitar</button>`
                      : d.approvalStatus === "approved"
                        ? `<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="${d.active ? "deactivate" : "activate"}" data-i="${i}">${ICON.power}${d.active ? "Desativar" : "Ativar"}</button>`
                        : ""}
                    <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-detail="${i}">Gerir</button>
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    }

    async function load() {
      let data;
      try {
        data = await AdminApi.listDevices(null, { signal: ctx.signal });
      } catch (error) {
        if (!ctx.signal.aborted) {
          showError(statsSlot, error, load);
          slot.innerHTML = "";
        }
        return;
      }
      if (ctx.signal.aborted) return;
      devices = toPage(data, "devices").items.map(normalizeDevice);
      const approved = devices.filter((d) => d.approvalStatus === "approved");
      statsSlot.innerHTML =
        stat("Total", devices.length, "iot", "", "") +
        stat("Ativos", approved.filter((d) => d.active).length, "power", "adm-stat--ok", "active") +
        stat("Online", devices.filter((d) => d.online).length, "pulse", "adm-stat--ok", "online") +
        stat("Offline", approved.filter((d) => d.active && !d.online).length, "wifiOff", "adm-stat--warn", "offline") +
        stat("Pendentes", devices.filter((d) => d.approvalStatus === "pending").length, "alert", "adm-stat--warn", "pending");
      renderTable();
    }

    // Tipos para o filtro (não bloqueia a lista)
    loadDeviceTypes().then((types) => {
      if (ctx.signal.aborted) return;
      root.querySelector('[data-field="type"]').innerHTML = `<option value="">Todos os tipos</option>` +
        types.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("");
    }).catch(() => {});

    const rerender = debounce(renderTable, 200);
    root.querySelector('[data-field="q"]').addEventListener("input", (e) => { filters.q = e.target.value.trim(); rerender(); });
    ["type", "status", "connection"].forEach((key) =>
      root.querySelector(`[data-field="${key}"]`).addEventListener("change", (e) => { filters[key] = e.target.value; renderTable(); }));
    root.querySelector('[data-action="add"]').addEventListener("click", () => go("deviceForm"));

    statsSlot.addEventListener("click", (event) => {
      const card = event.target.closest("[data-filter-status]");
      if (!card) return;
      const value = card.dataset.filterStatus;
      filters.connection = value === "online" || value === "offline" ? value : "";
      filters.status = value === "online" || value === "offline" ? (value === "offline" ? "active" : "") : value;
      root.querySelector('[data-field="status"]').value = filters.status;
      root.querySelector('[data-field="connection"]').value = filters.connection;
      renderTable();
    });

    slot.addEventListener("click", async (event) => {
      const detail = event.target.closest("[data-detail]");
      if (detail) return go("deviceDetail", { device: shown[Number(detail.dataset.detail)] });
      const btn = event.target.closest("[data-act]");
      if (!btn || btn.disabled) return;
      const updated = await deviceQuickAction(shown[Number(btn.dataset.i)], btn.dataset.act, btn);
      if (updated) load();
    });

    statsSlot.innerHTML = loadingHtml();
    slot.innerHTML = loadingHtml();
    await load();
    ctx.every(load, 30 * 1000);
  }

  // ---------------- Formulário (adicionar / editar) ----------------

  function configFieldsHtml(schema, values) {
    if (!schema.length) return `<p class="adm-hint">Este tipo não tem configuração específica.</p>`;
    return schema.map((f) => {
      const key = String(f.key || "");
      if (!/^[A-Za-z0-9_]{1,40}$/.test(key)) return "";
      const value = values[key] !== undefined ? values[key] : f.default;
      const label = esc(f.label || key);
      if (f.type === "boolean") {
        return `<label class="adm-toggle"><input type="checkbox" data-config="${key}" data-kind="boolean" ${value ? "checked" : ""}><span>${label}</span></label>`;
      }
      if (f.type === "select") {
        const options = Array.isArray(f.options) ? f.options : [];
        return `<label class="adm-field"><span>${label}</span><select class="adm-input" data-config="${key}" data-kind="select">
          ${options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${esc(o.label || o.value)}</option>`).join("")}</select></label>`;
      }
      if (f.type === "number") {
        return `<label class="adm-field"><span>${label}</span><input class="adm-input" type="number" inputmode="numeric" data-config="${key}" data-kind="number"
          ${f.min !== undefined ? `min="${Number(f.min)}"` : ""} ${f.max !== undefined ? `max="${Number(f.max)}"` : ""} value="${value !== undefined && value !== null ? esc(value) : ""}"></label>`;
      }
      return `<label class="adm-field"><span>${label}</span><input class="adm-input" data-config="${key}" data-kind="text" maxlength="100" value="${esc(value ?? "")}"></label>`;
    }).join("");
  }

  function readConfig(container, schema) {
    const config = {};
    for (const el of container.querySelectorAll("[data-config]")) {
      const key = el.dataset.config;
      const field = schema.find((f) => f.key === key) || {};
      if (el.dataset.kind === "boolean") config[key] = el.checked;
      else if (el.dataset.kind === "number") {
        if (el.value === "") continue;
        const n = Number(el.value);
        if (!Number.isFinite(n) || (field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
          throw new AdminApi.ApiError(`${field.label || key}: valor fora do intervalo${field.min !== undefined ? ` (${field.min}–${field.max})` : ""}.`, { status: 422 });
        }
        config[key] = n;
      } else if (el.value.trim()) config[key] = el.value.trim();
    }
    return config;
  }

  async function renderDeviceForm(root, ctx) {
    const editing = ctx.params.device || null;
    root.innerHTML = `
      <button type="button" class="adm-link-back" data-action="back">${ICON.back}${editing ? esc(editing.name) : "Dispositivos IoT"}</button>
      <section class="adm-panel">
        <div class="adm-panel__head"><h2>${editing ? "Editar dispositivo" : "Adicionar dispositivo"}</h2></div>
        <div data-slot="form">${loadingHtml()}</div>
      </section>`;
    root.querySelector('[data-action="back"]').addEventListener("click", () => (editing ? go("deviceDetail", { device: editing }) : go("devices")));
    const slot = root.querySelector('[data-slot="form"]');

    let types;
    let ref;
    try {
      [types, ref] = await Promise.all([loadDeviceTypes(), loadRefData()]);
    } catch (error) {
      if (!ctx.signal.aborted) showError(slot, error, () => go("deviceForm", ctx.params));
      return;
    }
    if (ctx.signal.aborted) return;
    const rooms = ref.rooms || [];
    const current = editing || { type: types[0] && types[0].id, readers: ["outside"], config: {}, active: true };

    slot.innerHTML = `
      <form class="adm-form" data-form="device" novalidate>
        <div class="adm-form__row">
          <label class="adm-field"><span>Nome do dispositivo</span><input class="adm-input" name="deviceName" maxlength="100" value="${esc(editing ? editing.name : "")}" placeholder="ex.: Porta de reuniões" required></label>
          <label class="adm-field"><span>ID único do dispositivo</span><input class="adm-input adm-mono" name="deviceId" maxlength="64" value="${esc(editing ? editing.id : "")}" placeholder="ex.: esp32-door-02" autocapitalize="off" spellcheck="false" ${editing ? "disabled" : ""}></label>
        </div>
        ${editing ? "" : `<p class="adm-hint">O ID tem de ser igual a <span class="adm-mono">DEVICE_ID</span> no firmware do ESP32 (minúsculas, números, «-», «_», «.»).</p>`}
        <div class="adm-form__row">
          <label class="adm-field"><span>Tipo</span><select class="adm-input" name="type">${types.map((t) => `<option value="${esc(t.id)}" ${t.id === current.type ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
          <label class="adm-field"><span>Sala/porta</span><select class="adm-input" name="roomId">
            <option value="">Sem sala</option>${roomOptions(rooms, current.roomId)}</select></label>
        </div>
        <div class="adm-form__row">
          <label class="adm-field"><span>Identificador de hardware (MAC)</span><input class="adm-input adm-mono" name="hardwareId" maxlength="100" value="${esc(current.hardwareId || "")}" placeholder="opcional — preenchido no 1.º contacto"></label>
          ${editing ? `<div class="adm-field"><span>Estado</span><div>${adminStatePill(editing)}</div></div>` : `
          <label class="adm-field"><span>Estado inicial</span><select class="adm-input" name="active">
            <option value="true">Ativo</option><option value="false">Inativo</option></select></label>`}
        </div>
        <label class="adm-field"><span>Descrição (opcional)</span><input class="adm-input" name="description" maxlength="255" value="${esc(current.description || "")}"></label>
        <div class="adm-field" data-slot="readers"><span>Leitores RFID instalados</span>
          <div class="adm-form__inline">
            <label class="adm-toggle"><input type="checkbox" name="outside" ${current.readers.includes("outside") ? "checked" : ""}><span>Exterior (entrada)</span></label>
            <label class="adm-toggle"><input type="checkbox" name="inside" ${current.readers.includes("inside") ? "checked" : ""}><span>Interior (saída)</span></label>
          </div>
        </div>
        <fieldset class="adm-fieldset"><legend>Configuração do tipo</legend><div class="adm-form" data-slot="config"></div></fieldset>
        <div class="adm-login__msg adm-login__msg--error hidden" data-slot="form-error" role="alert"></div>
        <div class="adm-form__actions">
          <button type="submit" class="adm-btn adm-btn--primary adm-btn--lg">${editing ? "Guardar alterações" : `${ICON.plus}Adicionar dispositivo`}</button>
        </div>
      </form>`;

    const form = slot.querySelector("form");
    const configSlot = form.querySelector('[data-slot="config"]');
    const errorSlot = form.querySelector('[data-slot="form-error"]');
    const typeOf = () => types.find((t) => t.id === form.type.value) || { configSchema: [], rfidCapable: false };
    let configValues = { ...(current.config || {}) };

    function syncType() {
      const t = typeOf();
      try { Object.assign(configValues, readConfig(configSlot, t.configSchema)); } catch (_) { /* valores incompletos */ }
      configSlot.innerHTML = configFieldsHtml(t.configSchema, configValues);
      form.querySelector('[data-slot="readers"]').classList.toggle("hidden", !t.rfidCapable);
    }
    form.type.addEventListener("change", syncType);
    syncType();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorSlot.classList.add("hidden");
      const t = typeOf();
      const payload = {
        name: form.deviceName.value.trim(),
        type: form.type.value,
        roomId: form.roomId.value || null,
        hardwareId: form.hardwareId.value.trim() || null,
        description: form.description.value.trim() || null,
      };
      try {
        if (payload.name.length < 2) throw new AdminApi.ApiError("Indique o nome do dispositivo.", { status: 422 });
        payload.config = readConfig(configSlot, t.configSchema);
        if (t.rfidCapable) {
          payload.readers = ["outside", "inside"].filter((r) => form[r].checked);
          if (!payload.readers.length) throw new AdminApi.ApiError("Indique pelo menos um leitor RFID.", { status: 422 });
        }
        if (!editing) {
          payload.deviceId = form.deviceId.value.trim().toLowerCase();
          payload.active = form.active.value === "true";
          if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(payload.deviceId)) throw new AdminApi.ApiError("ID do dispositivo inválido (3–64 caracteres: minúsculas, números, «.», «-», «_»).", { status: 422 });
          if (!payload.hardwareId) delete payload.hardwareId;
        }
      } catch (error) {
        errorSlot.textContent = errorText(error);
        errorSlot.classList.remove("hidden");
        return;
      }

      await withBusy(form.querySelector('[type="submit"]'), "A guardar…", async () => {
        try {
          const result = editing ? await AdminApi.updateDevice(editing.dbId, payload) : await AdminApi.createDevice(payload);
          invalidateRefData();
          const device = normalizeDevice((result && result.device) || {});
          toast(editing ? "Dispositivo atualizado." : "Dispositivo adicionado.", "ok");
          go("deviceDetail", { device: device.id ? device : editing });
        } catch (error) {
          if (error.kind === "unauthorized") return;
          errorSlot.textContent = errorText(error);
          errorSlot.classList.remove("hidden");
        }
      });
    });
  }

  // ---------------- Detalhe ----------------

  async function renderDeviceDetail(root, ctx) {
    let device = ctx.params.device;
    if (!device) return go("devices");

    root.innerHTML = `
      <button type="button" class="adm-link-back" data-action="back">${ICON.back}Dispositivos IoT</button>
      <div data-slot="summary"></div>
      <section class="adm-panel">
        <div class="adm-panel__head"><h2>Ações</h2></div>
        <div class="adm-actions" data-slot="actions"></div>
        <div data-slot="action-result"></div>
      </section>
      <section class="adm-panel">
        <div class="adm-panel__head"><h2>Eventos recentes</h2>
          <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-action="history">${ICON.history}Ver histórico</button>
        </div>
        <div data-slot="events">${loadingHtml()}</div>
      </section>`;

    const $ = (sel) => root.querySelector(sel);
    const resultSlot = $('[data-slot="action-result"]');
    $('[data-action="back"]').addEventListener("click", () => go("devices"));
    $('[data-action="history"]').addEventListener("click", () => go("history", { deviceId: device.id }));

    function render() {
      els.title.textContent = device.name;
      const cfg = Object.entries(device.config || {});
      $('[data-slot="summary"]').innerHTML = `
        <section class="adm-panel">
          <div class="adm-panel__head">
            <div class="adm-room__title"><h2>${esc(device.name)}</h2><small class="adm-mono">${esc(device.id)}</small></div>
            <div class="adm-list__right">${adminStatePill(device)}${statusPill(device.online, "Online", "Offline")}</div>
          </div>
          <dl class="adm-device__meta adm-device__meta--wide">
            <dt>Tipo</dt><dd>${esc(device.typeLabel || "—")}</dd>
            <dt>Sala/porta</dt><dd>${esc(device.roomName || "Sem sala")}</dd>
            <dt>Última comunicação</dt><dd>${esc(lastSeenText(device))}</dd>
            <dt>IP</dt><dd class="adm-mono">${esc(device.ipAddress || "—")}</dd>
            <dt>Firmware</dt><dd>${esc(device.firmwareVersion || "—")}</dd>
            <dt>Wi-Fi (RSSI)</dt><dd>${device.wifiRssi !== undefined && device.wifiRssi !== null ? `${esc(device.wifiRssi)} dBm` : "—"}</dd>
            <dt>Hardware</dt><dd class="adm-mono">${esc(device.hardwareId || "—")}</dd>
            ${device.rfidCapable ? `<dt>Leitores</dt><dd>${readerChips(device.readers)}</dd>` : ""}
            <dt>Credencial</dt><dd>${device.hasCredential === null ? "—" : device.hasCredential ? "Configurada" : `<span class="adm-pill adm-pill--warn">Sem credencial</span>`}</dd>
            ${device.description ? `<dt>Descrição</dt><dd>${esc(device.description)}</dd>` : ""}
            ${cfg.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === "boolean" ? (v ? "Sim" : "Não") : v)}</dd>`).join("")}
          </dl>
        </section>`;

      const a = [];
      a.push(`<button type="button" class="adm-btn adm-btn--ghost" data-do="edit">${ICON.edit}Editar</button>`);
      if (device.approvalStatus === "pending") {
        a.push(`<button type="button" class="adm-btn adm-btn--primary" data-do="approve">Aprovar</button>`);
        a.push(`<button type="button" class="adm-btn adm-btn--danger" data-do="reject">Rejeitar</button>`);
      } else if (device.approvalStatus === "approved") {
        a.push(`<button type="button" class="adm-btn ${device.active ? "adm-btn--ghost" : "adm-btn--primary"}" data-do="${device.active ? "deactivate" : "activate"}">${ICON.power}${device.active ? "Desativar" : "Ativar"}</button>`);
        a.push(`<button type="button" class="adm-btn adm-btn--ghost" data-do="credentials">${ICON.key}${device.hasCredential ? "Gerar nova credencial" : "Gerar credencial"}</button>`);
      } else {
        a.push(`<button type="button" class="adm-btn adm-btn--primary" data-do="approve">Aprovar novamente</button>`);
      }
      a.push(`<button type="button" class="adm-btn adm-btn--ghost" data-do="test">${ICON.pulse}Testar comunicação</button>`);
      if (device.approvalStatus !== "revoked") a.push(`<button type="button" class="adm-btn adm-btn--danger" data-do="revoke">Revogar dispositivo</button>`);
      $('[data-slot="actions"]').innerHTML = a.join("");
    }

    async function refresh() {
      try {
        const list = toPage(await AdminApi.listDevices({ q: device.id }, { signal: ctx.signal }), "devices").items.map(normalizeDevice);
        const fresh = list.find((d) => d.id === device.id);
        if (fresh && !ctx.signal.aborted) {
          device = fresh;
          render();
        }
      } catch (_) { /* mantém os dados recebidos da lista */ }
    }

    async function loadEvents() {
      const slot = $('[data-slot="events"]');
      try {
        const page = toPage(await AdminApi.listLogs({ deviceId: device.id, page: 1, pageSize: 5, sort: "timestamp", order: "desc", tz: officeTz() }, { signal: ctx.signal }), "logs");
        if (!ctx.signal.aborted) slot.innerHTML = eventsTableHtml(page.items.map(normalizeEvent), { compact: true, empty: "Sem eventos registados por este dispositivo." });
      } catch (error) {
        if (!ctx.signal.aborted) showError(slot, error, loadEvents);
      }
    }

    function showCredential(credential) {
      const card = openDialog(`
        <div class="adm-dialog__title">Credencial do dispositivo</div>
        <div class="adm-dialog__text">${esc(credential.instructions || "Copie a chave para o firmware.")}</div>
        <div class="adm-secret"><code class="adm-mono" data-slot="secret">${esc(credential.deviceKey)}</code></div>
        <div class="adm-dialog__text">No firmware: <span class="adm-mono">const char* DEVICE_API_KEY = "…";</span> — é enviada no cabeçalho <span class="adm-mono">${esc(credential.header || "X-Device-Key")}</span>.</div>
        <div class="adm-dialog__actions">
          <button type="button" class="adm-btn adm-btn--ghost" data-copy>Copiar</button>
          <button type="button" class="adm-btn adm-btn--primary" data-close-secret>Já copiei</button>
        </div>`);
      card.querySelector("[data-copy]").addEventListener("click", async (e) => {
        try {
          await navigator.clipboard.writeText(credential.deviceKey);
          e.currentTarget.textContent = "Copiado";
        } catch (_) {
          const range = document.createRange();
          range.selectNodeContents(card.querySelector('[data-slot="secret"]'));
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
          e.currentTarget.textContent = "Selecione e copie";
        }
      });
      // A chave sai do DOM quando o diálogo fecha
      card.querySelector("[data-close-secret]").addEventListener("click", closeDialog);
    }

    $('[data-slot="actions"]').addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-do]");
      if (!btn || btn.disabled) return;
      const action = btn.dataset.do;
      resultSlot.innerHTML = "";
      if (action === "edit") return go("deviceForm", { device });
      if (action === "test") {
        await withBusy(btn, "A testar…", async () => {
          try {
            const r = await AdminApi.deviceStatus(device.dbId, { signal: ctx.signal });
            const ok = flag(r.online);
            resultSlot.innerHTML = `<div class="adm-state adm-state--${ok ? "empty" : "error"} adm-state--result">
              <span class="adm-state__icon">${ok ? ICON.ok : ICON.wifiOff}</span>
              <div class="adm-state__body"><strong>${ok ? "Comunicação OK" : "Sem comunicação"}</strong><span>${esc(r.message || "")}</span>
              <span class="adm-hint">Teste passivo: baseia-se no último heartbeat (o ESP32 contacta o servidor a cada 2–60 s).</span></div></div>`;
            if (r.device) {
              device = normalizeDevice(r.device);
              render();
            }
          } catch (error) {
            if (!ctx.signal.aborted) showError(resultSlot, error);
          }
        });
        return;
      }
      if (action === "credentials") {
        const ok = await confirmDialog({
          title: device.hasCredential ? "Gerar nova credencial" : "Gerar credencial",
          message: device.hasCredential
            ? "A credencial atual deixa de funcionar de imediato: o ESP32 só volta a comunicar depois de atualizar o firmware com a nova chave."
            : "A partir daqui o ESP32 tem de enviar esta chave em todos os pedidos.",
          details: [["Dispositivo", `${device.name} (${device.id})`]],
          confirmLabel: "Gerar",
          danger: device.hasCredential,
        });
        if (!ok) return;
        await withBusy(btn, "A gerar…", async () => {
          try {
            const r = await AdminApi.deviceAction(device.dbId, "credentials");
            device = normalizeDevice(r.device || {});
            invalidateRefData();
            render();
            if (r.credential && r.credential.deviceKey) showCredential(r.credential);
          } catch (error) {
            toast(errorText(error), "error");
          }
        });
        return;
      }
      const updated = await deviceQuickAction(device, action, btn);
      if (updated) {
        device = updated;
        render();
      }
    });

    render();
    await Promise.all([refresh(), loadEvents()]);
  }

  // ============================================================
  // VISTA: HISTÓRICO
  // ============================================================

  const DATE_PRESETS = {
    "": "Todas as datas",
    today: "Hoje",
    yesterday: "Ontem",
    last7: "Últimos 7 dias",
    last30: "Últimos 30 dias",
    custom: "Intervalo personalizado",
  };

  const TIME_PRESETS = {
    "": ["Todas as horas"],
    night: ["Madrugada (00h–06h)", "00:00", "05:59"],
    morning: ["Manhã (06h–12h)", "06:00", "11:59"],
    afternoon: ["Tarde (12h–18h)", "12:00", "17:59"],
    evening: ["Noite (18h–24h)", "18:00", "23:59"],
    custom: ["Intervalo personalizado"],
  };

  async function renderHistory(root, ctx) {
    const filters = { q: ctx.params.userName || "", roomId: "", direction: "", result: "", datePreset: "", dateFrom: "", dateTo: "", timePreset: "", timeFrom: "", timeTo: "", deviceId: ctx.params.deviceId || "", readerId: "" };
    const state = { page: 1, order: "desc" };

    root.innerHTML = `
      <form class="adm-filters" data-form="filters" novalidate>
        <label class="adm-field adm-filters__full"><span>Pesquisar utilizador</span><input type="search" class="adm-input" name="q" placeholder="Nome do utilizador…" maxlength="80" value="${esc(filters.q)}"></label>
        <label class="adm-field"><span>Sala</span><select class="adm-input" name="roomId"><option value="">Todas as salas</option></select></label>
        <label class="adm-field"><span>Evento</span><select class="adm-input" name="direction"><option value="">Todos</option><option value="in">Entrada</option><option value="out">Saída</option></select></label>
        <label class="adm-field"><span>Data</span><select class="adm-input" name="datePreset">${Object.entries(DATE_PRESETS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label class="adm-field"><span>Hora</span><select class="adm-input" name="timePreset">${Object.entries(TIME_PRESETS).map(([v, [l]]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label class="adm-field hidden" data-custom="date"><span>De (data)</span><input type="date" class="adm-input" name="dateFrom"></label>
        <label class="adm-field hidden" data-custom="date"><span>Até (data)</span><input type="date" class="adm-input" name="dateTo"></label>
        <label class="adm-field hidden" data-custom="time"><span>Das (hora)</span><input type="time" class="adm-input" name="timeFrom"></label>
        <label class="adm-field hidden" data-custom="time"><span>Até (hora)</span><input type="time" class="adm-input" name="timeTo"></label>
        <label class="adm-field"><span>Dispositivo</span><select class="adm-input" name="deviceId"><option value="">Todos os dispositivos</option></select></label>
        <label class="adm-field"><span>Leitor</span><select class="adm-input" name="readerId"><option value="">Todos</option><option value="outside">Exterior (entrada)</option><option value="inside">Interior (saída)</option></select></label>
        <label class="adm-field"><span>Resultado</span><select class="adm-input" name="result"><option value="">Todos</option><option value="allowed">Permitido</option><option value="denied">Negado</option></select></label>
      </form>
      <div class="adm-results-head">
        <span data-slot="count"></span>
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-action="clear">Limpar filtros</button>
      </div>
      <div data-slot="results"></div>
      <button type="button" class="adm-btn adm-btn--ghost adm-btn--block adm-export" data-action="export">${ICON.download}Exportar resultados em CSV</button>`;

    const form = root.querySelector('[data-form="filters"]');
    const slot = root.querySelector('[data-slot="results"]');
    const countEl = root.querySelector('[data-slot="count"]');

    // Preenche salas/dispositivos sem bloquear a tabela
    loadRefData().then((ref) => {
      if (ctx.signal.aborted) return;
      if (ref.rooms) form.roomId.innerHTML = roomOptions(ref.rooms, filters.roomId, "Todas as salas");
      if (ref.devices) form.deviceId.innerHTML = deviceOptions(ref.devices, filters.deviceId, "Todos os dispositivos");
    });

    function buildQuery() {
      const q = { q: filters.q, roomId: filters.roomId, direction: filters.direction, result: filters.result, deviceId: filters.deviceId, readerId: filters.readerId, tz: officeTz(), sort: "timestamp", order: state.order };
      const presets = {
        today: [isoDayInTz(0), isoDayInTz(0)],
        yesterday: [isoDayInTz(-1), isoDayInTz(-1)],
        last7: [isoDayInTz(-6), isoDayInTz(0)],
        last30: [isoDayInTz(-29), isoDayInTz(0)],
        custom: [filters.dateFrom, filters.dateTo],
      };
      if (presets[filters.datePreset]) [q.dateFrom, q.dateTo] = presets[filters.datePreset];
      if (filters.timePreset === "custom") {
        q.timeFrom = filters.timeFrom;
        q.timeTo = filters.timeTo;
      } else if (filters.timePreset) {
        [, q.timeFrom, q.timeTo] = TIME_PRESETS[filters.timePreset];
      }
      return q;
    }

    async function load() {
      slot.innerHTML = loadingHtml();
      countEl.textContent = "";
      let page;
      try {
        page = toPage(await AdminApi.listLogs({ ...buildQuery(), page: state.page, pageSize: PAGE_SIZE }, { signal: ctx.signal }), "logs");
      } catch (error) {
        if (!ctx.signal.aborted) showError(slot, error, load);
        return;
      }
      if (ctx.signal.aborted) return;
      const events = page.items.map(normalizeEvent);
      countEl.textContent = page.total !== null ? `${page.total} registo(s) encontrados` : `${events.length} registo(s) nesta página`;
      slot.innerHTML = eventsTableHtml(events, { empty: "Nenhum registo corresponde aos filtros.", sortOrder: state.order }) + pagerHtml(state.page, page.total, events.length);
    }

    function syncFromForm() {
      Object.keys(filters).forEach((key) => {
        if (form[key]) filters[key] = form[key].value.trim();
      });
      root.querySelectorAll('[data-custom="date"]').forEach((el) => el.classList.toggle("hidden", filters.datePreset !== "custom"));
      root.querySelectorAll('[data-custom="time"]').forEach((el) => el.classList.toggle("hidden", filters.timePreset !== "custom"));
    }

    const reload = debounce(() => { state.page = 1; load(); }, 350);
    form.addEventListener("input", (e) => { if (e.target.name === "q") { syncFromForm(); reload(); } });
    form.addEventListener("change", (e) => { if (e.target.name !== "q") { syncFromForm(); state.page = 1; load(); } });
    form.addEventListener("submit", (e) => e.preventDefault());

    root.querySelector('[data-action="clear"]').addEventListener("click", () => {
      form.reset();
      form.q.value = "";
      syncFromForm();
      state.page = 1;
      load();
    });

    slot.addEventListener("click", (event) => {
      if (event.target.closest("[data-sort]")) {
        state.order = state.order === "desc" ? "asc" : "desc";
        state.page = 1;
        return load();
      }
      const btn = event.target.closest("[data-page]");
      if (btn && !btn.disabled) {
        state.page = Number(btn.dataset.page);
        load();
      }
    });

    root.querySelector('[data-action="export"]').addEventListener("click", (e) =>
      withBusy(e.currentTarget, "A exportar…", () => exportCsv(buildQuery())));

    await load();
  }

  function csvCell(value) {
    const s = String(value ?? "");
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Preferência: CSV gerado pelo servidor. Se o endpoint ainda não existir,
  // gera o CSV no navegador a partir das páginas reais de /api/access/logs.
  async function exportCsv(query) {
    const filename = `acessos_${isoDayInTz(0)}.csv`;
    try {
      const { blob } = await AdminApi.exportLogs(query);
      downloadBlob(blob, filename);
      toast("CSV exportado.", "ok");
      return;
    } catch (error) {
      if (error.kind !== "unavailable") {
        toast(`Exportação falhou: ${error.message}`, "error");
        return;
      }
    }

    try {
      const rows = [];
      for (let page = 1; rows.length < EXPORT_MAX_ROWS; page += 1) {
        const result = toPage(await AdminApi.listLogs({ ...query, page, pageSize: 200 }), "logs");
        rows.push(...result.items.map(normalizeEvent));
        if (result.items.length < 200 || (result.total !== null && rows.length >= result.total)) break;
      }
      const header = ["Data", "Hora", "Utilizador", "UID", "Sala", "Dispositivo", "Leitor", "Movimento", "Passagem confirmada", "Resultado", "Motivo"];
      const lines = [header, ...rows.map((ev) => [
        fmtDate(ev.timestamp), fmtTime(ev.timestamp), ev.userName || "Cartão desconhecido", ev.uid || "", ev.room || "", ev.deviceId || "", ev.readerId || "",
        directionLabel(ev.direction), ev.confirmed ? "Sim" : "Não", ev.allowed ? "Permitido" : "Negado", ev.reason || "",
      ])].map((cols) => cols.map(csvCell).join(","));
      // BOM para o Excel reconhecer UTF-8 (acentos)
      downloadBlob(new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }), filename);
      toast(`CSV gerado no navegador (${rows.length} registos).`, "ok");
    } catch (error) {
      toast(`Exportação falhou: ${error.message}`, "error");
    }
  }

  // ============================================================
  // VISTA: DEFINIÇÕES
  // ============================================================

  const TIMEZONES = ["Atlantic/Cape_Verde", "Europe/Lisbon", "Atlantic/Azores", "UTC"];

  async function renderSettings(root, ctx) {
    const admin = AdminAuth.current() || {};
    const prefs = AdminAuth.loadPrefs();
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zones = [...new Set([...TIMEZONES, browserTz].filter(Boolean))];

    root.innerHTML = `
      <div class="adm-grid-2">
        <section class="adm-panel">
          <div class="adm-panel__head"><h2>Sessão</h2></div>
          <dl class="adm-dialog__details">
            <dt>Administrador</dt><dd>${esc(admin.displayName || "—")}</dd>
            <dt>Utilizador</dt><dd>${esc(admin.username || "—")}</dd>
            <dt>Permissões</dt><dd>${esc(admin.permissions ? admin.permissions.join(", ") || "—" : "definidas pelo servidor")}</dd>
          </dl>
          <div class="adm-form__actions"><button type="button" class="adm-btn adm-btn--danger" data-action="logout">${ICON.logout}Terminar sessão</button></div>
        </section>
        <section class="adm-panel">
          <div class="adm-panel__head"><h2>Preferências deste ecrã</h2></div>
          <form class="adm-form" data-form="prefs">
            <label class="adm-field"><span>Fuso horário do escritório</span>
              <select class="adm-input" name="timezone">${zones.map((z) => `<option value="${esc(z)}" ${z === officeTz() ? "selected" : ""}>${esc(z)}</option>`).join("")}</select>
            </label>
            <label class="adm-field"><span>Bloqueio automático por inatividade</span>
              <select class="adm-input" name="lockMinutes">${[1, 2, 3, 5, 10, 15].map((m) => `<option value="${m}" ${m === AdminAuth.lockMinutes() ? "selected" : ""}>${m} min</option>`).join("")}</select>
            </label>
          </form>
          <p class="adm-hint">Guardado só neste navegador. Não contém credenciais.${prefs.timezone ? "" : " Predefinição: Atlantic/Cape_Verde."}</p>
        </section>
      </div>
      <section class="adm-panel">
        <div class="adm-panel__head"><h2>Servidor</h2>
          <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-action="probe">${ICON.refresh}Verificar endpoints</button>
        </div>
        <p class="adm-hint">API: <span class="adm-mono">${esc(AdminApi.CONFIG.baseUrl)}</span></p>
        <div data-slot="probe"></div>
      </section>`;

    root.querySelector('[data-action="logout"]').addEventListener("click", () => lock("logout"));
    root.querySelector('[data-form="prefs"]').addEventListener("change", (e) => {
      AdminAuth.savePrefs({ [e.target.name]: e.target.name === "lockMinutes" ? Number(e.target.value) : e.target.value });
      AdminAuth.touch();
      toast("Preferência guardada.", "ok");
    });

    const probeSlot = root.querySelector('[data-slot="probe"]');
    root.querySelector('[data-action="probe"]').addEventListener("click", (e) => withBusy(e.currentTarget, "A verificar…", async () => {
      const E = AdminApi.ENDPOINTS;
      const checks = [
        ["GET", E.session, () => AdminApi.session()],
        ["GET", E.dashboard, () => AdminApi.dashboard()],
        ["GET", E.users, () => AdminApi.listUsers({ pageSize: 1 })],
        ["GET", E.cards, () => AdminApi.listCards({ pageSize: 1 })],
        ["GET", E.rooms, () => AdminApi.listRooms()],
        ["GET", E.devices, () => AdminApi.listDevices()],
        ["GET", E.deviceTypes, () => AdminApi.listDeviceTypes()],
        ["GET", E.permissions, () => AdminApi.listPermissions({ userId: "0" })],
        ["GET", E.logs, () => AdminApi.listLogs({ pageSize: 1 })],
        ["GET", E.logsExport, () => AdminApi.exportLogs({ dateFrom: isoDayInTz(0), dateTo: isoDayInTz(0), tz: officeTz() })],
        ["GET", E.registerStatus, () => AdminApi.registerStatus("diagnostico")],
        ["GET", E.doorStatus, () => AdminApi.doorStatus({ deviceId: "diagnostico" })],
      ];
      probeSlot.innerHTML = loadingHtml("A verificar…");
      const results = await Promise.all(checks.map(async ([method, path, fn]) => {
        try {
          await fn();
          return [method, path, "ok", "Disponível"];
        } catch (error) {
          if (error.kind === "unavailable") return [method, path, "fail", "Em falta no servidor"];
          if (error.kind === "network" || error.kind === "timeout") return [method, path, "warn", "Sem ligação"];
          if (error.kind === "unauthorized" || error.kind === "forbidden") return [method, path, "ok", "Disponível (requer sessão)"];
          return [method, path, "ok", `Responde (${error.status || "erro"})`];
        }
      }));
      if (ctx.signal.aborted) return;
      probeSlot.innerHTML = `<ul class="adm-list">${results.map(([m, p, tone, label]) => `
        <li class="adm-list__item"><span class="adm-mono">${m} ${esc(p)}</span><span class="adm-pill adm-pill--${tone}">${esc(label)}</span></li>`).join("")}</ul>
        <p class="adm-hint">Endpoints POST/PATCH não são testados automaticamente para não provocar alterações.</p>`;
    }));
  }

  // ============================================================
  // NAVEGAÇÃO INTERNA
  // ============================================================

  const RENDERERS = {
    dashboard: renderDashboard,
    users: renderUsers,
    userDetail: renderUserDetail,
    register: renderRegister,
    cards: renderCards,
    rooms: renderRooms,
    devices: renderDevices,
    deviceForm: renderDeviceForm,
    deviceDetail: renderDeviceDetail,
    permissions: renderPermissions,
    history: renderHistory,
    settings: renderSettings,
  };

  const NAV_PARENT = { userDetail: "users", deviceDetail: "devices", deviceForm: "devices" };

  function leaveView({ clear = false } = {}) {
    if (clear && els.view) els.view.replaceChildren(); // não deixa dados admin no DOM após terminar a sessão
    if (viewController) viewController.abort();
    viewController = null;
    viewCleanups.forEach((fn) => fn());
    viewCleanups = [];
    closeDialog();
  }

  function go(viewId, params = {}) {
    leaveView();
    currentView = viewId;
    const navId = NAV_PARENT[viewId] || viewId;
    const meta = VIEWS.find((v) => v.id === navId);

    els.nav.querySelectorAll("[data-view]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === navId));
    const detailName = (viewId === "userDetail" && params.user && params.user.name) || (viewId === "deviceDetail" && params.device && params.device.name);
    els.title.textContent = detailName || (viewId === "deviceForm" ? (params.device ? "Editar dispositivo" : "Adicionar dispositivo") : meta.title);

    viewController = new AbortController();
    const signal = viewController.signal;
    const ctx = {
      signal,
      params,
      // Atualização periódica enquanto a vista estiver aberta (não conta como atividade)
      every(fn, ms) {
        const timer = setInterval(() => { if (!signal.aborted && !document.hidden) fn(); }, ms);
        viewCleanups.push(() => clearInterval(timer));
      },
    };

    const root = document.createElement("div");
    root.className = `adm-page adm-page--${viewId}`;
    els.view.replaceChildren(root);
    els.view.scrollTop = 0;

    Promise.resolve(RENDERERS[viewId](root, ctx)).catch((error) => {
      if (signal.aborted || isAbort(error)) return;
      console.error("[Smart Office Admin] Erro na vista", viewId, error);
      showError(root, error, () => go(viewId, params));
    });
  }

  // ============================================================
  // LOGIN / SHELL
  // ============================================================

  function showLogin(message, tone = "info") {
    leaveView({ clear: true });
    els.shell.classList.add("hidden");
    els.login.classList.remove("hidden");
    els.password.value = "";
    setLoginBusy(false);
    setLoginMessage(message, tone);
    AdminAuth.touch();
    // Não roubar o foco a quem já começou a escrever
    setTimeout(() => {
      if (!els.loginForm.contains(document.activeElement)) (els.username.value ? els.password : els.username).focus();
    }, 50);
  }

  function setLoginMessage(message, tone = "info") {
    els.loginError.textContent = message || "";
    els.loginError.className = `adm-login__msg adm-login__msg--${tone} ${message ? "" : "hidden"}`;
  }

  function setLoginBusy(busy, label = "Entrar") {
    els.loginSubmit.disabled = busy;
    els.username.disabled = busy;
    els.password.disabled = busy;
    els.loginSubmit.textContent = busy ? label : "Entrar";
  }

  function showShell() {
    const admin = AdminAuth.current();
    els.login.classList.add("hidden");
    els.shell.classList.remove("hidden");
    els.password.value = "";
    els.user.textContent = admin ? admin.displayName : "";
    AdminAuth.touch();
    go("dashboard");
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const username = els.username.value.trim();
    const password = els.password.value;
    if (!username || !password) {
      setLoginMessage("Indique o utilizador e a palavra-passe.", "error");
      return;
    }
    setLoginBusy(true, "A entrar…");
    setLoginMessage("");
    try {
      await AdminAuth.login(username, password);
      showShell();
    } catch (error) {
      els.password.value = "";
      setLoginBusy(false);
      const msg = error.kind === "unauthorized" ? "Utilizador ou palavra-passe incorretos." : error.message;
      setLoginMessage(msg, "error");
      els.password.focus();
    }
  }

  // ============================================================
  // ABRIR / FECHAR / BLOQUEAR
  // ============================================================

  async function open({ onExit } = {}) {
    exitHandler = onExit || null;
    isOpen = true;
    els.root.classList.remove("hidden");
    els.shell.classList.add("hidden");
    els.login.classList.remove("hidden");
    setLoginBusy(true, "A verificar sessão…");
    setLoginMessage("");

    try {
      const admin = await AdminAuth.checkSession();
      if (!isOpen) return;
      if (admin) return showShell();
      showLogin();
    } catch (error) {
      if (!isOpen) return;
      showLogin(`Servidor indisponível: ${error.message}`, "error");
    }
  }

  // Volta ao Smart Office sem terminar a sessão
  function close() {
    if (!isOpen) return;
    leaveView();
    isOpen = false;
    els.root.classList.add("hidden");
    els.password.value = "";
    if (exitHandler) exitHandler("back");
  }

  // Termina a sessão e fecha (logout manual, inatividade, screensaver, sessão expirada)
  async function lock(reason) {
    const wasOpen = isOpen;
    leaveView({ clear: true });
    isOpen = false;
    els.root.classList.add("hidden");
    els.password.value = "";
    els.username.value = "";
    await AdminAuth.logout();
    if (reason === "logout") toast("Sessão terminada.", "ok");
    // O screensaver já tratou da navegação; nos outros casos devolve o controlo ao painel
    if (wasOpen && reason !== "screensaver" && exitHandler) exitHandler(reason);
  }

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  function init() {
    els = {
      root: document.getElementById("admin"),
      login: document.getElementById("admin-login"),
      loginForm: document.getElementById("admin-login-form"),
      username: document.getElementById("admin-username"),
      password: document.getElementById("admin-password"),
      loginSubmit: document.getElementById("admin-login-submit"),
      loginError: document.getElementById("admin-login-msg"),
      shell: document.getElementById("admin-shell"),
      nav: document.getElementById("admin-nav"),
      title: document.getElementById("admin-title"),
      user: document.getElementById("admin-user"),
      view: document.getElementById("admin-view"),
      dialog: document.getElementById("admin-dialog"),
      dialogCard: document.getElementById("admin-dialog-card"),
      toast: document.getElementById("admin-toast"),
    };

    els.root.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = ICON[el.dataset.icon] || ""));

    els.nav.innerHTML = VIEWS.map((v) => `
      <button type="button" class="adm-nav__item" data-view="${v.id}" title="${esc(v.label)}">${ICON[v.icon]}<span>${esc(v.label)}</span></button>`).join("");

    els.nav.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-view]");
      if (btn) go(btn.dataset.view);
    });

    els.loginForm.addEventListener("submit", handleLoginSubmit);
    document.getElementById("admin-login-back").addEventListener("click", close);
    document.getElementById("admin-home").addEventListener("click", close);
    document.getElementById("admin-logout").addEventListener("click", () => lock("logout"));

    // Qualquer interação dentro da área admin adia o bloqueio automático
    ["pointerdown", "keydown", "touchstart", "wheel"].forEach((evt) =>
      els.root.addEventListener(evt, () => AdminAuth.touch(), { passive: true }));

    AdminAuth.onLock(() => {
      if (isOpen) lock("inactivity");
    });

    AdminAuth.onExpired(() => {
      if (isOpen) showLogin("A sessão expirou. Inicie sessão novamente.", "error");
    });
  }

  init();

  return {
    open,
    close,
    lock,
    isOpen: () => isOpen,
  };

})();
