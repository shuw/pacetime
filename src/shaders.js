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
  uStars: { value: 1 },
  uLampPos: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -1000, 0, 1)) },
  uLampColor: { value: Array.from({ length: 8 }, () => new THREE.Color(0, 0, 0)) },
  uPointScale: { value: 600 },
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
#ifdef ROTOR
uniform vec3 uRotCenter;  // a point on the axis
uniform vec3 uRotAxis;    // unit axis
uniform float uOmega;     // rad/s, world frame
uniform vec4 uPivot;      // xyz pivot; w = 1 to orbit without turning (gondolas)
uniform float uC;
uniform float uTime;
uniform float uDelay;
varying vec3 vSrcVel;
vec3 rotateAbout(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
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
  #ifdef ROTOR
    // Spinning things are built in their pose at world time 0. Find the world
    // time whose light reaches us now (Newton's method on |p(t) - eye| = c (T - t)),
    // and draw the vertex where it was then.
    vec3 r0 = (uPivot.w > 0.5 ? uPivot.xyz : wp.xyz) - uRotCenter;
    vec3 offset = uPivot.w > 0.5 ? wp.xyz - uPivot.xyz : vec3(0.0);
    float tau = 0.0;
    vec3 pr = rotateAbout(r0, uRotAxis, uOmega * uTime);
    if (uDelay > 0.5) {
      tau = length(uRotCenter + pr + offset - uCam) / uC;
      for (int i = 0; i < 5; i++) {
        vec3 ri = rotateAbout(r0, uRotAxis, uOmega * (uTime - tau));
        vec3 q = uRotCenter + ri + offset - uCam;
        float dq = length(q);
        vec3 vel = uOmega * cross(uRotAxis, ri);
        float f = dq - uC * tau;
        float df = -dot(vel, q) / max(dq, 1e-4) - uC;
        tau = max(0.0, tau - f / df);
      }
      pr = rotateAbout(r0, uRotAxis, uOmega * (uTime - tau));
    }
    vSrcVel = uOmega * cross(uRotAxis, pr);
    if (uPivot.w < 0.5) {
      // Turn the normal with the body.
      wp.xyz = uRotCenter + pr;
    } else {
      wp.xyz = uRotCenter + pr + offset;
    }
  #endif
  #ifdef UNLIT
    vNormalW = vec3(0.0, 1.0, 0.0);
  #else
    vNormalW = normalize(mat3(m) * normal);
    #ifdef ROTOR
      if (uPivot.w < 0.5) vNormalW = rotateAbout(vNormalW, uRotAxis, uOmega * (uTime - tau));
    #endif
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
uniform vec4 uLampPos[8];   // xyz, range
uniform vec3 uLampColor[8];
#ifdef ROTOR
varying vec3 vSrcVel;
#endif
#ifdef WATER
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uWave;
#endif
#ifdef SNOW
float snowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snowNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(snowHash(i), snowHash(i + vec2(1, 0)), f.x), mix(snowHash(i + vec2(0, 1)), snowHash(i + vec2(1, 1)), f.x), f.y);
}
#endif
#ifdef WINDOWS
uniform vec4 uWindows;  // cell width, cell height, fraction lit, seed
uniform vec3 uWindowColor;
#endif
#ifdef SPIRAL
uniform vec4 uSpiral;   // lamp x, lamp z, angular speed, beam half-width (rad)
uniform vec3 uSpiralColor;
#endif
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
  #ifdef ROTOR
    vec3 bsr = vSrcVel / uC;
    D /= inversesqrt(max(1e-6, 1.0 - dot(bsr, bsr))) * (1.0 + dot(bsr, normalize(vWorld - uCam)));
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
  // Nearby lamps.
  for (int i = 0; i < 8; i++) {
    vec3 L = uLampPos[i].xyz - vWorld;
    float d2 = dot(L, L), r = uLampPos[i].w;
    float fall = r * r / (r * r + d2 * 1.6) * (1.0 - smoothstep(r * 2.0, r * 3.0, sqrt(d2)));
    light += uLampColor[i] * fall * (0.35 + 0.65 * max(dot(N, L * inversesqrt(max(d2, 1e-4))), 0.0));
  }
  #ifdef UNLIT
    light = vec3(1.0);
  #endif
  float lum = dot(light, vec3(0.33));
  vec3 rgb = base * mix(light, vec3(1.6), e);
  float ir = uSpec.x * mix(lum, 1.6, e);
  float uv = uSpec.y * mix(lum, 1.6, e);

  #ifdef WATER
    // Gentle swell, and the sky reflected more strongly at grazing angles.
    {
      vec2 q = vWorld.xz;
      float t = uTime;
      vec3 n = normalize(vec3(
        uWave * (0.05 * sin(q.x * 0.35 + t * 0.9) + 0.03 * sin(q.x * 0.9 - q.y * 0.6 + t * 1.7) + 0.02 * sin(q.y * 1.7 + t * 2.3)),
        1.0,
        uWave * (0.05 * sin(q.y * 0.4 - t * 0.8) + 0.03 * sin(q.y * 1.1 + q.x * 0.5 + t * 1.3) + 0.02 * sin(q.x * 1.9 - t * 2.1))));
      vec3 view = normalize(vWorld - uCam);
      vec3 r = reflect(view, n);
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-view, n), 0.0), 5.0);
      vec3 skyc = mix(uSkyHorizon, uSkyTop, pow(max(r.y, 0.0), 0.6));
      float glint = pow(max(dot(r, uSun), 0.0), 300.0) * (1.0 - uNight);
      rgb = mix(base * (uSky * 0.6 + 0.1), skyc, fres) + uSunColor * glint * 4.0;
      ir = 0.15 + glint * 3.0;
      uv = 0.2 * fres;
    }
  #endif
  #ifdef SNOW
    // Soft drifts, and crystals that glint as you move.
    {
      vec2 q = vWorld.xz;
      float drift = snowNoise(q * 0.08) * 0.6 + snowNoise(q * 0.31) * 0.3 + snowNoise(q * 1.7) * 0.1;
      rgb *= 0.82 + 0.3 * drift;
      vec2 cell = floor(q * 3.0);
      float h = snowHash(cell);
      vec3 view = normalize(vWorld - uCam);
      float glint = step(0.985, h) * pow(max(0.0, sin(dot(view, vec3(h * 40.0, 17.0, h * 31.0)) * 6.0)), 24.0);
      glint *= smoothstep(0.42, 0.0, length(fract(q * 3.0) - 0.5)) * smoothstep(30.0, 4.0, vDist);
      rgb += vec3(1.2, 1.25, 1.4) * glint;
      uv += glint;
    }
  #endif
  #ifdef WINDOWS
    // A grid of windows on the wall, some lit, some dark.
    {
      vec2 wc = vec2(dot(vWorld.xz, vec2(abs(N.z), abs(N.x))), vWorld.y) / uWindows.xy;
      vec2 cell = floor(wc);
      vec2 f = fract(wc);
      float inside = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78) * step(0.5, abs(N.y) < 0.5 ? 1.0 : 0.0);
      float h = fract(sin(dot(cell + uWindows.w, vec2(41.3, 289.1))) * 43758.5);
      float lit = step(1.0 - uWindows.z, h) * inside;
      rgb = mix(rgb, uWindowColor * (0.25 + 0.45 * fract(h * 7.0)), lit);
      rgb = mix(rgb, rgb * 0.35, inside * (1.0 - lit));
      ir += lit * 0.3;
    }
  #endif

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
  #ifdef SPIRAL
    // Mist around a lighthouse glows where the turning beam's light passes.
    // Light leaving the lamp at te reaches this spot at te + r/c, then needs
    // vDist/c more to reach us, so the lit band is a spiral that unwinds outward.
    {
      vec2 d = vWorld.xz - uSpiral.xy;
      float r = length(d);
      float seen = uTime - (uDelay > 0.5 ? vDist / uC : 0.0);
      float te = seen - (uDelay > 0.5 ? r / uC : 0.0);
      float dAng = mod(uSpiral.z * te - atan(d.y, d.x) + 3.14159, 6.28318) - 3.14159;
      float glow = exp(-pow(dAng / uSpiral.w, 2.0)) * smoothstep(1.5, 6.0, r) / (1.0 + r * 0.025);
      rgb += uSpiralColor * glow * 0.7;
      ir += glow * 0.4;
      uv += glow * 0.4;
    }
  #endif
  float f = smoothstep(uFogRange.x, uFogRange.y, vDist);
  #ifdef ADDITIVE
    // Glows add to what's behind them, so haze just dims them.
    rgb *= 1.0 - f;
    ir *= 1.0 - f;
    uv *= 1.0 - f;
  #else
    rgb = mix(rgb, uFog, f);
    ir = mix(ir, 0.3 * (1.0 - uNight), f);
    uv = mix(uv, 0.4 * (1.0 - uNight), f);
  #endif

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
uniform float uStars;
varying vec3 vWorld;
${common}

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main() {
  vec3 dir = normalize(vWorld - uCam);
  float D = doppler(dir);
  float h = clamp(dir.y, -0.2, 1.0);
  // The warm horizon band hugs the horizon and is strongest toward the sun.
  vec2 across = dir.xz / max(length(dir.xz), 1e-4);
  vec2 sunFlat = uSun.xz / max(length(uSun.xz), 1e-4);
  float sunSide = 0.5 + 0.5 * dot(across, sunFlat);
  vec3 horizon = mix(mix(uSkyTop, uSkyHorizon, 0.35) * 1.3, uSkyHorizon, sunSide * sunSide);
  vec3 rgb = mix(horizon, uSkyTop, 1.0 - pow(1.0 - max(h, 0.0), 4.0));
  // Skylight beyond the rainbow scales with how bright the sky is.
  float skyLum = clamp(dot(rgb, vec3(0.3, 0.5, 0.2)) * 2.5, 0.0, 1.0);
  float uv = mix(0.5, 1.1, max(h, 0.0)) * (1.0 - uNight) * skyLum;
  float sun = smoothstep(0.9975, 0.999, dot(dir, uSun)) * (1.0 - uSpace);
  rgb += vec3(2.5, 2.2, 1.6) * sun * (1.0 - uNight);
  float ir = 0.3 * (1.0 - uNight) * skyLum + 0.03 + 2.0 * sun;
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
    star *= uStars;
    rgb += vec3(1.0, 0.95, 0.9) * star * (0.6 + 2.0 * fract(s * 91.0));
    ir += star * 0.8;
    uv += star * 0.8;
    float moon = smoothstep(0.99965, 0.99975, dot(dir, uSun)) * step(0.01, uStars);
    rgb += vec3(0.55, 0.55, 0.52) * moon;
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
  rotor = null,     // { uRotCenter, uRotAxis, uOmega, uPivot } uniforms for something spinning
  water = false,     // true, or a wave height multiplier
  snow = false,
  windows = null,   // { size: [w, h], lit, color, seed }
  spiral = null,    // { uSpiral, uSpiralColor } uniforms for a lighthouse beam
  depthWrite = null,
  vertexColors = false,
} = {}) {
  const key = JSON.stringify(arguments[0] ?? {});
  const special = mover || flashes || beam || wake || sourceVel || rotor || spiral;
  if (!special && cache.has(key)) return cache.get(key);
  const defines = {};
  if (checker) defines.CHECKER = "";
  if (grid) defines.GRID = "";
  if (toon) defines.TOON = "";
  if (unlit) defines.UNLIT = "";
  if (mover) defines.MOVER = "";
  if (additive) defines.ADDITIVE = "";
  if (flashes) defines.FLASHES = "";
  if (beam) defines.BEAM = "";
  if (rect) defines.CLIP_RECT = "";
  if (wake) defines.WAKE = "";
  if (sourceVel) defines.SOURCE_VEL = "";
  if (rotor) defines.ROTOR = "";
  if (water) defines.WATER = "";
  if (snow) defines.SNOW = "";
  if (windows) defines.WINDOWS = "";
  if (spiral) defines.SPIRAL = "";
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
      ...(rotor && rotor),
      ...(spiral && spiral),
      ...(water && { uWave: { value: water === true ? 1 : water } }),
      ...(windows && {
        uWindows: { value: new THREE.Vector4(windows.size[0], windows.size[1], windows.lit ?? 0.5, windows.seed ?? 1) },
        uWindowColor: { value: new THREE.Color(windows.color ?? "#ffcf8a") },
      }),
    },
    transparent: opacity < 1 || additive,
    depthWrite: depthWrite ?? (!additive && opacity >= 1),
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.userData.opts = arguments[0] ?? {};
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

