// ============================================================
// AUTENTICAÇÃO ADMINISTRATIVA
//
// A validação de username/password é feita SÓ no backend. Aqui apenas
// guardamos em memória quem está autenticado (para mostrar o nome e as
// permissões) e gerimos o bloqueio automático por inatividade.
// ============================================================

const AdminAuth = (() => {

  const SETTINGS_KEY = "smartOfficeAdminPrefs"; // só preferências não sensíveis
  const DEFAULT_LOCK_MINUTES = 3;

  let admin = null;          // { username, displayName, permissions: [] }
  let lockTimer = null;
  let lockHandler = null;
  let expiredHandler = null;

  // ============================================================
  // PREFERÊNCIAS LOCAIS (fuso horário, minutos até bloquear)
  // ============================================================

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function savePrefs(patch) {
    const next = { ...loadPrefs(), ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function lockMinutes() {
    const value = Number(loadPrefs().lockMinutes);
    return Number.isFinite(value) && value >= 1 && value <= 30 ? value : DEFAULT_LOCK_MINUTES;
  }

  // ============================================================
  // SESSÃO
  // ============================================================

  function normalizeAdmin(data) {
    const source = (data && (data.admin || data.user)) || {};
    return {
      username: source.username || "",
      displayName: source.displayName || source.name || source.username || "Administrador",
      permissions: Array.isArray(source.permissions) ? source.permissions : null,
      role: source.role || null,
    };
  }

  async function login(username, password) {
    const data = await AdminApi.login(username, password);
    if (!data || (data.authenticated !== true && data.success !== true)) {
      throw new AdminApi.ApiError("O servidor não confirmou o início de sessão.", { kind: "http" });
    }
    admin = normalizeAdmin(data);
    return admin;
  }

  // Devolve o admin autenticado, ou null se não houver sessão válida.
  // Erros de rede/servidor são propagados (não confundir com "sem sessão").
  async function checkSession() {
    try {
      const data = await AdminApi.session();
      if (data && data.authenticated === true) {
        admin = normalizeAdmin(data);
        return admin;
      }
      clearLocal();
      return null;
    } catch (error) {
      if (error.kind === "unauthorized") {
        clearLocal();
        return null;
      }
      throw error;
    }
  }

  async function logout() {
    const wasLoggedIn = Boolean(admin);
    // A UI deixa de estar autenticada de imediato; o token CSRF só é
    // descartado depois de o pedido de logout o ter enviado.
    admin = null;
    stopLockTimer();
    if (!wasLoggedIn) {
      AdminApi.setCsrfToken(null);
      return;
    }
    try {
      await AdminApi.logout();
    } catch (error) {
      console.warn("[Smart Office Admin] Logout não confirmado pelo servidor:", error.message);
    } finally {
      AdminApi.setCsrfToken(null);
    }
  }

  function clearLocal() {
    admin = null;
    AdminApi.setCsrfToken(null);
    stopLockTimer();
  }

  function current() {
    return admin;
  }

  // Sem lista de permissões no backend → a UI não esconde nada; o backend decide (403).
  function can(permission) {
    if (!admin) return false;
    if (admin.role === "superadmin" || !admin.permissions) return true;
    return admin.permissions.includes(permission) || admin.permissions.includes("*");
  }

  // ============================================================
  // BLOQUEIO POR INATIVIDADE
  // ============================================================

  function onLock(handler) {
    lockHandler = handler;
  }

  function onExpired(handler) {
    expiredHandler = handler;
  }

  // Corre também no ecrã de login, para que um login abandonado não impeça o screensaver
  function touch() {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(async () => {
      lockTimer = null;
      await logout();
      if (lockHandler) lockHandler("inactivity");
    }, lockMinutes() * 60 * 1000);
  }

  function stopLockTimer() {
    clearTimeout(lockTimer);
    lockTimer = null;
  }

  // Qualquer pedido que devolva 401 → sessão expirada no servidor
  AdminApi.onUnauthorized(() => {
    if (!admin) return;
    clearLocal();
    if (expiredHandler) expiredHandler();
  });

  return {
    login,
    logout,
    checkSession,
    current,
    can,
    touch,
    onLock,
    onExpired,
    loadPrefs,
    savePrefs,
    lockMinutes,
  };

})();
