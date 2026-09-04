/**
 * Camada de acesso a dados. Hoje retorna dados mockados.
 * Quando o Node-RED estiver pronto, troque a implementação dos
 * métodos abaixo por chamadas fetch() aos endpoints HTTP expostos
 * pelo Node-RED, sem precisar tocar em app.js.
 */
const DataProvider = (() => {
  const MODE = "live";
  const NODE_RED_URL = "https://violet-beaver-178312.hostingersite.com";
    let state = {
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
  }

  async function setAcOn(on) {
  if (MODE === "live") {
    const res = await fetch(`${NODE_RED_URL}/api/ac`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ on })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erro Node-RED: ${res.status} ${text}`);
    }
  }

  state.ac.on = on;
}

 async function setAcTemp(temp) {
  if (MODE === "live") {
    const res = await fetch(`${NODE_RED_URL}/api/ac`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ temp })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erro Node-RED: ${res.status} ${text}`);
    }
  }

  state.ac.temp = temp;
}

  async function setAcMode(mode) {
  if (MODE === "live") {
    const res = await fetch(`${NODE_RED_URL}/api/ac`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mode })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erro Node-RED: ${res.status} ${text}`);
    }
  }

  state.ac.mode = mode;
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
    return entry;
  }

  async function removeTimer(id) {
    if (MODE === "live") {
      // await fetch(`http://<node-red-host>:1880/api/timers/${id}`, { method: "DELETE" });
    }
    state.timers = state.timers.filter((t) => t.id !== id);
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
