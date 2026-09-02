const ICONS = {
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>`,
  ac: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>`,
  weather: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4-1.8A4 4 0 0 0 6.5 16"/></svg>`,
  outlet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="7"/><path d="M9.5 10v2M14.5 10v2"/></svg>`,
  timer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>`,
};

const AC_MODES = { cool: "Frio", fan: "Ventilar", dry: "Desumidificar" };
const IDLE_TIMEOUT_MS = 15 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

function timeParts(date) {
  return {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    date: date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
  };
}

function updateClocks() {
  const { time, date } = timeParts(new Date());

  const ssClock = document.getElementById("ss-clock");
  const ssDate = document.getElementById("ss-date");
  if (ssClock) ssClock.textContent = time;
  if (ssDate) ssDate.textContent = date;

  const tileClock = document.getElementById("tile-clock-value");
  if (tileClock) tileClock.textContent = time;

  const modalClock = document.getElementById("clock-modal-time");
  const modalDate = document.getElementById("clock-modal-date");
  if (modalClock) modalClock.textContent = `${time}:${pad(new Date().getSeconds())}`;
  if (modalDate) modalDate.textContent = date;
}

/* ---------- Navegação entre telas ---------- */

function showScreensaver() {
  document.getElementById("screensaver").classList.remove("hidden");
  document.getElementById("panel").classList.add("hidden");
  document.getElementById("detail-modal").classList.add("hidden");
  document.getElementById("timer-modal").classList.add("hidden");
  stopIdleTimer();
}

function showPanel() {
  document.getElementById("screensaver").classList.add("hidden");
  document.getElementById("panel").classList.remove("hidden");
  resetIdleTimer();
}

/* ---------- Auto-retorno por inatividade ---------- */

let idleTimer = null;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showScreensaver, IDLE_TIMEOUT_MS);
}

function stopIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = null;
}

/* ---------- Tiles ---------- */

function lightsSummary(state) {
  const onCount = state.lights.filter((l) => l.on).length;
  return {
    isOn: onCount > 0,
    value: onCount > 0 ? `${onCount}/${state.lights.length} ligadas` : "Todas desligadas",
  };
}

function outletsSummary(state) {
  const onCount = state.outlets.filter((o) => o.on).length;
  return {
    isOn: onCount > 0,
    value: onCount > 0 ? `${onCount}/${state.outlets.length} ligadas` : "Todas desligadas",
  };
}

async function renderTiles() {
  const state = await DataProvider.getState();
  const grid = document.getElementById("tile-grid");
  const lights = lightsSummary(state);
  const outlets = outletsSummary(state);

  grid.innerHTML = `
    <div class="tile tile--info" data-modal="clock">
      <span class="tile__icon">${ICONS.clock}</span>
      <span class="tile__label">Relógio</span>
      <span class="tile__value" id="tile-clock-value">--:--</span>
    </div>

    <div class="tile ${lights.isOn ? "is-on" : ""}" data-modal="lights">
      <span class="tile__badge"></span>
      <span class="tile__icon">${ICONS.light}</span>
      <span class="tile__label">Luz</span>
      <span class="tile__value">${lights.value}</span>
    </div>

    <div class="tile ${state.ac.on ? "is-on" : ""}" data-modal="ac">
      <span class="tile__badge"></span>
      <span class="tile__icon">${ICONS.ac}</span>
      <span class="tile__label">A.C.</span>
      <span class="tile__value">${state.ac.on ? `${state.ac.temp}°C` : "Desligado"}</span>
    </div>

    <div class="tile tile--info" data-modal="weather">
      <span class="tile__icon">${ICONS.weather}</span>
      <span class="tile__label">Clima</span>
      <span class="tile__value">${state.weather.condition}, ${state.weather.temp}°C</span>
    </div>

    <div class="tile ${outlets.isOn ? "is-on" : ""}" data-modal="outlets">
      <span class="tile__badge"></span>
      <span class="tile__icon">${ICONS.outlet}</span>
      <span class="tile__label">Tomada</span>
      <span class="tile__value">${outlets.value}</span>
    </div>

    <div class="tile" data-modal="timer">
      <span class="tile__icon">${ICONS.timer}</span>
      <span class="tile__label">Timer</span>
      <span class="tile__value">${state.timers.length} agendado(s)</span>
    </div>
  `;

  updateClocks();
}

async function handleTileClick(event) {
  const tile = event.target.closest(".tile");
  if (!tile) return;

  const modal = tile.dataset.modal;
  if (modal === "timer") {
    openTimerModal();
  } else {
    openDetailModal(modal);
  }
}

/* ---------- Modal genérico de detalhes ---------- */

let currentDetailType = null;

