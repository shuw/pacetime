import { effects, kmh, lightSpeed, world } from "./relativity.js";
import { shared } from "./shaders.js";

// Gentle softens the color shift, brightening and bending; true to life is the real thing.
// [color shift, brightening, bending]
const LOOKS = { gentle: [0.25, 0.12, 0.55], full: [1, 1, 1] };
let look = "gentle";
try { look = localStorage.getItem("pacetime-look") === "full" ? "full" : "gentle"; } catch {}
export function setLook(k) {
  look = k;
  [shared.uShiftAmt.value, shared.uGlowAmt.value, shared.uAberrK.value] = LOOKS[k];
  try { localStorage.setItem("pacetime-look", k); } catch {}
  $("look-gentle").setAttribute("aria-checked", k === "gentle");
  $("look-full").setAttribute("aria-checked", k === "full");
}

const $ = (id) => document.getElementById(id);

const C_WORDS = [
  [0.7, "a snail's sprint"], [1.6, "a stroll"], [4, "a brisk walk"], [8, "a run"], [16, "a bicycle"], [45, "a car on the highway"],
  [120, "a race car"], [400, "an airliner"], [3000, "a bullet"], [3e5, "the fastest spacecraft"], [Infinity, "light in our world"],
];

const TOGGLES = [
  ["aberration", "Bending", "aberration"],
  ["doppler", "Color shift", "Doppler"],
  ["searchlight", "Brightening", "searchlight"],
  ["delay", "Light delay", "travel time"],
  ["dilation", "Slow clocks, short trains", "dilation"],
  ["ghosts", "Where things really are", "x-ray"],
];

const fmtC = kmh;
export const cWord = (c) => C_WORDS.find(([v]) => c <= v)[1];

let setLight = () => {};

export function initLab(onLight) {
  setLight = onLight;
  $("toggles").innerHTML = TOGGLES.map(([k, name, term]) =>
    `<label><input type="checkbox" id="fx-${k}" data-k="${k}" ${effects[k] ? "checked" : ""}/> ${name} <small>${term}</small></label>`).join("");
  $("toggles").addEventListener("change", (e) => (effects[e.target.dataset.k] = e.target.checked));
  for (const id of ["c-slider", "light-slider"]) {
    $(id).addEventListener("input", () => {
      setLight(10 ** Number($(id).value));
      syncLab();
    });
  }
  $("lab-btn").addEventListener("click", toggleLab);
  $("look-gentle").addEventListener("click", () => setLook("gentle"));
  $("look-full").addEventListener("click", () => setLook("full"));
  setLook(look);
  $("goals-toggle").addEventListener("click", toggleGoals);
  syncLab();
}

export function syncLab() {
  for (const [k] of TOGGLES) $(`fx-${k}`).checked = effects[k];
  const c = lightSpeed();
  for (const id of ["c-slider", "light-slider"]) if (document.activeElement !== $(id)) $(id).value = Math.log10(c);
  $("c-value").textContent = fmtC(c);
  $("light-value").textContent = fmtC(c);
  $("c-word").textContent = `about as fast as ${cWord(c)}. Anything that would outrun it is held just below it.`;
}

export function toggleLab() {
  $("lab").hidden = !$("lab").hidden;
  return !$("lab").hidden;
}

export function toggleGoals() {
  const open = $("goals").hidden;
  $("goals").hidden = !open;
  $("next-goal").hidden = open;
  document.querySelector(".brief").classList.toggle("expanded", open);
}

let toastTimer;
export function clearToast() {
  clearTimeout(toastTimer);
  $("toast").classList.remove("show");
}

export function toast(msg, seconds = 6) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), seconds * 1000);
}

let lastGoals = "", lastLog = 0, logRef = null, noteTimer;

export function onGoalClick(fn) {
  $("goals").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) fn(Number(li.dataset.i));
  });
  $("next-goal").addEventListener("click", () => {
    const i = Number($("next-goal").dataset.i);
    if (Number.isFinite(i)) fn(i);
  });
}

export function showScene(scene) {
  $("scene-title").textContent = scene.title;
  lastGoals = "";
  lastLog = 0;
  logRef = null;
  $("log").innerHTML = "";
  $("note").textContent = "";
  $("note").classList.remove("show");
}

// Notes appear under the crosshair for a few seconds, then fade.
function showNote(text) {
  const el = $("note");
  el.textContent = text;
  el.classList.toggle("show", !!text);
  clearTimeout(noteTimer);
  if (text) noteTimer = setTimeout(() => el.classList.remove("show"), 9000);
}

// 0.533, 0.990, 0.99996…: enough digits to show every nine.
export function formatBeta(b, omb) {
  if (b < 0.99) return b.toFixed(3);
  const nines = Math.floor(-Math.log10(Math.max(omb, 1e-15)));
  const k = Math.min(15, nines + 2);
  return (Math.floor((1 - omb) * 10 ** k) / 10 ** k).toFixed(k);
}

