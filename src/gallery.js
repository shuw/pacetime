import * as THREE from "three";
import { box, G, mesh } from "./geo.js";
import { mat, sparkField } from "./shaders.js";
import { Mover } from "./movers.js";

import { sfx } from "./audio.js";

// A shooting gallery: rows of targets sliding back and forth at a good
// fraction of light speed. You see each one where it was; to hit it, throw
// at where it is (and where it will be when the ball gets there).
export class Gallery {
  constructor(group, { origin, width = 18, depth = 7, rows = [[0.2, 1.2], [0.35, 2.2], [0.5, 3.2]], c, toast }) {
    this.c = c;
    this.toast = toast;
    this.origin = origin.clone(); // centre of the throwing line
    this.width = width;
    this.score = 0;
    this.throws = 0;
    this.targets = [];
    this.balls = [];
    const back = origin.z - depth;
    const o = origin;
    // Booth: back wall, side posts, striped canopy, rails for each row.
    group.add(box(width + 3, 4.4, 0.3, { color: "#3a2232", ir: 0.3, surface: "wood" }, [o.x, 2.2, back - 0.4]));
    for (const s of [-1, 1]) group.add(box(0.4, 5, 0.4, { color: "#e8d9b0", ir: 0.5, surface: "paint" }, [o.x + s * (width / 2 + 1.3), 2.5, back + depth / 2]));
    for (let k = 0; k < 10; k++) group.add(box((width + 3) / 10, 0.25, 3, { color: k % 2 ? "#ffffff" : "#d8344a", ir: 0.5, surface: "fabric" }, [o.x - (width + 3) / 2 + (k + 0.5) * ((width + 3) / 10), 4.6, back + 1]));
    group.add(box(width + 3, 0.9, 0.3, { color: "#d8344a", ir: 0.5, surface: "wood" }, [o.x, 0.45, o.z - 0.4]));
    for (let k = 0; k < 14; k++) group.add(mesh(G.ball, mat({ color: k % 2 ? "#ffd38a" : "#fff0d0", emissive: 1, ir: 1, uv: 1 }), { pos: [o.x - width / 2 - 1 + (k * (width + 2)) / 13, 4.4, back + 2.55], scale: 0.1 }));
    group.add(mesh(new THREE.RingGeometry(0.55, 0.65, 40), mat({ color: "#ffb36b", emissive: 1, unlit: true, doubleSided: true }), { pos: [o.x, 0.03, o.z + 1.2], rot: [-Math.PI / 2, 0, 0] }));

    rows.forEach(([frac, y], r) => {
      const z = back + 0.4 + r * 0.05;
      group.add(box(width + 2, 0.08, 0.08, { color: "#b8902a", emissive: 0.3, ir: 0.5 }, [o.x, y - 0.55, z]));
      const phases = [[0, 0.62], [0.3, 0.75], [0.15, 0.55]][r % 3];
      for (const ph of phases) {
        const dir = r % 2 ? -1 : 1;
        // Two of each target, taking turns lap by lap: when one wraps round to
        // the start, its last lap's light is still on its way to you, so it
        // stays in sight until that light has arrived.
        const ms = [0, 1].map(() => {
          const m = new Mover(new THREE.Vector3(dir * frac * c, 0, 0), { clip: [o.x - width / 2 - 0.6, z - 2, o.x + width / 2 + 0.6, z + 2] });
          const colors = ["#ffd166", "#7bdcff", "#ff7aa8"];
          m.add(G.cyl, { color: "#fff6e0", ir: 0.6, uv: 0.3 }, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [0.55, 0.12, 0.55] });
          m.add(G.cyl, { color: colors[r], emissive: 0.5, ir: 0.8, uv: 1 }, { pos: [0, y, 0.07], rot: [Math.PI / 2, 0, 0], scale: [0.38, 0.12, 0.38] });
          m.add(G.cyl, { color: "#d8344a", emissive: 0.4, ir: 0.6, uv: 0.6 }, { pos: [0, y, 0.12], rot: [Math.PI / 2, 0, 0], scale: [0.15, 0.12, 0.15] });
          m.add(G.box, { color: "#b8902a", ir: 0.4 }, { pos: [0, y - 0.35, 0], scale: [0.08, 0.4, 0.08] });
          m.withGhost();
          m.group.userData.dynamic = true;
          group.add(m.group);
          return m;
        });
        const span = width;
        const tg = { ms, m: ms[0], lap: 0, y, z, dir, frac, span, phase: ph * span, row: r, hitAt: null, respawn: 0 };
        this.place(tg, 0);
        this.targets.push(tg);
      }
    });
    // Bursts where targets get hit, seen when their light arrives.
    this.pops = sparkField(600, { gravity: 2, intensity: 4, uv: 1 });
    group.add(this.pops);
  }

  // Put a target on its track: it slides across, then wraps round to the
  // other end. Each lap is its own mover, alive only for that lap.
  place(tg, t) {
    const half = tg.span / 2;
    const v = tg.frac * this.c;
    const travel = tg.span / v;
    const k = ((((t + tg.phase / v) % travel) + travel) % travel) / travel;
    const x = this.origin.x + tg.dir * (-half + k * tg.span);
    tg.m = tg.ms[tg.lap++ % 2];
    tg.m.dispatch(t, new THREE.Vector3(x, 0, tg.z));
    tg.wrapAt = t + (1 - k) * travel;
    tg.m.life.set(tg.lap === 1 ? -1e9 : t, tg.wrapAt); // the first lap has been going all along
  }

  throwBall(b) {
    this.balls.push(b);
    this.throws++;
    if (this.balls.length > 30) this.balls.shift();
  }

  update(t) {
    for (const tg of this.targets) {
      if (tg.hitAt !== null && t > tg.respawn) {
        tg.hitAt = null;
        this.place(tg, t);
      }
      if (tg.hitAt === null && t >= tg.wrapAt) this.place(tg, t);
    }
    // Hits are decided where things really are, at the same world time.
    for (const b of this.balls) {
      if (b.done) continue;
      const a = t - b.birth;
      const p = b.origin.clone().addScaledVector(b.vel, a);
      p.y -= 0.5 * b.gravity * a * a;
      if (p.y < 0 || a > 10) { b.done = true; continue; }
      for (const tg of this.targets) {
        if (tg.hitAt !== null) continue;
        const q = tg.m.at(t);
        if (Math.abs(p.z - tg.z) < 0.5 && Math.hypot(p.x - q.x, p.y - tg.y) < 0.62) {
          b.done = true;
          tg.hitAt = t;
          tg.respawn = t + 4;
          tg.m.life.y = t;
          this.score += 1 + tg.row;
          sfx.clang(new THREE.Vector3(q.x, tg.y, tg.z));
          const col = new THREE.Color(["#ffd166", "#7bdcff", "#ff7aa8"][tg.row]);
          for (let i = 0; i < 40; i++) {
            const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(0.25 * this.c);
            this.pops.set({ origin: new THREE.Vector3(q.x, tg.y, tg.z + 0.2), vel: d.add(tg.m.vel.clone().multiplyScalar(0.5)), birth: t, life: 1.6, color: col, size: 0.25 });
          }
          break;
        }
      }
    }
  }
}
