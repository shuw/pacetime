import * as THREE from "three";
import { restCorrection } from "./relativity.js";

// Uniforms shared by every material, updated once per frame.
export const shared = {
  uCam: { value: new THREE.Vector3() },
  uBeta: { value: new THREE.Vector3() }, // observer velocity / c
  uFlags: { value: new THREE.Vector4(1, 1, 1, 0) }, // aberration, doppler, searchlight
  uCorr: { value: restCorrection() },
  uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
  uSky: { value: new THREE.Color(0.55, 0.65, 0.8) },
  uGround: { value: new THREE.Color(0.35, 0.3, 0.25) },
  uFog: { value: new THREE.Color(0.9, 0.85, 0.95) },
  uFogRange: { value: new THREE.Vector2(60, 220) },
  uSkyTop: { value: new THREE.Color("#6fb8ff") },
  uSkyHorizon: { value: new THREE.Color("#ffe3ef") },
  uNight: { value: 0 },
  uExposure: { value: 1 },
  uTime: { value: 0 },
};

const vertex = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uBeta;
uniform vec4 uFlags;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vTint;
varying float vDist;

void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  vNormalW = normalize(mat3(m) * normal);
  vWorld = wp.xyz;
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  #ifdef USE_COLOR
    vTint *= color;
  #endif

  // The light we see from this vertex left it at world time -|x| (c = 1 in
  // these units). Lorentz-boost that emission event into the observer's frame;
  // the boosted spatial part is where the vertex appears.
  vec3 x = wp.xyz - uCam;
  float d = max(length(x), 1e-4);
  vDist = d;
  vec3 P = x;
  float b = length(uBeta);
  if (b > 1e-5 && uFlags.x > 0.5) {
    float g = inversesqrt(1.0 - b * b);
    vec3 n = uBeta / b;
    P = x + n * ((g - 1.0) * dot(x, n)) + uBeta * (g * d);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(uCam + P, 1.0);
}
`;

const common = /* glsl */ `
uniform mat3 uCorr;
uniform vec4 uFlags;
uniform vec3 uBeta;
uniform float uExposure;
const vec3 EYE = vec3(610.0, 545.0, 465.0);

vec3 eye(float l, float a) { vec3 z = (vec3(l) - EYE) / 48.0; return a * exp(-z * z); }

vec3 erfApprox(vec3 x) { return tanh(x * (1.128 + 0.104 * x * x)); }

// The eye's response to a flat spectrum spanning l0..l1 nm.
vec3 eyeSpan(float l0, float l1, float a) {
  return a * 0.5 * (erfApprox((vec3(l1) - EYE) / 48.0) - erfApprox((vec3(l0) - EYE) / 48.0));
}

// Doppler factor for light reaching the observer from world offset x.
float doppler(vec3 x) {
  float b2 = dot(uBeta, uBeta);
  if (b2 < 1e-10) return 1.0;
  return inversesqrt(1.0 - b2) * (1.0 + dot(uBeta, normalize(x)));
}

// rgb plus broad infrared (760-4000 nm) and ultraviolet (100-400 nm) light,
// as seen with Doppler factor D: every wavelength gets divided by D.
vec3 spectralShift(vec3 rgb, float ir, float uv, float D) {
  if (uFlags.y < 0.5) D = 1.0;
  vec3 a = uCorr * rgb;
  float k = 1.0 / D;
  vec3 o = eye(610.0 * k, a.r) + eye(545.0 * k, a.g) + eye(465.0 * k, a.b)
         + eyeSpan(760.0 * k, 4000.0 * k, 0.4 * ir)
         + eyeSpan(100.0 * k, 400.0 * k, 0.4 * uv);
  return max(o, 0.0);
}

// Brighter ahead, dimmer behind; uExposure is the eye adapting to it.
vec3 searchlight(vec3 c, float D) {
  if (uFlags.z < 0.5) return c;
  return c * D * D * uExposure;
}

