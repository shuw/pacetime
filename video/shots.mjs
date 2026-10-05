// The shots, in order, placed on the music's bar grid. Each sets up a place
// (in the page), then runs `frame` in the page once per video frame with u (0
// to 1 through the shot) and s (seconds into it). `frame` can return "hold" to
// freeze the world for that frame, or { split } to show relativity switched off
// left of that fraction of the screen. Helpers in the page: V.cam(x, y, z,
// yaw, pitch), V.aim(x, y, z, at) → [yaw, pitch], V.free(), V.mix, V.ease,
// V.xray(on), V.labels. A shot runs on from the one before unless it loads its
// place; `place` says which it needs when recorded on its own. `speed` runs the
// world faster than the video.
import { bar, BEAT } from "./timeline.mjs";

const B2 = 2 * BEAT; // montage cuts, two beats each

export const SHOTS = [
  // Cold open: the rainbow tunnel at 0.99999999 c, then the question over black.
  {
    id: "open-tunnel", place: "highway", from: 0, to: bar(1),
    setup: () => {
      slowlight.load("highway");
      slowlight.player.eta = 9;
      slowlight.advance(2);
    },
    frame: (u) => { const p = slowlight.player; p.eta = V.mix(9.5, 11.5, u); p.yaw = V.mix(0.08, -0.04, u); p.pitch = 0.03; },
  },
  { id: "open-black", place: "highway", from: bar(1), to: bar(2), setup: () => {}, frame: () => "hold", black: true },
  {
    id: "pier-drone", place: "pier", from: bar(2), to: bar(5),
    setup: () => {
      slowlight.load("pier");
      slowlight.instance.time.set(0.04);
      slowlight.advance(1.5);
      V.free();
    },
    frame: (u) => {
      const e = V.ease(u);
      const x = V.mix(20, 7, e), y = V.mix(17, 7, e), z = V.mix(78, 4, e);
      const [yaw, pitch] = V.aim(x, y, z, [V.mix(2, -12, e), V.mix(-2, 6, e), V.mix(25, -146, e)]);
      V.cam(x, y, z, yaw, pitch);
    },
  },
  {
    id: "pier-lights", place: "pier", from: bar(5), to: bar(7),
    setup: () => {
      slowlight.world.c = 16; // quicker light, so the switch-on rolls the length of the pier in a couple of seconds
      slowlight.instance.time.set(0.47 - 0.5 / 170);
      slowlight.advance(0.2);
      V.free();
    },
    frame: (u) => V.cam(0.4, 0.6, V.mix(33, 30, u), 0.02, 0.05),
  },
  {
    id: "mirrors", place: "pier", from: bar(7), to: bar(9),
    setup: () => {
      slowlight.world.c = 6;
      slowlight.instance.time.set(0.4);
      slowlight.player.place(-31.2, 50.5, 1.57);
      slowlight.advance(6);
    },
    frame: (u, s) => {
      const p = slowlight.player;
      p.yaw = V.mix(1.62, 1.5, u); p.pitch = 0.02;
      if ((s > 0.25 && s < 0.29) || (s > 1.9 && s < 1.94)) slowlight.act();
    },
  },
  // The gallery: throws aimed at where the targets really are, and a freeze to show it.
  {
    id: "gallery", place: "pier", from: bar(9), to: bar(11),
    setup: () => {
      slowlight.instance.time.set(0.8);
      slowlight.player.place(-20, -130.4, 0);
      slowlight.player.pitch = 0.04;
      const g = slowlight.instance.gallery;
      window.__gal = { next: 0, tg: null, aimed: null };
      // Turn toward the next target's real future position and throw at it.
      window.__galStep = (s) => {
        const p = slowlight.player, W = window.__gal, t = slowlight.world.t;
        const e = p.eye, o = e.clone().setY(e.y - 0.3), speed = 0.6 * slowlight.world.c;
        if (!W.tg) W.tg = g.targets.filter((x) => x.hitAt === null && !x.aimed && Math.abs(x.m.at(t + 1.5).x - o.x) < 4.5).sort((a, b) => a.row - b.row)[0] ?? null;
        if (!W.tg) return;
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
          W.tg.aimed = true; W.aimed = W.aimed ?? W.tg; W.tg = null; W.next = s + 0.7;
        }
      };
      // Start throwing a little before the shot, so the first ball is on its way.
      for (let i = 0; i < 36; i++) { window.__galStep(i / 30 - 1.2); slowlight.advance(1 / 30); }
      window.__gal.next = 0.3;
    },
    frame: (u, s) => {
      const W = window.__gal, tg = W.aimed;
      const hold = s > 0.55 && s < 1.75 && tg && tg.hitAt === null;
      if (hold) {
        V.xray(true, 0.3);
        const eye = slowlight.player.eye, seen = tg.m.seen(eye).pos, real = tg.m.at(slowlight.world.t);
        const k = Math.min(1, (s - 0.55) / 0.2);
        V.labels = [
          { at: [seen.x, tg.y, seen.z], text: "WHAT YOU SEE", color: "#ffd38a", up: 150, dx: -60, k },
          { at: [real.x, tg.y, real.z], text: "WHERE IT IS", color: "#7fe8ff", up: 250, dx: 60, k },
        ];
        return "hold";
      }
      V.labels = []; V.xray(false);
      window.__galStep(s);
    },
  },
  {
    id: "fireworks", place: "pier", from: bar(11), to: bar(14),
    setup: () => {
      // Dusk, just before the show: let any shells already up burst and fade,
      // then launch one of our own. Its bang is heard 0.35 s in, and light is
      // slowed so its flash arrives on the bar two bars later.
      slowlight.instance.time.set(0.45);
      slowlight.advance(13);
      V.free();
      const eye = new slowlight.camera.position.constructor(-8, 1.4, -171);
      const at = eye.clone().set(-2, 34, -224), from = eye.clone().set(0, -1.4, -228);
      const d = at.distanceTo(eye), now = slowlight.world.t;
      const tBurst = now + 0.35 - d / 343;
      slowlight.world.c = d / (3.906 - 0.35 + d / 343);
      slowlight.instance.fw.shell(from, at, tBurst, { color: "#9fffc8", count: 320 });
      window.__look = { yaw: Math.atan2(-(at.x - eye.x), -(at.z - eye.z)), pitch: Math.atan2(at.y - eye.y, Math.hypot(at.x - eye.x, at.z - eye.z)) - 0.12 };
    },
    frame: (u) => V.cam(-8, -0.2, -171, window.__look.yaw + V.mix(0.04, -0.04, u), window.__look.pitch),
  },
  {
    id: "coaster", place: "pier", from: bar(14), to: bar(15),
    setup: () => {
      slowlight.world.c = 6;
      slowlight.instance.time.set(0.82);
      slowlight.player.place(17.6, -126, -Math.PI / 2);
      slowlight.act();
      slowlight.advance(50.4); // over the top of the lift hill and down the first drop
    },
    frame: () => { slowlight.player.pitch = -0.32; },
  },
  // The crossroads: a taxi whips past a low camera, then the bonk, frozen and explained.
  {
    id: "taxis-low", place: "city", from: bar(15), to: bar(16),
    setup: () => {
      slowlight.load("city");
      slowlight.advance(1);
      V.free();
      const CAM = 30;
      for (let i = 0; i < 6000; i++) {
        const t = slowlight.world.t;
        if (slowlight.instance.cabs.some(({ m, lane }) => lane.beta > 0.8 && lane.dir > 0 && Math.abs((CAM - m.at(t).z) / m.vel.z - 1.05) < 0.02)) break;
        slowlight.advance(0.02);
      }
    },
    frame: (u) => V.cam(-3.45, -1.25, 30, V.mix(-0.12, -0.22, u), 0.06),
  },
  {
    id: "bonk", place: "city", from: bar(16), to: bar(19),
    setup: () => {
      const ZEBRA = 8.8, AVE = 7;
      const p = slowlight.player;
      p.place(-(AVE + 0.6), ZEBRA, 0);
      slowlight.instance.walk = undefined; // (the free camera before set walls of its own)
      delete slowlight.instance.walk;
      slowlight.advance(0.1);
      // On the curb until a fast taxi is two seconds away...
      let cab = -1;
      for (let i = 0; i < 4000 && cab < 0; i++) {
        const t = slowlight.world.t;
        slowlight.instance.cabs.forEach(({ m, lane }, k) => {
          const due = (ZEBRA - 1.6 - m.at(t).z) / m.vel.z;
          if (lane.beta > 0.8 && lane.dir > 0 && due > 1.97 && due < 2.03) cab = k;
        });
        if (cab < 0) slowlight.advance(0.02);
      }
      window.__cab = cab;
      // ...then step into its lane, looking up the avenue.
      p.place(-1.75, ZEBRA, 0.06);
      p.pitch = 0.02;
    },
    // A second of the road looking clear, then a freeze with the taxi's real
    // position shown, then it resumes and the bonk lands on the downbeat.
    frame: (u, s) => {
      const p = slowlight.player, cam = slowlight.camera, m = slowlight.instance.cabs[window.__cab].m;
      const acc = document.getElementById("acc");
      if (s >= 1.0 && s < 2.9) {
        V.xray(true, 0.42);
        const eye = p.eye, seen = m.seen(eye).pos, real = m.at(slowlight.world.t), k = Math.min(1, (s - 1.0) / 0.25);
        V.labels = [
          { at: [seen.x, 1.2, seen.z], text: "WHAT YOU SEE", color: "#ffd38a", up: 170, dx: 90, k },
          { at: [real.x, 1.4, real.z], text: "WHERE IT REALLY IS", color: "#7fe8ff", up: 260, dx: -260, k },
        ];
        cam.fov = V.mix(72, 60, V.ease((s - 1.0) / 1.9)); cam.updateProjectionMatrix();
        acc.style.filter = "brightness(0.8) contrast(1.08)";
        return "hold";
      }
      if (V.labels.length) { V.labels = []; V.xray(false); cam.fov = 72; cam.updateProjectionMatrix(); acc.style.filter = ""; }
      if (slowlight.instance.bonks > 0) { p.yaw += (-1.15 - p.yaw) * 0.12; p.pitch += (0.02 - p.pitch) * 0.1; }
    },
  },
  {
    id: "guard", place: "city", from: bar(19), to: bar(21),
    setup: () => {
      const p = slowlight.player;
      p.place(-8.4, 8.8, -Math.PI / 2 - 0.55);
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
      const p = slowlight.player, k = V.ease((s - 0.7) / 1.7);
      p.pos.set(V.mix(-8.4, 7.7, k), 0, 8.8); p.u.set(0, 0, 0); p.v.set(0, 0, 0);
      const back = V.ease((s - 2.5) / 0.9);
      p.yaw = V.mix(V.mix(-Math.PI / 2 - 0.55, -Math.PI / 2, V.ease((s - 0.4) / 0.6)), Math.PI / 2 + 0.25, back);
      p.pitch = V.mix(0.08, 0.02, V.ease(s - 0.4));
    },
  },
  // The railway: lightning at both ends of a passing train, from down in the meadow; then the tunnel.
  {
    id: "railway-storm", place: "railway", from: bar(21), to: bar(23),
    setup: () => {
      slowlight.load("railway");
      const tr = slowlight.instance.trains[0], c = slowlight.world.c;
      const seen = tr.timeAt(-90) + Math.hypot(tr.halfLength, 25, 1.85) / c;
      slowlight.advance(seen - 1.6);
      V.free();
    },
    frame: (u) => V.cam(V.mix(-95, -88, u), -1.85, -25, Math.PI + V.mix(0.06, -0.06, u), 0.22),
  },
  {
    id: "railway-tunnel", place: "railway", from: bar(23), to: bar(25),
    setup: () => {
      const tr = slowlight.instance.trains[0], h = tr.halfLength, c = slowlight.world.c;
      const shut = tr.timeAt(-30 + h) + 0.15, open = tr.timeAt(10 - h) - 0.15;
      const seen = (shut + open) / 2 + Math.hypot(20, 17, 1.6) / c;
      slowlight.advance(Math.max(0, seen - 1.8 - slowlight.world.t));
      V.free();
    },
    frame: (u) => V.cam(-10, 0, V.mix(18, 17, u), 0, 0.06),
  },
  // The road: relativity off and on side by side, then flat out into the drop.
  {
    id: "einstein", place: "highway", from: bar(25), to: bar(27),
    setup: () => {
      slowlight.load("highway");
      slowlight.player.eta = 4.4;
      slowlight.advance(1.5);
    },
    frame: (u, s) => {
      const p = slowlight.player;
      p.eta = V.mix(4.4, 5.2, u); p.yaw = 0; p.pitch = 0.03;
      const split = s < 0.5 ? 1 : V.mix(1, 0.5, V.ease((s - 0.5) / 0.4));
      return { split };
    },
    counter: true,
  },
  {
    id: "road-faster", place: "highway", from: bar(27), to: bar(30),
    setup: () => {},
    frame: (u) => { const p = slowlight.player; p.eta = 5.2 + 6.3 * Math.pow(u, 1.6); p.yaw = 0; p.pitch = 0.03; },
    counter: true,
  },
  {
    id: "road-pulse", place: "highway", from: bar(30), to: bar(32),
    setup: () => { slowlight.player.eta = 11.5; },
    frame: (u, s) => {
      slowlight.player.yaw = 0; slowlight.player.pitch = 0.02;
      if (s > 0.1 && s < 0.14) slowlight.instance.fire();
    },
    counter: true,
  },
  // The starship.
  {
    id: "starship-jump", place: "starship", from: bar(32), to: bar(35),
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
      // Gently out past the jellies and the whale for a bar, then the jump.
      s.eta = u < 0.34 ? 7e-7 * (u / 0.34) ** 2 : Math.exp(V.mix(Math.log(7e-7), Math.log(10.5), V.ease((u - 0.34) / 0.6)));
      const turn = V.ease((u - 0.26) / 0.2);
      slowlight.player.yaw = s.heading + V.mix(0.38, 0, turn);
      slowlight.player.pitch = V.mix(-0.2, 0.02, turn);
    },
  },
  {
    id: "starship-buoy", place: "starship", from: bar(35), to: bar(37),
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
      // Up from the helm, to whichever end of the cabin faces the buoy.
      await t.q(() => {
        slowlight.advance(1);
        slowlight.act();
        const s = slowlight.player.ship, d = slowlight.instance.nav.where("buoy").sub(s.pos);
        const ahead = -Math.sin(s.heading) * d.x - Math.cos(s.heading) * d.z > 0;
        s.local.set(0, 0, ahead ? -5.3 : 5.0);
        slowlight.advance(0.1);
      });
    },
    // Looking at the buoy, with Proxima b beside it.
    frame: (u) => {
      const p = slowlight.player, d = slowlight.instance.nav.where("buoy").sub(p.eye);
      p.yaw = Math.atan2(-d.x, -d.z) + V.mix(-0.12, -0.2, u); p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) - 0.05;
    },
  },
  {
    id: "starship-cards", place: "starship", from: bar(37), to: bar(40), speed: 3,
    setup: async (t) => {
      // Home again: back to the helm and W, and years of cards from the crew catch up with us.
      await t.q(() => { const s = slowlight.player.ship; if (!s.helm) { s.local.set(0, 0, -4); slowlight.act(); } });
      await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
      for (let i = 0; i < 60 && (await t.q(() => slowlight.player.ship.eta)) < 15.7; i++) await t.q(() => slowlight.advance(0.5));
      await t.q(() => slowlight.advance(4));
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
    id: "starship-home", place: "starship", from: bar(40), to: bar(42),
    setup: async (t) => {
      await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
      for (let i = 0; i < 60 && !(await t.q(() => slowlight.instance.goals[4].done)); i++) await t.q(() => slowlight.advance(5));
      await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
      await t.q(() => slowlight.advance(4));
    },
    frame: (u) => { slowlight.player.yaw = slowlight.player.ship.heading + V.mix(0.25, 0.05, u); slowlight.player.pitch = V.mix(0.12, 0.05, u); },
  },
  // Montage, two beats a cut: a taxi ride, the coaster, the top of the wheel, the road behind.
  {
    id: "m-taxi", place: "city", from: bar(42), to: bar(42) + B2,
    setup: () => {
      slowlight.load("city");
      slowlight.player.place(-7.6, 14, 0);
      slowlight.act();
      slowlight.advance(2.2);
    },
    frame: () => {},
  },
  {
    id: "m-coaster", place: "pier", from: bar(42) + B2, to: bar(43),
    setup: () => {
      slowlight.load("pier");
      slowlight.instance.time.set(0.82);
      slowlight.player.place(17.6, -126, -Math.PI / 2);
      slowlight.act();
      slowlight.advance(58.5); // the second dip
    },
    frame: () => { slowlight.player.pitch = -0.25; },
  },
  {
    id: "m-wheel", place: "pier", from: bar(43), to: bar(43) + B2,
    setup: () => {
      if (slowlight.instance.action()?.label === "Step off the coaster") slowlight.act();
      slowlight.instance.time.set(0.84);
      slowlight.player.place(-16, -142, 0);
      slowlight.act();
      slowlight.advance(4.2); // the top of the wheel
    },
    frame: (u) => { slowlight.player.yaw = V.mix(0.5, 0.3, u); slowlight.player.pitch = -0.12; },
  },
  {
    id: "m-behind", place: "highway", from: bar(43) + B2, to: bar(44),
    setup: () => {
      slowlight.load("highway");
      slowlight.player.eta = 7;
      slowlight.advance(2);
    },
    frame: () => { slowlight.player.lookBack = true; slowlight.player.pitch = 0.1; },
  },
  // The song's break: a slow orbit of the Ferris wheel.
  {
    id: "wheel-orbit", place: "pier", from: bar(44), to: bar(45),
    setup: () => {
      slowlight.player.lookBack = false;
      slowlight.load("pier");
      slowlight.instance.time.set(0.83);
      slowlight.advance(3);
      V.free();
    },
    frame: (u) => {
      const a = V.mix(0.15, 0.55, u), R = 32, x = -16 + R * Math.sin(a), z = -146 + R * Math.cos(a), y = 1.5;
      const [yaw, pitch] = V.aim(x, y, z, [-16, 13, -146]);
      V.cam(x, y, z, yaw, pitch);
    },
  },
  // Montage, two beats a cut.
  {
    id: "m-drone-night", place: "pier", from: bar(45), to: bar(45) + B2,
    setup: () => { slowlight.instance.time.set(0.86); slowlight.advance(1); },
    frame: (u) => {
      const x = V.mix(14, 11, u), y = 12, z = V.mix(-60, -75, u);
      const [yaw, pitch] = V.aim(x, y, z, [-10, 4, -150]);
      V.cam(x, y, z, yaw, pitch);
    },
  },
  {
    id: "m-swings", place: "pier", from: bar(45) + B2, to: bar(46),
    setup: () => {},
    frame: (u) => {
      const x = V.mix(9, 8, u), z = -156;
      const [yaw, pitch] = V.aim(x, -1.2, z, [-1, 5, -160]);
      V.cam(x, -1.2, z, yaw, pitch);
    },
  },
  {
    id: "m-fireworks", place: "pier", from: bar(46), to: bar(46) + B2,
    setup: () => { slowlight.instance.time.set(0.7); slowlight.advance(25); slowlight.world.c = 30; },
    frame: (u) => V.cam(0, 1, V.mix(-150, -156, u), 0, 0.32),
  },
  {
    id: "m-rain", place: "city", from: bar(46) + B2, to: bar(47),
    setup: () => { slowlight.load("city"); slowlight.advance(4); V.free(); },
    frame: (u) => V.cam(-3.45, -1.2, V.mix(34, 33, u), V.mix(2.9, 3.0, u), 0.3),
  },
  {
    id: "m-platform", place: "railway", from: bar(47), to: bar(47) + B2,
    setup: () => {
      slowlight.load("railway");
      const tr = slowlight.instance.trains;
      for (let i = 0; i < 4000 && !tr.some((x) => Math.abs(x.centerAt(slowlight.world.t) + 50) < 4); i++) slowlight.advance(0.05);
      slowlight.player.place(-50, 4, 0);
      slowlight.player.pitch = 0.05;
    },
    frame: (u) => { slowlight.player.yaw = V.mix(0.25, -0.25, u); },
  },
  {
    id: "m-tunnel-train", place: "railway", from: bar(47) + B2, to: bar(48),
    setup: () => {
      const tr = slowlight.instance.trains[0];
      for (let i = 0; i < 4000 && !slowlight.instance.trains.some((x) => Math.abs(x.centerAt(slowlight.world.t) + 10) < 3); i++) slowlight.advance(0.05);
      V.free();
      void tr;
    },
    frame: (u) => V.cam(-10, -1.6, V.mix(14, 12, u), 0, 0.12),
  },
  {
    id: "m-depart", place: "starship", from: bar(48), to: bar(48) + B2,
    setup: () => {
      slowlight.load("starship");
      slowlight.advance(0.5);
      slowlight.player.ship.local.set(0, 0, -4);
      slowlight.act();
      slowlight.player.ship.ease = 0;
      slowlight.player.ship.eta = 3e-7;
      slowlight.advance(2.5);
    },
    frame: (u) => { const p = slowlight.player; p.yaw = p.ship.heading + V.mix(0.45, 0.3, u); p.pitch = -0.18; },
  },
  {
    id: "m-tunnel", place: "highway", from: bar(48) + B2, to: bar(49),
    setup: () => { slowlight.load("highway"); slowlight.player.eta = 11; slowlight.advance(3); },
    frame: (u) => { const p = slowlight.player; p.eta = V.mix(11, 12, u); p.yaw = 0; p.pitch = 0.03; },
  },
  // The title, over the pier at night, as the music winds down to its last chord.
  {
    id: "title", place: "pier", from: bar(49), to: 108.88,
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
