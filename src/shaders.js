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
  uAurora: { value: 0 },
  uSunDisk: { value: 1 },  // how much of the sun disk to draw at uSun
  uMoon: { value: 1 },     // how much of the moon disk to draw at uSun (night)
  uPass: { value: 0 },               // 0 normal, 1 mirror (water reflection), 2 shadow depth
  uMirrorY: { value: -1e6 },
  uShadowMap: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uDebugShadow: { value: 0 },
  uReflection: { value: null },
  uReflOn: { value: 0 },
  uLightsOn: { value: -1e9 },         // world time the switched lights come on
  uLightsOff: { value: 1e9 },         // and go off again
  uClouds: { value: 0 },                              // cover, 0..1
  uCloudLit: { value: new THREE.Color("#ffb070") },   // sunward edges
  uCloudShade: { value: new THREE.Color("#6a4a70") }, // shadowed undersides
  uWind: { value: new THREE.Vector2(0.004, 0.0015) },
  uLampPos: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -1000, 0, 1)) },
  uLampColor: { value: Array.from({ length: 8 }, () => new THREE.Color(0, 0, 0)) },
  uPointScale: { value: 600 },
  uExposure: { value: 1 },
  uAberrK: { value: 0.55 },   // 1 = true to life; less softens the bending
  uShiftAmt: { value: 0.4 },   // 1 = true to life; less softens the color shift
  uGlowAmt: { value: 0.5 },    // 1 = true to life; less softens the brightening
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
uniform float uAberrK;
uniform float uPass;
uniform mat4 uShadowMatrix;
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
uniform float uPhase;     // angle reached by now
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
    vec3 pr = rotateAbout(r0, uRotAxis, uPhase);
    if (uDelay > 0.5) {
      // Solve f(tau) = |p(T - tau) - eye| - c tau = 0. f falls steadily (the
      // point moves slower than light), so keep a bracket [lo, hi] and take
      // Newton steps that stay inside it, bisecting when they don't. Plain
      // Newton fails for points heading straight at you near light speed.
      float lo = 0.0;
      float hi = (length(uRotCenter - uCam) + length(r0) + length(offset)) / uC + 0.01;
      tau = clamp(length(uRotCenter + pr + offset - uCam) / uC, lo, hi);
      for (int i = 0; i < 10; i++) {
        vec3 ri = rotateAbout(r0, uRotAxis, uPhase - uOmega * tau);
        vec3 q = uRotCenter + ri + offset - uCam;
        float dq = length(q);
        float f = dq - uC * tau;
        if (f > 0.0) lo = tau; else hi = tau;
        vec3 vel = uOmega * cross(uRotAxis, ri);
        float df = -dot(vel, q) / max(dq, 1e-4) - uC;
        float next = tau - f / min(df, -1e-4);
        tau = (next > lo && next < hi) ? next : 0.5 * (lo + hi);
      }
      pr = rotateAbout(r0, uRotAxis, uPhase - uOmega * tau);
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
      if (uPivot.w < 0.5) vNormalW = rotateAbout(vNormalW, uRotAxis, uPhase - uOmega * tau);
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
    // Gentle mode bends the view as if you were going slower (in rapidity).
    float bv = uAberrK > 0.999 ? b : tanh(uAberrK * atanh(min(b, 0.999999)));
    vec3 n = uBeta / b;
    float g = inversesqrt(1.0 - bv * bv);
    P = x + n * ((g - 1.0) * dot(x, n)) + n * (bv * g * d);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(uCam + P, 1.0);
  // The sun's shadow map is made in the world's own frame, with no light delay.
  if (uPass > 1.5) gl_Position = uShadowMatrix * vec4(wp.xyz, 1.0);
}
`;

const common = /* glsl */ `
uniform mat3 uCorr;
uniform vec4 uFlags;
uniform vec3 uBeta;
uniform float uExposure;
uniform float uShiftAmt;
uniform float uGlowAmt;
// Softened Doppler factor: follows D for small shifts, then levels off, so
// colors lean warmer or cooler without washing out. k = 1 is the real thing.
float softD(float D, float k) {
  if (k > 0.999) return D;
  float l = log(max(D, 1e-4));
  return exp(k * 1.5 * tanh(l / 1.5));
}
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
// The part of infrared and ultraviolet light that lands in view at Doppler factor D.
vec3 beyondSeen(float ir, float uv, float D) {
  float k = 1.0 / D;
  return eyeSpan(760.0 * k, 1100.0 * k, 0.5 * ir)
       + eyeSpan(1100.0 * k, 1800.0 * k, 0.22 * ir)
       + eyeSpan(1800.0 * k, 3200.0 * k, 0.08 * ir)
       + eyeSpan(330.0 * k, 400.0 * k, 0.6 * uv)
       + eyeSpan(250.0 * k, 330.0 * k, 0.25 * uv)
       + eyeSpan(120.0 * k, 250.0 * k, 0.06 * uv);
}

