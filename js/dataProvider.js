const DataProvider = (() => {

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const MODE = "live"; // "mock" | "live"

  const NODE_RED_URL =
    "http://10.11.0.210:1880"; // URL do Node-RED (HTTP, sem TLS — Node-RED no Raspberry Pi não expõe HTTPS nesta porta)

  const STORAGE_KEY = "smartOfficeState";

  const AC_TEMP_MIN = 16;
  const AC_TEMP_MAX = 30;


  // ============================================================
  // ESTADO PADRÃO
  // ============================================================

  const defaultState = {

    lights: [
      { id: "light-1", label: "Luz principal", on: true },
      { id: "light-2", label: "Luz de mesa", on: false },
      { id: "light-3", label: "Luz de teto", on: true },
    ],

    ac: {
      on: true,
      temp: 23,
      mode: "cool",
    },

    outlets: [
      { id: "outlet-1", label: "Tomada 1", on: false },
      { id: "outlet-2", label: "Tomada 2", on: false },
    ],

    weather: {
      condition: "Nublado",
      temp: 22,
      feelsLike: 23,
      humidity: 58,

      forecast: [
        { hour: "13h", temp: 23 },
        { hour: "15h", temp: 24 },
        { hour: "17h", temp: 21 },
      ],
    },

    timers: [],
  };


  // ============================================================
  // LOCAL STORAGE
  // ============================================================

  function loadState() {
    try {

      const raw = localStorage.getItem(STORAGE_KEY);

      if (raw) {
        return JSON.parse(raw);
      }

    } catch (error) {
      console.warn(
        "[Smart Office] Não foi possível carregar localStorage:",
        error
      );
    }

    return JSON.parse(JSON.stringify(defaultState));
  }


  function persist() {
    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
      );

    } catch (error) {

      console.warn(
        "[Smart Office] Não foi possível guardar localStorage:",
        error
      );

    }
  }


  let state = loadState();


  // ============================================================
  // FUNÇÃO CENTRAL DE COMUNICAÇÃO COM NODE-RED
  // ============================================================

  async function nodeRedFetch(endpoint, options = {}) {

    const url = `${NODE_RED_URL}${endpoint}`;
    const method = options.method || "GET";

    console.log(
      `[Smart Office] ${method} ${url}`,
      options.body || ""
    );

    let response;

    try {
      response = await fetch(url, {
        ...options,

        headers: {
          "Content-Type": "text/plain",
          ...(options.headers || {}),
        },
      });
    } catch (networkError) {
      console.error(
        `[Smart Office] Falha de rede ao contactar o Node-RED em ${url}. ` +
        "Verifica se o Raspberry Pi está ligado, se o IP/porta estão corretos e se o Node-RED tem CORS configurado (ver NODE_RED_CORS_SETUP.md).",
        networkError
      );
      throw networkError;
    }


    if (!response.ok) {

      let errorBody = "";

      try {
        errorBody = await response.text();
      } catch (_) {}

      const error = new Error(
        `Node-RED respondeu ${response.status}: ${errorBody}`
      );

      console.error(`[Smart Office] ${method} ${url} falhou:`, error.message);

      throw error;
    }

    console.log(`[Smart Office] ${method} ${url} OK (${response.status})`);


    // Alguns endpoints podem devolver 204 No Content
    if (response.status === 204) {
      return null;
    }


    const contentType =
      response.headers.get("content-type") || "";


    if (contentType.includes("application/json")) {
      return response.json();
    }


    return response.text();
  }


  // ============================================================
  // ESTADO GERAL
  // ============================================================

 async function getState() {
  return JSON.parse(
    JSON.stringify(state)
  );
}

  // ============================================================
  // LUZES
  // ============================================================

  async function setLightOn(id, on) {

    if (MODE === "live") {

      try {
        await nodeRedFetch(
          `/api/lights/${encodeURIComponent(id)}`,
          {
            method: "POST",

            body: JSON.stringify({
              on: Boolean(on),
            }),
          }
        );
      } catch (error) {
        console.warn("[Smart Office] Falha ao avisar o Node-RED (luz):", error);
      }
    }


    const light =
      state.lights.find(
        (light) => light.id === id
      );


    if (light) {
      light.on = Boolean(on);
    }


    persist();
  }


  // ============================================================
  // TOMADAS
  // ============================================================

  async function setOutletOn(id, on) {

    if (MODE === "live") {

      try {
        await nodeRedFetch(
          `/api/outlets/${encodeURIComponent(id)}`,
          {
            method: "POST",

            body: JSON.stringify({
              on: Boolean(on),
            }),
          }
        );
      } catch (error) {
        console.warn("[Smart Office] Falha ao avisar o Node-RED (tomada):", error);
      }
    }


    const outlet =
      state.outlets.find(
        (outlet) => outlet.id === id
      );


    if (outlet) {
      outlet.on = Boolean(on);
    }


    persist();
  }


  // ============================================================
  // SAMSUNG WINDFREE
  // LIGAR / DESLIGAR
  // ============================================================
