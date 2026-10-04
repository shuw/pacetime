import * as THREE from "three";
import "./style.css";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Player } from "./player.js";
import { bake } from "./geo.js";
import { shared, skyMaterial } from "./shaders.js";
import { effects, world } from "./relativity.js";
import { initLab, showScene, syncLab, toast, toggleLab, updateHud } from "./hud.js";
import { isMuted, setListener, setMuted, sfx, unlockAudio, updateAudio } from "./audio.js";
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
  player.place(0, 0, 0);
  player.tau = 0;
  world.t = 0;
  const instance = scene.build({ player, toast });
  instance.lamps = [];
  instance.group.traverse((o) => o.userData.lamp && instance.lamps.push(o.userData.lamp));
  bake(instance.group);
  root.add(instance.group);
  current = { scene, instance };
  applyEnv(instance.env);
  applyPost(instance.post);
  const [x, z, yaw] = instance.spawn;
  player.place(x, z, yaw ?? 0);
  showScene(scene, SCENES.indexOf(scene));
  instance.c0 = world.c;
  player.legs = world.c;
  goalsDone = 0;
  syncLab();
  store.set("pacetime-last", scene.id);
}

// The address bar mirrors where you are, e.g. #tunnel@-30.0,17.0,0.00,0.00&c=8&off=doppler,
// so a refresh or a shared link drops you back in the same spot.
function stateHash() {
  const p = player;
  let h = `#${current.scene.id}@${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)},${p.yaw.toFixed(2)},${p.pitch.toFixed(2)}`;
  if (Math.abs(world.c - current.instance.c0) > 1e-3) h += `&c=${+world.c.toFixed(2)}`;
  const off = Object.keys(effects).filter((k) => !effects[k]);
  if (off.length) h += `&off=${off.join(",")}`;
  return h;
}

function parseHash() {
  const [head, ...rest] = decodeURIComponent(location.hash.slice(1)).split("&");
  const [id, pose] = head.split("@");
  if (!SCENES.some((s) => s.id === id)) return null;
  const opts = Object.fromEntries(rest.map((kv) => kv.split("=")));
  return { id, pose: pose?.split(",").map(Number), c: opts.c ? Number(opts.c) : null, off: opts.off ? opts.off.split(",") : [] };
}

function restore(h) {
  for (const k of Object.keys(effects)) effects[k] = !h.off.includes(k);
  load(SCENES.find((s) => s.id === h.id));
  current.instance.started = true;
  if (h.c > 0) world.c = h.c;
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
  if (h !== location.hash) history.replaceState(null, "", h);
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

function startScene(scene) {
  unlockAudio();
  sfx.ui();
  player.autopilot = null;
  load(scene);
  current.instance.started = true;
  closeMenu();
  if (matchMedia("(pointer: fine)").matches) canvas.requestPointerLock?.();
}

document.getElementById("scene-cards").addEventListener("click", (e) => {
  const card = e.target.closest(".scene-card");
  if (card) startScene(SCENES.find((s) => s.id === card.dataset.id));
});

function act() {
  const a = current?.instance.action?.(player.eye);
  a?.run();
}

document.getElementById("menu-btn").addEventListener("click", openMenu);
document.getElementById("act-btn").addEventListener("click", act);
const back = document.getElementById("back-btn");
back.addEventListener("touchstart", (e) => { player.lookBack = true; e.preventDefault(); });
back.addEventListener("touchend", () => (player.lookBack = false));
canvas.addEventListener("click", () => {
  if (!paused && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
function setHelp(open) {
  if (help.hidden === !open) return;
  sfx.ui();
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
  else if (e.code === "KeyE") act();
  else if (e.code === "KeyT" && current) {
    const [x, z, yaw] = current.instance.spawn;
    player.alight();
    player.place(x, z, yaw);
  }
});

initLab();
buildMenu();

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

  instance.update({ player, eye, camera, t: world.t, dT, dTau });
  if (realtime) pickLamps(instance.lamps, eye);
  instance.group.traverse((c) => { if (c.follow) c.position.set(eye.x, c.followY ?? 0, eye.z); });
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
      setTimeout(() => toast(`${scene.title}: all observations made. Open Experiments (M) for the next one.`, 7), 9000);
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
    const total = frozen ? 0 : dTau * warp;
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
  player, world, effects, closeMenu, act, shared, bloom,
  get instance() { return current?.instance; },
  get fps() { const n = frameTimes.length - 1; return n > 0 ? (1000 * n) / (frameTimes[n] - frameTimes[0]) : 0; },
  get drawCalls() { return renderer.info.render.calls; },
  get warp() { return warp; },
  set warp(k) { warp = Math.max(0, Math.min(k, 40)); },
  // Jump ahead: run the world for `seconds` of your own time without drawing.
  advance(seconds) {
    const steps = Math.ceil(seconds / 0.05);
    for (let i = 0; i < steps; i++) simulate(seconds / steps, { realtime: false });
  },
  load: (id) => { load(SCENES.find((s) => s.id === id)); current.instance.started = true; },
};
