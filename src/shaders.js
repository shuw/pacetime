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
  uSpace: { value: 0 },
  uExposure: { value: 1 },
  uGrain: { value: 0 },
  uTime: { value: 0 },
  uC: { value: 3 },
  uDelay: { value: 1 },
  uContract: { value: 1 },
};

const vertex = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uBeta;
uniform vec4 uFlags;
#ifdef MOVER
uniform vec3 uVel;    // m/s, world frame
uniform vec3 uAnchor; // where the object's origin is at world time 0
uniform vec2 uLife;   // world times between which the object exists
uniform float uC;
uniform float uTime;
uniform float uDelay;
uniform float uContract;
#endif
#ifdef WAKE
attribute float aBirth;
uniform float uC;
uniform float uTime;
uniform float uDelay;
varying float vAge;
#endif
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
  #ifdef MOVER
    // Moving objects are built around the origin. Squash them along their
    // motion (Lorentz contraction), then find where this vertex was when the
    // light reaching the observer now left it: |w - u*tau| = c*tau.
    vec3 rel = wp.xyz;
    float u2 = dot(uVel, uVel);
    if (u2 > 1e-8 && uContract > 0.5) {
      vec3 un = uVel * inversesqrt(u2);
      rel -= un * dot(rel, un) * (1.0 - sqrt(1.0 - u2 / (uC * uC)));
    }
    vec3 w = uAnchor + rel + uVel * uTime - uCam;
    float tau = 0.0;
    if (uDelay > 0.5) {
      float a = max(uC * uC - u2, 1e-6);
      float wu = dot(w, uVel);
      tau = (-wu + sqrt(wu * wu + a * dot(w, w))) / a;
    }
    wp.xyz = w - uVel * tau + uCam;
    float te = uTime - tau;
    if (te < uLife.x || te > uLife.y) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  #endif
  #ifdef UNLIT
    vNormalW = vec3(0.0, 1.0, 0.0);
  #else
    vNormalW = normalize(mat3(m) * normal);
  #endif
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
  #ifdef WAKE
    // How long ago, as seen from here, this bit of trail was laid down.
    vAge = uTime - (uDelay > 0.5 ? d / uC : 0.0) - aBirth;
  #endif
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

// rgb plus infrared and ultraviolet light that tails off away from the
// visible (roughly like sunlight), as seen with Doppler factor D: every
// wavelength gets divided by D.
vec3 spectralShift(vec3 rgb, float ir, float uv, float D) {
  if (uFlags.y < 0.5) D = 1.0;
  vec3 a = uCorr * rgb;
  float k = 1.0 / D;
  vec3 o = eye(610.0 * k, a.r) + eye(545.0 * k, a.g) + eye(465.0 * k, a.b)
         + eyeSpan(760.0 * k, 1100.0 * k, 0.5 * ir)
         + eyeSpan(1100.0 * k, 1800.0 * k, 0.22 * ir)
         + eyeSpan(1800.0 * k, 3200.0 * k, 0.08 * ir)
         + eyeSpan(330.0 * k, 400.0 * k, 0.6 * uv)
         + eyeSpan(250.0 * k, 330.0 * k, 0.25 * uv)
         + eyeSpan(120.0 * k, 250.0 * k, 0.06 * uv);
  return max(o, 0.0);
}

// Brighter ahead, dimmer behind; uExposure is the eye adapting to it.
vec3 searchlight(vec3 c, float D) {
  if (uFlags.z < 0.5) return c;
  return c * D * D * uExposure;
}

