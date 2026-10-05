// The shots, in order. Each sets up a place (in the page), then runs `frame`
// in the page once per video frame with u (0 to 1 through the shot) and s
// (seconds into it). Helpers in the page: V.cam(x, y, z, yaw, pitch) puts the
// camera there, V.free() lets it go anywhere, V.mix and V.ease.
export const SHOTS = [
  {
    id: "funfair-golden",
    place: "pier",
    from: 0, to: 6,
    setup: () => {
      slowlight.load("pier");
      slowlight.instance.time.set(0.03);
      slowlight.advance(1.5);
      V.free();
    },
    frame: (u) => {
      const e = V.ease(u);
      V.cam(V.mix(0.4, 0, e), V.mix(0.2, 1.2, e), V.mix(50, 27, e), V.mix(-0.02, 0, e), V.mix(0.07, 0.02, e));
    },
  },
  {
    id: "funfair-lights",
    place: "pier",
    from: 6, to: 10,
    setup: () => {
      slowlight.world.c = 16; // quicker light, so the switch-on rolls the length of the pier in a few seconds
      slowlight.instance.time.set(0.47 - 0.9 / 170);
      slowlight.advance(0.2);
      V.free();
    },
    frame: (u) => V.cam(0.4, 0.6, V.mix(33, 29, u), 0.02, 0.05),
  },
  {
    id: "funfair-wheel",
    place: "pier",
    from: 10, to: 13,
    setup: () => {
      slowlight.world.c = 6;
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
    id: "funfair-fireworks",
    place: "pier",
    from: 13, to: 16,
    setup: () => {
      slowlight.instance.time.set(0.66);
      slowlight.advance(16);
      V.free();
      // Wait until a burst's light will reach the end of the pier in about a second.
      const eye = { x: -8, y: 1.4, z: -171 };
      const seenIn = (b) => b.t + Math.hypot(b.at.x - eye.x, b.at.y - eye.y, b.at.z - eye.z) / slowlight.world.c - slowlight.world.t;
      for (let i = 0; i < 600 && !slowlight.instance.fw.bangs.some((b) => { const k = seenIn(b); return k > 0.6 && k < 1.0; }); i++) slowlight.advance(0.1);
    },
    frame: (u) => V.cam(-8, -0.2, -171, V.mix(-0.08, -0.14, u), V.mix(0.5, 0.54, u)),
  },
  {
    id: "crossroads-taxis",
    place: "city",
    from: 16, to: 20,
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
    id: "crossroads-bonk",
    place: "city",
    from: 20, to: 24,
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
    id: "railway-storm",
    place: "railway",
    from: 24, to: 30,
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
    id: "road-faster",
    place: "highway",
    from: 30, to: 38,
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
    id: "starship-jump",
    place: "starship",
    from: 38, to: 44,
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
    id: "starship-home",
    place: "starship",
    from: 44, to: 48,
    setup: async (t) => {
      await t.q(() => {
        slowlight.load("starship");
        slowlight.advance(0.5);
        slowlight.player.ship.local.set(0, 0, -4);
        slowlight.act();
      });
      // Fly the whole trip: out to Proxima, then home.
      for (const goal of [3, 4]) {
        await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
        for (let i = 0; i < 60 && !(await t.q((g) => slowlight.instance.goals[g].done, goal)); i++) await t.q(() => slowlight.advance(5));
        await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
        await t.q(() => slowlight.advance(0.5));
      }
      await t.q(() => slowlight.advance(4));
    },
    frame: (u) => { slowlight.player.yaw = slowlight.player.ship.heading + V.mix(0.25, 0.05, u); slowlight.player.pitch = V.mix(0.12, 0.05, u); },
  },
  // A quick montage, a second each: taxi ride, coaster, wheel, the road behind.
  {
    id: "montage-taxi",
    place: "city",
    from: 48, to: 49,
    setup: () => {
      slowlight.load("city");
      slowlight.player.place(-7.6, 14, 0);
      slowlight.act();
      slowlight.advance(2.2);
    },
    frame: () => {},
  },
  {
    id: "montage-coaster",
    place: "pier",
    from: 49, to: 50,
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
    id: "montage-wheel",
    place: "pier",
    from: 50, to: 51,
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
    id: "montage-road",
    place: "highway",
    from: 51, to: 52,
    setup: () => {
      slowlight.load("highway");
      slowlight.player.eta = 7;
      slowlight.advance(2);
    },
    frame: () => { slowlight.player.lookBack = true; slowlight.player.pitch = 0.1; },
  },
  {
    id: "title",
    place: "pier",
    from: 52, to: 60,
    setup: () => {
      slowlight.load("pier");
      slowlight.instance.time.set(0.74);
      slowlight.advance(14);
      V.free();
    },
    frame: (u) => V.cam(V.mix(42, 38, u), 2, V.mix(-128, -134, u), V.mix(0.9, 0.82, u), 0.2),
    title: true,
  },
];
