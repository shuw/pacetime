import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { reflScale, shared, skyMaterial } from "./shaders.js";
import { effects, viewDoppler, world } from "./relativity.js";

// Drawing a frame: the camera and scene, the sky, sun shadows, water
// reflections, bloom, lamps, the eye adapting to brightness, and resolution
// that drops when frames get slow.

const canvas = document.getElementById("view");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.info.autoReset = false;
// Things ahead appear up to several times farther away at speed, sky included.
export const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 12000);
export const root = new THREE.Scene();

export const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 128, 64), skyMaterial());
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

function renderShadow(place, eye) {
  const sun = shared.uSun.value;
  const on = place.shadows ? THREE.MathUtils.smoothstep(sun.y, -0.01, 0.06) : 0;
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

function renderMirror(place) {
  const y0 = place.mirrorY;
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
export const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.5, 0.8);
composer.addPass(bloom);
// A finishing grade: corners gently darkened, shadows nudged cool and
// highlights warm, and a little extra contrast.
export const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uWarm: { value: 0.04 }, uContrast: { value: 0.06 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uWarm, uContrast; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb += uWarm * mix(vec3(-0.6, -0.1, 0.8), vec3(0.8, 0.25, -0.6), smoothstep(0.05, 0.6, l)) * min(l, 1.0);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), uContrast * step(c.rgb, vec3(1.0)));
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

/** Sky and light for a place. @param {import("./place.js").Env} e */
export function applyEnv(e) {
  shared.uNight.value = e.night ?? 0;
  shared.uSpace.value = e.space ?? 0;
  shared.uStars.value = e.stars ?? 1;
  shared.uSunDisk.value = e.sunDisk ?? 1;
  shared.uMoon.value = 1;
  shared.uAurora.value = e.aurora ?? 0;
  shared.uClouds.value = e.clouds ?? 0;
  shared.uVaryOn.value = e.vary ?? 1;
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

export function applyPost(post) {
  bloom.enabled = !!post?.bloom;
  if (post?.bloom) Object.assign(bloom, post.bloom);
  Object.assign(grade.uniforms.uVignette, { value: post?.vignette ?? 0.32 });
  Object.assign(grade.uniforms.uWarm, { value: post?.warm ?? 0.04 });
}

// Draw the place as seen from eye: shadows and reflections first, then the view.
export function draw(place, eye) {
  renderer.info.reset();
  if (place) {
    if (place.bloomNow) Object.assign(bloom, place.bloomNow);
    renderShadow(place, eye);
    renderMirror(place);
  }
  composer.render();
}

// Compile a newly loaded place's shaders in the background, so its first
// frame doesn't stall (most noticeable on slower machines).
export function warmUp() {
  // Compile for where the scene is really drawn, the composer's buffer: a
  // shader for the screen is a different program, and every one would
  // compile again on the first frame.
  const was = renderer.getRenderTarget();
  renderer.setRenderTarget(composer.readBuffer);
  const done = renderer.compileAsync(root, camera);
  renderer.setRenderTarget(was);
  return done.catch(() => {});
}

export function resize() {
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
// Riding, the carriage around you fills the view, so it doesn't adapt.
const viewDir = new THREE.Vector3();
export function adaptExposure(dt, riding) {
  const b = shared.uBeta.value;
  camera.getWorldDirection(viewDir);
  let D = 1;
  if (b.lengthSq() > 1e-14) {
    const [, , g, omb] = shared.uObs.value.toArray();
    D = viewDoppler(g, omb, b.clone().normalize().sub(viewDir).lengthSq() / 2);
  }
  const k = shared.uGlowAmt.value;
  const Dg = k > 0.999 ? D : Math.exp(k * 1.5 * Math.tanh(Math.log(Math.max(D, 1e-4)) / 0.83));
  const brightAhead = k > 0.999 ? Dg ** -0.5 : Dg ** -2; // gentle: the eye adapts fully
  const target = effects.searchlight && !riding ? THREE.MathUtils.clamp(Dg < 1 ? Dg ** -1.2 : brightAhead, 0.3, 4) : 1;
  const u = shared.uExposure;
  u.value += (target - u.value) * Math.min(1, dt * 4);
}

// The eight lamps nearest you light their surroundings. Switched lamps only
// light things once their switching-on has been seen.
function lampOn(l, eye) {
  if (!l.switched) return 1;
  const seen = world.t - (effects.delay ? l.pos.distanceTo(eye) / world.c : 0);
  return THREE.MathUtils.clamp((seen - shared.uLightsOn.value) / 0.2, 0, 1) * (1 - THREE.MathUtils.clamp((seen - shared.uLightsOff.value) / 0.2, 0, 1));
}
export function pickLamps(lamps, eye) {
  // The eight that light up the most around you: big bright lamps beat small
  // glows that happen to be nearer, and lamps that are off don't count.
  const weight = (l) => (l.power * lampOn(l, eye) * l.range * l.range) / (l.pos.distanceToSquared(eye) + l.range * l.range);
  const near = lamps.length > 8 ? lamps.map((l) => [weight(l), l]).sort((a, b) => b[0] - a[0]).slice(0, 8).map((x) => x[1]) : lamps;
  for (let i = 0; i < 8; i++) {
    const l = near[i];
    if (l) {
      shared.uLampPos.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.range);
      shared.uLampColor.value[i].copy(l.color).multiplyScalar(l.power * lampOn(l, eye));
    } else shared.uLampColor.value[i].setRGB(0, 0, 0);
  }
}

// Frame timing, and lower resolution if frames are slow (raised again when
// there's room).
let frameTimes = [];
export function frameTick(now) {
  frameTimes.push(now);
  if (frameTimes.length > 120) frameTimes.shift();
}
export function fps() {
  const n = frameTimes.length - 1;
  return n > 0 ? (1000 * n) / (frameTimes[n] - frameTimes[0]) : 0;
}
const MAX_RATIO = Math.min(devicePixelRatio, 2);
let ratio = MAX_RATIO, slowFor = 0, fastFor = 0;
export const pixelRatio = () => ratio;
let adaptive = true;
export function setAdaptiveResolution(on) { adaptive = on; }
export function adaptResolution(dt) {
  if (!adaptive) return;
  const f = frameTimes.length > 31 ? fps() : 0;
  if (f && f < 42) { slowFor += dt; fastFor = 0; }
  else if (f > 57) { fastFor += dt; slowFor = 0; }
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