uniform float uGrain;
vec3 softClip(vec3 c) {
  c *= 1.0 - uGrain * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
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
uniform float uTime;
uniform float uC;
uniform float uDelay;
#if defined(MOVER) || defined(SOURCE_VEL)
uniform vec3 uVel;
#endif
uniform vec3 uGridColor;
uniform vec3 uGrid; // spacing, line width in pixels, glow
#ifdef FLASHES
uniform vec4 uFlash[6];      // xyz where, w world time when
uniform vec3 uFlashColor[6];
#endif
#ifdef BEAM
uniform vec4 uBeam;          // origin x, direction (+1/-1), period, first pulse time
uniform vec3 uBeamColor;
#endif
#ifdef CLIP_RECT
uniform vec4 uRect;          // min x, min z, max x, max z
#endif
#ifdef WAKE
uniform float uWakeFade;
varying float vAge;
#endif
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vTint;
varying float vDist;
uniform vec3 uCam;
${common}

void main() {
  #ifdef CLIP_RECT
    if (vWorld.x < uRect.x || vWorld.z < uRect.y || vWorld.x > uRect.z || vWorld.z > uRect.w) discard;
  #endif
  #ifdef WAKE
    if (vAge < 0.0) discard;
  #endif
  float D = doppler(vWorld - uCam);
  #if defined(MOVER) || defined(SOURCE_VEL)
    vec3 bs = uVel / uC;
    D /= inversesqrt(max(1e-6, 1.0 - dot(bs, bs))) * (1.0 + dot(bs, normalize(vWorld - uCam)));
  #endif
  vec3 base = uColor * vTint;
  float e = uSpec.z;
  #ifdef CHECKER
    vec2 cell = floor(vWorld.xz / uCheckerSize);
    if (mod(cell.x + cell.y, 2.0) > 0.5) base = uCheckerB;
  #endif
  #ifdef GRID
    vec2 gc = vWorld.xz / uGrid.x;
    vec2 gd = abs(fract(gc - 0.5) - 0.5) / fwidth(gc);
    float line = 1.0 - min(min(gd.x, gd.y) / uGrid.y, 1.0);
    base = mix(base, uGridColor, line);
    e = mix(e, uGrid.z, line);
  #endif
  vec3 N = normalize(vNormalW);
  #ifdef DOUBLE_SIDED
    if (!gl_FrontFacing) N = -N;
  #endif
  float ndl = max(dot(N, uSun), 0.0);
  #ifdef TOON
    ndl = smoothstep(0.05, 0.12, ndl) * 0.85 + smoothstep(0.55, 0.62, ndl) * 0.15;
  #endif
  vec3 light = mix(uGround, uSky, N.y * 0.5 + 0.5) + uSunColor * ndl;
  #ifdef UNLIT
    light = vec3(1.0);
  #endif
  float lum = dot(light, vec3(0.33));
  vec3 rgb = base * mix(light, vec3(1.6), e);
  float ir = uSpec.x * mix(lum, 1.6, e);
  float uv = uSpec.y * mix(lum, 1.6, e);

  #ifdef FLASHES
    // A flash lights each bit of floor as its wavefront passes; that glow then
    // has to travel on to us. The bright band we see is an ellipse with the
    // flash and our eye at its foci.
    for (int i = 0; i < 6; i++) {
      float age = uTime - uFlash[i].w;
      if (age > 0.0 && age < 80.0) {
        float k = (distance(vWorld, uFlash[i].xyz) + (uDelay > 0.5 ? distance(vWorld, uCam) : 0.0)) / uC;
        float z = (age - k) * uC / 0.3;
        float band = exp(-z * z) * (1.0 / (1.0 + age * 0.12));
        rgb += uFlashColor[i] * band * 1.1;
        ir += band * 0.3;
        uv += band * 0.3;
      }
    }
  #endif
  #ifdef BEAM
    // Dust along the beam line glows briefly as each pulse passes.
    {
      float s = (vWorld.x - uBeam.x) * uBeam.y;
      float seen = uTime - (uDelay > 0.5 ? vDist / uC : 0.0);
      float since = seen - uBeam.w - max(s, 0.0) / uC;
      float age = mod(since, uBeam.z);
      float glow = since > 0.0 && s > -0.5 ? exp(-age * 5.0) * 3.0 + exp(-age * 0.8) * 0.15 : 0.0;
      rgb += uBeamColor * glow;
      ir += glow * 0.4;
      uv += glow * 0.4;
    }
  #endif
  float f = smoothstep(uFogRange.x, uFogRange.y, vDist);
  rgb = mix(rgb, uFog, f);
  ir = mix(ir, 0.3 * (1.0 - uNight), f);
  uv = mix(uv, 0.4 * (1.0 - uNight), f);

  vec3 col = searchlight(spectralShift(rgb, ir, uv, D), D);
  float alpha = uOpacity;
  #ifdef WAKE
    alpha *= exp(-vAge / uWakeFade);
  #endif
  gl_FragColor = vec4(softClip(col), alpha);
  #include <colorspace_fragment>
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uNight;
uniform float uSpace;
varying vec3 vWorld;
${common}

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main() {
  vec3 dir = normalize(vWorld - uCam);
  float D = doppler(dir);
  float h = clamp(dir.y, -0.2, 1.0);
  vec3 rgb = mix(uSkyHorizon, uSkyTop, pow(max(h, 0.0), 0.6));
  float uv = mix(0.5, 1.1, max(h, 0.0)) * (1.0 - uNight);
  float sun = smoothstep(0.9975, 0.999, dot(dir, uSun)) * (1.0 - uSpace);
  rgb += vec3(2.5, 2.2, 1.6) * sun * (1.0 - uNight);
  float ir = 0.3 * (1.0 - uNight) + 0.03 + 2.0 * sun;
  if (uSpace > 0.5) {
    // Deep space: no horizon, a faint galactic band, stars in every direction.
    vec3 gal = normalize(vec3(0.3, 0.9, -0.3));
    float band = exp(-pow(dot(dir, gal) / 0.18, 2.0));
    rgb = vec3(0.004, 0.005, 0.012) + vec3(0.05, 0.045, 0.06) * band;
    uv = 0.05 * band;
    ir = 0.08 * band;
    // Stars have broad spectra, so as you speed up they crowd ahead into a
    // ring (the starbow) before shifting out of sight at its center.
    for (int i = 0; i < 3; i++) {
      float scale = i == 0 ? 160.0 : (i == 1 ? 340.0 : 700.0);
      vec3 cell = floor(dir * scale);
      float s = hash(cell + float(i) * 17.0);
      vec3 f = fract(dir * scale) - 0.5;
      float density = i == 0 ? 0.985 : (i == 1 ? 0.975 : 0.96) - 0.03 * band;
      float star = step(density, s) * smoothstep(0.42, 0.0, length(f));
      float temp = fract(s * 113.0);
      vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.72, 0.86, 1.25), temp);
      float bright = i == 0 ? 4.0 : (i == 1 ? 2.2 : 1.4);
      rgb += tint * star * bright;
      ir += star * bright * (1.4 - temp);
      uv += star * bright * (0.3 + temp);
    }
    float sunDisk = smoothstep(0.9992, 0.9996, dot(dir, uSun));
    rgb += vec3(6.0, 5.5, 5.0) * sunDisk;
    ir += 4.0 * sunDisk;
    uv += 3.0 * sunDisk;
  } else if (uNight > 0.5) {
    vec3 cell = floor(dir * 300.0);
    float s = hash(cell);
    float star = step(0.996, s) * smoothstep(0.0, 0.3, h) * smoothstep(0.4, 0.1, length(fract(dir * 300.0) - 0.5));
    rgb += vec3(1.0, 0.95, 0.9) * star * (0.6 + 2.0 * fract(s * 91.0));
    ir += star * 0.8;
    uv += star * 0.8;
    float moon = smoothstep(0.99965, 0.99975, dot(dir, uSun));
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
  grid = null,
  toon = false,
  unlit = false,
  doubleSided = false,
  unique = false,
  mover = null,
  flashes = null,
  beam = null,
  rect = null,
  wake = 0,
  sourceVel = null, // colors only: the velocity of something placed by hand at its seen position
  vertexColors = false,
} = {}) {
  const key = JSON.stringify(arguments[0] ?? {});
  const special = mover || flashes || beam || wake || sourceVel;
  if (!special && cache.has(key)) return cache.get(key);
  const defines = {};
  if (checker) defines.CHECKER = "";
  if (grid) defines.GRID = "";
  if (toon) defines.TOON = "";
  if (unlit) defines.UNLIT = "";
  if (mover) defines.MOVER = "";
  if (flashes) defines.FLASHES = "";
  if (beam) defines.BEAM = "";
  if (rect) defines.CLIP_RECT = "";
  if (wake) defines.WAKE = "";
  if (sourceVel) defines.SOURCE_VEL = "";
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
      uGridColor: { value: new THREE.Color(grid?.color ?? "#fff") },
      uGrid: { value: new THREE.Vector3(grid?.spacing ?? 4, grid?.width ?? 1, grid?.glow ?? 0) },
      ...(mover && { uVel: mover.uVel, uAnchor: mover.uAnchor, uLife: mover.uLife ?? { value: new THREE.Vector2(-1e9, 1e9) } }),
      ...(flashes && { uFlash: flashes.uFlash, uFlashColor: flashes.uFlashColor }),
      ...(beam && { uBeam: beam.uBeam, uBeamColor: beam.uBeamColor }),
      ...(rect && { uRect: { value: new THREE.Vector4(...rect) } }),
      ...(wake && { uWakeFade: { value: wake } }),
      ...(sourceVel && { uVel: sourceVel }),
    },
    transparent: opacity < 1 || additive,
    depthWrite: !additive && opacity >= 1,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (!unique && !special) cache.set(key, m);
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