vec3 bandsSeen(vec3 rgb, float ir, float uv, float D) {
  vec3 a = uCorr * rgb;
  float k = 1.0 / D;
  vec3 o = eye(610.0 * k, a.r) + eye(545.0 * k, a.g) + eye(465.0 * k, a.b);
  return o + beyondSeen(ir, uv, D);
}

vec3 spectralShift(vec3 rgb, float ir, float uv, float D) {
  if (uFlags.y < 0.5) D = 1.0;
  if (uShiftAmt > 0.999) return max(bandsSeen(rgb, ir, uv, D), 0.0);
  // Gentle: colors keep their hue and lean bluer ahead, warmer behind. Light
  // from beyond the rainbow still slides into view, so hidden inks show.
  float l = log(max(D, 1e-4));
  float s = tanh(l / 1.2);
  vec3 tint = s > 0.0 ? mix(vec3(1.0), vec3(0.8, 0.96, 1.3), s) : mix(vec3(1.0), vec3(1.28, 0.93, 0.72), -s);
  float Dk = exp(uShiftAmt * 3.0 * tanh(l / 1.5));
  vec3 extra = max(beyondSeen(ir, uv, Dk) - beyondSeen(ir, uv, 1.0), 0.0);
  extra *= smoothstep(1.8, 3.0, max(ir, uv));
  return max((rgb + beyondSeen(ir, uv, 1.0)) * tint + extra, 0.0);
}

// Brighter ahead, dimmer behind; uExposure is the eye adapting to it.
vec3 searchlight(vec3 c, float D) {
  if (uFlags.z < 0.5) return c;
  float g = softD(D, uGlowAmt);
  return c * g * g * uExposure;
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
uniform float uPass;
uniform float uMirrorY;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uDebugShadow;
uniform sampler2D uReflection;
uniform float uReflOn;
uniform float uLightsOn;
uniform float uLightsOff;
uniform vec4 uLampPos[8];   // xyz, range
uniform vec3 uLampColor[8];
#ifdef ROTOR
varying vec3 vSrcVel;
#endif
#ifdef WATER
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uWave;
uniform float uReflScale;
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

// 1 in sunlight, 0 in shadow, softened over a few texels.
float sunVisible(vec3 p, vec3 N) {
  if (uShadowOn <= 0.0) return 1.0;
  vec4 s = uShadowMatrix * vec4(p + N * 0.08, 1.0);
  vec3 q = s.xyz / s.w * 0.5 + 0.5;
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  float lit = 0.0;
  vec2 texel = vec2(1.0 / 2048.0);
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float d = texture2D(uShadowMap, q.xy + vec2(float(i), float(j)) * texel * 1.5).r;
    lit += step(q.z - 0.0012, d);
  }
  return mix(1.0, lit / 9.0, uShadowOn);
}

