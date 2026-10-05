import * as THREE from "three";
import "./style.css";
import { Player } from "./player.js";
import { bake } from "./geo.js";
import { ghosts, shared, sparkField } from "./shaders.js";
import { addVelocity, effects, lightSpeed, observerFactors, world } from "./relativity.js";
import { clearToast, initLab, initTime, onGoalClick, showScene, syncLab, timeOpen, toast, toggleGoals, toggleLab, toggleTime, updateHud } from "./hud.js";
import { motion } from "./motion.js";
import { Minimap } from "./minimap.js";
import { Carried, Sparkler } from "./toys.js";
import { isMuted, renderEffects, setAmbience, setListener, setMuted, sfx, unlockAudio, updateAudio } from "./audio.js";
import { adaptExposure, adaptResolution, applyEnv, applyPost, bloom, camera, draw, fps, frameTick, pickLamps, pixelRatio, renderer, root, setAdaptiveResolution, sky, warmUp } from "./render.js";
import { linkFor, linkKeeper, readLink } from "./link.js";
import { TitleScreen } from "./title.js";
import { store } from "./store.js";
import railway from "./scenes/railway.js";
import pier from "./scenes/pier.js";
import city from "./scenes/city.js";
import highway from "./scenes/highway.js";
import starship from "./scenes/starship.js";

// The game loop and the controls. Drawing is in render.js, the title screen
// in title.js, the address bar in link.js; each place is a module in scenes/.

/** @type {import("./place.js").PlaceModule[]} */
const SCENES = [pier, highway, starship, city, railway];

const player = new Player(document.getElementById("view"));
const carried = new Carried(root);
const minimap = new Minimap(document.getElementById("minimap"));
/** @type {{ scene: import("./place.js").PlaceModule, instance: import("./place.js").Place & Record<string, any> } | null} */
let current = null;
let paused = true;
const help = document.getElementById("help");

const done = JSON.parse(store.get("done") ?? "{}");

function load(scene) {
  if (current) root.remove(current.instance.group);
  ghosts.length = 0;
  clearToast();
  player.place(0, 0, 0);
  player.tau = 0;
  world.t = 0;
  motion.reset();
  minimap.reset();
  carried.reset();
  const instance = scene.build({ player, toast });
  instance.sparkler = new Sparkler(instance.group);
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
  showScene(scene);
  instance.c0 = world.c;
  player.legs = world.c;
  player.rocket = !!instance.rocket;
  player.eta = 0;
  player.easing = false;
  player.ship = instance.ship ?? null;
  if (player.ship) player.yaw = player.ship.heading;
  camera.far = instance.far ?? 12000;
  camera.updateProjectionMatrix();
  carried.setCockpit(instance.cockpit);
  goalsDone = 0;
  syncLab();
}

// Open a link: its place, its Lab settings and where it stood.
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
const keepLink = linkKeeper();
const currentLink = () => linkFor({ id: current.scene.id, player, c: lightSpeed(), c0: current.instance.c0, effects });
addEventListener("hashchange", () => {
  const h = readLink(location.hash, SCENES.map((s) => s.id));
  if (h && h.id !== current?.scene.id) restore(h);
});

const title = new TitleScreen({ places: SCENES, done, onPick: (s) => startScene(s), onResume: () => closeMenu() });

function openMenu() {
  paused = true;
  // The title screen has no place in the address; going back in puts it back.
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* embedded pages may not allow it */ }
  player.enabled = false;
  title.open(current?.instance.started ? current.scene.title : null);
}

function closeMenu() {
  title.close();
  paused = false;
  player.enabled = true;
}

// Going into a place: a veil fades in over the title screen, the place is
// built and its shaders compiled out of sight, and the veil fades into it.
const veil = document.getElementById("veil");
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const fadeVeil = (on, ms) => new Promise((r) => {
  veil.style.transitionDuration = `${ms}ms`;
  veil.classList.toggle("on", on);
  setTimeout(r, ms);
});
let starting = false;
async function startScene(scene) {
  if (starting) return;
  // The place you're already in: just go back to it.
  if (current?.scene === scene && current.instance.started) return closeMenu();
  starting = true;
  unlockAudio();
  sfx.ui();
  veil.querySelector("h2").textContent = scene.title;
  veil.querySelector("p").textContent = scene.tag;
  await fadeVeil(true, 150);
  await nextFrame(); await nextFrame(); // the veil is on screen before building holds up the page
  load(scene);
  current.instance.started = true;
  closeMenu();
  await warmUp();
  for (let i = 0; i < 3; i++) await nextFrame(); // the first frames, with their uploads, also behind the veil
  starting = false;
  await fadeVeil(false, 380);
}

