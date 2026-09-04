/**
 * Smart Office - Data Provider
 *
 * Comunicação entre o frontend e o Node-RED.
 *
 * Node-RED:
 * https://violet-beaver-178312.hostingersite.com
 */

const DataProvider = (() => {

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const MODE = "live"; // "mock" | "live"

  const NODE_RED_URL =
    "https://violet-beaver-178312.hostingersite.com";

  const STORAGE_KEY = "smartOfficeState";


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

    timers: [
      {
        id: "t1",
        device: "ac",
        action: "off",
        time: "19:00",
      },
    ],
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

    console.log(
      `[Smart Office] ${options.method || "GET"} ${url}`
    );

    const response = await fetch(url, {
      ...options,

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });


    if (!response.ok) {

      let errorBody = "";

      try {
        errorBody = await response.text();
      } catch (_) {}

      throw new Error(
        `Node-RED respondeu ${response.status}: ${errorBody}`
      );
    }


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

    if (MODE === "live") {

      try {

        const remoteState =
          await nodeRedFetch("/api/room");

        /*
         * Só substituímos o estado se Node-RED
         * realmente devolver um objeto válido.
         */

        if (
          remoteState &&
          typeof remoteState === "object"
        ) {

          state = {
            ...state,
            ...remoteState,
          };

          persist();
        }

      } catch (error) {

        /*
         * Enquanto /api/room ainda não existir,
         * o dashboard continua funcional usando
         * o último estado local.
         */

        console.warn(
          "[Smart Office] Estado remoto indisponível:",
          error
        );
      }
    }


    return JSON.parse(
      JSON.stringify(state)
    );
  }


  // ============================================================
  // LUZES
  // ============================================================

  async function setLightOn(id, on) {

    if (MODE === "live") {

      await nodeRedFetch(
        `/api/lights/${encodeURIComponent(id)}`,
        {
          method: "POST",

          body: JSON.stringify({
            on: Boolean(on),
          }),
        }
      );
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

      await nodeRedFetch(
        `/api/outlets/${encodeURIComponent(id)}`,
        {
          method: "POST",

          body: JSON.stringify({
            on: Boolean(on),
          }),
        }
      );
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

      await nodeRedFetch(
        "/api/ac",
        {
          method: "POST",

          body: JSON.stringify({
            on: value,
          }),
        }
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
      throw new Error(
        "Temperatura inválida"
      );
    }


    if (MODE === "live") {

      await nodeRedFetch(
        "/api/ac",
        {
          method: "POST",

          body: JSON.stringify({
            temp: value,
          }),
        }
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

    const allowedModes = [
      "cool",
      "fan",
      "dry",
    ];


    if (!allowedModes.includes(mode)) {

      throw new Error(
        `Modo de AC inválido: ${mode}`
      );

    }


    if (MODE === "live") {

      await nodeRedFetch(
        "/api/ac",
        {
          method: "POST",

          body: JSON.stringify({
            mode,
          }),
        }
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

      await nodeRedFetch(
        "/api/timers",
        {
          method: "POST",

          body: JSON.stringify(entry),
        }
      );
    }


    state.timers.push(entry);

    persist();


    return entry;
  }


  async function removeTimer(id) {

    if (MODE === "live") {

      await nodeRedFetch(
        `/api/timers/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );
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