void main() {
  if (uPass > 1.5) { gl_FragColor = vec4(1.0); return; }
  if (uPass > 0.5 && vWorld.y < uMirrorY - 0.05) discard;
  #ifdef BLOB
    // A soft contact shadow: darkest at the centre (vertex colour 1), fading out.
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity * vTint.r * vTint.r);
    return;
  #endif
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
  #ifdef GHOST
    D = 1.0;
  #endif
  vec3 base = uColor * vTint;
  float e = uSpec.z;
  #ifdef SWITCHED
    // Lamps that all switch on at one world time, seen when that light arrives.
    float seenAt = uTime - (uDelay > 0.5 ? vDist / uC : 0.0);
    float on = smoothstep(uLightsOn, uLightsOn + 0.2, seenAt) * (1.0 - smoothstep(uLightsOff, uLightsOff + 0.2, seenAt));
    e *= on;
    base *= mix(0.3, 1.0, on);
  #endif
  #ifdef CHECKER
    vec2 cell = floor(vWorld.xz / uCheckerSize);
    if (mod(cell.x + cell.y, 2.0) > 0.5) base = uCheckerB;
  #endif
  #ifdef PLANKS
    // Deck boards laid across, each a slightly different shade, ends staggered.
    {
      float w = 0.24;
      float row = floor(vWorld.z / w);
      float seg = floor((vWorld.x + fract(row * 0.37) * 2.4) / 2.4);
      float h = fract(sin(row * 12.9898 + seg * 78.233) * 43758.5453);
      base *= 0.82 + 0.32 * h;
      // fz, fx are distances to the nearest seam in pixels: darken within ~1 px.
      float seamZ = abs(fract(vWorld.z / w + 0.5) - 0.5) / fwidth(vWorld.z / w);
      float seamX = abs(fract((vWorld.x + fract(row * 0.37) * 2.4) / 2.4 + 0.5) - 0.5) / fwidth(vWorld.x / 2.4);
      float gap = 1.0 - min(min(seamZ, seamX) / 1.0, 1.0);
      base *= 1.0 - 0.5 * gap;
      float grain = fract(sin(dot(floor(vWorld.xz * vec2(9.0, 40.0)), vec2(41.3, 289.1))) * 43758.5);
      base *= 0.96 + 0.06 * grain;
    }
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
  #ifndef UNLIT
    if (ndl > 0.0) ndl *= sunVisible(vWorld, N);
  #endif
  #ifdef TOON
    ndl = smoothstep(0.05, 0.12, ndl) * 0.85 + smoothstep(0.55, 0.62, ndl) * 0.15;
  #endif
  vec3 light = mix(uGround, uSky, N.y * 0.5 + 0.5) + uSunColor * ndl;
  // Walls darken toward the ground they stand on, which seats them in the scene.
  light *= mix(1.0, mix(0.55, 1.0, smoothstep(0.0, 1.8, abs(vWorld.y))), step(abs(N.y), 0.6));
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
  float waterFres = 0.0;
  vec3 waterN = vec3(0.0, 1.0, 0.0);
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
      rgb = mix(base * (uSky * 0.6 + 0.1), skyc, uReflOn > 0.5 ? 0.0 : fres) + uSunColor * glint * 4.0;
      ir = 0.15 + glint * 3.0;
      uv = 0.2 * fres;
      waterFres = fres;
      waterN = n;
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
      float glow = exp(-pow(dAng / uSpiral.w, 2.0)) * smoothstep(8.0, 40.0, r) / (1.0 + r * 0.012);
      rgb += uSpiralColor * glow * 0.45;
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
  if (uDebugShadow > 0.5) {
    vec4 s = uShadowMatrix * vec4(vWorld, 1.0);
    vec3 q = s.xyz / s.w * 0.5 + 0.5;
    col = vec3(texture2D(uShadowMap, q.xy).r, q.z, sunVisible(vWorld, N));
  }
  #ifdef WATER
    // The reflection pass is already drawn as seen, so it's mixed in after the shift.
    if (uReflOn > 0.5) {
      vec2 sc = gl_FragCoord.xy / vec2(textureSize(uReflection, 0)) * uReflScale;
      sc.x = 1.0 - sc.x;
      sc += waterN.xz * vec2(-0.06, 0.06);
      vec3 refl = texture2D(uReflection, clamp(sc, 0.001, 0.999)).rgb;
      col = mix(col, refl * (1.0 - f * 0.7), waterFres * 0.92 + 0.04);
    }
  #endif
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
uniform float uAurora;
uniform float uSunDisk;
uniform float uMoon;
uniform float uTime;
uniform float uClouds;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec2 uWind;
uniform vec3 uSunColor;
varying vec3 vWorld;
${common}

float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1, 0)), f.x), mix(aHash(i + vec2(0, 1)), aHash(i + vec2(1, 1)), f.x), f.y);
}

// Curtains of aurora: green at the bottom edge, red and violet higher up.
vec3 aurora(vec3 dir, out float ir, out float uv) {
  ir = 0.0; uv = 0.0;
  if (dir.y < 0.02) return vec3(0.0);
  float az = atan(dir.z, dir.x);
  float h = dir.y;
  vec3 col = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    // Where this curtain's lower edge sits, wandering slowly.
    float base = 0.22 + 0.08 * fk + 0.05 * sin(az * (2.0 + fk) + uTime * 0.05 * (1.0 + fk)) + 0.04 * aNoise(vec2(az * 3.0 + fk * 7.0, uTime * 0.03));
    float above = h - base;
    if (above < -0.02) continue;
    float rays = 0.55 + 0.45 * aNoise(vec2(az * 40.0 + fk * 13.0, uTime * 0.25));
    float fold = 0.5 + 0.5 * sin(az * (9.0 + fk * 3.0) + uTime * 0.12 + aNoise(vec2(az * 4.0, uTime * 0.05)) * 4.0);
    float edge = smoothstep(-0.02, 0.01, above) * exp(-max(above, 0.0) / (0.08 + 0.05 * fold));
    float tall = smoothstep(0.0, 0.25, above) * exp(-max(above, 0.0) / 0.35);
    float strength = rays * (0.5 + 0.5 * fold) * (k == 0 ? 1.0 : 0.6);
    col += strength * (vec3(0.25, 1.4, 0.55) * edge + vec3(0.7, 0.15, 0.45) * tall * 0.6);
    uv += strength * tall * 0.4;
  }
  return col * 0.32;
}

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * aNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return v;
}

