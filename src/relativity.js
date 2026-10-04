import * as THREE from "three";

// One observer (the player) moving through a world at rest. Positions are in
// meters, times in seconds; `c` is the (adjustable) speed of light in m/s.

export const effects = {
  aberration: true,
  doppler: true,
  searchlight: true,
  delay: true,
  dilation: true,
  ghosts: false,
};

export const world = {
  c: 3.0,
  t: 0, // world (coordinate) time
};

// Narrow emission bands an RGB surface is assumed to send out, and the eye's
// three sensitivity curves (same numbers as the shader). Shifting a band by the
// Doppler factor and re-reading it through the eye slides colors along the rainbow.
export const BANDS = [610, 545, 465]; // nm
export const EYE = [610, 545, 465];
export const SIGMA = 48;

const response = (lambda, mu) => Math.exp(-(((lambda - mu) / SIGMA) ** 2));

// At rest the round trip RGB -> bands -> eye should be the identity, so undo
// the cross-talk between neighbouring bands.
export function restCorrection() {
  const e = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) e.push(response(BANDS[i], EYE[j]));
  return new THREE.Matrix3().set(...e).invert();
}

export function gammaOf(beta) {
  return 1 / Math.sqrt(Math.max(1e-9, 1 - beta * beta));
}

// Doppler factor for light reaching an observer with velocity v (m/s) from a
// source at rest at `src`: >1 is blueshift.
export function dopplerFactor(observer, v, src) {
  const r = new THREE.Vector3().subVectors(src, observer);
  const d = r.length() || 1;
  const b = v.clone().divideScalar(world.c);
  return gammaOf(b.length()) * (1 + b.dot(r) / d);
}

// The world time at which light now arriving at the observer left `src`.
export function retardedTime(observer, src) {
  if (!effects.delay) return world.t;
  return world.t - observer.distanceTo(src) / world.c;
}

// Unit direction (observer frame) in which a source at rest appears.
export function apparentDirection(observer, v, src) {
  const x = new THREE.Vector3().subVectors(src, observer);
  const d = x.length();
  const b = v.clone().divideScalar(world.c);
  const beta = b.length();
  if (beta < 1e-6 || !effects.aberration) return x.normalize();
  const g = gammaOf(beta);
  const n = b.clone().divideScalar(beta);
  return x.addScaledVector(n, (g - 1) * x.dot(n)).addScaledVector(b, g * d).normalize();
}

// Velocity of something moving at w inside a frame that itself moves at V
// (all m/s, world frame result).
export function addVelocity(V, w) {
  const c2 = world.c * world.c;
  const gV = 1 / Math.sqrt(Math.max(1e-9, 1 - V.lengthSq() / c2));
  const vw = V.dot(w) / c2;
  return w.clone().divideScalar(gV)
    .addScaledVector(V, 1 + (gV / (1 + gV)) * vw)
    .divideScalar(1 + vw);
}

// Time coordinate, in the frame of an observer at `here` moving at v, of an
// event at world time t and place `pos`, relative to the observer's "now" T.
export function frameTime(t, pos, T, here, v) {
  const c2 = world.c * world.c;
  const g = 1 / Math.sqrt(Math.max(1e-9, 1 - v.lengthSq() / c2));
  const dx = new THREE.Vector3().subVectors(pos, here);
  return g * ((t - T) - v.dot(dx) / c2);
}

// World time at which light now reaching `eye` left something whose world
// position at time t is path(t). Bisection; works for anything slower than light.
export function seenTimeOf(path, eye, T = world.t, span = 600) {
  if (!effects.delay) return T;
  let lo = T - span, hi = T;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (world.c * (T - mid) > path(mid).distanceTo(eye)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
