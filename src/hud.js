import { effects, world } from "./relativity.js";

const $ = (id) => document.getElementById(id);

const SPEED_WORDS = [
  [0.03, "standing"], [0.25, "strolling"], [0.55, "walking"], [0.8, "jogging"], [0.92, "zooming"], [1, "whooshing"],
];

const C_WORDS = [
  [1.6, "a toddle"], [4, "a brisk walk"], [8, "a jog"], [16, "a bicycle"], [45, "a car on the highway"],
  [120, "a race car"], [Infinity, "a jet plane (real light is a million times faster)"],
];

const TOGGLES = [
  ["aberration", "Bending", "aberration"],
  ["doppler", "Color shift", "Doppler"],
  ["searchlight", "Brightening", "searchlight"],
  ["delay", "Light delay", "seeing the past"],
  ["dilation", "Slow watch", "time dilation"],
];

const fmt = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

export function initLab(onChange) {
  const slider = $("c-slider");
  const show = () => {
    $("c-value").textContent = `${world.c < 10 ? world.c.toFixed(1) : Math.round(world.c)} m/s`;
    $("c-word").textContent = `as fast as ${C_WORDS.find(([v]) => world.c <= v)[1]}`;
  };
  slider.value = Math.log10(world.c);
  slider.addEventListener("input", () => {
    world.c = 10 ** Number(slider.value);
    show();
    onChange?.();
  });
  show();
  $("toggles").innerHTML = TOGGLES.map(([k, name, term]) =>
    `<label><input type="checkbox" data-k="${k}" ${effects[k] ? "checked" : ""}/> ${name} <small>${term}</small></label>`).join("");
  $("toggles").addEventListener("change", (e) => {
    effects[e.target.dataset.k] = e.target.checked;
    onChange?.();
  });
  $("lab-btn").addEventListener("click", toggleLab);
}

export function toggleLab() {
  $("lab").hidden = !$("lab").hidden;
}

let toastTimer;
export function toast(msg, seconds = 5) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), seconds * 1000);
}

let lastGoals = "";
let tipIndex = 0, tipClock = 0;

export function showScene(scene, instance) {
  $("scene-title").textContent = `${scene.icon} ${scene.title}`;
  lastGoals = "";
  tipIndex = 0;
  tipClock = 0;
  $("tip").textContent = instance.tips?.[0] ?? "";
}

export function updateHud({ player, instance, dTau, locked }) {
  const b = player.beta;
  $("speed-word").textContent = SPEED_WORDS.find(([v]) => b <= v)[1];
  $("speed-fill").style.width = `${(b * 100).toFixed(1)}%`;
  $("beta").textContent = `${(b * 100).toFixed(b > 0.99 ? 2 : 0)}% of light`;
  $("gamma").textContent = `γ ${player.gamma.toFixed(2)}`;

  $("tau").textContent = fmt(player.tau);
  $("worldt").textContent = fmt(world.t);
  const gap = world.t - player.tau;
  $("younger").textContent = gap < 0.05 ? "in step with the world" : `you're ${gap.toFixed(1)} s younger than everyone`;

  const goals = instance.goals ?? [];
  const sig = goals.map((g) => g.text + g.done).join("|");
  if (sig !== lastGoals) {
    const prev = lastGoals.split("|");
    $("goals").innerHTML = goals
      .map((g, i) => `<li class="${g.done ? "done" : ""} ${g.done && !prev[i]?.endsWith("true") && lastGoals ? "just" : ""}">${g.text}</li>`)
      .join("");
    lastGoals = sig;
  }

  tipClock += dTau;
  if (instance.tips?.length > 1 && tipClock > 12) {
    tipClock = 0;
    tipIndex = (tipIndex + 1) % instance.tips.length;
    $("tip").textContent = instance.tips[tipIndex];
  }

  const tea = instance.hud?.();
  $("tea").hidden = !tea;
  if (tea) {
    $("sand-text").textContent = `${tea.sandLeft.toFixed(1)} s`;
    $("sand-fill").style.width = `${(tea.sandLeft / tea.sand) * 100}%`;
    $("brew-text").textContent = `${Math.round((tea.brew / tea.brewTotal) * 100)}%`;
    $("brew-fill").style.width = `${(tea.brew / tea.brewTotal) * 100}%`;
  }

  $("look-hint").hidden = locked;
}