// A layer of cloud on a dome overhead, lit from the sun's side.
vec4 clouds(vec3 dir) {
  if (uClouds <= 0.0 || dir.y < -0.02) return vec4(0.0);
  vec2 p = dir.xz / (dir.y + 0.12) * 1.6 + uWind * uTime * 60.0;
  float n = fbm(p) * 0.75 + fbm(p * 3.1 + 4.0) * 0.25;
  float cover = mix(0.72, 0.4, uClouds);
  float dens = smoothstep(cover, cover + 0.22, n);
  if (dens <= 0.0) return vec4(0.0);
  // Thin wisps near the horizon, fading into haze.
  dens *= smoothstep(-0.02, 0.12, dir.y);
  // Light from the sun's side: undersides glow when the sun is low.
  float toward = 0.5 + 0.5 * dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-4), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-4));
  float glow = pow(max(dot(dir, uSun), 0.0), 6.0);
  float edge = smoothstep(cover + 0.22, cover, n); // thin edges catch the light
  vec3 col = mix(uCloudShade, uCloudLit, clamp(0.25 + 0.55 * toward * toward + 0.6 * edge * toward, 0.0, 1.0));
  col += uSunColor * glow * (0.6 + edge);
  return vec4(col, dens);
}

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
  float sd = dot(dir, uSun);
  float sun = smoothstep(0.99955, 0.99975, sd) * (1.0 - uSpace) * uSunDisk;
  float halo = (pow(max(sd, 0.0), 400.0) * 0.6 + pow(max(sd, 0.0), 30.0) * 0.12) * (1.0 - uSpace) * uSunDisk;
  rgb += (vec3(3.2, 2.8, 2.0) * sun + uSunColor * halo) * (1.0 - uNight) * smoothstep(-0.04, 0.0, dir.y);
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
    float moon = smoothstep(0.99965, 0.99975, dot(dir, uSun)) * step(0.01, uStars) * uMoon;
    moon += pow(max(dot(dir, uSun), 0.0), 900.0) * 0.25 * uMoon * step(0.01, uStars);
    rgb += vec3(0.55, 0.55, 0.52) * moon;
  }
  vec4 cl = clouds(dir);
  rgb = mix(rgb, cl.rgb, cl.a);
  ir = mix(ir, 0.35 * dot(cl.rgb, vec3(0.33)), cl.a);
  uv = mix(uv, 0.2 * dot(cl.rgb, vec3(0.33)), cl.a);
  if (uAurora > 0.0) {
    float air, auv;
    rgb += aurora(dir, air, auv) * uAurora;
    uv += auv * uAurora;
  }
  vec3 col = searchlight(spectralShift(rgb, ir, uv, D), D);
  gl_FragColor = vec4(softClip(col), 1.0);
  #include <colorspace_fragment>
}
`;

const cache = new Map();
// Screen pixels per reflection texel (the reflection is drawn at reduced size).
export const reflScale = { value: 0.5 };
const ids = new WeakMap();
let nextId = 1;
const idOf = (o) => { if (!ids.has(o)) ids.set(o, nextId++); return ids.get(o); };

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
  ghost = false,    // drawn where the thing really is now, not where its light says
  rotor = null,     // { uRotCenter, uRotAxis, uOmega, uPivot } uniforms for something spinning
  water = false,     // true, or a wave height multiplier
  snow = false,
  planks = false,
  blob = false,
  switched = false, // a lamp that comes on at uLightsOn
  windows = null,   // { size: [w, h], lit, color, seed }
  spiral = null,    // { uSpiral, uSpiralColor } uniforms for a lighthouse beam
  depthWrite = null,
  vertexColors = false,
} = {}) {
  // Shared uniform objects (a train's motion, a wheel's spin) key by identity,
  // so every part of one train shares a material and can be merged.
  const byIdentity = new Set(["mover", "rotor", "flashes", "beam", "spiral", "sourceVel"]);
  const key = JSON.stringify(arguments[0] ?? {}, (k, v) => (byIdentity.has(k) && v ? `#${idOf(v)}` : v));
  if (!unique && !wake && cache.has(key)) return cache.get(key);
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
  if (ghost) defines.GHOST = "";
  if (rotor) defines.ROTOR = "";
  if (water) defines.WATER = "";
  if (snow) defines.SNOW = "";
  if (planks) defines.PLANKS = "";
  if (blob) defines.BLOB = "";
  if (switched) defines.SWITCHED = "";
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
      ...(ghost && { uDelay: { value: 0 } }),
      ...(rotor && rotor),
      ...(spiral && spiral),
      ...(water && { uWave: { value: water === true ? 1 : water }, uReflScale: reflScale }),
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
  if (!unique && !wake) cache.set(key, m);
  return m;
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
uniform float uAberrK;
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

