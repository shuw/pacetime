import * as THREE from "three";
import { box, G, mesh } from "./geo.js";
import { mat } from "./shaders.js";
import { effects, retardedTime, world } from "./relativity.js";
import { personGeometry } from "./people.js";
import { neon } from "./earth.js";

// A hall of mirrors: a small room with mirrors on two facing walls. What you
// see in a mirror is light that went the long way round, so each image is
// drawn as a real copy of the room behind the glass (mirrored, one room-width
// further along for each bounce). The light from each copy takes longer to
// reach you, so further images show you, and everything else, further back
// in time.
export class MirrorHall {
  constructor(group, { center, W = 4, D = 6, H = 3.2, images = 5, colliders, toast }) {
    this.cx = center[0];
    this.cz = center[1];
    this.W = W;
    this.D = D;
    this.H = H;
    this.images = images;
    this.toast = toast;
    this.history = []; // { t, x, z, yaw, wave }
    this.waveUntil = -1;
    const { cx, cz } = this;
    const z0 = cz - D / 2, z1 = cz + D / 2;

    // Outside: a striped pavilion with a sign and a curtained door facing the sea.
    this.shell = new THREE.Group();
    this.shell.userData.dynamic = true;
    const stripe = (i) => (i % 2 ? "#ffffff" : "#8338ec");
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 6; k++) this.shell.add(box(0.1, H + 0.6, D / 6, { color: stripe(k), ir: 0.5 }, [cx + sx * (W / 2 + 0.16), (H + 0.6) / 2, z0 + (k + 0.5) * (D / 6)]));
    }
    group.add(this.shell);
    const wall = { color: "#3d2a5c", ir: 0.4 };
    group.add(box(W + 0.42, H + 0.6, 0.12, wall, [cx, (H + 0.6) / 2, z1 + 0.06]));
    for (const sx of [-1, 1]) group.add(box(W / 2 - 0.7 + 0.21, H + 0.6, 0.12, wall, [cx + sx * (0.7 + (W / 2 - 0.7 + 0.21) / 2), (H + 0.6) / 2, z0 - 0.06]));
    group.add(box(1.4, H + 0.6 - 2.3, 0.12, wall, [cx, 2.3 + (H + 0.6 - 2.3) / 2, z0 - 0.06]));
    group.add(mesh(new THREE.ConeGeometry((W + 1) * 0.75, 1.6, 4), mat({ color: "#ffbe0b", ir: 0.5 }), { pos: [cx, H + 1.4, cz], rot: [0, Math.PI / 4, 0], scale: [1, 1, D / W] }));
    const sign = neon("MIRRORS", { size: 0.2, color: "#ff8fd8", width: 0.07 });
    sign.position.set(cx - sign.textWidth / 2, H + 0.05, z0 - 0.14);
    sign.rotation.y = Math.PI;
    sign.position.x = cx + sign.textWidth / 2;
    group.add(sign);
    // A velvet curtain in the doorway, open in the middle.
    for (const sx of [-1, 1]) group.add(box(0.45, 2.3, 0.05, { color: "#b0003a", ir: 0.5 }, [cx + sx * 0.5, 1.15, z0 - 0.02]));

    // The room and its images.
    this.rooms = [];
    for (let n = -images; n <= images; n++) {
      const g = new THREE.Group();
      g.userData.dynamic = true;
      const dim = Math.pow(0.8, Math.abs(n)); // each bounce loses a little light
      this.buildRoom(g, n, dim);
      // Image n: shifted n room-widths along x, mirrored for odd n.
      g.position.set(n * W, 0, 0);
      if (n % 2 !== 0) {
        g.scale.x = -1;
        g.position.x += 2 * cx; // mirror about the room's centre line
      }
      group.add(g);
      this.rooms.push({ n, g, dim });
    }
    // Past the last image the corridor fades to darkness.
    this.caps = [-1, 1].map((sx) => {
      const cap = box(0.1, H + 0.2, D + 0.2, { color: "#0a0612", ir: 0, uv: 0 }, [cx + sx * (images * W + W / 2 + 0.06), H / 2, cz]);
      cap.userData.dynamic = true;
      group.add(cap);
      return cap;
    });
    // Colliders: the walls, with the doorway left open.
    for (let z = z0 + 0.25; z < z1; z += 0.5) for (const sx of [-1, 1]) colliders.push({ x: cx + sx * (W / 2 + 0.05), z, r: 0.12 });
    for (let x = cx - W / 2; x <= cx + W / 2; x += 0.5) {
      colliders.push({ x, z: z1 + 0.05, r: 0.12 });
      if (Math.abs(x - cx) > 0.75) colliders.push({ x, z: z0 - 0.05, r: 0.12 });
    }

    // You, as seen in each image. Arms up while waving.
    const look = { body: "#5ce1c6", belly: "#e8fff8", top: "antenna", topColor: "#ffbe0b", eyes: "round", cheeks: true, wide: 1.05 };
    this.youStand = personGeometry(look, { scale: 1.15 });
    this.youWave = personGeometry(look, { scale: 1.15, pose: "ride" });
    this.yous = [];
    for (const { n, dim } of this.rooms) {
      if (n === 0) continue;
      const sv = { value: new THREE.Vector3() };
      const m = mesh(this.youStand, mat({ color: new THREE.Color(dim, dim, dim).getStyle(), vertexColors: true, ir: 0.4, uv: 0.3, sourceVel: sv }));
      m.userData.dynamic = true;
      group.add(m);
      this.yous.push({ n, m, sv });
    }
  }

  buildRoom(g, n, dim) {
    const { cx, cz, W, D, H } = this;
    const z0 = cz - D / 2, z1 = cz + D / 2;
    const tint = (c) => new THREE.Color(c).multiplyScalar(dim).getStyle();
    const add = (o) => (g.add(o), o);
    // Floor: a starry checkerboard; ceiling; back and front walls.
    add(box(W, 0.02, D, { color: tint("#2a1f4a"), checker: { b: tint("#ff8fd8"), size: 0.5 }, ir: 0.3 }, [cx, 0.02, cz]));
    add(box(W, 0.06, D, { color: tint("#1d1530"), ir: 0.2 }, [cx, H, cz]));
    add(box(W, H, 0.05, { color: tint("#4a2a7a"), ir: 0.3 }, [cx, H / 2, z1]));
    for (const sx of [-1, 1]) add(box(W / 2 - 0.7, H, 0.05, { color: tint("#4a2a7a"), ir: 0.3 }, [cx + sx * (0.7 + (W / 2 - 0.7) / 2), H / 2, z0]));
    add(box(1.4, H - 2.3, 0.05, { color: tint("#4a2a7a"), ir: 0.3 }, [cx, 2.3 + (H - 2.3) / 2, z0]));
    add(box(1.4, 2.3, 0.04, { color: tint("#b0003a"), ir: 0.5 }, [cx, 1.15, z0 - 0.01]));
    // Mirror frames on both side walls, and the glass itself.
    for (const sx of [-1, 1]) {
      const x = cx + sx * W / 2;
      add(box(0.08, 0.14, D, { color: tint("#ffd166"), emissive: 0.3 * dim, ir: 0.6 }, [x, 0.1, cz]));
      add(box(0.08, 0.14, D, { color: tint("#ffd166"), emissive: 0.3 * dim, ir: 0.6 }, [x, H - 0.1, cz]));
      for (let k = 0; k <= 3; k++) add(box(0.08, H, 0.12, { color: tint("#ffd166"), emissive: 0.3 * dim, ir: 0.6 }, [x, H / 2, z0 + (k * D) / 3]));
      const glass = mesh(G.box, mat({ color: "#dfe8ff", opacity: 0.1, ir: 0.1, uv: 0.2, depthWrite: false }), { pos: [x, H / 2, cz], scale: [0.02, H, D] });
      glass.renderOrder = 3;
      add(glass);
    }
    // A bulb that pulses on a shared clock, and a little attendant who hops.
    const bulbMat = mat({ color: "#fff1c4", emissive: 1, ir: 1, uv: 1, unique: true });
    const bulb = add(mesh(G.sphere, bulbMat, { pos: [cx, H - 0.6, cz + 1.4], scale: 0.18 }));
    add(box(0.02, 0.5, 0.02, { color: "#2b2d33" }, [cx, H - 0.3, cz + 1.4]));
    const pal = mesh(personGeometry({ body: "#ff8fd8", belly: "#ffe0f2", top: "bow", topColor: "#ffbe0b", eyes: "round", cheeks: true, wide: 1 }, { scale: 0.9 }), mat({ color: tint("#ffffff"), vertexColors: true, ir: 0.4 }), { pos: [cx + 0.9, 0, cz + 2.2], rot: [0, Math.PI + 0.4, 0] });
    add(pal);
    g.userData.bulb = { mat: bulbMat, mesh: bulb, dim };
    g.userData.pal = pal;
  }

  inside(p) {
    return Math.abs(p.x - this.cx) < this.W / 2 + 0.1 && p.z > this.cz - this.D / 2 - 0.4 && p.z < this.cz + this.D / 2;
  }

  wave(t) {
    this.waveUntil = t + 1.4;
  }

  // Where image n of a point is.
  image(n, x, z) {
    const { cx, W } = this;
    return new THREE.Vector3(n % 2 === 0 ? x + n * W : 2 * cx + n * W - x, 0, z);
  }

  // Where you were at world time t (from the recorded history).
  past(t) {
    const h = this.history;
    if (!h.length) return null;
    if (t <= h[0].t) return h[0];
    let lo = 0, hi = h.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (h[m].t <= t) lo = m; else hi = m; }
    const a = h[lo], b = h[hi];
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    return { t, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + (b.yaw - a.yaw) * k, wave: k < 0.5 ? a.wave : b.wave };
  }

  update(eye, player, t) {
    const inside = this.inside(player.pos);
    this.shell.visible = !inside;
    for (const r of this.rooms) r.g.visible = inside || r.n === 0;
    for (const c of this.caps) c.visible = inside;
    // Record where you are.
    const h = this.history;
    h.push({ t, x: player.pos.x, z: player.pos.z, yaw: player.yaw, wave: t < this.waveUntil });
    while (h.length > 2 && h[1].t < t - 14) h.shift();
    // Each pulsing bulb shows the time its light left it.
    for (const r of this.rooms) {
      const b = r.g.userData.bulb;
      const wp = b.mesh.getWorldPosition(new THREE.Vector3());
      const tr = retardedTime(eye, wp);
      const phase = ((tr % 1.6) + 1.6) % 1.6;
      const k = phase < 0.25 ? 1 : 0.12;
      b.mat.uniforms.uSpec.value.z = k;
      b.mat.uniforms.uColor.value.set(k > 0.5 ? "#fff1c4" : "#4a3c2a").multiplyScalar(r.dim);
      const pal = r.g.userData.pal;
      const pp = pal.getWorldPosition(new THREE.Vector3());
      const hp = ((retardedTime(eye, pp) % 2.4) + 2.4) % 2.4;
      pal.position.y = hp < 0.4 ? Math.sin((hp / 0.4) * Math.PI) * 0.35 : 0;
    }
    // Your images: solve for when the light now reaching you left each one.
    for (const y of this.yous) {
      y.m.visible = inside;
      if (!inside) continue;
      let lo = Math.max(h[0].t, t - 14), hi = t, s = null;
      const seen = (tt) => { const p = this.past(tt); return this.image(y.n, p.x, p.z).setY(0.9).distanceTo(eye) - world.c * (t - tt); };
      if (!effects.delay) lo = hi = t;
      else if (seen(lo) > 0) hi = lo; // older than the history: show the oldest
      else for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (seen(mid) > 0) hi = mid; else lo = mid; }
      s = this.past((lo + hi) / 2);
      const p = this.image(y.n, s.x, s.z);
      y.m.position.set(p.x, 0, p.z);
      const odd = y.n % 2 !== 0;
      y.m.rotation.y = odd ? -s.yaw : s.yaw;
      y.m.scale.set(odd ? -1 : 1, 1, 1);
      y.m.geometry = s.wave ? this.youWave : this.youStand;
      y.age = t - s.t;
    }
  }
}
