import * as THREE from "three";
import { Player } from "./player.js";
import { shared, skyMaterial } from "./shaders.js";
import { effects, world } from "./relativity.js";
import { initLab, showScene, toast, toggleLab, updateHud } from "./hud.js";
import { unlockAudio } from "./audio.js";
import meadow from "./scenes/meadow.js";
import choir from "./scenes/choir.js";
import garden from "./scenes/garden.js";
import tea from "./scenes/tea.js";
import { PREVIEWS } from "./styles.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const SCENES = [meadow, choir, garden, tea];
const DAY = {
  night: 0,
  sun: [0.4, 0.8, 0.3],
  sunColor: [1.0, 0.95, 0.85],
  sky: [0.55, 0.62, 0.78],
  ground: [0.38, 0.32, 0.28],
  fog: "#f6ecf6",
  fogRange: [60, 220],
  skyTop: "#6fb8ff",
  skyHorizon: "#ffe3ef",
};

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// Objects ahead appear up to ~6x farther away at full sprint, sky included.
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 12000);
const root = new THREE.Scene();

const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 96, 48), skyMaterial());
sky.frustumCulled = false;
sky.renderOrder = -1;
root.add(sky);

const player = new Player(canvas);
let current = null; // { scene, instance }
let paused = true;
const stars = JSON.parse(localStorageGet("pacetime-stars") ?? "{}");

function localStorageGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localStorageSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

function applyEnv(env) {
  const e = { ...DAY, ...env };
  shared.uNight.value = e.night;
  shared.uSpace.value = e.space ?? 0;
  shared.uSun.value.set(...e.sun).normalize();
  shared.uSunColor.value.setRGB(...e.sunColor);
  shared.uSky.value.setRGB(...e.sky);
  shared.uGround.value.setRGB(...e.ground);
  shared.uFog.value.set(e.fog);
  shared.uFogRange.value.set(...e.fogRange);
  shared.uSkyTop.value.set(e.skyTop);
  shared.uSkyHorizon.value.set(e.skyHorizon);
  document.body.style.background = e.night ? "#120e26" : "#fbe9f2";
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(root, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.5, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let usePost = false;

function applyPost(post) {
  usePost = !!post?.bloom;
  if (usePost) Object.assign(bloom, post.bloom);
}

function load(scene) {
  if (current) root.remove(current.instance.group);
  const instance = scene.build();
  instance.toast = toast;
  root.add(instance.group);
  current = { scene, instance };
  applyEnv(instance.env);
  applyPost(instance.post);
  const [x, z, yaw] = instance.spawn;
  player.place(x, z, yaw ?? 0);
  player.tau = 0;
  world.t = 0;
  showScene(scene, instance);
  localStorageSet("pacetime-last", scene.id);
}

function buildMenu() {
  document.getElementById("scene-cards").innerHTML = SCENES.map((s) => `
    <button class="scene-card" data-id="${s.id}">
      <span class="icon">${s.icon}</span>
      <h3>${s.title}</h3>
      <p>${s.blurb}</p>
      <span class="stars">${stars[s.id] ? "★ all goals found" : ""}</span>
    </button>`).join("");
}

function openMenu() {
  paused = true;
  player.enabled = false;
  buildMenu();
  const menu = document.getElementById("menu");
  menu.hidden = false;
  menu.classList.toggle("overlay", !!current);
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
  if (current?.scene !== scene) load(scene);
  closeMenu();
  if (matchMedia("(pointer: fine)").matches) canvas.requestPointerLock?.();
});

document.getElementById("menu-btn").addEventListener("click", openMenu);
const back = document.getElementById("back-btn");
back.addEventListener("touchstart", (e) => { player.lookBack = true; e.preventDefault(); });
back.addEventListener("touchend", () => (player.lookBack = false));
canvas.addEventListener("click", () => {
  if (!paused && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
addEventListener("keydown", (e) => {
  if (e.code === "KeyM" || (e.code === "Escape" && current && document.getElementById("menu").hidden)) openMenu();
  else if (e.code === "Escape" && current) closeMenu();
  else if (e.code === "KeyL") toggleLab();
  else if (e.code === "KeyR" && current && !paused) load(current.scene);
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

// The eye adapts to the brightness of whatever is in the middle of the view,
// so the searchlight effect brightens and dims without blinding or blacking out.
const viewDir = new THREE.Vector3();
function adaptExposure(dt) {
  const b = shared.uBeta.value;
  const beta2 = b.lengthSq();
  camera.getWorldDirection(viewDir);
  const D = beta2 > 1e-10 ? 1 / (Math.sqrt(1 / (1 - beta2)) * (1 - b.dot(viewDir))) : 1;
  const target = effects.searchlight ? THREE.MathUtils.clamp(D ** -1.4, 0.15, 12) : 1;
  const u = shared.uExposure;
  u.value += (target - u.value) * Math.min(1, dt * 4);
}

const clock = new THREE.Clock();
const eye = new THREE.Vector3();
let wasComplete = false;

function frame() {
  const dTau = Math.min(clock.getDelta(), 0.05);
  if (current) {
    const { instance, scene } = current;
    const step = paused ? 0 : dTau;
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
    updateHud({ player, instance, dTau: step, locked: document.pointerLockElement === canvas || matchMedia("(pointer: coarse)").matches });

    const complete = instance.goals?.length > 0 && instance.goals.every((g) => g.done);
    if (complete && !wasComplete && !stars[scene.id]) {
      stars[scene.id] = true;
      localStorageSet("pacetime-stars", JSON.stringify(stars));
      setTimeout(() => toast(`★ ${scene.title} complete! Try another scene from the map (M).`, 6), 4000);
    }
    wasComplete = complete;
  }
  if (usePost) composer.render();
  else renderer.render(root, camera);
  requestAnimationFrame(frame);
}

// Start straight into a scene behind the title card so the menu has a live backdrop.
load(SCENES.find((s) => s.id === localStorageGet("pacetime-last")) ?? meadow);
openMenu();
document.getElementById("menu").classList.remove("overlay");
frame();

// Handy for poking at the physics from the console.
window.pacetime = {
  player, world, effects, closeMenu,
  load: (id) => load([...SCENES, ...PREVIEWS].find((s) => s.id === id)),
};