vec3 V; // launch velocity, held under light speed

// How long the particle had been flying at world time te.
float flight(float te) { return uPeriodic > 0.5 ? mod(te - aBirth, aLife) : te - aBirth; }
vec3 posAt(vec3 o, float a) { return o + V * a + vec3(0.0, -0.5 * uGravity * a * a, 0.0); }

void main() {
  {
    float v = length(aVel), lim = 0.9 * uC;
    V = v > lim ? aVel * (lim + 0.085 * uC * tanh((v - lim) / (0.085 * uC))) / v : aVel;
  }
  float T = uTime - aTail;
  vec3 o = aOrigin;
  if (uPeriodic > 0.5) {
    // Keep the field of drops centred on the viewer.
    o.xz = uCam.xz + mod(aOrigin.xz - uCam.xz + uWrap.xz * 0.5, uWrap.xz) - uWrap.xz * 0.5;
  }
  float tau = 0.0;
  if (uDelay > 0.5) {
    tau = length(posAt(o, flight(T)) - uCam) / uC;
    for (int i = 0; i < 6; i++) {
      float a = flight(T - tau);
      vec3 q = posAt(o, a) - uCam;
      vec3 vel = V + vec3(0.0, -uGravity * a, 0.0);
      float dq = length(q);
      float f = dq - uC * tau;
      float df = -dot(vel, q) / max(dq, 1e-4) - uC;
      // Near light speed head-on, Newton overshoots; fall back to a plain
      // fixed-point step, which always moves toward the answer.
      tau = df < -0.15 * uC ? max(0.0, tau - f / df) : dq / uC;
    }
  }
  float a = flight(T - tau);
  vSrc = V + vec3(0.0, -uGravity * a, 0.0);
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
    // Gentle mode bends the view as if you were going slower (in rapidity).
    float bv = uAberrK > 0.999 ? b : tanh(uAberrK * atanh(min(b, 0.999999)));
    vec3 n = uBeta / b;
    float g = inversesqrt(1.0 - bv * bv);
    P = x + n * ((g - 1.0) * dot(x, n)) + n * (bv * g * d);
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
uniform vec2 uBeyond; // infrared and ultraviolet, relative to visible
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
  vec3 col = searchlight(spectralShift(rgb, k * uBeyond.x, k * uBeyond.y, D), D);
  gl_FragColor = vec4(softClip(col), 1.0);
  #include <colorspace_fragment>
}
`;

// particles: { origin, vel, birth, life, color, size, tail }[]; as "points" or "lines".
export function sparkField(count, { lines = false, gravity = 0, periodic = false, wrap = [60, 0, 60], intensity = 1.5, round = true, ir = 0.35, uv = 0.35 } = {}) {
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
      uBeyond: { value: new THREE.Vector2(ir, uv) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const obj = lines ? new THREE.LineSegments(geo, material) : new THREE.Points(geo, material);
  obj.frustumCulled = false;
  obj.layers.set(1);
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

// Ghosts: see-through copies of moving things drawn where they really are at
// this moment. Shown when the Lab's "where things really are" switch is on.
export const ghosts = [];

export function ghostOf(obj) {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4();
  obj.traverse((m) => {
    const o = m.material?.userData?.opts;
    if (!m.isMesh || !o || !(o.mover || o.rotor)) return;
    const copy = new THREE.Mesh(m.geometry, mat({ ...o, ghost: true, color: "#7fe8ff", emissive: 1, unlit: true, additive: true, opacity: 0.22, ir: 0, uv: 0, grid: null, windows: null, unique: false }));
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(inv.copy(obj.matrixWorld).invert().multiply(m.matrixWorld));
    copy.frustumCulled = false;
    copy.renderOrder = 5;
    copy.layers.set(2);
    g.add(copy);
  });
  g.position.copy(obj.position);
  g.quaternion.copy(obj.quaternion);
  g.visible = false;
  ghosts.push(g);
  return g;
}
