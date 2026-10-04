import { world } from "./relativity.js";

// Everything that moves keeps its own speed in m/s whatever the speed of light
// is set to, until light gets slower than it. Then it's held just under light
// speed, because nothing can outrun light.
export function govern(v, c = world.c) {
  const a = 0.9 * c;
  if (v <= a) return v;
  const b = 0.085 * c;
  return a + b * Math.tanh((v - a) / b);
}

const movers = new Set();
const rotors = [];
const others = [];

export const motion = {
  addMover(m) { movers.add(m); },
  // A spinning thing: rmax is its fastest-moving radius.
  addRotor(u, omega, rmax) { rotors.push({ u, omega, rmax }); },
  // Anything else that needs to hear about speed limits: fn(dT, t, c).
  add(fn) { others.push(fn); },
  reset() { movers.clear(); rotors.length = 0; others.length = 0; },
  step(dT, t) {
    const c = world.c;
    for (const m of movers) m.govern(c, t);
    for (const r of rotors) {
      const s = Math.abs(r.omega) * r.rmax;
      const eff = s > 0 ? (Math.sign(r.omega) * govern(s, c)) / r.rmax : 0;
      r.u.uOmega.value = eff;
      // Keep the angle small: GPUs compute sin and cos of large angles poorly,
      // which made fast rides shred after a few minutes.
      const TAU = Math.PI * 2;
      r.u.uPhase.value = ((((r.u.uPhase.value + eff * dT + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    }
    for (const f of others) f(dT, t, c);
  },
};

// Angle a rotor had reached at world time t (recent past or now).
export function angleOf(r, t) {
  return r.uPhase.value - r.uOmega.value * (world.t - t);
}
