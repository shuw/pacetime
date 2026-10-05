import * as THREE from "three";
import { G, mesh } from "./geo.js";
import { mat, shared, sparkField } from "./shaders.js";
import { world } from "./relativity.js";
import { Painter } from "./paint.js";

// The recent history of a beam of light (a torch, a headlight): where it was
// and which way it pointed. The shader looks back through it, so the light
// arriving anywhere is the light that left the lamp the right time ago.
export class BeamHistory {
  constructor(n = 256) {
    this.n = n;
    this.data = new Float32Array(n * 2 * 4);
    this.tex = new THREE.DataTexture(this.data, n, 2, THREE.RGBAFormat, THREE.FloatType);
    this.tex.needsUpdate = true;
    this.reset();
  }

  reset() {
    this.data.fill(0);
    this.count = 0;
    this.last = -1e9;
    this.dt = this.spacing();
    this.tex.needsUpdate = true;
  }

  // Long enough to cover light going ~30 m and back.
  spacing() {
    return Math.max(0.04, 60 / world.c / this.n);
  }

  push(t, origin, dir, on, strength = 1) {
    if (Math.abs(this.spacing() - this.dt) > 1e-6) this.reset();
    const n = this.n, d = this.data;
    if (t - this.last >= this.dt) {
      d.copyWithin(4, 0, (n - 1) * 4);
      d.copyWithin(n * 4 + 4, n * 4, (2 * n - 1) * 4);
      this.last = t;
      this.count = Math.min(n, this.count + 1);
    }
    d.set([dir.x, dir.y, dir.z, on ? 1 : 0], 0);
    d.set([origin.x, origin.y, origin.z, t], n * 4);
    this.tex.needsUpdate = true;
    shared.uBeamTex.value = this.tex;
    shared.uBeamInfo.value.set(t, this.dt, Math.max(2, this.count), strength);
  }
}

// Things you carry are attached to the camera and drawn without bending.
function carried(geo, color, extra = {}) {
  const m = mesh(geo, mat({ color, comoving: true, ir: 0.3, uv: 0.2, ...extra }));
  m.layers.set(2);
  m.renderOrder = 6;
  return m;
}

export function torchModel() {
  const g = new THREE.Group();
  const body = new THREE.CylinderGeometry(0.035, 0.03, 0.26, 16);
  body.rotateX(Math.PI / 2);
  g.add(carried(body, "#3a86ff"));
  const head = new THREE.CylinderGeometry(0.055, 0.04, 0.07, 16);
  head.rotateX(Math.PI / 2);
  const h = carried(head, "#e8e4dc");
  h.position.z = -0.15;
  g.add(h);
  const lens = carried(new THREE.CircleGeometry(0.048, 20), "#fff6d8", { emissive: 1, unlit: true });
  lens.position.z = -0.186;
  g.add(lens);
  g.lens = lens;
  g.position.set(0.24, -0.26, -0.55);
  return g;
}

export function wandModel() {
  const g = new THREE.Group();
  const stick = new THREE.CylinderGeometry(0.008, 0.008, 0.5, 8);
  stick.rotateX(Math.PI / 2 - 0.5);
  g.add(carried(stick, "#c9c4bb"));
  const tip = carried(G.sphere, "#fff2b0", { emissive: 1, unlit: true });
  tip.scale.setScalar(0.03);
  tip.position.set(0, 0.12, -0.22);
  g.add(tip);
  g.tip = tip;
  g.position.set(0.22, -0.22, -0.55);
  return g;
}

