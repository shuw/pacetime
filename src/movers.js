import * as THREE from "three";
import { G, mesh } from "./geo.js";
import { ghostOf, mat } from "./shaders.js";
import { effects, gammaOf, world } from "./relativity.js";

// Something moving in a straight line at constant velocity, built around its
// own origin. Every material made through `mat` shares its uniforms, so the
// shader draws it where it was when the light reaching you left it.
export class Mover {
  constructor(vel = new THREE.Vector3(), { clip = null } = {}) {
    this.vel = vel.clone();
    this.anchor = new THREE.Vector3(0, 0, -1e5); // position at world time 0
    this.life = new THREE.Vector2(-1e9, 1e9);
    this.uniforms = { uVel: { value: this.vel }, uAnchor: { value: this.anchor }, uLife: { value: this.life } };
    this.clip = clip;
    this.group = new THREE.Group();
  }

  // Call once built: adds the see-through "where it really is" copy.
  withGhost() {
    this.group.add(ghostOf(this.group));
    return this;
  }

  mat(opts) {
    return mat({ ...opts, mover: this.uniforms, rect: this.clip });
  }

  add(geo, opts, transform) {
    const m = mesh(geo, this.mat(opts), transform);
    this.group.add(m);
    return m;
  }

  // Be at `pos` at world time t.
  dispatch(t, pos) {
    this.anchor.copy(pos).addScaledVector(this.vel, -t);
  }

  at(t) {
    return this.anchor.clone().addScaledVector(this.vel, t);
  }

  // Where you see its origin now, and the world time that light left it.
  seen(eye, T = world.t) {
    const w = this.at(T).sub(eye);
    if (!effects.delay) return { pos: this.at(T), t: T };
    const u2 = this.vel.lengthSq(), a = world.c * world.c - u2;
    const wu = w.dot(this.vel);
    const tau = (-wu + Math.sqrt(wu * wu + a * w.lengthSq())) / a;
    return { pos: this.at(T - tau), t: T - tau };
  }

  // Doppler factor of its light at `eye` for an observer moving at v.
  doppler(eye, v = new THREE.Vector3()) {
    const { pos } = this.seen(eye);
    const n = pos.clone().sub(eye).normalize();
    const bo = v.clone().divideScalar(world.c), bs = this.vel.clone().divideScalar(world.c);
    return (gammaOf(bo.length()) * (1 + bo.dot(n))) / (gammaOf(bs.length()) * (1 + bs.dot(n)));
  }
}

// A yellow cab facing -z in its own frame (rotate the mover's group for other headings).
export function taxi(m, { body = "#f2c230", heading = 0 } = {}) {
  const r = (x, z) => [x * Math.cos(heading) + z * Math.sin(heading), -x * Math.sin(heading) + z * Math.cos(heading)];
  const add = (scale, pos, opts) => {
    const [x, z] = r(pos[0], pos[2]);
    const s = heading % Math.PI === 0 ? scale : [scale[2], scale[1], scale[0]];
    return m.add(G.box, opts, { pos: [x, pos[1], z], scale: s });
  };
  add([1.9, 0.8, 4.4], [0, 0.7, 0], { color: body, ir: 0.5, uv: 0.15 });
  add([1.7, 0.65, 2.3], [0, 1.4, 0.2], { color: "#20232b", ir: 0.2, uv: 0.2 });
  add([1.72, 0.45, 2.2], [0, 1.42, 0.2], { color: "#ffe2a0", emissive: 0.35, ir: 0.4 });
  add([0.9, 0.25, 0.4], [0, 1.85, 0.2], { color: "#fff3b0", emissive: 1, ir: 1, uv: 0.3 });
  add([0.4, 0.25, 0.08], [-0.65, 0.75, -2.22], { color: "#d8d8d0", emissive: 1, ir: 1.2, uv: 0.5 });
  add([0.4, 0.25, 0.08], [0.65, 0.75, -2.22], { color: "#d8d8d0", emissive: 1, ir: 1.2, uv: 0.5 });
  add([0.5, 0.2, 0.08], [-0.6, 0.8, 2.22], { color: "#ff2020", emissive: 1, ir: 1.4 });
  add([0.5, 0.2, 0.08], [0.6, 0.8, 2.22], { color: "#ff2020", emissive: 1, ir: 1.4 });
  for (const [x, z] of [[-0.9, -1.4], [0.9, -1.4], [-0.9, 1.4], [0.9, 1.4]]) add([0.3, 0.6, 0.6], [x, 0.3, z], { color: "#111114", ir: 0.1 });
  return m;
}