async function openDetailModal(type) {
  currentDetailType = type;
  document.getElementById("detail-modal").classList.remove("hidden");
  await renderDetailBody(type);
}

function closeDetailModal() {
  document.getElementById("detail-modal").classList.add("hidden");
}

async function renderDetailBody(type) {
  const state = await DataProvider.getState();
  const body = document.getElementById("detail-body");

  if (type === "clock") {
    const { time, date } = timeParts(new Date());
    body.innerHTML = `
      <div class="clock-modal">
        <div class="clock-modal__time" id="clock-modal-time">${time}:${pad(new Date().getSeconds())}</div>
        <div class="clock-modal__date" id="clock-modal-date">${date}</div>
      </div>
    `;
    return;
  }

  if (type === "lights") {
    body.innerHTML = `
      <div class="sublist" id="lights-list">
        ${state.lights
          .map(
            (l) => `
          <div class="subtoggle ${l.on ? "is-on" : ""}" data-kind="light" data-id="${l.id}">
            <span class="subtoggle__label"><span class="subtoggle__dot"></span>${l.label}</span>
            <span class="subtoggle__state">${l.on ? "Ligado" : "Desligado"}</span>
          </div>`
          )
          .join("")}
      </div>
    `;
    return;
  }

  if (type === "outlets") {
    body.innerHTML = `
      <div class="sublist" id="outlets-list">
        ${state.outlets
          .map(
            (o) => `
          <div class="subtoggle ${o.on ? "is-on" : ""}" data-kind="outlet" data-id="${o.id}">
            <span class="subtoggle__label"><span class="subtoggle__dot"></span>${o.label}</span>
            <span class="subtoggle__state">${o.on ? "Ligada" : "Desligada"}</span>
          </div>`
          )
          .join("")}
      </div>
    `;
    return;
  }

  if (type === "ac") {
    body.innerHTML = `
      <div class="ac-power ${state.ac.on ? "is-on" : ""}" data-kind="ac-power">
        <span class="subtoggle__label"><span class="subtoggle__dot"></span>Ar-condicionado</span>
        <span class="subtoggle__state">${state.ac.on ? "Ligado" : "Desligado"}</span>
      </div>
      <div class="ac-stepper">
        <button class="ac-stepper__btn" data-kind="ac-temp-down" aria-label="Diminuir temperatura">−</button>
        <span class="ac-stepper__value">${state.ac.temp}°C</span>
        <button class="ac-stepper__btn" data-kind="ac-temp-up" aria-label="Aumentar temperatura">+</button>
      </div>
      <div class="mode-chips">
        ${Object.entries(AC_MODES)
          .map(
            ([value, label]) => `
          <div class="mode-chip ${state.ac.mode === value ? "is-active" : ""}" data-kind="ac-mode" data-value="${value}">${label}</div>`
          )
          .join("")}
      </div>
    `;
    return;
  }

  if (type === "weather") {
    body.innerHTML = `
      <div class="weather-summary">
        <span class="weather-summary__temp">${state.weather.temp}°C</span>
        <span class="weather-summary__condition">${state.weather.condition}</span>
      </div>
      <div class="weather-stats">
        <span>Sensação: <strong>${state.weather.feelsLike}°C</strong></span>
        <span>Umidade: <strong>${state.weather.humidity}%</strong></span>
      </div>
      <div class="forecast-list">
        ${state.weather.forecast
          .map(
            (f) => `
          <div class="forecast-item">
            <div class="forecast-item__hour">${f.hour}</div>
            <div class="forecast-item__temp">${f.temp}°C</div>
          </div>`
          )
          .join("")}
      </div>
    `;
    return;
  }
}

async function handleDetailBodyClick(event) {
  const target = event.target.closest("[data-kind]");
  if (!target) return;

  const kind = target.dataset.kind;

  if (kind === "light") {
    const on = !target.classList.contains("is-on");
    await DataProvider.setLightOn(target.dataset.id, on);
  } else if (kind === "outlet") {
    const on = !target.classList.contains("is-on");
    await DataProvider.setOutletOn(target.dataset.id, on);
  } else if (kind === "ac-power") {
    const on = !target.classList.contains("is-on");
    await DataProvider.setAcOn(on);
  } else if (kind === "ac-temp-down") {
    const state = await DataProvider.getState();
    await DataProvider.setAcTemp(Math.max(16, state.ac.temp - 1));
  } else if (kind === "ac-temp-up") {
    const state = await DataProvider.getState();
    await DataProvider.setAcTemp(Math.min(30, state.ac.temp + 1));
  } else if (kind === "ac-mode") {
    await DataProvider.setAcMode(target.dataset.value);
  } else {
    return;
  }

  await renderDetailBody(currentDetailType);
  await renderTiles();
}

