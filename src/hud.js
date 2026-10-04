import { effects, world } from "./relativity.js";

const $ = (id) => document.getElementById(id);

const C_WORDS = [
  [1.6, "a stroll"], [4, "a brisk walk"], [8, "a run"], [16, "a bicycle"], [45, "a car on the highway"],
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

const sec = (s) => s.toFixed(2);

export function initLab(onChange) {
  const slider = $("c-slider");
  $("toggles").innerHTML = TOGGLES.map(([k, name, term]) =>
    `<label><input type="checkbox" id="fx-${k}" data-k="${k}" ${effects[k] ? "checked" : ""}/> ${name} <small>${term}</small></label>`).join("");
  $("toggles").addEventListener("change", (e) => {
    effects[e.target.dataset.k] = e.target.checked;
    onChange?.();
  });
  slider.addEventListener("input", () => {
    world.c = 10 ** Number(slider.value);
    syncLab();
    onChange?.();
  });
  $("lab-btn").addEventListener("click", toggleLab);
  syncLab();
}

export const cWord = (c) => C_WORDS.find(([v]) => c <= v)[1];

export function syncLab() {
  for (const [k] of TOGGLES) $(`fx-${k}`).checked = effects[k];
  $("c-slider").value = Math.log10(world.c);
  $("c-value").textContent = `${world.c < 10 ? world.c.toFixed(1) : Math.round(world.c)} m/s`;
  $("c-word").textContent = `about as fast as ${C_WORDS.find(([v]) => world.c <= v)[1]}`;
}

export function toggleLab() {
  $("lab").hidden = !$("lab").hidden;
  return !$("lab").hidden;
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

let lastGoals = "", lastLog = 0, logRef = null;

export function initBrief() {
  // On phones, tapping the panel folds and unfolds the goal list.
  document.querySelector(".brief").addEventListener("click", (e) => {
    if (matchMedia("(max-width: 760px)").matches && !e.target.closest("li.go.expanded-only")) {
      document.querySelector(".brief").classList.toggle("expanded");
    }
  });
}

export function onGoalClick(fn) {
  $("goals").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) fn(Number(li.dataset.i));
  });
}

export function showScene(scene, index) {
  $("kicker").textContent = `${index + 1} · ${scene.tag}`;
  $("scene-title").textContent = scene.title;
  lastGoals = "";
  lastLog = 0;
  logRef = null;
  $("log").innerHTML = "";
}

// A plain description of what your motion is doing to the view right now.
function seeing(player, look) {
  const b = player.beta;
  if (b < 0.25) return "";
  const v = player.v.clone().normalize();
  const along = v.dot(look);
  if (along > 0.6) return b > 0.8 ? "Ahead: the whole world crowds into a circle ringed with rainbow." : "Ahead: things bunch together and shift bluer.";
  if (along < -0.6) return b > 0.8 ? "Behind: the world stretches away, dim and red." : "Behind: things spread apart and redden.";
  return "Beside you: things you've passed still look ahead of you.";
}

export function updateHud({ player, instance, locked, prompt, look }) {
  const b = player.beta;
  $("beta").textContent = b.toFixed(3);
  $("gamma").textContent = `γ ${player.gamma.toFixed(3)}`;
  $("speed-fill").style.width = `${(b * 100).toFixed(2)}%`;
  $("speed-ms").textContent = `${(b * world.c).toFixed(2)} m/s`;
  $("riding").textContent = player.vehicle ? "riding" : "";
  const s = look ? seeing(player, look) : "";
  if ($("seeing").textContent !== s) $("seeing").textContent = s;

  $("tau").textContent = sec(player.tau);
  $("worldt").textContent = sec(world.t);
  const gap = world.t - player.tau;
  $("younger").textContent = Math.abs(gap) < 0.005 ? "0.00" : `${gap > 0 ? "−" : "+"}${sec(Math.abs(gap))}`;

  const goals = instance.goals ?? [];
  const sig = goals.map((g) => g.text + g.done).join("|");
  if (sig !== lastGoals) {
    const prev = lastGoals.split("|");
    $("goals").innerHTML = goals
      .map((g, i) => (g.group && g.group !== goals[i - 1]?.group ? `<li class="group">${g.group}</li>` : "") +
        `<li data-i="${i}" class="${g.done ? "done" : ""} ${g.done && lastGoals && !prev[i]?.endsWith("true") ? "just" : ""} ${g.at ? "go" : ""}" ${g.at ? 'title="Take me there"' : ""}>${g.text}</li>`)
      .join("");
    lastGoals = sig;
    const next = $("goals").querySelector("li[data-i]:not(.done)");
    next?.classList.add("next");
  }
  const note = instance.note ?? "";
  if ($("note").textContent !== note) $("note").textContent = note;

  const rows = instance.readouts?.() ?? [];
  $("readouts").hidden = !rows.length;
  $("readouts").innerHTML = rows.map(([k, v]) => `<div class="r"><span class="label">${k}</span><b>${v}</b></div>`).join("");

  const log = instance.log;
  $("log-panel").hidden = !log;
  if (log && (log.seen.length !== lastLog || logRef !== log)) {
    const fresh = log.seen.length - lastLog;
    $("log").innerHTML = log.seen.slice(-6).reverse()
      .map((e, i) => `<li class="${i < fresh ? "fresh" : ""}"><span>${e.label}${e.riding ? " · on board" : ""}</span><span>${sec(e.seenTau)}</span><span>${sec(e.frameTau)}</span></li>`)
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
