import * as THREE from "three";
import "./style.css";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Player } from "./player.js";
import { bake } from "./geo.js";
import { ghosts, shared, skyMaterial } from "./shaders.js";
import { effects, world } from "./relativity.js";
import { clearToast, cWord, initLab, onGoalClick, showScene, syncLab, toast, toggleGoals, toggleLab, updateHud } from "./hud.js";
import { lightSpeed } from "./relativity.js";
import { addVelocity } from "./relativity.js";
import { sparkField } from "./shaders.js";
import { isMuted, setAmbience, setListener, setMuted, sfx, unlockAudio, updateAudio } from "./audio.js";
import railway from "./scenes/railway.js";
import beam from "./scenes/beam.js";
import pier from "./scenes/pier.js";
import city from "./scenes/city.js";
import village from "./scenes/village.js";

const SCENES = [pier, city, village, railway, beam];

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.info.autoReset = false;
// Things ahead appear up to several times farther away at speed, sky included.
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 12000);
const root = new THREE.Scene();

const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 128, 64), skyMaterial());
sky.frustumCulled = false;
sky.renderOrder = -1;
root.add(sky);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(root, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.5, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let usePost = false;

const player = new Player(canvas);
let current = null; // { scene, instance }
let paused = true;
const help = document.getElementById("help");

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const done = JSON.parse(store.get("pacetime-done") ?? "{}");

function applyEnv(e) {
  shared.uNight.value = e.night ?? 0;
  shared.uSpace.value = e.space ?? 0;
  shared.uStars.value = e.stars ?? 1;
  shared.uAurora.value = e.aurora ?? 0;
  shared.uSun.value.set(...e.sun).normalize();
  shared.uSunColor.value.setRGB(...e.sunColor);
  shared.uSky.value.setRGB(...e.sky);
  shared.uGround.value.setRGB(...e.ground);
  shared.uFog.value.set(e.fog);
  shared.uFogRange.value.set(...e.fogRange);
  shared.uSkyTop.value.set(e.skyTop);
  shared.uSkyHorizon.value.set(e.skyHorizon);
}

function applyPost(post) {
  usePost = !!post?.bloom;
  if (usePost) Object.assign(bloom, post.bloom);
}

function load(scene) {
  if (current) root.remove(current.instance.group);
  ghosts.length = 0;
  if (intro) { intro = null; document.getElementById("intro").hidden = true; }
  clearToast();
  player.place(0, 0, 0);
  player.tau = 0;
  world.t = 0;
  const instance = scene.build({ player, toast });
  // Balls glow like embers: plenty of light beyond the violet, so they stay
  // visible (and redden) as they fly away from you.
  instance.balls = sparkField(120, { gravity: 0.5, intensity: 4, ir: 0.6, uv: 2.4 });
  instance.group.add(instance.balls);
  instance.lamps = [];
  instance.group.traverse((o) => o.userData.lamp && instance.lamps.push(o.userData.lamp));
  bake(instance.group);
  root.add(instance.group);
  current = { scene, instance };
  applyEnv(instance.env);
  applyPost(instance.post);
  setAmbience(instance.ambience ?? null);
  const [x, z, yaw] = instance.spawn;
  player.place(x, z, yaw ?? 0);
  showScene(scene, SCENES.indexOf(scene));
  instance.c0 = world.c;
  player.legs = world.c;
  world.slow = 1;
  player.stretch = 1;
  goalsDone = 0;
  syncLab();
}

// The address bar mirrors where you are, e.g. #tunnel@-30.0,17.0,0.00,0.00&c=8&off=doppler,
// so a refresh or a shared link drops you back in the same spot.
function stateHash() {
  const p = player;
  let h = `#${current.scene.id}@${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)},${p.yaw.toFixed(2)},${p.pitch.toFixed(2)}`;
  if (Math.abs(lightSpeed() - current.instance.c0) > 1e-3) h += `&c=${+lightSpeed().toFixed(2)}`;
  const off = Object.keys(effects).filter((k) => k !== "ghosts" && !effects[k]);
  if (off.length) h += `&off=${off.join(",")}`;
  if (effects.ghosts) h += "&xray=1";
  return h;
}

function parseHash() {
  const [head, ...rest] = decodeURIComponent(location.hash.slice(1)).split("&");
  const [id, pose] = head.split("@");
  if (!SCENES.some((s) => s.id === id)) return null;
  const opts = Object.fromEntries(rest.map((kv) => kv.split("=")));
  return { id, pose: pose?.split(",").map(Number), c: opts.c ? Number(opts.c) : null, off: opts.off ? opts.off.split(",") : [], xray: opts.xray === "1" };
}

function restore(h) {
  for (const k of Object.keys(effects)) effects[k] = !h.off.includes(k);
  effects.ghosts = h.xray;
  load(SCENES.find((s) => s.id === h.id));
  current.instance.started = true;
  if (h.c > 0) setLight(h.c);
  if (h.pose?.length >= 3 && h.pose.every(Number.isFinite)) {
    player.place(h.pose[0], h.pose[1], h.pose[2]);
    player.pitch = h.pose[3] ?? 0;
  }
  syncLab();
  closeMenu();
}

let hashClock = 0;
function writeHash(dt) {
  hashClock += dt;
  if (hashClock < 0.5) return;
  hashClock = 0;
  const h = stateHash();
  if (h !== location.hash) {
    try { history.replaceState(null, "", h); } catch { /* embedded pages may not allow it */ }
  }
}
addEventListener("hashchange", () => {
  const h = parseHash();
  if (h && h.id !== current?.scene.id) restore(h);
});

function buildMenu() {
  document.getElementById("scene-cards").innerHTML = SCENES.map((s) => `
    <li><button class="scene-card" data-id="${s.id}">
      <h3>${s.title}</h3>
      <span class="tag">${s.tag}${done[s.id] ? ' · <span class="done">complete</span>' : ""}</span>
      <p>${s.blurb}</p>
    </button></li>`).join("");
}

function openMenu() {
  paused = true;
  player.enabled = false;
  buildMenu();
  document.getElementById("menu").hidden = false;
  document.getElementById("hud").hidden = true;
  document.exitPointerLock?.();
}

function closeMenu() {
  document.getElementById("menu").hidden = true;
  document.getElementById("hud").hidden = false;
  paused = false;
  player.enabled = true;
}

// Arriving at an everyday place, light starts at its real speed and slows to
// walking pace, so you watch the world turn strange.
const REAL_C = 299792458;
let intro = null;
function startIntro() {
  intro = { c1: world.c, t: 0, dur: 6 };
  world.c = REAL_C;
  sfx.slowdown(intro.dur * 0.85);
  document.getElementById("intro").hidden = false;
}
function runIntro(dt) {
  if (!intro) return;
  intro.t += dt;
  const k = Math.min(1, intro.t / intro.dur);
  const e = k < 0.15 ? 0 : (k - 0.15) / 0.85;
  const smooth = e * e * (3 - 2 * e);
  world.c = Math.exp(Math.log(REAL_C) + (Math.log(intro.c1) - Math.log(REAL_C)) * smooth);
  const c = world.c;
  document.getElementById("intro-c").textContent = `${c >= 100 ? Math.round(c).toLocaleString("en-US") : c.toFixed(1)} m/s`;
  document.getElementById("intro-word").textContent = k < 0.15 ? "as it is in our world" : k < 1 ? "slowing down…" : `about as fast as ${cWord(intro.c1)}. Have a look around.`;
  if (intro.t > intro.dur + 2.5) {
    world.c = intro.c1;
    intro = null;
    document.getElementById("intro").hidden = true;
    syncLab();
  }
}

function startScene(scene) {
  unlockAudio();
  sfx.ui();
  player.autopilot = null;
  load(scene);
  store.set("pacetime-last", scene.id);
  if (scene.intro) startIntro();
  current.instance.started = true;
  closeMenu();
  if (matchMedia("(pointer: fine)").matches) canvas.requestPointerLock?.();
}

document.getElementById("scene-cards").addEventListener("click", (e) => {
  const card = e.target.closest(".scene-card");
  if (card) startScene(SCENES.find((s) => s.id === card.dataset.id));
});

// Throw a glowing ball at 60% of light speed (relative to you), from your hand.
const BALL_COLORS = ["#ffd166", "#7bdcff", "#ff7aa8", "#9dff8a", "#c7a0ff"];
let ballN = 0;
function throwBall() {
  if (!current || paused) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y += 0.12;
  dir.normalize();
  const vRel = dir.multiplyScalar(0.6 * world.c);
  const vel = player.v.lengthSq() > 1e-6 ? addVelocity(player.v, vRel) : vRel;
  const origin = player.eye.clone().add(new THREE.Vector3(0, -0.3, 0));
  current.instance.balls.set({ origin, vel, birth: world.t, life: 12, color: new THREE.Color(BALL_COLORS[ballN++ % BALL_COLORS.length]), size: 0.5 });
  current.instance.onThrow?.({ origin, vel, birth: world.t, gravity: 0.5 });
  sfx.toss();
}

function act() {
  const a = current?.instance.action?.(player.eye);
  a?.run();
}

document.getElementById("menu-btn").addEventListener("click", openMenu);
document.getElementById("throw-btn").addEventListener("click", () => throwBall());

// Playback speed for everything, for studying fast things.
const SPEEDS = [0.25, 0.5, 1];
let playback = 1;
function setPlayback(k) {
  playback = k;
  const el = document.getElementById("slowmo");
  el.hidden = k === 1;
  el.textContent = `slow motion ${k === 0.25 ? "¼" : "½"}×`;
}
document.getElementById("act-btn").addEventListener("click", act);
const back = document.getElementById("back-btn");
back.addEventListener("touchstart", (e) => { player.lookBack = true; e.preventDefault(); });
back.addEventListener("touchend", () => (player.lookBack = false));
canvas.addEventListener("click", () => {
  if (paused) return;
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  else throwBall();
});
function setHelp(open) {
  if (help.hidden === !open) return;
  sfx.ui();
  // What's going on in this place, before the controls.
  const tips = current?.instance.tips ?? [];
  document.getElementById("place-help").hidden = !tips.length || paused;
  document.getElementById("place-help-title").textContent = `What's going on in ${current?.scene.title ?? ""}`;
  document.getElementById("place-tips").innerHTML = tips.map((t) => `<li>${t}</li>`).join("");
  help.hidden = !open;
  player.enabled = !open && !paused;
  if (open) document.exitPointerLock?.();
  else if (!paused && matchMedia("(pointer: fine)").matches) canvas.requestPointerLock?.();
}
document.getElementById("help-btn").addEventListener("click", () => setHelp(true));
document.getElementById("help-close").addEventListener("click", () => setHelp(false));
help.addEventListener("click", (e) => { if (e.target === help) setHelp(false); });

const soundToggle = document.getElementById("sound-toggle");
soundToggle.checked = !isMuted();
soundToggle.addEventListener("change", () => setMuted(!soundToggle.checked));
function toggleSound() {
  setMuted(!isMuted());
  soundToggle.checked = !isMuted();
  toast(isMuted() ? "Sound off" : "Sound on", 2);
}
addEventListener("pointerdown", unlockAudio);

addEventListener("keydown", (e) => {
  unlockAudio();
  if (e.code === "Space" && !paused) e.preventDefault();
  if (e.repeat) return;
  if (e.key === "?") return setHelp(help.hidden);
  if (e.code === "KeyN") return toggleSound();
  if (!help.hidden) {
    if (e.code === "Escape") setHelp(false);
    return;
  }
  const menuOpen = !document.getElementById("menu").hidden;
  const pick = menuOpen && /^Digit[1-9]$/.test(e.code) ? SCENES[Number(e.code.slice(5)) - 1] : null;
  if (pick) return startScene(pick);
  if (e.code === "KeyM") menuOpen && current?.instance.started ? closeMenu() : openMenu();
  else if (e.code === "Escape" && menuOpen && current?.instance.started) closeMenu();
  else if (menuOpen) return;
  // The Lab needs the mouse, so opening it lets go of the view.
  else if (e.code === "KeyL" && toggleLab()) document.exitPointerLock?.();
  else if (e.code === "KeyG") toggleGoals();
  else if (e.code === "BracketLeft" || e.code === "BracketRight") {
    setLight(lightSpeed() * (e.code === "BracketLeft" ? 0.8 : 1.25));
    syncLab();
  }
  else if (e.code === "KeyE") act();
  else if (e.code === "KeyF") throwBall();
  else if (e.code === "Comma") setPlayback(SPEEDS[Math.max(0, SPEEDS.indexOf(playback) - 1)]);
  else if (e.code === "Period") setPlayback(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(playback) + 1)]);
  else if (e.code === "KeyH") document.body.classList.toggle("photo");
  else if (e.code === "KeyT" && current) {
    const [x, z, yaw] = current.instance.spawn;
    player.alight();
    player.place(x, z, yaw);
  }
});