vec3 softClip(vec3 c) {
  float m = max(c.r, max(c.g, c.b));
  if (m > 0.8) c *= (0.8 + 0.2 * tanh((m - 0.8) / 0.2)) / m;
  return mix(c, vec3(1.0), smoothstep(1.2, 8.0, m) * 0.7);
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSpec; // infrared, ultraviolet, emissive
uniform float uOpacity;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uFog;
uniform vec2 uFogRange;
uniform vec3 uCheckerB;
uniform float uCheckerSize;
uniform float uNight;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vTint;
varying float vDist;
uniform vec3 uCam;
${common}

void main() {
  float D = doppler(vWorld - uCam);
  vec3 base = uColor * vTint;
  #ifdef CHECKER
    vec2 cell = floor(vWorld.xz / uCheckerSize);
    if (mod(cell.x + cell.y, 2.0) > 0.5) base = uCheckerB;
  #endif
  vec3 N = normalize(vNormalW);
  #ifdef DOUBLE_SIDED
    if (!gl_FrontFacing) N = -N;
  #endif
  float ndl = max(dot(N, uSun), 0.0);
  vec3 light = mix(uGround, uSky, N.y * 0.5 + 0.5) + uSunColor * ndl;
  float lum = dot(light, vec3(0.33));
  float e = uSpec.z;
  vec3 rgb = base * mix(light, vec3(1.6), e);
  float ir = uSpec.x * mix(lum, 1.6, e);
  float uv = uSpec.y * mix(lum, 1.6, e);

  float f = smoothstep(uFogRange.x, uFogRange.y, vDist);
  rgb = mix(rgb, uFog, f);
  ir = mix(ir, 0.3 * (1.0 - uNight), f);
  uv = mix(uv, 0.4 * (1.0 - uNight), f);

  vec3 col = searchlight(spectralShift(rgb, ir, uv, D), D);
  gl_FragColor = vec4(softClip(col), uOpacity);
  #include <colorspace_fragment>
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uNight;
varying vec3 vWorld;
${common}

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main() {
  vec3 dir = normalize(vWorld - uCam);
  float D = doppler(dir);
  float h = clamp(dir.y, -0.2, 1.0);
  vec3 rgb = mix(uSkyHorizon, uSkyTop, pow(max(h, 0.0), 0.6));
  float uv = mix(0.5, 1.1, max(h, 0.0)) * (1.0 - uNight);
  float sun = smoothstep(0.9975, 0.999, dot(dir, uSun));
  rgb += vec3(2.5, 2.2, 1.6) * sun * (1.0 - uNight);
  float ir = 0.3 * (1.0 - uNight) + 0.03 + 2.0 * sun;
  if (uNight > 0.5) {
    vec3 cell = floor(dir * 180.0);
    float s = hash(cell);
    float star = step(0.9965, s) * smoothstep(0.0, 0.3, h);
    rgb += vec3(1.0, 0.95, 0.9) * star * (0.6 + 2.0 * fract(s * 91.0));
    ir += star * 0.8;
    uv += star * 0.8;
    float moon = smoothstep(0.9990, 0.9994, dot(dir, uSun));
    rgb += vec3(1.6, 1.6, 1.4) * moon;
  }
  vec3 col = searchlight(spectralShift(rgb, ir, uv, D), D);
  gl_FragColor = vec4(softClip(col), 1.0);
  #include <colorspace_fragment>
}
`;

const cache = new Map();

// color: css color; ir/uv: how strongly the surface sends out light just
// beyond either end of the rainbow; emissive: 0..1 self-lit.
export function mat({
  color = "#ffffff",
  ir = 0.25,
  uv = 0.12,
  emissive = 0,
  opacity = 1,
  additive = false,
  checker = null,
  doubleSided = false,
  unique = false,
  vertexColors = false,
} = {}) {
  const key = JSON.stringify(arguments[0] ?? {});
  if (cache.has(key)) return cache.get(key);
  const defines = {};
  if (checker) defines.CHECKER = "";
  if (doubleSided) defines.DOUBLE_SIDED = "";
  const m = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    defines,
    vertexColors,
    uniforms: {
      ...shared,
      uColor: { value: new THREE.Color(color) },
      uSpec: { value: new THREE.Vector3(ir, uv, emissive) },
      uOpacity: { value: opacity },
      uCheckerB: { value: new THREE.Color(checker?.b ?? "#000") },
      uCheckerSize: { value: checker?.size ?? 1 },
    },
    transparent: opacity < 1 || additive,
    depthWrite: !additive && opacity >= 1,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (!unique) cache.set(key, m);
  return m;
}

// A private (uncached) material whose uniforms a prop can animate.
export function liveMat(opts) {
  return mat({ ...opts, unique: true });
}

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: skyFragment,
    uniforms: shared,
    side: THREE.BackSide,
    depthWrite: false,
  });
}