async function setAcOn(on) {
  const value = Boolean(on);

  if (MODE === "live") {
    // Se o Node-RED falhar, nodeRedFetch lança e o estado local NÃO é alterado.
    const result = await nodeRedFetch(
      "/api/ac",
      {
        method: "POST",
        body: JSON.stringify({
          on: value,
        }),
      }
    );

    console.log(
      "[Smart Office] AC on/off confirmado pelo Node-RED:",
      result
    );
  }

  state.ac.on = value;
  persist();
}


  // ============================================================
  // SAMSUNG WINDFREE
  // TEMPERATURA
  // ============================================================

async function setAcTemp(temp) {

  const value = Number(temp);

  if (!Number.isFinite(value)) {
    throw new Error("Temperatura inválida");
  }

  if (value < AC_TEMP_MIN || value > AC_TEMP_MAX) {
    throw new Error(
      `Temperatura fora do intervalo permitido (${AC_TEMP_MIN}–${AC_TEMP_MAX}°C)`
    );
  }

  if (MODE === "live") {
    // Se o Node-RED falhar, nodeRedFetch lança e o estado local NÃO é alterado.
    const result = await nodeRedFetch(
      "/api/ac",
      {
        method: "POST",

        body: JSON.stringify({
          temp: value,
        }),
      }
    );

    console.log(
      "[Smart Office] AC temperatura confirmada pelo Node-RED:",
      result
    );
  }

  state.ac.temp = value;

  persist();
}


  // ============================================================
  // SAMSUNG WINDFREE
  // MODO
  // ============================================================
async function setAcMode(mode) {

  if (MODE === "live") {
    // Se o Node-RED falhar, nodeRedFetch lança e o estado local NÃO é alterado.
    const result = await nodeRedFetch(
      "/api/ac",
      {
        method: "POST",

        body: JSON.stringify({
          mode,
        }),
      }
    );

    console.log(
      "[Smart Office] AC modo confirmado pelo Node-RED:",
      result
    );
  }

  state.ac.mode = mode;

  persist();
}


  // ============================================================
  // TIMERS
  // ============================================================

  async function addTimer(timer) {

    const entry = {
      id: `t${Date.now()}`,
      ...timer,
    };


    if (MODE === "live") {

      try {
        await nodeRedFetch(
          "/api/timers",
          {
            method: "POST",

            body: JSON.stringify(entry),
          }
        );
      } catch (error) {
        console.warn("[Smart Office] Falha ao avisar o Node-RED (criar timer):", error);
      }
    }


    state.timers.push(entry);

    persist();


    return entry;
  }


  async function removeTimer(id) {

    if (MODE === "live") {

      try {
        await nodeRedFetch(
          `/api/timers/${encodeURIComponent(id)}`,
          {
            method: "DELETE",
          }
        );
      } catch (error) {
        console.warn("[Smart Office] Falha ao avisar o Node-RED (remover timer):", error);
      }
    }


    state.timers =
      state.timers.filter(
        (timer) => timer.id !== id
      );


    persist();
  }


  // ============================================================
  // API PÚBLICA
  // ============================================================

  return {

    MODE,

    getState,

    setLightOn,

    setOutletOn,

    setAcOn,

    setAcTemp,

    setAcMode,

    addTimer,

    removeTimer,

  };

})();