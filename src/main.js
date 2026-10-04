import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Player } from "./player.js";
import { shared, skyMaterial } from "./shaders.js";
import { effects, world } from "./relativity.js";
import { initLab, showScene, syncLab, toast, toggleLab, updateHud } from "./hud.js";
import { unlockAudio } from "./audio.js";
import simultaneity from "./scenes/simultaneity.js";
import tunnel from "./scenes/tunnel.js";
import beam from "./scenes/beam.js";
import lightclock from "./scenes/lightclock.js";

const SCENES = [simultaneity, tunnel, lightclock, beam];

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const done = JSON.parse(store.get("pacetime-done") ?? "{}");

function applyEnv(e) {
  shared.uNight.value = e.night ?? 0;
  shared.uSpace.value = e.space ?? 0;
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
  root.add(instance.group);
  current = { scene, instance };
  applyEnv(instance.env);
  applyPost(instance.post);
  const [x, z, yaw] = instance.spawn;
  player.place(x, z, yaw ?? 0);
  showScene(scene, SCENES.indexOf(scene));
  syncLab();
  store.set("pacetime-last", scene.id);
}

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

document.getElementById("scene-cards").addEventListener("click", (e) => {
  const card = e.target.closest(".scene-card");
  if (!card) return;
  unlockAudio();
  const scene = SCENES.find((s) => s.id === card.dataset.id);
  if (current?.scene !== scene || current.instance.started) load(scene);
  current.instance.started = true;
  closeMenu();
  if (matchMedia("(pointer: fine)").matches) canvas.requestPointerLock?.();
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
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const menuOpen = !document.getElementById("menu").hidden;
  if (e.code === "KeyM") menuOpen && current?.instance.started ? closeMenu() : openMenu();
  else if (e.code === "Escape" && menuOpen && current?.instance.started) closeMenu();
  else if (menuOpen) return;
  else if (e.code === "KeyL") toggleLab();
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
let wasComplete = false;

function frame() {
  const now = performance.now();
  const dTau = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (current) {
    const { instance, scene } = current;
    // Behind the title screen the world keeps running so the menu has a live backdrop.
    const step = paused && instance.started ? 0 : dTau;
    const dT = player.update(step, instance);
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
    adaptExposure(step);
    sky.position.copy(eye);

    instance.update({ player, eye, camera, t: world.t, dT, dTau: step });
    instance.group.traverse((c) => { if (c.follow) c.position.set(eye.x, 0, eye.z); });

    if (!paused) {
      updateHud({
        player, instance,
        locked: document.pointerLockElement === canvas || matchMedia("(pointer: coarse)").matches,
        prompt: instance.action?.(eye) ?? null,
      });
      const complete = instance.goals?.length > 0 && instance.goals.every((g) => g.done);
      if (complete && !wasComplete && !done[scene.id]) {
        done[scene.id] = true;
        store.set("pacetime-done", JSON.stringify(done));
        setTimeout(() => toast(`${scene.title}: all observations made. Open Experiments (M) for the next one.`, 7), 9000);
      }
      wasComplete = complete;
    }
  }
  if (usePost) composer.render();
  else renderer.render(root, camera);
  requestAnimationFrame(frame);
}

// A live scene runs behind the title screen.
load(SCENES.find((s) => s.id === store.get("pacetime-last")) ?? simultaneity);
openMenu();
frame();

// Handy for poking at the physics from the console.
window.pacetime = {
  player, world, effects, closeMenu, act,
  get instance() { return current?.instance; },
  load: (id) => { load(SCENES.find((s) => s.id === id)); current.instance.started = true; },
};