// Particles that fly in straight lines (with optional gravity) from a birth
// event: sparks, rain, snow. Each vertex solves for the moment its light left
// it, like everything else. As points they're soft dots; drawn as line pairs
// (the second vertex lagging by aTail seconds) they're streaks.
const sparkVertex = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uBeta;
uniform vec4 uFlags;
uniform float uC;
uniform float uTime;
uniform float uDelay;
uniform float uPointScale;
uniform float uGravity;
uniform float uPeriodic;  // 1: particles respawn every aLife seconds (rain, snow)
uniform vec3 uWrap;       // periodic particles wrap around the camera within this box
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute float aBirth;
attribute float aLife;
attribute float aTail;
attribute vec3 aColor;
attribute float aSize;
varying vec3 vColor;
varying float vAgeK;
varying vec3 vSrc;
varying vec3 vWorld;

// How long the particle had been flying at world time te.
float flight(float te) { return uPeriodic > 0.5 ? mod(te - aBirth, aLife) : te - aBirth; }
vec3 posAt(vec3 o, float a) { return o + aVel * a + vec3(0.0, -0.5 * uGravity * a * a, 0.0); }

void main() {
  float T = uTime - aTail;
  vec3 o = aOrigin;
  if (uPeriodic > 0.5) {
    // Keep the field of drops centred on the viewer.
    o.xz = uCam.xz + mod(aOrigin.xz - uCam.xz + uWrap.xz * 0.5, uWrap.xz) - uWrap.xz * 0.5;
  }
  float tau = 0.0;
  if (uDelay > 0.5) {
    tau = length(posAt(o, flight(T)) - uCam) / uC;
    for (int i = 0; i < 4; i++) {
      float a = flight(T - tau);
      vec3 q = posAt(o, a) - uCam;
      vec3 vel = aVel + vec3(0.0, -uGravity * a, 0.0);
      float dq = length(q);
      float f = dq - uC * tau;
      float df = -dot(vel, q) / max(dq, 1e-4) - uC;
      tau = max(0.0, tau - f / df);
    }
  }
  float a = flight(T - tau);
  vSrc = aVel + vec3(0.0, -uGravity * a, 0.0);
  if (uPeriodic < 0.5 && (a < 0.0 || a > aLife)) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec3 p = posAt(o, a);
  vWorld = p;
  vAgeK = uPeriodic > 0.5 ? 0.0 : a / aLife;
  vColor = aColor;
  vec3 x = p - uCam;
  float d = max(length(x), 1e-3);
  vec3 P = x;
  float b = length(uBeta);
  if (b > 1e-5 && uFlags.x > 0.5) {
    float g = inversesqrt(1.0 - b * b);
    vec3 n = uBeta / b;
    P = x + n * ((g - 1.0) * dot(x, n)) + uBeta * (g * d);
  }
  vec4 clip = projectionMatrix * viewMatrix * vec4(uCam + P, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(aSize * uPointScale / max(length(P), 0.1), 1.0, 64.0);
}
`;

const sparkFragment = /* glsl */ `
uniform vec3 uCam;
uniform float uC;
uniform float uIntensity;
uniform float uRound;
varying vec3 vColor;
varying float vAgeK;
varying vec3 vSrc;
varying vec3 vWorld;
${common}

void main() {
  float shape = 1.0;
  if (uRound > 0.5) {
    vec2 q = gl_PointCoord - 0.5;
    shape = smoothstep(0.5, 0.0, length(q));
    if (shape < 0.01) discard;
  }
  float D = doppler(vWorld - uCam);
  vec3 bs = vSrc / uC;
  D /= inversesqrt(max(1e-6, 1.0 - dot(bs, bs))) * (1.0 + dot(bs, normalize(vWorld - uCam)));
  float fade = (1.0 - vAgeK) * (1.0 - vAgeK);
  vec3 rgb = vColor * uIntensity * fade * shape;
  float k = dot(vColor, vec3(0.33)) * uIntensity * fade * shape;
  vec3 col = searchlight(spectralShift(rgb, k * 0.35, k * 0.35, D), D);
  gl_FragColor = vec4(softClip(col), 1.0);
  #include <colorspace_fragment>
}
`;

// particles: { origin, vel, birth, life, color, size, tail }[]; as "points" or "lines".
export function sparkField(count, { lines = false, gravity = 0, periodic = false, wrap = [60, 0, 60], intensity = 1.5, round = true } = {}) {
  const n = lines ? count * 2 : count;
  const geo = new THREE.BufferGeometry();
  const attr = (name, size) => {
    const a = new THREE.BufferAttribute(new Float32Array(n * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const A = {
    origin: attr("aOrigin", 3), vel: attr("aVel", 3), birth: attr("aBirth", 1), life: attr("aLife", 1),
    tail: attr("aTail", 1), color: attr("aColor", 3), size: attr("aSize", 1),
  };
  A.birth.array.fill(-1e9);
  const material = new THREE.ShaderMaterial({
    vertexShader: sparkVertex,
    fragmentShader: sparkFragment,
    uniforms: {
      ...shared,
      uGravity: { value: gravity },
      uPeriodic: { value: periodic ? 1 : 0 },
      uWrap: { value: new THREE.Vector3(...wrap) },
      uIntensity: { value: intensity },
      uRound: { value: round && !lines ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const obj = lines ? new THREE.LineSegments(geo, material) : new THREE.Points(geo, material);
  obj.frustumCulled = false;
  obj.renderOrder = 3;
  let next = 0;
  // Sets particle i (or the next free slot).
  obj.set = (p, i = next++ % count) => {
    const put = (j, tail) => {
      A.origin.array.set([p.origin.x, p.origin.y, p.origin.z], j * 3);
      A.vel.array.set([p.vel.x, p.vel.y, p.vel.z], j * 3);
      A.birth.array[j] = p.birth;
      A.life.array[j] = p.life;
      A.tail.array[j] = tail;
      A.color.array.set([p.color.r, p.color.g, p.color.b], j * 3);
      A.size.array[j] = p.size ?? 0.1;
    };
    if (lines) { put(i * 2, 0); put(i * 2 + 1, p.tail ?? 0.05); }
    else put(i, 0);
    for (const a of Object.values(A)) a.needsUpdate = true;
  };
  obj.count = count;
  return obj;
}