// Throw a glowing ball at 60% of light speed (relative to you), from your hand.
const BALL_COLORS = ["#ffd166", "#7bdcff", "#ff7aa8", "#9dff8a", "#c7a0ff"];
let ballN = 0;
function throwBall() {
  if (!current || paused) return;
  if (current.instance.fire) return current.instance.fire(); // some places fire light instead
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

function toggleTorch() {
  const on = carried.toggle("torch");
  sfx.ui();
  toast(on ? "Torch on. Its light crawls out at the speed of light: sweep it across a wall and watch the spot lag behind." : "Torch off", 4);
}
function toggleSparkler() {
  const on = carried.toggle("sparkler");
  sfx.ui();
  toast(on ? "Sparkler lit. Draw in the air, then sprint past what you drew." : "Sparkler out", 4);
}

// Playback speed for everything, for studying fast things.
const SPEEDS = [0.25, 0.5, 1];
let playback = 1;
function setPlayback(k) {
  playback = k;
  const el = document.getElementById("slowmo");
  el.hidden = k === 1;
  el.textContent = `slow motion ${k === 0.25 ? "¼" : "½"}×`;
}

function setHelp(open) {
  if (help.hidden === !open) return;
  sfx.ui();
  // What this place shows; from the title screen, what the game is about.
  const inPlace = !!current && !paused;
  document.getElementById("about-place").hidden = !inPlace;
  document.getElementById("about-game").hidden = inPlace;
  if (inPlace) {
    document.getElementById("place-help-title").textContent = current.scene.title;
    document.getElementById("place-lede").textContent = current.scene.blurb;
    document.getElementById("place-tips").replaceChildren(...(current.instance.tips ?? []).map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  }
  help.hidden = !open;
  player.enabled = !open && !paused;
}

const soundToggle = document.getElementById("sound-toggle");
soundToggle.checked = !isMuted();
soundToggle.addEventListener("change", () => setMuted(!soundToggle.checked));
function toggleSound() {
  setMuted(!isMuted());
  soundToggle.checked = !isMuted();
  toast(isMuted() ? "Sound off" : "Sound on", 2);
}

// Light speed is independent of everything else: things keep their own
// speeds, and are only held just under light speed when they'd outrun it.
function setLight(c) {
  // Some places use light at its real speed.
  if (current?.instance.fixedC) return toast("Light here moves at its real speed.", 3);
  world.c = c;
}

// Buttons and keys.
document.getElementById("menu-btn").addEventListener("click", openMenu);
document.getElementById("throw-btn").addEventListener("click", () => throwBall());
document.getElementById("act-btn").addEventListener("click", act);
const back = document.getElementById("back-btn");
back.addEventListener("touchstart", (e) => { player.lookBack = true; e.preventDefault(); });
back.addEventListener("touchend", () => (player.lookBack = false));
// Pace buttons: click to pick a pace that stays until you change it.
document.querySelector(".paces").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-pace]");
  if (b) player.setPace(Number(b.dataset.pace));
});
document.getElementById("help-btn").addEventListener("click", () => setHelp(true));
document.getElementById("menu-help").addEventListener("click", () => setHelp(true));
document.getElementById("help-close").addEventListener("click", () => setHelp(false));
help.addEventListener("click", (e) => { if (e.target === help) setHelp(false); });
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
  const menuOpen = title.isOpen;
  const pick = menuOpen && /^Digit[1-9]$/.test(e.code) ? SCENES[Number(e.code.slice(5)) - 1] : null;
  if (pick) return startScene(pick);
  if (e.code === "KeyM") menuOpen && current?.instance.started ? closeMenu() : openMenu();
  else if (e.code === "Escape" && menuOpen) { if (current?.instance.started) closeMenu(); }
  else if (menuOpen) return;
  // Esc closes the time picker or the Lab if one is open, and otherwise goes back to the title screen.
  else if (e.code === "Escape" && timeOpen()) toggleTime(false);
  else if (e.code === "Escape") document.getElementById("lab").hidden ? openMenu() : toggleLab();
  // The Lab needs the mouse, so opening it lets go of the view.
  else if (e.code === "KeyL") toggleLab();
  else if (e.code === "KeyG") toggleGoals();
  else if (e.code === "BracketLeft" || e.code === "BracketRight") {
    setLight(lightSpeed() * (e.code === "BracketLeft" ? 0.8 : 1.25));
    syncLab();
  }
  else if (e.code === "KeyE") act();
  else if (current?.instance.onKey?.(e.code)) return;
  else if (e.code === "KeyF") throwBall();
  else if (e.code === "KeyR") toggleTorch();
  else if (e.code === "KeyV") toggleSparkler();
  else if (e.code === "KeyX") player.easeToWalk();
  else if (e.code === "Comma") setPlayback(SPEEDS[Math.max(0, SPEEDS.indexOf(playback) - 1)]);
  else if (e.code === "Period") setPlayback(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(playback) + 1)]);
  else if (e.code === "KeyH") document.body.classList.toggle("photo");
  else if (e.code === "KeyT" && current) {
    const [x, z, yaw] = current.instance.spawn;
    player.alight();
    player.place(x, z, yaw);
  }
});

