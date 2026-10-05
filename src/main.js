import * as THREE from "three";
import "./style.css";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Player } from "./player.js";
import { bake } from "./geo.js";
import { ghosts, reflScale, shared, skyMaterial } from "./shaders.js";
import { effects, world } from "./relativity.js";
import { clearToast, initLab, onGoalClick, showScene, syncLab, toast, toggleGoals, toggleLab, updateHud } from "./hud.js";
import { lightSpeed } from "./relativity.js";
import { motion } from "./motion.js";
import { Minimap } from "./minimap.js";
import { ACCENTS, MenuModels } from "./menu3d.js";
import { BeamHistory, handlebarsModel, Sparkler, torchModel, wandModel } from "./toys.js";
import { addVelocity } from "./relativity.js";
import { sparkField } from "./shaders.js";
import { isMuted, setAmbience, setListener, setMuted, sfx, unlockAudio, updateAudio } from "./audio.js";
import railway from "./scenes/railway.js";
import pier from "./scenes/pier.js";
import city from "./scenes/city.js";
import highway from "./scenes/highway.js";
import starship from "./scenes/starship.js";

const SCENES = [pier, highway, starship, city, railway];

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
sky.layers.set(1);
root.add(sky);

// Layers: 0 casts shadows and shows in reflections, 1 shows in reflections
// only (sky, particles, ground), 2 is seen directly only (water, mirrored copies).
camera.layers.enable(1);
camera.layers.enable(2);

// Sun shadows: depth maps drawn from the sun, in the world's own frame. A
// sharp near map follows you; a coarser far map covers the rest.
const SHADOW_SIZE = 2048;
function shadowTarget() {
  const rt = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE, THREE.FloatType);
  return rt;
}
const cascades = [
  { rt: shadowTarget(), cam: new THREE.OrthographicCamera(-30, 30, 30, -30, 200, 700), ahead: 18, size: 60 },
  { rt: shadowTarget(), cam: new THREE.OrthographicCamera(-120, 120, 120, -120, 200, 700), ahead: 70, size: 240 },
];
for (const c of cascades) c.cam.layers.set(0);
let shadowFrame = 0;

function renderShadow() {
  const sun = shared.uSun.value;
  const on = current.instance.shadows ? THREE.MathUtils.smoothstep(sun.y, -0.01, 0.06) : 0;
  shared.uShadowOn.value = on;
  if (on <= 0) return;
  const ahead = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  // Moving things cast shadows from where you see them (light delay included),
  // so a fast wheel's shadow lines up with what's on screen. The view bending
  // is left out: shadows fall in the world.
  shared.uPass.value = 2;
  // A texture can't be read while it's being drawn into.
  shared.uShadowMap.value = shared.uShadowMapFar.value = null;
  shadowFrame++;
  cascades.forEach((c, k) => {
    if (k === 1 && shadowFrame % 2 === 0 && c.ready) return; // the far map can lag a frame
    const center = new THREE.Vector3(eye.x, 0, eye.z).addScaledVector(ahead, c.ahead);
    // Snap to whole texels so shadow edges don't shimmer as you move.
    const texel = c.size / SHADOW_SIZE;
    c.cam.position.copy(center).addScaledVector(sun, 400);
    c.cam.lookAt(center);
    c.cam.updateMatrixWorld();
    const local = center.clone().applyMatrix4(c.cam.matrixWorldInverse);
    const snap = new THREE.Vector3(Math.round(local.x / texel) * texel - local.x, Math.round(local.y / texel) * texel - local.y, 0);
    c.cam.position.add(snap.applyQuaternion(c.cam.quaternion));
    c.cam.updateMatrixWorld();
    c.matrix = new THREE.Matrix4().multiplyMatrices(c.cam.projectionMatrix, c.cam.matrixWorldInverse);
    shared.uShadowMatrix.value.copy(c.matrix);
    renderer.setRenderTarget(c.rt);
    renderer.clear();
    renderer.render(root, c.cam);
    c.ready = true;
  });
  renderer.setRenderTarget(null);
  shared.uPass.value = 0;
  shared.uShadowMatrix.value.copy(cascades[0].matrix);
  shared.uShadowMatrixFar.value.copy(cascades[1].matrix);
  shared.uShadowMap.value = cascades[0].rt.depthTexture;
  shared.uShadowMapFar.value = cascades[1].rt.depthTexture;
}