export function handlebarsModel() {
  const g = new THREE.Group();
  const bar = new THREE.CylinderGeometry(0.02, 0.02, 0.62, 10);
  bar.rotateZ(Math.PI / 2);
  g.add(carried(bar, "#2b2d33"));
  for (const s of [-1, 1]) {
    const grip = new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10);
    grip.rotateZ(Math.PI / 2);
    const m = carried(grip, "#ff4d6d");
    m.position.x = s * 0.33;
    g.add(m);
  }
  const stem = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 10);
  const st = carried(stem, "#5ce1c6");
  st.position.set(0, -0.25, -0.05);
  g.add(st);
  const dash = carried(new THREE.BoxGeometry(0.22, 0.08, 0.12), "#5ce1c6");
  dash.position.set(0, -0.02, 0.02);
  g.add(dash);
  const lamp = carried(G.sphere, "#fff6d8", { emissive: 1, unlit: true });
  lamp.scale.set(0.07, 0.07, 0.03);
  lamp.position.set(0, -0.06, -0.08);
  g.add(lamp);
  g.position.set(0, -0.3, -0.72);
  return g;
}

// A seaside scooter, parked; one colour-baked mesh.
export function scooterGeometry() {
  const p = new Painter();
  const wheel = new THREE.TorusGeometry(0.28, 0.1, 10, 24);
  for (const z of [-0.55, 0.6]) {
    p.add(wheel, "#1d1b2e", { pos: [0, 0.38, z], rot: [0, Math.PI / 2, 0] });
    p.add(G.cyl, "#cfcfcf", { pos: [0, 0.38, z], rot: [0, 0, Math.PI / 2], scale: [0.1, 0.24, 0.1] });
  }
  p.add(G.box, "#5ce1c6", { pos: [0, 0.48, 0.15], scale: [0.36, 0.14, 0.9] }); // footboard
  p.add(G.sphere, "#5ce1c6", { pos: [0, 0.78, 0.45], scale: [0.26, 0.28, 0.42] }); // rear body
  p.add(G.box, "#f4ead2", { pos: [0, 1.05, 0.38], scale: [0.26, 0.09, 0.55] }); // seat
  p.add(G.box, "#5ce1c6", { pos: [0, 0.85, -0.5], rot: [-0.35, 0, 0], scale: [0.3, 0.8, 0.14] }); // leg shield
  p.add(G.cyl, "#2b2d33", { pos: [0, 1.25, -0.62], rot: [-0.35, 0, 0], scale: [0.04, 0.5, 0.04] }); // stem
  p.add(G.cyl, "#2b2d33", { pos: [0, 1.48, -0.7], rot: [0, 0, Math.PI / 2], scale: [0.025, 0.6, 0.025] }); // bars
  for (const s of [-1, 1]) p.add(G.cyl, "#ff4d6d", { pos: [s * 0.32, 1.48, -0.7], rot: [0, 0, Math.PI / 2], scale: [0.035, 0.12, 0.035] });
  p.add(G.sphere, "#fff6d8", { pos: [0, 1.32, -0.78], scale: [0.09, 0.09, 0.05] }); // headlight
  return p.geometry();
}

// A sparkler: its glowing trail stays hanging where the light was, and fades.
export class Sparkler {
  constructor(group) {
    this.trail = sparkField(6000, { intensity: 0.7, ir: 0.3, uv: 0.8 });
    this.sparks = sparkField(1200, { gravity: 2.4, intensity: 1.6, ir: 0.3, uv: 0.8 });
    group.add(this.trail, this.sparks);
    this.last = null;
    this.hue = 0;
  }

  update(t, tip, on) {
    if (!on) { this.last = null; return; }
    const c = new THREE.Color().setHSL(this.hue, 0.95, 0.62);
    this.hue = (this.hue + 0.004) % 1;
    const from = this.last ?? tip.clone();
    const gap = from.distanceTo(tip);
    if (this.last && gap < 0.06) return; // wait until the tip has moved a little
    const n = Math.min(40, Math.max(1, Math.ceil(gap / 0.06)));
    for (let i = 1; i <= n; i++) {
      const p = from.clone().lerp(tip, i / n);
      this.trail.set({ origin: p, vel: new THREE.Vector3(), birth: t, life: 45, color: c, size: 0.05 });
    }
    for (let k = 0; k < 2; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(1.6);
      this.sparks.set({ origin: tip, vel: v, birth: t, life: 0.5 + Math.random() * 0.4, color: new THREE.Color("#fff2b0"), size: 0.05 });
    }
    this.last = tip.clone();
  }
}
