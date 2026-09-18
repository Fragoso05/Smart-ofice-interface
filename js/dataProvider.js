const DataProvider = (() => {

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const MODE = "live"; // "mock" | "live"

 const NODE_RED_URL = "http://10.11.0.210:1880";
  const STORAGE_KEY = "smartOfficeState";

  const AC_TEMP_MIN = 16;
  const AC_TEMP_MAX = 30;

// ============================================================
// CLIMA - OPEN METEO
// ============================================================

// Praia, Cabo Verde
const WEATHER_LAT = 14.93;
const WEATHER_LON = -23.51;

const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${WEATHER_LAT}` +
  `&longitude=${WEATHER_LON}` +
  `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code` +
  `&hourly=temperature_2m,weather_code` +
  `&forecast_days=2` +
  `&timezone=Atlantic%2FCape_Verde`;

function weatherCodeToText(code) {
  const codes = {
    0: "Céu limpo",
    1: "Pouco nublado",
    2: "Parcialmente nublado",
    3: "Nublado",

    45: "Nevoeiro",
    48: "Nevoeiro",

    51: "Chuvisco",
    53: "Chuvisco",
    55: "Chuvisco forte",

    61: "Chuva fraca",
    63: "Chuva",
    65: "Chuva forte",

    71: "Neve fraca",
    73: "Neve",
    75: "Neve forte",

    80: "Aguaceiros",
    81: "Aguaceiros",
    82: "Aguaceiros fortes",

    95: "Trovoada",
    96: "Trovoada",
    99: "Trovoada forte"
  };

  return codes[code] || "Tempo variável";
}

async function refreshWeather() {
  try {
    console.log("[Smart Office] A atualizar clima...");

    const response = await fetch(WEATHER_URL);

    if (!response.ok) {
      throw new Error(`Open-Meteo respondeu ${response.status}`);
    }

    const data = await response.json();

    const current = data.current;

    // Procura a primeira hora futura
    let startIndex = data.hourly.time.findIndex(
      (time) => time > current.time
    );

    if (startIndex < 0) {
      startIndex = 0;
    }

    // Previsão de 2 em 2 horas
    const forecastIndexes = [
      startIndex,
      startIndex + 2,
      startIndex + 4
    ];

    const forecast = forecastIndexes
      .filter((index) => index < data.hourly.time.length)
      .map((index) => {
        const date = new Date(data.hourly.time[index]);

        return {
          hour: `${String(date.getHours()).padStart(2, "0")}h`,
          temp: Math.round(data.hourly.temperature_2m[index]),
          condition: weatherCodeToText(
            data.hourly.weather_code[index]
          )
        };
      });

    state.weather = {
      condition: weatherCodeToText(current.weather_code),

      temp: Math.round(
        current.temperature_2m
      ),

      feelsLike: Math.round(
        current.apparent_temperature
      ),

      humidity: Math.round(
        current.relative_humidity_2m
      ),

      forecast,

      updatedAt: new Date().toISOString()
    };

    persist();

    console.log(
      "[Smart Office] Clima atualizado:",
      state.weather
    );

    return state.weather;

  } catch (error) {

    console.error(
      "[Smart Office] Erro ao obter clima:",
      error
    );

    // Mantém os últimos dados caso a internet esteja indisponível
    return state.weather;
  }
}

  // ============================================================
  // ESTADO PADRÃO
  // ============================================================

  const defaultState = {

    lights: [
      { id: "light-1", name: "Luz principal", number: 1, connected: true, on: true },
      { id: "light-2", name: "Luz de mesa", number: 2, connected: true, on: false },
      { id: "light-3", name: "Luz de teto", number: 3, connected: true, on: true },
    ],

    ac: {
      on: true,
      temp: 24,
      mode: "cool",
      fan: "auto",
    },

    outlets: [
      { id: "outlet-1", name: "Tomada 1", number: 1, connected: true, on: false },
      { id: "outlet-2", name: "Tomada 2", number: 2, connected: true, on: false },
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

  // Migração: estados antigos guardados no localStorage ainda não têm "fan"
  if (state.ac && typeof state.ac.fan === "undefined") {
    state.ac.fan = "auto";
  }

  // ============================================================
  // TOMADAS / LÂMPADAS — HELPERS DE DISPOSITIVO
  // ============================================================

  const DEVICE_ENDPOINTS = {
    outlet: "/api/outlets",
    light: "/api/lights",
  };

  function getDefaultDeviceName(type, number) {
    return type === "outlet" ? `Tomada ${number}` : `Lâmpada ${number}`;
  }

  function getDeviceList(type) {
    if (type === "outlet") return state.outlets;
    if (type === "light") return state.lights;
    throw new Error(`Tipo de dispositivo desconhecido: ${type}`);
  }

  function getDeviceByType(type, id) {
    return getDeviceList(type).find((device) => device.id === id);
  }

  function isDeviceConnected(type, id) {
    const device = getDeviceByType(type, id);
    return Boolean(device && device.connected);
  }

  // Migração: estados antigos guardados no localStorage ainda não têm
  // "number"/"connected", e usavam "label" em vez de "name".
  function migrateDeviceList(list, type) {
    if (!Array.isArray(list)) return;

    list.forEach((device, index) => {
      if (typeof device.number !== "number") {
        const match = /(\d+)$/.exec(String(device.id));
        device.number = match ? Number(match[1]) : index + 1;
      }

      if (!device.name) {
        device.name = device.label || getDefaultDeviceName(type, device.number);
      }
      delete device.label;

      if (typeof device.connected !== "boolean") {
        device.connected = true;
      }
    });
  }

  migrateDeviceList(state.lights, "light");
  migrateDeviceList(state.outlets, "outlet");


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


  // Só confirma uma alteração do AC quando o Node-RED devolve success:true —
  // caso contrário lança, e quem chamou não deve dar a ação como aplicada.
  function assertAcConfirmed(result) {
    if (!result || result.success !== true) {
      const error = new Error(
        (result && result.error) || "Node-RED não confirmou a alteração do AC"
      );
      console.error("[Smart Office] AC não confirmado pelo Node-RED:", error.message);
      throw error;
    }
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
  // LUZES / TOMADAS — LIGAR / DESLIGAR
  // ============================================================

  // Só confirma a alteração quando o Node-RED devolve success:true — se a API
  // falhar ou o dispositivo estiver desconectado, o estado local não muda.
  async function setDeviceOn(type, id, on) {
    const device = getDeviceByType(type, id);

    if (!device) return;

    if (!device.connected) {
      console.warn(`[Smart Office] Dispositivo desconectado (${type}):`, id);
      return;
    }

    const desired = Boolean(on);

    if (MODE === "live") {
      try {
        const result = await nodeRedFetch(
          `${DEVICE_ENDPOINTS[type]}/${encodeURIComponent(id)}`,
          {
            method: "POST",

            body: JSON.stringify({
              on: desired,
            }),
          }
        );

        if (!result || result.success !== true) {
          throw new Error("Node-RED não confirmou o comando");
        }
      } catch (error) {
        console.warn(
          `[Smart Office] Falha ao controlar ${type === "outlet" ? "tomada" : "luz"}:`,
          error
        );
        return;
      }
    }

    device.on = desired;

    persist();
  }

  async function setLightOn(id, on) {
    return setDeviceOn("light", id, on);
  }

  async function setOutletOn(id, on) {

  const outlet = state.outlets.find(
    (outlet) => outlet.id === id
  );

  if (!outlet) {
    throw new Error(
      `Tomada não encontrada: ${id}`
    );
  }

  const desired = Boolean(on);

  // IMPORTANTE:
  // não alterar outlet.on antes da confirmação

  if (MODE === "live") {

    const result = await nodeRedFetch(
      "/api/outlets",
      {
        method: "POST",

        body: JSON.stringify({
          id: id,
          on: desired
        })
      }
    );

    if (
      !result ||
      result.success !== true
    ) {
      throw new Error(
        result?.error ||
        "Node-RED não confirmou o comando da tomada"
      );
    }

    // Só agora alterar o estado visual
    outlet.on = Boolean(result.on);
    outlet.connected = true;

    persist();

    return outlet;
  }

  // Apenas em modo mock
  outlet.on = desired;

  persist();

  return outlet;
}

  // ============================================================
  // LUZES / TOMADAS — RENOMEAR
  // ============================================================

  const DEVICE_NAME_MAX_LENGTH = 40;

  async function renameDevice(type, id, name) {
    const device = getDeviceByType(type, id);

    if (!device) {
      throw new Error("Dispositivo não encontrado");
    }

    const trimmed = String(name || "").trim().slice(0, DEVICE_NAME_MAX_LENGTH);

    if (!trimmed) {
      throw new Error("Nome inválido");
    }

    device.name = trimmed;

    persist();

    return device;
  }

  // ============================================================
  // LUZES / TOMADAS — ESTADO DE CONEXÃO
  // ============================================================

  // Atualiza "connected"/"on" a partir do Node-RED, quando o endpoint existir.
  // Sem efeito em modo mock, e falha silenciosamente (console.warn) se o
  // endpoint ainda não estiver disponível no backend.
  async function refreshDeviceConnectivity(type) {
    if (MODE !== "live") return getDeviceList(type);

    try {
      const result = await nodeRedFetch(DEVICE_ENDPOINTS[type]);
      const key = type === "outlet" ? "outlets" : "lights";
      const incomingList = result && Array.isArray(result[key]) ? result[key] : null;

      if (incomingList) {
        incomingList.forEach((incoming) => {
          const device = getDeviceByType(type, incoming.id);
          if (!device) return;

          if (typeof incoming.connected === "boolean") {
            device.connected = incoming.connected;
          }

          if (typeof incoming.on === "boolean") {
            device.on = incoming.on;
          }
        });

        persist();
      }
    } catch (error) {
      console.warn(
        `[Smart Office] Falha ao atualizar estado de conexão (${type}):`,
        error
      );
    }

    return getDeviceList(type);
  }

  async function refreshOutlets() {
    return refreshDeviceConnectivity("outlet");
  }

  async function refreshLights() {
    return refreshDeviceConnectivity("light");
  }


  // ============================================================
  // SAMSUNG WINDFREE
  // LIGAR / DESLIGAR
  // ============================================================
async function setAcOn(on) {
  const value = Boolean(on);

  if (MODE === "live") {
    // Se o Node-RED falhar ou não confirmar, o estado local NÃO é alterado.
    const result = await nodeRedFetch(
      "/api/ac",
      {
        method: "POST",
        body: JSON.stringify({
          on: value,
        }),
      }
    );

    assertAcConfirmed(result);

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
    // Se o Node-RED falhar ou não confirmar, o estado local NÃO é alterado.
    const result = await nodeRedFetch(
      "/api/ac",
      {
        method: "POST",

        body: JSON.stringify({
          temp: value,
          mode: state.ac.mode,
          fan: state.ac.fan,
        }),
      }
    );

    assertAcConfirmed(result);

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

  // Regra de interface isolada: no modo "dry" seleciona automaticamente a
  // velocidade "auto" (fácil de alterar se o hardware passar a suportar mais
  // velocidades nesse modo).
  function resolveFanForMode(mode, currentFan) {
    if (mode === "dry") return "auto";
    return currentFan;
  }

async function setAcMode(mode) {
    const currentTemp = Number(state.ac.temp);
    const fan = resolveFanForMode(mode, state.ac.fan);

    if (MODE === "live") {
        const result = await nodeRedFetch(
            "/api/ac",
            {
                method: "POST",
                body: JSON.stringify({
                    mode,
                    temp: currentTemp,
                    fan
                }),
            }
        );

        assertAcConfirmed(result);

        console.log(
            "[Smart Office] AC modo confirmado pelo Node-RED:",
            result
        );
    }

    state.ac.mode = mode;
    state.ac.fan = fan;
    persist();
}


  // ============================================================
  // SAMSUNG WINDFREE
  // VELOCIDADE DA VENTOINHA
  // ============================================================

  const AC_FAN_SPEEDS = ["auto", "low", "medium", "high", "turbo"];

async function setAcFan(fan) {
    if (!AC_FAN_SPEEDS.includes(fan)) {
        throw new Error("Velocidade da ventoinha inválida");
    }

    if (MODE === "live") {
        const result = await nodeRedFetch(
            "/api/ac",
            {
                method: "POST",
                body: JSON.stringify({
                    fan,
                    mode: state.ac.mode,
                    temp: state.ac.temp
                }),            }
        );

        assertAcConfirmed(result);

        console.log(
            "[Smart Office] AC ventoinha confirmada pelo Node-RED:",
            result
        );
    }

    state.ac.fan = fan;
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
  refreshWeather,
  setLightOn,
  setOutletOn,
  renameDevice,
  isDeviceConnected,
  refreshOutlets,
  refreshLights,
  setAcOn,
  setAcTemp,
  setAcMode,
  setAcFan,
  addTimer,
  removeTimer,
};

})();