// Water reflections: the scene drawn again from a camera mirrored in the
// water's surface. Its distances are the real reflected light paths, so light
// delay and color shifts come out right in the reflection too.
const mirrorCam = new THREE.PerspectiveCamera();
mirrorCam.matrixAutoUpdate = false;
mirrorCam.matrixWorldAutoUpdate = false;
mirrorCam.layers.set(0);
mirrorCam.layers.enable(1);
let reflRT = null;
const flipX = new THREE.Matrix4().makeScale(-1, 1, 1);

function renderMirror() {
  const y0 = current.instance.mirrorY;
  if (y0 === undefined) { shared.uReflOn.value = 0; return; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(reflScale.value).floor();
  if (!reflRT || reflRT.width !== size.x || reflRT.height !== size.y) {
    reflRT?.dispose();
    reflRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  }
  const R = new THREE.Matrix4().set(1, 0, 0, 0, 0, -1, 0, 2 * y0, 0, 0, 1, 0, 0, 0, 0, 1);
  mirrorCam.projectionMatrix.copy(camera.projectionMatrix).premultiply(flipX);
  mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();
  mirrorCam.matrixWorld.copy(R).multiply(camera.matrixWorld);
  mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
  const cam = shared.uCam.value.clone(), beta = shared.uBeta.value.clone();
  shared.uCam.value.applyMatrix4(R);
  shared.uBeta.value.y *= -1;
  sky.position.copy(shared.uCam.value);
  shared.uPass.value = 1;
  shared.uMirrorY.value = y0;
  shared.uReflOn.value = 0;
  shared.uReflection.value = null;
  renderer.setRenderTarget(reflRT);
  renderer.clear();
  renderer.render(root, mirrorCam);
  renderer.setRenderTarget(null);
  shared.uPass.value = 0;
  shared.uCam.value.copy(cam);
  shared.uBeta.value.copy(beta);
  sky.position.copy(cam);
  shared.uReflection.value = reflRT.texture;
  shared.uReflOn.value = 1;
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(root, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.5, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let usePost = false;

const player = new Player(canvas);

// Things you carry ride along with the camera.
const rig = new THREE.Group();
const torch = torchModel(), wand = wandModel(), bars = handlebarsModel();
rig.add(torch, wand);
root.add(rig);
// What you ride in faces where you're heading, not where you look.
const craft = new THREE.Group();
craft.add(bars);
root.add(craft);
const beamHistory = new BeamHistory();
const toys = { torch: false, sparkler: false };
function toggleTorch() {
  toys.torch = !toys.torch;
  sfx.ui();
  toast(toys.torch ? "Torch on. Its light crawls out at the speed of light: sweep it across a wall and watch the spot lag behind." : "Torch off", 4);
}
function toggleSparkler() {
  toys.sparkler = !toys.sparkler;
  sfx.ui();
  toast(toys.sparkler ? "Sparkler lit. Draw in the air, then sprint past what you drew." : "Sparkler out", 4);
}
const minimap = new Minimap(document.getElementById("minimap"));
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
  shared.uSunDisk.value = e.sunDisk ?? 1;
  shared.uMoon.value = 1;
  shared.uAurora.value = e.aurora ?? 0;
  shared.uClouds.value = e.clouds ?? 0;
  shared.uLightsOn.value = -1e9;
  shared.uLightsOff.value = 1e9;
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
  clearToast();
  player.place(0, 0, 0);
  player.tau = 0;
  world.t = 0;
  motion.reset();
  minimap.reset();
  beamHistory.reset();
  const instance = scene.build({ player, toast });
  instance.sparkler = new Sparkler(instance.group);
  // Balls glow like embers: plenty of light beyond the violet, so they stay
  // visible (and redden) as they fly away from you.
  instance.balls = sparkField(120, { gravity: 0.5, intensity: 4, ir: 0.6, uv: 2.4 });
  instance.group.add(instance.balls);
  instance.lamps = [];
  instance.group.traverse((o) => o.userData.lamp && instance.lamps.push(o.userData.lamp));
  const t0 = performance.now();
  bake(instance.group);
  instance.bakeMs = performance.now() - t0;
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
  player.rocket = !!instance.rocket;
  player.eta = 0;
  player.easing = false;
  player.ship = instance.ship ?? null;
  if (player.ship) player.yaw = player.ship.heading;
  camera.far = instance.far ?? 12000;
  camera.updateProjectionMatrix();
  craft.remove(...craft.children.filter((c) => c.userData.cockpit));
  if (instance.cockpit) { instance.cockpit.userData.cockpit = true; craft.add(instance.cockpit); }
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
  let text;
  try { text = decodeURIComponent(location.hash.slice(1)); } catch { return null; } // a mangled link: start at the title screen
  const [head, ...rest] = text.split("&");
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

// The title screen: a card per place, each with a little live model.
const menuModels = new MenuModels(document.getElementById("menu-models"));
const menuEl = document.getElementById("menu");
function buildMenu() {
  document.getElementById("scene-cards").innerHTML = SCENES.map((s) => `
    <li><button class="scene-card" data-id="${s.id}" style="--c: ${ACCENTS[s.id] ?? "#9fb4ff"}">
      <div class="stage" data-stage="${s.id}"></div>
      <div class="card-text">
        <h3>${s.title}</h3>
        <span class="tag">${s.tag}${done[s.id] ? ' · <span class="done">complete</span>' : ""}</span>
        <p>${s.blurb}</p>
      </div>
    </button></li>`).join("");
}
const hoverCard = (e) => { menuModels.hover = e.target.closest?.(".scene-card")?.dataset.id ?? null; };
document.getElementById("scene-cards").addEventListener("pointerover", hoverCard);
document.getElementById("scene-cards").addEventListener("pointerleave", () => (menuModels.hover = null));
document.getElementById("scene-cards").addEventListener("focusin", hoverCard);
document.getElementById("resume").addEventListener("click", () => closeMenu());

function openMenu() {
  paused = true;
  player.enabled = false;
  buildMenu();
  const resume = current?.instance.started;
  document.getElementById("resume").hidden = !resume;
  if (resume) document.getElementById("resume-name").textContent = current.scene.title;
  menuEl.hidden = false;
  document.getElementById("hud").hidden = true;
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
  load(scene);
  store.set("pacetime-last", scene.id);
  current.instance.started = true;
  closeMenu();
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
// Pace buttons: click to pick a pace that stays until you change it.
document.querySelector(".paces").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-pace]");
  if (b) player.setPace(Number(b.dataset.pace));
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
  else if (e.code === "Escape" && menuOpen) { if (current?.instance.started) closeMenu(); }
  else if (menuOpen) return;
  // Esc closes the Lab if it's open, and otherwise goes back to the title screen.
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

// Light speed is independent of everything else: things keep their own
// speeds, and are only held just under light speed when they'd outrun it.
function setLight(c) {
  // Some places use light at its real speed.
  if (current?.instance.fixedC) return toast("Light here moves at its real speed.", 3);
  world.c = c;
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
  camera.getWorldDirection(viewDir);
  // 1/(γ(1 - β cosθ)) with 1 - β cosθ = (1-β) + β(1-cosθ), exact near light speed.
  let D = 1;
  if (b.lengthSq() > 1e-14) {
    const [, , g, omb] = shared.uObs.value.toArray();
    const oneMinusCos = b.clone().normalize().sub(viewDir).lengthSq() / 2;
    D = 1 / (g * (omb + (1 - omb) * oneMinusCos));
  }
  // On a train, the carriage around you moves with you and fills the view, so don't adapt.
  const k = shared.uGlowAmt.value;
  const Dg = k > 0.999 ? D : Math.exp(k * 1.5 * Math.tanh(Math.log(Math.max(D, 1e-4)) / 0.83));
  const brightAhead = k > 0.999 ? Dg ** -0.5 : Dg ** -2; // gentle: the eye adapts fully
  const target = effects.searchlight && !player.vehicle ? THREE.MathUtils.clamp(Dg < 1 ? Dg ** -1.2 : brightAhead, 0.3, 4) : 1;
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
  // γ and 1-β straight from your proper velocity, so the shaders stay exact
  // even at 99.99999% of light speed. The bending uses a gentler rapidity in
  // gentle mode.
  {
    const g = player.gamma, omb = player.omb;
    const eta = omb < 1 ? 0.5 * Math.log((2 - omb) / omb) : 0;
    const ea = eta * shared.uAberrK.value;
    shared.uObs.value.set(g, omb, Math.cosh(ea), 2 / (1 + Math.exp(2 * ea)));
  }
  shared.uFlags.value.set(+effects.aberration, +effects.doppler, +effects.searchlight, 0);
  shared.uTime.value = world.t;
  shared.uC.value = world.c;
  shared.uDelay.value = +effects.delay;
  shared.uContract.value = +effects.dilation;
  adaptExposure(dTau);
  sky.position.copy(eye);

  updateToys(instance);
  instance.update({ player, eye, camera, t: world.t, dT, dTau });
  motion.sync(world.t);
  if (realtime) pickLamps(instance.lamps, eye);
  instance.group.traverse((c) => { if (c.follow) c.position.set(eye.x, c.followY ?? 0, eye.z); });
  for (const g of ghosts) g.visible = effects.ghosts;
  if (!realtime) return;

  setListener(eye, right.set(1, 0, 0).applyQuaternion(camera.quaternion));
  updateAudio({ beta: player.beta, gamma: player.gamma, dt: dTau, train: instance.sound?.(eye) ?? instance.train?.audio(eye, player) ?? null });
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


// The torch, the scooter's headlight and the sparkler.
const fwdV = new THREE.Vector3();
function updateToys(instance) {
  rig.position.copy(camera.position);
  rig.quaternion.copy(camera.quaternion);
  rig.updateMatrixWorld(true);
  craft.position.copy(camera.position);
  craft.rotation.set(0, player.yaw, 0);
  craft.updateMatrixWorld(true);
  const onBike = !!player.bike;
  torch.visible = toys.torch && !onBike;
  wand.visible = toys.sparkler && !onBike;
  bars.visible = onBike;
  if (onBike) {
    // The headlight points along the scooter, dipped toward the road.
    const h = new THREE.Vector3(-Math.sin(player.yaw), -0.07, -Math.cos(player.yaw)).normalize();
    const lamp = player.eye.clone().add(new THREE.Vector3(0, -0.55, 0)).addScaledVector(h, 0.6);
    shared.uBeamCone.value.set(0.975, 0.9, 30);
    beamHistory.push(world.t, lamp, h, true, 0.8);
  } else {
    const lens = new THREE.Vector3();
    torch.lens.getWorldPosition(lens);
    camera.getWorldDirection(fwdV);
    shared.uBeamCone.value.set(0.988, 0.955, 22);
    beamHistory.push(world.t, lens, fwdV, toys.torch, 1);
  }
  const tip = new THREE.Vector3();
  wand.tip.getWorldPosition(tip);
  instance.sparkler?.update(world.t, tip, toys.sparkler && !onBike);
}

// The eight lamps nearest you light their surroundings. Switched lamps only
// light things once their switching-on has been seen.
function lampOn(l, eye) {
  if (!l.switched) return 1;
  const seen = world.t - (effects.delay ? l.pos.distanceTo(eye) / world.c : 0);
  return THREE.MathUtils.clamp((seen - shared.uLightsOn.value) / 0.2, 0, 1) * (1 - THREE.MathUtils.clamp((seen - shared.uLightsOff.value) / 0.2, 0, 1));
}
function pickLamps(lamps, eye) {
  const near = lamps.length > 8 ? [...lamps].sort((a, b) => a.pos.distanceToSquared(eye) - b.pos.distanceToSquared(eye)).slice(0, 8) : lamps;
  for (let i = 0; i < 8; i++) {
    const l = near[i];
    if (l) {
      shared.uLampPos.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.range);
      shared.uLampColor.value[i].copy(l.color).multiplyScalar(l.power * lampOn(l, eye));
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
  // The title screen covers everything: draw its models instead of the world.
  if (!menuEl.hidden) {
    menuModels.render(dTau);
    requestAnimationFrame(frame);
    return;
  }
  if (current) {
    // Behind the title screen the world keeps running so the menu has a live backdrop.
    const frozen = (paused || !help.hidden) && current.instance.started;
    const total = frozen ? 0 : dTau * warp * playback;
    const n = Math.max(1, Math.ceil(total / 0.05));
    for (let i = 0; i < n; i++) simulate(total / n, { realtime: i === n - 1 });
    if (!paused) {
      updateHud({
        player, instance: current.instance,
        locked: player.dragged || matchMedia("(pointer: coarse)").matches,
        prompt: current.instance.action?.(eye) ?? null,
      });
      writeHash(dTau);
      minimap.update(player, current.instance, dTau);
    }
  }
  adaptResolution(dTau);
  renderer.info.reset();
  if (current?.instance.bloomNow) Object.assign(bloom, current.instance.bloomNow);
  if (current) {
    renderShadow();
    renderMirror();
  }
  if (usePost) composer.render();
  else renderer.render(root, camera);
  requestAnimationFrame(frame);
}

// Open where the address says; otherwise on the title screen.
const fromHash = parseHash();
if (fromHash) restore(fromHash);
else openMenu();
frame();

// Handy for poking at the physics from the console.
window.pacetime = {
  player, world, effects, closeMenu, act, shared, bloom, throwBall, pickLamps,
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