// Seconds, until they get long: then minutes, hours, days and years.
export function formatTime(s, unit = "") {
  if (s < 10000) return s.toFixed(1) + unit;
  const units = [[60, "min"], [3600, "h"], [86400, "days"], [31557600, "years"]];
  let [d, name] = units[0];
  for (const u of units) if (s >= u[0] * 2) [d, name] = u;
  const v = s / d;
  return `${v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} ${name}`;
}

// For sentences: "32 seconds", "12 minutes", "1 hour 43 minutes", "3.2 days".
export function humanTime(s) {
  const n = (v, unit) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (s < 90) return n(Math.round(s), "second");
  if (s < 5400) return n(Math.round(s / 60), "minute");
  if (s < 172800) { const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60); return m ? `${n(h, "hour")} ${n(m, "minute")}` : n(h, "hour"); }
  if (s < 3 * 31557600) return `${(s / 86400).toFixed(s < 864000 ? 1 : 0)} days`;
  return `${(s / 31557600).toLocaleString("en-US", { maximumFractionDigits: 1 })} years`;
}

export function updateHud({ player, instance, locked, prompt }) {
  const b = player.beta;
  $("beta").textContent = formatBeta(b, player.omb);
  const g = player.gamma;
  $("gamma").textContent = `γ ${g < 100 ? g.toFixed(2) : Math.round(g).toLocaleString("en-US")}`;
  $("speed-fill").style.width = `${(b * 100).toFixed(2)}%`;
  $("riding").textContent = player.vehicle ? "· riding" : "";
  // Which pace is in effect (a held key wins over the chosen pace), and a
  // nudge toward sprinting while you're walking along.
  const now = player.paceNow ?? player.pace;
  document.querySelectorAll(".paces button").forEach((b) => {
    const k = Number(b.dataset.pace);
    b.classList.toggle("on", k === now);
    b.setAttribute("aria-checked", k === now);
    b.classList.toggle("hint", k === 1 && now === 0 && player.walkingFor > 1.5 && !player.vehicle);
  });

  $("tau").textContent = player.tau.toFixed(1);
  $("worldt").textContent = formatTime(world.t);
  const gap = world.t - player.tau;
  $("younger-row").hidden = gap < 0.05;
  $("younger").textContent = formatTime(gap, " s");

  const goals = instance.goals ?? [];
  const sig = goals.map((g) => g.text + g.done).join("|");
  if (sig !== lastGoals) {
    const prev = lastGoals.split("|");
    $("goals").innerHTML = goals
      .map((g, i) => (g.group && g.group !== goals[i - 1]?.group ? `<li class="group">${g.group}</li>` : "") +
        `<li data-i="${i}" class="${g.done ? "done" : ""} ${g.done && lastGoals && !prev[i]?.endsWith("true") ? "just" : ""} ${g.at ? "go" : ""}" ${g.at ? 'title="Take me there"' : ""}>${g.text}</li>`)
      .join("");
    const doneN = goals.filter((g) => g.done).length;
    const nextI = goals.findIndex((g) => !g.done);
    $("goals-count").textContent = goals.length ? `${doneN} / ${goals.length}` : "";
    $("goals-toggle").hidden = !goals.length;
    const next = $("next-goal");
    next.textContent = nextI < 0 ? (goals.length ? "Everything spotted. Press M for another place." : "") : goals[nextI].text;
    next.dataset.i = nextI;
    next.classList.toggle("go", nextI >= 0 && !!goals[nextI].at);
    next.classList.toggle("just", !!lastGoals && doneN > prev.filter((p) => p.endsWith("true")).length);
    lastGoals = sig;
  }
  const note = instance.note ?? "";
  if (note !== $("note").dataset.last) {
    $("note").dataset.last = note;
    showNote(note);
  }

  if (!$("lab").hidden) {
    const rows = instance.readouts?.() ?? [];
    $("readouts").innerHTML = rows.map(([k, v]) => `<div class="r"><span class="label">${k}</span><b>${v}</b></div>`).join("");
  }

  const log = instance.log;
  $("log-panel").hidden = !log || !log.seen.length;
  if (log && (log.seen.length !== lastLog || logRef !== log)) {
    const fresh = log.seen.length - lastLog;
    $("log").innerHTML = log.seen.slice(-4).reverse()
      .map((e, i) => `<li class="${i < fresh ? "fresh" : ""}"><span>${e.label}${e.riding ? " · aboard" : ""}</span><span>${e.seenTau.toFixed(2)}</span><span>${e.frameTau.toFixed(2)}</span></li>`)
      .join("");
    lastLog = log.seen.length;
    logRef = log;
  }

  const clock = instance.clock?.();
  $("clock").hidden = !clock;
  if (clock) {
    $("clock-time").textContent = clock.text;
    $("clock-icon").classList.toggle("moon", !clock.sun);
  }

  // Places with light at its real speed have no light slider.
  document.querySelector(".gauge .light").hidden = !!instance.fixedC;
  document.querySelector('#lab label[for="c-slider"]').hidden = !!instance.fixedC;

  $("prompt").hidden = !prompt;
  $("act-btn").hidden = !prompt;
  if (prompt) {
    $("prompt-text").textContent = prompt.label;
    $("act-btn").textContent = prompt.label;
  }
  $("look-hint").hidden = locked;
}
