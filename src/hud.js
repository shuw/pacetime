import { effects, lightSpeed, world } from "./relativity.js";
import { shared } from "./shaders.js";

// Gentle softens the color shift and brightening; true to life is the real thing.
const LOOKS = { gentle: [0.25, 0.35], full: [1, 1] };
let look = "gentle";
try { look = localStorage.getItem("pacetime-look") === "full" ? "full" : "gentle"; } catch {}
export function setLook(k) {
  look = k;
  [shared.uShiftAmt.value, shared.uGlowAmt.value] = LOOKS[k];
  try { localStorage.setItem("pacetime-look", k); } catch {}
  $("look-gentle").setAttribute("aria-checked", k === "gentle");
  $("look-full").setAttribute("aria-checked", k === "full");
}

const $ = (id) => document.getElementById(id);

const C_WORDS = [
  [0.7, "a snail's sprint"], [1.6, "a stroll"], [4, "a brisk walk"], [8, "a run"], [16, "a bicycle"], [45, "a car on the highway"],
  [120, "a race car"], [Infinity, "an airliner (real light is a million times faster)"],
];

const TOGGLES = [
  ["aberration", "Bending", "aberration"],
  ["doppler", "Color shift", "Doppler"],
  ["searchlight", "Brightening", "searchlight"],
  ["delay", "Light delay", "travel time"],
  ["dilation", "Slow clocks, short trains", "dilation"],
  ["ghosts", "Where things really are", "x-ray"],
];

const fmtC = (c) => `${c < 10 ? c.toFixed(1) : Math.round(c)} m/s`;
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
  $("c-word").textContent = `about as fast as ${cWord(c)}${world.slow < 1 ? ". Moving things slow down too, so nothing outruns it." : ""}`;
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

export function updateHud({ player, instance, locked, prompt }) {
  const b = player.beta;
  $("beta").textContent = b > 0.999 ? b.toFixed(5) : b.toFixed(3);
  $("gamma").textContent = `γ ${player.gamma < 100 ? player.gamma.toFixed(2) : Math.round(player.gamma)}`;
  $("speed-fill").style.width = `${(b * 100).toFixed(2)}%`;
  $("riding").textContent = player.vehicle ? "· riding" : "";

  $("tau").textContent = player.tau.toFixed(1);
  $("worldt").textContent = world.t.toFixed(1);
  const gap = world.t - player.tau;
  $("younger-row").hidden = gap < 0.05;
  $("younger").textContent = `${gap.toFixed(1)} s`;

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

  $("prompt").hidden = !prompt;
  $("act-btn").hidden = !prompt;
  if (prompt) {
    $("prompt-text").textContent = prompt.label;
    $("act-btn").textContent = prompt.label;
  }
  $("look-hint").hidden = locked;
}