initLab(setLight);
initTime();
// Clicking a goal takes you to a good spot for it.
onGoalClick((i) => {
  const at = current?.instance.goals?.[i]?.at;
  if (!at) return;
  player.alight();
  player.place(at[0], at[1], at[2] ?? 0);
  player.pitch = at[3] ?? 0;
  // Some goals happen at a time of day: wind the sky back to just before it.
  const goal = current.instance.goals[i];
  const day = current.instance.day;
  if (goal.day !== undefined && day) {
    // Wind the sky to just before that time of day, today or tomorrow.
    const P = day.phaseAt(world.t), d = day.dayOf(P);
    if (P - d * day.period > goal.day) day.set(d * day.period + goal.day, world.t);
  }
  sfx.ui();
});

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
  // Places that go on forever move the world back under you (in whole tiles).
  const shift = instance.rebase?.(player);
  if (shift) {
    const { x = 0, z = 0 } = typeof shift === "number" ? { z: shift } : shift;
    minimap.trail.forEach((p) => { p[0] += x; p[1] += z; });
  }
  motion.step(dT, world.t);
  player.applyTo(camera);
  camera.updateMatrixWorld();
  eye.copy(player.eye);

  shared.uCam.value.copy(eye);
  shared.uBeta.value.copy(player.v).divideScalar(world.c);
  shared.uObs.value.set(...observerFactors(player.gamma, player.omb, shared.uAberrK.value));
  shared.uFlags.value.set(+effects.aberration, +effects.doppler, +effects.searchlight, 0);
  shared.uTime.value = world.t;
  shared.uC.value = world.c;
  shared.uDelay.value = +effects.delay;
  shared.uContract.value = +effects.dilation;
  adaptExposure(dTau, !!player.vehicle);
  sky.position.copy(eye);

  carried.update({ camera, player, sparkler: instance.sparkler });
  instance.update({ player, eye, camera, t: world.t, dT, dTau });
  motion.sync(world.t);
  if (realtime) pickLamps(instance.lamps, eye);
  instance.group.traverse((c) => { if (c.follow) c.position.set(eye.x, c.followY ?? 0, eye.z); });
  for (const g of ghosts) g.visible = effects.ghosts;
  if (!realtime) return;

  setListener(eye, right.set(1, 0, 0).applyQuaternion(camera.quaternion));
  updateAudio({ beta: player.beta, gamma: player.gamma, dt: dTau, train: instance.sound?.(eye) ?? null });
  footsteps(dTau);
  if (!paused) {
    const nDone = instance.goals?.filter((g) => g.done).length ?? 0;
    if (nDone > goalsDone) sfx.goal();
    goalsDone = nDone;
    const complete = instance.goals?.length > 0 && instance.goals.every((g) => g.done);
    if (complete && !wasComplete && !done[scene.id]) {
      done[scene.id] = true;
      store.set("done", JSON.stringify(done));
      setTimeout(() => toast(`${scene.title}: everything spotted. Press M for another place.`, 7), 9000);
    }
    wasComplete = complete;
  }
}

// Tests can run the world faster than real time.
let warp = 1;
let last = performance.now();
function frame() {
  const now = performance.now();
  frameTick(now);
  const dTau = Math.min((now - last) / 1000, 0.05);
  last = now;
  // The title screen covers everything: draw its models instead of the world.
  if (title.isOpen) {
    title.render(dTau);
    requestAnimationFrame(frame);
    return;
  }
  if (current) {
    const frozen = (paused || !help.hidden) && current.instance.started;
    const total = frozen ? 0 : dTau * warp * playback;
    const n = Math.max(1, Math.ceil(total / 0.05));
    for (let i = 0; i < n; i++) simulate(total / n, { realtime: i === n - 1 });
    if (!paused) {
      updateHud({
        player, instance: current.instance,
        locked: player.dragged || player.usedKeys || matchMedia("(pointer: coarse)").matches,
        prompt: current.instance.action?.(eye) ?? null,
      });
      keepLink(dTau, currentLink);
      minimap.update(player, current.instance, dTau);
    }
  }
  adaptResolution(dTau);
  draw(current?.instance, eye);
  requestAnimationFrame(frame);
}

// Open where the address says; otherwise on the title screen.
const fromLink = readLink(location.hash, SCENES.map((s) => s.id));
if (fromLink) restore(fromLink);
else openMenu();
frame();

// Handy for poking at the physics from the console, and for the tests.
window.slowlight = {
  player, world, effects, closeMenu, act, shared, bloom, throwBall, pickLamps, camera, sfx, renderEffects,
  // Draw a frame now (for recording: the canvas can be read straight after).
  render: () => draw(current?.instance, eye),
  get instance() { return current?.instance; },
  get fps() { return fps(); },
  get drawCalls() { return renderer.info.render.calls; },
  get pixelRatio() { return pixelRatio(); },
  get warp() { return warp; },
  set warp(k) { warp = Math.max(0, Math.min(k, 40)); },
  set adaptiveResolution(on) { setAdaptiveResolution(on); },
  // Jump ahead: run the world for `seconds` of your own time without drawing.
  // With live, the last step also updates lamps and sound, as a real frame
  // would (for recording frame by frame).
  advance(seconds, { live = false } = {}) {
    const steps = Math.ceil(seconds / 0.05);
    for (let i = 0; i < steps; i++) simulate(seconds / steps, { realtime: live && i === steps - 1 });
  },
  load: (id) => { load(SCENES.find((s) => s.id === id)); current.instance.started = true; },
};
