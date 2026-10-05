// The shots, in order. Each sets up a place (in the page), then runs `frame`
// in the page once per video frame with u (0 to 1 through the shot) and s
// (seconds into it). Helpers in the page: V.cam(x, y, z, yaw, pitch) puts the
// camera there, V.free() lets it go anywhere, V.mix and V.ease. A shot runs
// on from the one before unless it loads its place; `place` says which it
// needs when recorded on its own. `speed` runs the world faster than the video.
export const SHOTS = [
  {
    id: "funfair-golden", place: "pier", from: 0, to: 8,
    setup: () => {
      slowlight.load("pier");
      slowlight.instance.time.set(0.03);
      slowlight.advance(1.5);
      V.free();
    },
    frame: (u) => {
      const e = V.ease(u);
      V.cam(V.mix(0.4, 0, e), V.mix(0.2, 1.2, e), V.mix(52, 26, e), V.mix(-0.02, 0, e), V.mix(0.07, 0.02, e));
    },
  },
  {
    id: "funfair-lights", place: "pier", from: 8, to: 12,
    setup: () => {
      slowlight.world.c = 16; // quicker light, so the switch-on rolls the length of the pier in a few seconds
      slowlight.instance.time.set(0.47 - 0.9 / 170);
      slowlight.advance(0.2);
      V.free();
    },
    frame: (u) => V.cam(0.4, 0.6, V.mix(33, 29, u), 0.02, 0.05),
  },
  {
    id: "funfair-mirrors", place: "pier", from: 12, to: 16,
    setup: () => {
      slowlight.world.c = 6;
      slowlight.instance.time.set(0.4);
      slowlight.player.place(-31.2, 50.5, 1.57);
      slowlight.advance(6);
    },
    // Wave twice: each reflection waves back a little later than the last.
    frame: (u, s) => {
      const p = slowlight.player;
      p.yaw = V.mix(1.62, 1.5, u); p.pitch = 0.02;
      if ((s > 0.5 && s < 0.54) || (s > 2.3 && s < 2.34)) slowlight.act();
    },
  },
  {
    id: "funfair-wheel", place: "pier", from: 16, to: 19,
    setup: () => {
      slowlight.instance.time.set(0.8);
      slowlight.advance(2);
      V.free();
    },
    frame: (u) => {
      const x = V.mix(-10, -19, u), z = V.mix(-121, -123, u);
      const dx = -16 - x, dz = -146 - z, dy = 14.5 - 1.8;
      V.cam(x, 0.2, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)) - 0.04);
    },
  },
  {
    id: "funfair-gallery", place: "pier", from: 19, to: 22,
    setup: () => {
      slowlight.player.place(-20, -130.4, 0);
      slowlight.player.pitch = 0.04;
      window.__gal = { next: 0.25, tg: null };
    },
    // Throw glowing balls at where the targets really are (and will be), ahead of where they look.
    frame: (u, s) => {
      const g = slowlight.instance.gallery, p = slowlight.player, W = window.__gal, t = slowlight.world.t;
      const e = p.eye, o = e.clone().setY(e.y - 0.3), speed = 0.6 * slowlight.world.c;
      if (!W.tg) W.tg = g.targets.filter((x) => x.hitAt === null && !x.aimed && Math.abs(x.m.at(t + 1).x - o.x) < 4.5).sort((a, b) => a.row - b.row)[0] ?? null;
      if (W.tg) {
        let T = Math.abs(W.tg.z - o.z) / speed, P;
        for (let k = 0; k < 6; k++) { P = W.tg.m.at(t + T).setY(W.tg.y); T = P.distanceTo(o) / speed; }
        const d = P.clone().sub(o).normalize();
        p.yaw += (Math.atan2(-d.x, -d.z) - p.yaw) * 0.25;
        p.pitch += (Math.asin(d.y) + 0.05 - p.pitch) * 0.25;
        if (s >= W.next) {
          const vel = d.multiplyScalar(speed);
          vel.y += 0.25 * T;
          const color = slowlight.shared.uSkyTop.value.clone().set(["#ffd166", "#7bdcff", "#ff7aa8"][W.tg.row]);
          slowlight.instance.balls.set({ origin: o, vel, birth: t, life: 12, color, size: 0.5 });
          slowlight.instance.onThrow({ origin: o, vel, birth: t, gravity: 0.5 });
          W.tg.aimed = true; W.tg = null; W.next = s + 0.75;
        }
      }
    },
  },
  {
    id: "funfair-fireworks", place: "pier", from: 22, to: 28,
    setup: () => {
      slowlight.instance.time.set(0.66);
      slowlight.advance(16);
      slowlight.world.c = 20; // light at 72 km/h: the flash comes three seconds after the bang
      V.free();
      // Wait until a bang will be heard 0.8 s in (its flash follows about three seconds later).
      const eye = { x: -8, y: 1.4, z: -171 };
      const d = (b) => Math.hypot(b.at.x - eye.x, b.at.y - eye.y, b.at.z - eye.z);
      const quiet = (b) => b.t + d(b) / slowlight.world.c < slowlight.world.t + 0.2 || b.t + d(b) / 343 > slowlight.world.t + 6;
      let pick = null;
      for (let i = 0; i < 3000 && !pick; i++) {
        const now = slowlight.world.t;
        pick = slowlight.instance.fw.bangs.find((b) => Math.abs(b.t + d(b) / 343 - now - 0.8) < 0.02) ?? null;
        if (pick && !slowlight.instance.fw.bangs.every((b) => b === pick || quiet(b))) pick = null;
        if (!pick) slowlight.advance(0.02);
      }
      // Look where it will burst.
      const at = pick ? pick.at : { x: 0, y: 36, z: -224 };
      window.__look = { yaw: Math.atan2(-(at.x - eye.x), -(at.z - eye.z)), pitch: Math.atan2(at.y - eye.y, Math.hypot(at.x - eye.x, at.z - eye.z)) - 0.12 };
    },
    frame: (u) => V.cam(-8, -0.2, -171, window.__look.yaw + V.mix(0.04, -0.04, u), window.__look.pitch),
  },
  {
    id: "crossroads-taxis", place: "city", from: 28, to: 32,
    setup: () => {
      slowlight.load("city");
      slowlight.advance(1);
      V.free();
      // Until a fast taxi coming our way will pass the camera 2.3 s in.
      const CAM = 36;
      for (let i = 0; i < 6000; i++) {
        const t = slowlight.world.t;
        if (slowlight.instance.cabs.some(({ m, lane }) => lane.beta > 0.8 && lane.dir > 0 && Math.abs((CAM - m.at(t).z) / m.vel.z - 2.3) < 0.03)) break;
        slowlight.advance(0.02);
      }
    },
    frame: (u) => V.cam(-0.2, -0.55, V.mix(36, 37.5, u), V.mix(0.1, 0.05, u), 0.03),
  },
  {
    id: "crossroads-bonk", place: "city", from: 32, to: 36,
    setup: () => {
      const ZEBRA = 8.8, AVE = 7;
      // On the curb until a fast taxi is just under two seconds away...
      slowlight.player.place(-(AVE + 0.6), ZEBRA, 0);
      for (let i = 0; i < 4000; i++) {
        const t = slowlight.world.t;
        const due = slowlight.instance.cabs.filter(({ lane }) => lane.beta > 0.8 && lane.dir > 0)
          .map(({ m }) => (ZEBRA - 1.6 - m.at(t).z) / m.vel.z);
        if (due.some((d) => d > 1.95 && d < 2.05) && !due.some((d) => d > -0.2 && d < 1.95)) break;
        slowlight.advance(0.02);
      }
      // ...then step into its lane, looking up the avenue.
      slowlight.player.place(-1.75, ZEBRA, 0.06);
      slowlight.player.pitch = 0.02;
    },
    // Once bonked, turn dizzily to face across the road.
    frame: () => {
      const p = slowlight.player;
      if (slowlight.instance.bonks > 0) { p.yaw += (-1.15 - p.yaw) * 0.12; p.pitch += (0.02 - p.pitch) * 0.1; }
    },
  },
  {
    id: "crossroads-guard", place: "city", from: 36, to: 40,
    setup: () => {
      const p = slowlight.player;
      p.place(-8.4, 8.8, -Math.PI / 2 - 0.55);
      // Wait for the guard's paddle to turn to GO.
      let was = true;
      for (let i = 0; i < 6000; i++) {
        slowlight.advance(0.02);
        const go = slowlight.instance.guardGo;
        if (go && !was) break;
        was = go;
      }
      p.pitch = 0.08;
    },
    // A look at the paddle, then across on her GO, and a look back at the traffic.
    frame: (u, s) => {
      const p = slowlight.player, k = V.ease((s - 0.9) / 1.8);
      p.pos.set(V.mix(-8.4, 7.7, k), 0, 8.8); p.u.set(0, 0, 0); p.v.set(0, 0, 0);
      const back = V.ease((s - 2.7) / 0.9);
      p.yaw = V.mix(V.mix(-Math.PI / 2 - 0.55, -Math.PI / 2, V.ease((s - 0.6) / 0.6)), Math.PI / 2 + 0.25, back);
      p.pitch = V.mix(0.08, 0.02, V.ease(s - 0.6));
    },
  },
  {
    id: "railway-storm", place: "railway", from: 40, to: 46,
    setup: () => {
      slowlight.load("railway");
      // Start so the strikes' light reaches the camera three seconds in.
      const tr = slowlight.instance.trains[0], c = slowlight.world.c;
      const seen = tr.timeAt(-90) + Math.hypot(tr.halfLength, 25, 1.85) / c;
      slowlight.advance(seen - 3);
      V.free();
    },
    frame: (u) => V.cam(V.mix(-97, -87, u), -0.35, -25, Math.PI + V.mix(0.08, -0.08, u), 0.3),
  },
  {
    id: "railway-tunnel", place: "railway", from: 46, to: 50,
    setup: () => {
      // From the TUNNEL sign's ring, both glass doors are the same distance
      // away: start so you see them both shut, the whole train inside, 2 s in.
      const tr = slowlight.instance.trains[0], h = tr.halfLength, c = slowlight.world.c;
      const shut = tr.timeAt(-30 + h) + 0.15, open = tr.timeAt(10 - h) - 0.15;
      const seen = (shut + open) / 2 + Math.hypot(20, 17, 1.6) / c;
      slowlight.advance(Math.max(0, seen - 2 - slowlight.world.t));
      V.free();
    },
    frame: (u) => V.cam(-10, 0, V.mix(18, 17, u), 0, 0.06),
  },
  {
    id: "road-faster", place: "highway", from: 50, to: 58,
    setup: () => {
      slowlight.load("highway");
      slowlight.advance(0.5);
    },
    frame: (u) => {
      const p = slowlight.player;
      p.eta = 0.35 + 10.2 * Math.pow(u, 1.7);
      p.yaw = V.mix(0.22, 0, V.ease(Math.min(1, u * 1.6)));
      p.pitch = 0.04;
    },
    counter: true,
  },
  {
    id: "road-pulse", place: "highway", from: 58, to: 62,
    setup: () => { slowlight.player.eta = 10.55; },
    // Flat out, fire a pulse of light ahead: it pulls away regardless.
    frame: (u, s) => {
      slowlight.player.yaw = 0; slowlight.player.pitch = 0.02;
      if (s > 0.2 && s < 0.24) slowlight.instance.fire();
    },
    counter: true,
  },
  {
    id: "starship-jump", place: "starship", from: 62, to: 68,
    setup: () => {
      slowlight.load("starship");
      slowlight.advance(0.5);
      slowlight.player.ship.local.set(0, 0, -4);
      slowlight.act();
      slowlight.player.ship.ease = 0;
      slowlight.player.pitch = -0.08;
    },
    frame: (u) => {
      const s = slowlight.player.ship;
      // Gently out past the jellies and the whale, then the jump.
      s.eta = u < 0.4 ? 7e-7 * (u / 0.4) ** 2 : Math.exp(V.mix(Math.log(7e-7), Math.log(10.5), V.ease((u - 0.4) / 0.6)));
      const turn = V.ease((u - 0.3) / 0.25);
      slowlight.player.yaw = s.heading + V.mix(0.38, 0, turn);
      slowlight.player.pitch = V.mix(-0.2, 0.02, turn);
    },
  },
  {
    id: "starship-buoy", place: "starship", from: 68, to: 72,
    setup: async (t) => {
      await t.q(() => {
        slowlight.load("starship");
        slowlight.advance(0.5);
        slowlight.player.ship.local.set(0, 0, -4);
        slowlight.act();
      });
      await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
      for (let i = 0; i < 60 && !(await t.q(() => slowlight.instance.goals[3].done)); i++) await t.q(() => slowlight.advance(5));
      await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
      await t.q(() => slowlight.advance(1));
    },
    // The Far Buoy's crystal lighthouse, with Proxima b beside it.
    frame: (u) => { const p = slowlight.player; p.yaw = p.ship.heading + V.mix(0.8, 0.62, u); p.pitch = 0.12; },
  },
  {
    id: "starship-cards", place: "starship", from: 72, to: 78, speed: 3,
    setup: async (t) => {
      // Home again: W at the helm, and years of cards from the crew catch up with us.
      await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
      await t.q(() => slowlight.advance(30));
      await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
      await t.q(() => { window.__cards = []; window.__note = slowlight.instance.note; });
    },
    frame: (u) => {
      const p = slowlight.player;
      p.yaw = p.ship.heading + Math.PI + V.mix(-0.35, -0.15, u); p.pitch = -0.1;
      const n = slowlight.instance.note;
      if (n !== window.__note && n.startsWith("Card from home")) window.__cards.push(n);
      window.__note = n;
    },
    cards: true,
  },
  {
    id: "starship-home", place: "starship", from: 78, to: 82,
    setup: async (t) => {
      await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
      for (let i = 0; i < 60 && !(await t.q(() => slowlight.instance.goals[4].done)); i++) await t.q(() => slowlight.advance(5));
      await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
      await t.q(() => slowlight.advance(4));
    },
    frame: (u) => { slowlight.player.yaw = slowlight.player.ship.heading + V.mix(0.25, 0.05, u); slowlight.player.pitch = V.mix(0.12, 0.05, u); },
  },
  // A quick montage, a second each: taxi ride, coaster, wheel, the road behind.
  {
    id: "montage-taxi", place: "city", from: 82, to: 83,
    setup: () => {
      slowlight.load("city");
      slowlight.player.place(-7.6, 14, 0);
      slowlight.act();
      slowlight.advance(2.2);
    },
    frame: () => {},
  },
  {
    id: "montage-coaster", place: "pier", from: 83, to: 84,
    setup: () => {
      slowlight.load("pier");
      slowlight.instance.time.set(0.82);
      slowlight.player.place(24.4, -128, Math.PI);
      for (let i = 0; i < 600 && slowlight.instance.action()?.label !== "Board the coaster"; i++) slowlight.advance(0.1);
      slowlight.act();
      slowlight.advance(50); // over the top of the lift hill and down the first drop
    },
    frame: () => { slowlight.player.pitch = -0.3; },
  },
  {
    id: "montage-wheel", place: "pier", from: 84, to: 85,
    setup: () => {
      if (slowlight.instance.action()?.label === "Step off the coaster") slowlight.act();
      slowlight.instance.time.set(0.84);
      slowlight.player.place(-16, -142, 0);
      slowlight.act();
      slowlight.advance(4.2); // the top of the wheel
    },
    frame: (u) => { slowlight.player.yaw = V.mix(0.5, 0.2, u); slowlight.player.pitch = -0.12; },
  },
  {
    id: "montage-road", place: "highway", from: 85, to: 86,
    setup: () => {
      slowlight.load("highway");
      slowlight.player.eta = 7;
      slowlight.advance(2);
    },
    frame: () => { slowlight.player.lookBack = true; slowlight.player.pitch = 0.1; },
  },
  {
    id: "title", place: "pier", from: 86, to: 96,
    setup: () => {
      slowlight.load("pier");
      slowlight.instance.time.set(0.74);
      slowlight.advance(14);
      V.free();
    },
    frame: (u) => V.cam(V.mix(42, 37, u), 2, V.mix(-128, -135, u), V.mix(0.9, 0.8, u), 0.2),
    title: true,
  },
];