/* ---------- Modal do Timer ---------- */

const DEVICE_LABEL_MAP = (state) => {
  const map = { ac: "A.C." };
  state.lights.forEach((l) => (map[l.id] = l.label));
  state.outlets.forEach((o) => (map[o.id] = o.label));
  return map;
};

function deviceOptions(state) {
  return [
    ...state.lights.map((l) => ({ id: l.id, label: l.label })),
    { id: "ac", label: "A.C." },
    ...state.outlets.map((o) => ({ id: o.id, label: o.label })),
  ];
}

let timerSelectedDevice = null;
let timerSelectedAction = "on";

function buildTimeOptions(selected) {
  let html = "";
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const val = `${pad(h)}:${pad(m)}`;
      html += `<option value="${val}" ${val === selected ? "selected" : ""}>${val}</option>`;
    }
  }
  return html;
}

async function openTimerModal() {
  const state = await DataProvider.getState();
  const devices = deviceOptions(state);

  timerSelectedDevice = devices[0]?.id || null;
  timerSelectedAction = "on";

  document.getElementById("timer-device-buttons").innerHTML = devices
    .map(
      (d) => `
      <div class="mode-chip ${d.id === timerSelectedDevice ? "is-active" : ""}" data-device="${d.id}">${d.label}</div>`
    )
    .join("");

  document.querySelectorAll("#timer-action-buttons .mode-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.action === timerSelectedAction);
  });

  document.getElementById("timer-time").innerHTML = buildTimeOptions("07:00");

  document.getElementById("timer-modal").classList.remove("hidden");
  await renderTimerList();
}

function closeTimerModal() {
  document.getElementById("timer-modal").classList.add("hidden");
}

function handleTimerDeviceClick(event) {
  const chip = event.target.closest(".mode-chip");
  if (!chip) return;
  timerSelectedDevice = chip.dataset.device;
  document
    .querySelectorAll("#timer-device-buttons .mode-chip")
    .forEach((c) => c.classList.toggle("is-active", c === chip));
}

function handleTimerActionClick(event) {
  const chip = event.target.closest(".mode-chip");
  if (!chip) return;
  timerSelectedAction = chip.dataset.action;
  document
    .querySelectorAll("#timer-action-buttons .mode-chip")
    .forEach((c) => c.classList.toggle("is-active", c === chip));
}

async function renderTimerList() {
  const state = await DataProvider.getState();
  const labels = DEVICE_LABEL_MAP(state);
  const list = document.getElementById("timer-list");

  if (state.timers.length === 0) {
    list.innerHTML = `<div class="timer-list__empty">Nenhum timer agendado</div>`;
    return;
  }

  list.innerHTML = state.timers
    .map(
      (t) => `
      <div class="timer-item" data-id="${t.id}">
        <span>${labels[t.device] || t.device} — ${t.action === "on" ? "Ligar" : "Desligar"} às ${t.time}</span>
        <button class="timer-item__remove" data-id="${t.id}" aria-label="Remover">✕</button>
      </div>`
    )
    .join("");
}

async function handleTimerAdd() {
  if (!timerSelectedDevice) return;
  const time = document.getElementById("timer-time").value || "00:00";

  await DataProvider.addTimer({ device: timerSelectedDevice, action: timerSelectedAction, time });
  await renderTimerList();
  await renderTiles();
}

async function handleTimerListClick(event) {
  const btn = event.target.closest(".timer-item__remove");
  if (!btn) return;

  await DataProvider.removeTimer(btn.dataset.id);
  await renderTimerList();
  await renderTiles();
}

/* ---------- Wiring ---------- */

document.getElementById("screensaver").addEventListener("click", showPanel);
document.getElementById("tile-grid").addEventListener("click", handleTileClick);

document.getElementById("detail-back").addEventListener("click", closeDetailModal);
document.getElementById("detail-body").addEventListener("click", handleDetailBodyClick);

document.getElementById("timer-back").addEventListener("click", closeTimerModal);
document.getElementById("timer-device-buttons").addEventListener("click", handleTimerDeviceClick);
document.getElementById("timer-action-buttons").addEventListener("click", handleTimerActionClick);
document.getElementById("timer-add").addEventListener("click", handleTimerAdd);
document.getElementById("timer-list").addEventListener("click", handleTimerListClick);

// Qualquer toque/clique no painel ou nos modais reinicia o contador de inatividade
["click", "touchstart"].forEach((evt) => {
  document.getElementById("panel").addEventListener(evt, resetIdleTimer);
  document.getElementById("detail-modal").addEventListener(evt, resetIdleTimer);
  document.getElementById("timer-modal").addEventListener(evt, resetIdleTimer);
});

renderTiles();
updateClocks();
setInterval(updateClocks, 1000);
