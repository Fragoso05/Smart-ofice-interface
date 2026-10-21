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
  };

  const VIEWS = [
    { id: "dashboard", label: "Dashboard", title: "Controlo de acessos", icon: "dashboard" },
    { id: "users", label: "Utilizadores", title: "Utilizadores", icon: "users" },
    { id: "register", label: "Acessos RFID", title: "Registo RFID", icon: "rfid" },
    { id: "cards", label: "Cartões", title: "Cartões RFID", icon: "card" },
    { id: "rooms", label: "Salas e portas", title: "Salas e portas", icon: "door" },
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

  function normalizeEvent(e) {
    const resultRaw = String(first(e.result, e.status) ?? "").toLowerCase();
    const allowed = typeof e.allowed === "boolean" ? e.allowed
      : typeof e.granted === "boolean" ? e.granted
      : ["allowed", "granted", "permitido", "ok", "success"].includes(resultRaw);
    return {
      id: first(e.id, e.logId),
      timestamp: first(e.timestamp, e.createdAt, e.created_at, e.time, e.date),
      userName: first(e.userName, e.user_name, e.user && e.user.name, e.name),
      uid: first(e.uid, e.cardUid, e.card_uid),
      room: first(e.roomName, e.room_name, e.room && e.room.name, e.room, e.doorName, e.doorId),
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
      active: typeof u.active === "boolean" ? u.active : statusRaw ? statusRaw === "active" : true,
      createdAt: first(u.createdAt, u.created_at, u.registeredAt),
      raw: u,
    };
  }

  function normalizeCard(c) {
    const perms = first(c.permissions, c.rooms);
    return {
      id: first(c.id, c.cardId, c.uid),
      uid: first(c.uid, c.cardUid, "—"),
      userId: first(c.userId, c.user_id, c.user && c.user.id),
      userName: first(c.userName, c.user_name, c.user && c.user.name),
      createdAt: first(c.createdAt, c.created_at, c.registeredAt),
      status: String(first(c.status, c.active === false ? "revoked" : "active")).toLowerCase(),
      permissions: Array.isArray(perms) ? perms.map((p) => (typeof p === "string" ? p : first(p.roomName, p.name, p.roomId))).join(", ") : first(perms, "—"),
      lastUsedAt: first(c.lastUsedAt, c.last_used_at, c.lastSeen),
    };
  }

  function normalizeRoom(r) {
    return {
      id: first(r.id, r.roomId, r.doorId),
      name: first(r.name, r.roomName, r.id),
      doorId: first(r.doorId, r.door_id, r.id),
      deviceCount: Array.isArray(r.devices) ? r.devices.length : first(r.deviceCount, r.devicesCount),
    };
  }

  function normalizeDevice(d) {
    const lastSeen = first(d.lastSeen, d.lastSeenAt, d.last_seen, d.lastCommunication);
    const lastSeenDate = parseDate(lastSeen);
    const online = typeof d.online === "boolean" ? d.online
      : d.status ? String(d.status).toLowerCase() === "online"
      : lastSeenDate ? Date.now() - lastSeenDate.getTime() < 90 * 1000 : false;
    const readers = (Array.isArray(d.readers) ? d.readers : []).map((r) => (typeof r === "string" ? r : first(r.readerId, r.id)));
    const doorRaw = first(d.doorState, d.door_state, d.doorSensor);
    return {
      id: first(d.deviceId, d.device_id, d.id),
      name: first(d.name, d.label, d.deviceId, d.id),
      roomId: first(d.roomId, d.room_id, d.room && d.room.id),
      roomName: first(d.roomName, d.room_name, d.room && d.room.name, d.roomId),
      doorId: first(d.doorId, d.door_id),
      online,
      lastSeen,
      readers,
      relay: first(d.relayState, d.relay_state, d.relay),
      door: doorRaw ? String(doorRaw).toLowerCase() : null,
      origin: first(d.origin, d.connection, d.source),
    };
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
    if (error.kind === "network" || error.kind === "timeout") return "Sem ligação ao servidor";
    if (error.kind === "forbidden") return "Sem permissão";
    return "Erro do servidor";
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
      <div class="adm-section-head">
        <h2>Atividade recente</h2>
        <span class="adm-chip adm-chip--live">Tempo real</span>
      </div>
      <div data-slot="recent"></div>`;

    const statsSlot = root.querySelector('[data-slot="stats"]');
    const recentSlot = root.querySelector('[data-slot="recent"]');
    const updatedSlot = root.querySelector('[data-slot="updated"]');

    const statCard = (label, value, icon, tone = "") => `
      <div class="adm-stat ${tone}">
        <div class="adm-stat__head"><span>${esc(label)}</span>${ICON[icon]}</div>
        <div class="adm-stat__value">${value === null || value === undefined ? "—" : esc(value)}</div>
      </div>`;

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

      updatedSlot.textContent = `Atualizado às ${fmtTime(new Date())} · fuso ${officeTz()}`;

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
    ctx.every(load, 30 * 1000);
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
          toast(error.message, "error");
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
          toast(error.message, "error");
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
          toast(error.message, "error");
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
    async function loadPerms() {
      permsSlot.innerHTML = loadingHtml();
      let perms;
      let ref;
      try {
        [perms, ref] = await Promise.all([
          AdminApi.listPermissions({ userId: user.id }, { signal: ctx.signal }),
          loadRefData(),
        ]);
      } catch (error) {
        if (!ctx.signal.aborted) showError(permsSlot, error, loadPerms);
        return;
      }
      if (ctx.signal.aborted) return;

      const list = toPage(perms, "permissions").items;
      const byRoom = new Map(list.map((p) => [String(first(p.roomId, p.room_id, p.doorId)), p]));
      const rooms = ref.rooms || list.map((p) => ({ id: first(p.roomId, p.room_id, p.doorId), name: first(p.roomName, p.room_name, p.roomId) }));

      if (!rooms.length) {
        permsSlot.innerHTML = emptyHtml("Não existem salas registadas no servidor.");
        return;
      }

      permsSlot.innerHTML = `<ul class="adm-list">${rooms.map((room) => {
        const p = byRoom.get(String(room.id)) || {};
        const canEnter = first(p.canEnter, p.can_enter) === true || first(p.canEnter, p.can_enter) === 1;
        const canExit = first(p.canExit, p.can_exit) === true || first(p.canExit, p.can_exit) === 1;
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
    }
    permsSlot.addEventListener("change", async (event) => {
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
        toast(error.message, "error");
      } finally {
        row.querySelectorAll("input").forEach((i) => (i.disabled = false));
      }
    });

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
        toast(error.message, "error");
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
    offline: { label: "ESP32 offline — o leitor não respondeu.", tone: "fail", terminal: true },
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
              <label class="adm-field"><span>Sala ou porta</span><span data-slot="room-field">${loadingHtml("Salas…")}</span></label>
              <label class="adm-field"><span>Dispositivo de registo</span><span data-slot="device-field">${loadingHtml("Dispositivos…")}</span></label>
            </div>
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
              <button type="submit" class="adm-btn adm-btn--primary adm-btn--lg">${ICON.rfid}Iniciar registo RFID</button>
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

    if (existingUser) $('[data-action="back"]').addEventListener("click", () => go("userDetail", { user: existingUser }));

    form.useSchedule.addEventListener("change", () => $('[data-slot="schedule"]').classList.toggle("hidden", !form.useSchedule.checked));

    // Salas e dispositivos vêm da API; sem lista, permite introduzir o identificador manualmente
    const ref = await loadRefData(true);
    if (ctx.signal.aborted) return;
    const roomField = $('[data-slot="room-field"]');
    const deviceField = $('[data-slot="device-field"]');
    roomField.innerHTML = ref.rooms && ref.rooms.length
      ? `<select class="adm-input" name="doorId">${roomOptions(ref.rooms)}</select>`
      : `<input class="adm-input" name="doorId" placeholder="ex.: main-door" maxlength="64" autocomplete="off">`;
    deviceField.innerHTML = ref.devices && ref.devices.length
      ? `<select class="adm-input" name="deviceId">${deviceOptions(ref.devices)}</select>`
      : `<input class="adm-input" name="deviceId" placeholder="ex.: esp32-door-01" maxlength="64" autocomplete="off">`;
    if (!ref.rooms || !ref.devices || !ref.devices.length) {
      const refErr = ref.devicesError || ref.roomsError;
      $('[data-slot="ref"]').innerHTML = `<div class="adm-note adm-note--warn">${ICON.alert}<span>${refErr ? esc(refErr.message) : "Ainda não existem dispositivos registados."} Introduza os identificadores manualmente.</span></div>`;
    }

    let active = null; // { registrationId, controller }

    function renderProgress(stateKey, info = {}) {
      const st = REG_STATES[stateKey];
      const steps = ["Dados enviados", "A aguardar cartão", "Cartão recebido", "A guardar dados", "Concluído"];
      const failedTerminal = st.terminal && stateKey !== "completed";
      progress.innerHTML = `
        <div class="adm-panel__head"><h2>Estado do registo</h2></div>
        <div class="adm-progress adm-progress--${st.tone}">
          <div class="adm-progress__icon">${stateKey === "waiting" ? `<span class="adm-pulse">${ICON.rfid}</span>` : st.tone === "ok" ? ICON.ok : st.tone === "busy" ? `<span class="adm-spinner adm-spinner--lg"></span>` : stateKey === "offline" ? ICON.wifiOff : ICON.alert}</div>
          <div class="adm-progress__label">${esc(st.label)}</div>
          ${info.message ? `<div class="adm-progress__detail">${esc(info.message)}</div>` : ""}
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
            <dt>Permissões</dt><dd>${esc(info.permissions || "—")}</dd>
          </dl>` : ""}
        ${stateKey === "duplicate" && info.owner ? `<div class="adm-progress__detail">Associado a: ${esc(info.owner)}</div>` : ""}
        <div class="adm-form__actions">
          ${st.terminal
            ? `<button type="button" class="adm-btn adm-btn--primary" data-action="again">Novo registo</button>
               <button type="button" class="adm-btn adm-btn--ghost" data-action="to-users">Ver utilizadores</button>`
            : `<button type="button" class="adm-btn adm-btn--danger" data-action="cancel" ${stateKey === "starting" || stateKey === "saving" ? "disabled" : ""}>Cancelar registo</button>`}
        </div>`;
      form.querySelectorAll("input, select, button").forEach((el) => (el.disabled = !st.terminal));
    }

    progress.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "again") {
        if (existingUser) return go("register", { user: existingUser });
        form.reset();
        form.querySelectorAll("input, select, button").forEach((el) => (el.disabled = false));
        $('[data-slot="schedule"]').classList.add("hidden");
        progress.innerHTML = `<div class="adm-panel__head"><h2>Estado do registo</h2></div><div class="adm-state adm-state--empty">Pronto para um novo registo.</div>`;
      } else if (btn.dataset.action === "to-users") {
        go("users");
      } else if (btn.dataset.action === "cancel" && active) {
        await withBusy(btn, "A cancelar…", async () => {
          try {
            await AdminApi.registerCancel(active.registrationId);
            active.controller.abort();
            active = null;
            renderProgress("cancelled");
          } catch (error) {
            // Sem confirmação do servidor o registo pode continuar ativo — continuamos a acompanhar
            toast(error.kind === "unavailable"
              ? "Cancelamento indisponível no servidor. O registo continua ativo até expirar."
              : `Não foi possível cancelar: ${error.message}`, "error");
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

      if (!existingUser && name.length < 2) return toast("Indique o nome completo.", "error");
      if (!deviceId) return toast("Indique o dispositivo de registo.", "error");
      if (!doorId) return toast("Indique a sala ou porta.", "error");
      if (!canEnter && !canExit) return toast("Selecione pelo menos uma permissão (entrada ou saída).", "error");
      if (form.useSchedule.checked && form.scheduleFrom.value >= form.scheduleTo.value) return toast("O horário final deve ser posterior ao inicial.", "error");

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

      renderProgress("starting");
      // No ecrã de 480px o painel de estado fica abaixo do formulário
      progress.scrollIntoView({ behavior: "smooth", block: "start" });
      let started;
      try {
        started = await AdminApi.registerStart(payload);
      } catch (error) {
        if (ctx.signal.aborted) return;
        const key = error.code === "device_offline" ? "offline" : error.code === "card_already_registered" ? "duplicate" : "error";
        renderProgress(key, { message: error.message });
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

      renderProgress("waiting");
      const expires = parseDate(first(started.expiresAt, started.expires_at));
      const deadline = (expires ? expires.getTime() : Date.now() + REGISTER_FALLBACK_TIMEOUT_MS) + 5000;
      const permissionsText = [canEnter && "Entrada", canExit && "Saída"].filter(Boolean).join(" e ") + ` · ${form.doorId.selectedOptions ? form.doorId.selectedOptions[0].textContent : doorId}`;
      let lastState = "waiting";
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
            renderProgress("error", { message: `${error.message} O estado do registo é desconhecido — confirme na lista de cartões.` });
            break;
          }
          continue;
        }

        const stateKey = normalizeRegStatus(first(data && data.status, data && data.state));
        const card = (data && data.card) || {};
        const info = {
          name: first(data && data.user && data.user.name, data && data.name, name),
          uid: first(data && data.uid, card.uid),
          permissions: permissionsText,
          owner: first(data && data.ownerName, data && data.existingUser && data.existingUser.name),
          message: stateKey === "error" ? first(data && data.message, data && data.error) : null,
        };

        if (stateKey !== lastState || REG_STATES[stateKey].terminal) renderProgress(stateKey, info);
        lastState = stateKey;

        if (REG_STATES[stateKey].terminal) {
          if (stateKey === "completed") refCache = null;
          break;
        }

        if (Date.now() > deadline) {
          renderProgress("expired", { message: "O cartão não foi apresentado a tempo." });
          AdminApi.registerCancel(registrationId).catch(() => {});
          break;
        }
      }

      // Saiu da vista a meio do registo → pede cancelamento (melhor esforço)
      if (ctx.signal.aborted && lastState !== "completed" && !REG_STATES[lastState].terminal) {
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

  async function renderRooms(root, ctx) {
    root.innerHTML = `
      <div class="adm-section-head">
        <h2>Dispositivos</h2>
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-action="refresh">${ICON.refresh}Atualizar</button>
      </div>
      <div data-slot="devices">${loadingHtml()}</div>
      <div class="adm-section-head"><h2>Salas</h2></div>
      <div data-slot="rooms">${loadingHtml()}</div>`;

    const devicesSlot = root.querySelector('[data-slot="devices"]');
    const roomsSlot = root.querySelector('[data-slot="rooms"]');
    let devices = [];
    let rooms = [];

    const relayLabel = (v) => {
      if (v === undefined || v === null || v === "") return "—";
      const s = String(v).toLowerCase();
      return ["on", "active", "true", "1", "open"].includes(s) ? "Ativo" : ["off", "idle", "false", "0", "closed"].includes(s) ? "Repouso" : String(v);
    };
    const doorLabel = (v) => (!v ? "Sem sensor" : v === "open" ? "Aberta" : v === "closed" ? "Fechada" : v);
    const originLabel = (v) => (!v ? "—" : String(v).toLowerCase().startsWith("local") ? "Local" : String(v).toLowerCase().startsWith("remot") ? "Remota" : v);

    async function load() {
      const ref = await loadRefData(true);
      if (ctx.signal.aborted) return;
      devices = ref.devices || [];
      rooms = ref.rooms || [];
      const canOpen = AdminAuth.can("door.open");

      if (ref.devicesError) showError(devicesSlot, ref.devicesError, load);
      else if (!devices.length) devicesSlot.innerHTML = emptyHtml("Nenhum dispositivo registado no servidor.");
      else devicesSlot.innerHTML = `<div class="adm-devices">${devices.map((d, i) => `
        <article class="adm-device">
          <header class="adm-device__head">
            <div><strong>${esc(d.name)}</strong><small class="adm-mono">${esc(d.id)}</small></div>
            ${statusPill(d.online, "Online", "Offline")}
          </header>
          <dl class="adm-device__meta">
            <dt>Sala</dt><dd>${esc(d.roomName || "—")}</dd>
            <dt>Última comunicação</dt><dd>${esc(fmtRelative(d.lastSeen))}</dd>
            <dt>Leitores</dt><dd>${d.readers.length ? d.readers.map((r) => `<span class="adm-chip">${esc(r === "outside" ? "Exterior" : r === "inside" ? "Interior" : r)}</span>`).join(" ") : "—"}</dd>
            <dt>Relé</dt><dd>${esc(relayLabel(d.relay))}</dd>
            <dt>Porta</dt><dd>${esc(doorLabel(d.door))}</dd>
            <dt>Origem</dt><dd>${esc(originLabel(d.origin))}</dd>
          </dl>
          <button type="button" class="adm-btn adm-btn--primary adm-btn--block" data-open="${i}" ${canOpen ? "" : "disabled title=\"Sem permissão de abertura remota\""}>${ICON.door}Abrir porta</button>
        </article>`).join("")}</div>`;

      if (ref.roomsError) showError(roomsSlot, ref.roomsError, load);
      else if (!rooms.length) roomsSlot.innerHTML = emptyHtml("Nenhuma sala registada no servidor.");
      else roomsSlot.innerHTML = `<ul class="adm-list">${rooms.map((r) => {
        const count = r.deviceCount ?? devices.filter((d) => String(d.roomId) === String(r.id)).length;
        return `<li class="adm-list__item"><div><span class="adm-td-main">${esc(r.name)}</span><small class="adm-mono">${esc(r.id)}</small></div><span class="adm-chip">${esc(count)} dispositivo(s)</span></li>`;
      }).join("")}</ul>`;
    }

    root.querySelector('[data-action="refresh"]').addEventListener("click", (e) => withBusy(e.currentTarget, "A atualizar…", load));
    devicesSlot.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-open]");
      if (btn && !btn.disabled) openDoorFlow(devices[Number(btn.dataset.open)], load);
    });

    await load();
    ctx.every(load, 15 * 1000);
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
      return render("unconfirmed", error.message);
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
    const filters = { q: ctx.params.userName || "", roomId: "", direction: "", result: "", datePreset: "", dateFrom: "", dateTo: "", timePreset: "", timeFrom: "", timeTo: "", deviceId: "", readerId: "" };
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
    history: renderHistory,
    settings: renderSettings,
  };

  const NAV_PARENT = { userDetail: "users" };

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
    els.title.textContent = viewId === "userDetail" && params.user ? params.user.name : meta.title;

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
    setTimeout(() => (els.username.value ? els.password : els.username).focus(), 50);
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
