/**
 * Camada de acesso a dados. Hoje retorna dados mockados.
 * Quando o Node-RED estiver pronto, troque a implementação dos
 * métodos abaixo por chamadas fetch() aos endpoints HTTP expostos
 * pelo Node-RED, sem precisar tocar em app.js.
 */
const DataProvider = (() => {
  const MODE = "mock"; // "mock" | "live"
  const STORAGE_KEY = "smartOfficeState";

  const defaultState = {
    lights: [
      { id: "light-1", label: "Luz principal", on: true },
      { id: "light-2", label: "Luz de mesa", on: false },
      { id: "light-3", label: "Luz de teto", on: true },
    ],
    ac: { on: true, temp: 23, mode: "cool" }, // mode: "cool" | "fan" | "dry"
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
    timers: [{ id: "t1", device: "ac", action: "off", time: "19:00" }],
  };

  // Mantém o estado (luzes, A.C., tomadas, timers) entre recarregamentos da página —
  // sem isso, um refresh no kiosk perderia tudo o que foi criado em modo mock.
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // localStorage indisponível ou dado corrompido — segue com o padrão
    }
    return JSON.parse(JSON.stringify(defaultState));
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // armazenamento indisponível (ex: modo privado) — segue só em memória
    }
  }

  let state = loadState();

  async function getState() {
    if (MODE === "live") {
      // const res = await fetch("http://<node-red-host>:1880/api/room");
      // return res.json();
    }
    return JSON.parse(JSON.stringify(state)); // cópia, evita mutação externa
  }

  async function setLightOn(id, on) {
    if (MODE === "live") {
      // await fetch(`http://<node-red-host>:1880/api/lights/${id}`, {
      //   method: "POST", headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ on }),
      // });
    }
    const light = state.lights.find((l) => l.id === id);
    if (light) light.on = on;
    persist();
  }

  async function setOutletOn(id, on) {
    if (MODE === "live") {
      // await fetch(`http://<node-red-host>:1880/api/outlets/${id}`, {
      //   method: "POST", headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ on }),
      // });
    }
    const outlet = state.outlets.find((o) => o.id === id);
    if (outlet) outlet.on = on;
    persist();
  }

  async function setAcOn(on) {
    if (MODE === "live") {
      // await fetch("http://<node-red-host>:1880/api/ac", {
      //   method: "POST", headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ on }),
      // });
    }
    state.ac.on = on;
    persist();
  }

  async function setAcTemp(temp) {
    if (MODE === "live") {
      // await fetch("http://<node-red-host>:1880/api/ac", {
      //   method: "POST", headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ temp }),
      // });
    }
    state.ac.temp = temp;
    persist();
  }

  async function setAcMode(mode) {
    if (MODE === "live") {
      // await fetch("http://<node-red-host>:1880/api/ac", {
      //   method: "POST", headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ mode }),
      // });
    }
    state.ac.mode = mode;
    persist();
  }

  async function addTimer(timer) {
    const entry = { id: `t${Date.now()}`, ...timer };
    if (MODE === "live") {
      // await fetch("http://<node-red-host>:1880/api/timers", {
      //   method: "POST", headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(entry),
      // });
    }
    state.timers.push(entry);
    persist();
    return entry;
  }

  async function removeTimer(id) {
    if (MODE === "live") {
      // await fetch(`http://<node-red-host>:1880/api/timers/${id}`, { method: "DELETE" });
    }
    state.timers = state.timers.filter((t) => t.id !== id);
    persist();
  }

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