// Faster than a place's own light speed, light simply speeds up. Slower than
// it, the world slows down with it and your stride lengthens, so every moving
// thing keeps its fraction of c.
function setLight(c) {
  const c0 = current?.instance.c0 ?? world.c;
  if (intro) return;
  if (c >= c0) { world.c = c; world.slow = 1; }
  else { world.c = c0; world.slow = c / c0; }
  player.stretch = 1 / world.slow;
}

initLab(setLight);
buildMenu();
// Clicking a goal takes you to a good spot for it.
onGoalClick((i) => {
  const at = current?.instance.goals?.[i]?.at;
  if (!at) return;
  player.alight();
  player.place(at[0], at[1], at[2] ?? 0);
  player.pitch = at[3] ?? 0;
  sfx.ui();
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w < h ? 90 : 72;
  camera.updateProjectionMatrix();
  shared.uPointScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
addEventListener("resize", resize);
resize();

// The eye adapts to the brightness in the middle of the view, so the
// searchlight effect brightens and dims without blinding or blacking out.
const viewDir = new THREE.Vector3();
function adaptExposure(dt) {
  const b = shared.uBeta.value;
  const beta2 = b.lengthSq();
  camera.getWorldDirection(viewDir);
  const D = beta2 > 1e-10 ? 1 / (Math.sqrt(1 / (1 - beta2)) * (1 - b.dot(viewDir))) : 1;
  // On a train, the carriage around you moves with you and fills the view, so don't adapt.
  const target = effects.searchlight && !player.vehicle ? THREE.MathUtils.clamp(D < 1 ? D ** -1.2 : D ** -0.5, 0.3, 4) : 1;
  const u = shared.uExposure;
  u.value += (target - u.value) * Math.min(1, dt * 4);
}

let last = performance.now();
const eye = new THREE.Vector3();
const right = new THREE.Vector3();
let wasComplete = false;
let goalsDone = 0, stepDist = 0;

// Footsteps, faster and firmer as you speed up. Nothing while riding.
function footsteps(dt) {
  const u = player.u.length();
  if (player.vehicle || !player.enabled || u < 0.3) { stepDist = 0; return; }
  stepDist += u * dt;
  const stride = 0.75 + 0.14 * u;
  if (stepDist > stride) {
    stepDist -= stride;
    sfx.step(Math.min(1, 0.4 + u / 9));
  }
}

// One step of simulation: the player's own time advances by dTau.
function simulate(dTau, { realtime = true } = {}) {
  const { instance, scene } = current;
  const dT = player.update(dTau, instance);
  world.t += dT;
  player.applyTo(camera);
  camera.updateMatrixWorld();
  eye.copy(player.eye);

  shared.uCam.value.copy(eye);
  shared.uBeta.value.copy(player.v).divideScalar(world.c);
  shared.uFlags.value.set(+effects.aberration, +effects.doppler, +effects.searchlight, 0);
  shared.uTime.value = world.t;
  shared.uC.value = world.c;
  shared.uDelay.value = +effects.delay;
  shared.uContract.value = +effects.dilation;
  adaptExposure(dTau);
  sky.position.copy(eye);

  // Nothing counts as spotted while light is still slowing down.
  const before = intro ? instance.goals?.map((g) => g.done) : null;
  instance.update({ player, eye, camera, t: world.t, dT, dTau });
  if (before) instance.goals.forEach((g, i) => (g.done = before[i]));
  if (realtime) pickLamps(instance.lamps, eye);
  instance.group.traverse((c) => { if (c.follow) c.position.set(eye.x, c.followY ?? 0, eye.z); });
  for (const g of ghosts) g.visible = effects.ghosts;
  if (!realtime) return;

  setListener(eye, right.set(1, 0, 0).applyQuaternion(camera.quaternion));
  updateAudio({ beta: player.beta, train: instance.sound?.(eye) ?? instance.train?.audio(eye, player) ?? null });
  footsteps(dTau);
  if (!paused) {
    const nDone = instance.goals?.filter((g) => g.done).length ?? 0;
    if (nDone > goalsDone) sfx.goal();
    goalsDone = nDone;
    const complete = instance.goals?.length > 0 && instance.goals.every((g) => g.done);
    if (complete && !wasComplete && !done[scene.id]) {
      done[scene.id] = true;
      store.set("pacetime-done", JSON.stringify(done));
      setTimeout(() => toast(`${scene.title}: everything spotted. Press M for another place.`, 7), 9000);
    }
    wasComplete = complete;
  }
}

// On the title screen the camera glides through the scene: a few seconds at
// 92% of light speed, a slow-down to look around, then back to the start.
let tourClock = 0;
function tour(dt) {
  const tr = current?.scene.tour;
  if (!tr || !paused || current.instance.started) { player.autopilot = null; return; }
  tourClock += dt;
  const [x, z, yaw] = tr.from;
  const cycle = 14;
  // Show each scene for two glides, then move on to the next.
  if (tourClock > cycle * 2) {
    tourClock = 0;
    load(SCENES[(SCENES.indexOf(current.scene) + 1) % SCENES.length]);
    return;
  }
  const k = tourClock % cycle;
  if (k < dt * 1.5 || player.pos.distanceTo(new THREE.Vector3(x, 0, z)) > tr.length) {
    player.place(x, z, yaw);
    player.pitch = 0.04;
    tourClock = Math.floor(tourClock / cycle) * cycle + dt * 2;
  }
  const u = (k < 9 ? 2.4 : 0) * player.legs; // proper speed: 0.92 c
  player.autopilot = new THREE.Vector3(tr.dir[0], 0, tr.dir[1]).normalize().multiplyScalar(u);
}

// The eight lamps nearest you light their surroundings.
function pickLamps(lamps, eye) {
  const near = lamps.length > 8 ? [...lamps].sort((a, b) => a.pos.distanceToSquared(eye) - b.pos.distanceToSquared(eye)).slice(0, 8) : lamps;
  for (let i = 0; i < 8; i++) {
    const l = near[i];
    if (l) {
      shared.uLampPos.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.range);
      shared.uLampColor.value[i].copy(l.color).multiplyScalar(l.power);
    } else shared.uLampColor.value[i].setRGB(0, 0, 0);
  }
}

// Tests can run the world faster than real time.
let warp = 1;

// Lower the resolution if frames are slow, raise it again when there's room.
const MAX_RATIO = Math.min(devicePixelRatio, 2);
let ratio = MAX_RATIO, slowFor = 0, fastFor = 0;
function adaptResolution(dt) {
  const n = frameTimes.length - 1;
  const fps = n > 30 ? (1000 * n) / (frameTimes[n] - frameTimes[0]) : 0;
  if (fps && fps < 42) { slowFor += dt; fastFor = 0; }
  else if (fps > 57) { fastFor += dt; slowFor = 0; }
  else { slowFor = fastFor = 0; }
  const next = slowFor > 2 ? Math.max(0.75, ratio - 0.25) : fastFor > 6 ? Math.min(MAX_RATIO, ratio + 0.25) : ratio;
  if (next !== ratio) {
    ratio = next;
    slowFor = fastFor = 0;
    frameTimes = [];
    renderer.setPixelRatio(ratio);
    resize();
  }
}

let frameTimes = [];
function frame() {
  const now = performance.now();
  frameTimes.push(now);
  if (frameTimes.length > 120) frameTimes.shift();
  const dTau = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (current) {
    // Behind the title screen the world keeps running so the menu has a live backdrop.
    const frozen = (paused || !help.hidden) && current.instance.started;
    tour(dTau);
    const total = frozen ? 0 : dTau * warp * playback * world.slow;
    if (!frozen) runIntro(dTau);
    const n = Math.max(1, Math.ceil(total / 0.05));
    for (let i = 0; i < n; i++) simulate(total / n, { realtime: i === n - 1 });
    if (!paused) {
      updateHud({
        player, instance: current.instance,
        locked: document.pointerLockElement === canvas || matchMedia("(pointer: coarse)").matches,
        prompt: current.instance.action?.(eye) ?? null,
      });
      writeHash(dTau);
    }
  }
  adaptResolution(dTau);
  renderer.info.reset();
  if (usePost) composer.render();
  else renderer.render(root, camera);
  requestAnimationFrame(frame);
}

// Open where the address says; otherwise a live scene runs behind the title screen.
const fromHash = parseHash();
if (fromHash) restore(fromHash);
else {
  load(SCENES.find((s) => s.id === store.get("pacetime-last")) ?? SCENES[0]);
  openMenu();
}
frame();

// Handy for poking at the physics from the console.
window.pacetime = {
  player, world, effects, closeMenu, act, shared, bloom, throwBall,
  get instance() { return current?.instance; },
  get fps() { const n = frameTimes.length - 1; return n > 0 ? (1000 * n) / (frameTimes[n] - frameTimes[0]) : 0; },
  get drawCalls() { return renderer.info.render.calls; },
  get pixelRatio() { return ratio; },
  get warp() { return warp; },
  set warp(k) { warp = Math.max(0, Math.min(k, 40)); },
  // Jump ahead: run the world for `seconds` of your own time without drawing.
  advance(seconds) {
    const steps = Math.ceil(seconds / 0.05);
    for (let i = 0; i < steps; i++) simulate(seconds / steps, { realtime: false });
  },
  load: (id) => { load(SCENES.find((s) => s.id === id)); current.instance.started = true; },
};
