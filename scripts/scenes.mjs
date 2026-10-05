// Plays each everyday scene's goals with scripted moves, fast-forwarding where
// it can. Usage: node scripts/scenes.mjs [pier|city|highway|starship ...]
import { open, report } from "./lib.mjs";

const want = process.argv.slice(2);
const t = await open({ size: [1200, 750] });
const show = async (id) => console.log(id, (await t.goals()).join("\n" + " ".repeat(id.length + 1)), "\n  note:", await t.note());
const run = async (id, fn) => {
  if (want.length && !want.includes(id)) return;
  await t.q((id) => { slowlight.load(id); slowlight.closeMenu(); }, id);
  await fn();
  await show(id);
};

await run("city", async () => {
  const AVE = 7, ZEBRA = AVE + 1.8;
  // Get bonked: step off the west curb into the fast lane and wait there.
  await t.place(-(AVE + 0.6), ZEBRA, -Math.PI / 2);
  await t.advance(0.1);
  await t.place(-1.75, ZEBRA, Math.PI / 2 + 0.3, 0.05);
  for (let i = 0; i < 1500 && !(await t.q(() => slowlight.instance.goals[0].done)); i++) await t.advance(0.05);
  console.log("  bonked:", await t.q(() => slowlight.instance.note), await t.snap("city-bonk"));
  // Cross on the guard's GO.
  await t.advance(1);
  await t.place(-(AVE + 0.6), ZEBRA, -Math.PI / 2);
  for (let i = 0; i < 1200 && !(await t.q(() => slowlight.instance.guardGo)); i++) await t.advance(0.05);
  await t.page.keyboard.down("w");
  for (let i = 0; i < 80 && !(await t.q(() => slowlight.instance.goals[1].done)); i++) await t.advance(0.05);
  await t.page.keyboard.up("w");
  console.log("  crossed:", await t.q(() => ({ bonks: slowlight.instance.bonks, crossings: slowlight.instance.crossings })), await t.snap("city-crossed"));
  // From the east sidewalk, watch a fast taxi come north at you, then leave.
  await t.place(AVE + 1.5, -20, Math.PI);
  let shotNear = false;
  for (let i = 0; i < 600 && !(await t.q(() => slowlight.instance.goals[2].done)); i++) {
    await t.advance(0.1);
    const d = await t.q(() => {
      const eye = slowlight.player.eye;
      const near = slowlight.instance.cabs.filter((c) => c.lane.beta > 0.8).map((c) => ({ c, s: c.m.seen(eye) })).filter((x) => x.s.pos.distanceTo(eye) > 6).sort((a, b) => a.s.pos.distanceTo(eye) - b.s.pos.distanceTo(eye))[0];
      const p = near.s.pos;
      slowlight.player.yaw = Math.atan2(-(p.x - eye.x), -(p.z - eye.z));
      slowlight.player.pitch = -0.05;
      const toward = near.c.m.vel.clone().normalize().dot(eye.clone().sub(p).normalize());
      return toward > 0 ? p.distanceTo(eye) : -p.distanceTo(eye);
    });
    if (!shotNear && d > 15 && d < 25) { shotNear = true; console.log("  oncoming taxi:", await t.snap("city-oncoming")); }
  }
  // Signals from the centre line, then the power flicker from the sidewalk.
  await t.place(0, 0, 0, 0.1);
  for (let i = 0; i < 40 && !(await t.q(() => slowlight.instance.goals[3].done)); i++) await t.advance(0.5);
  await t.place(-(AVE + 2), 40, 0);
  for (let i = 0; i < 60 && !(await t.q(() => slowlight.instance.goals[4].done)); i++) await t.advance(0.5);
  // The secret billboard: run at it along the centre line, then away looking back.
  await t.place(0, -5, 0, 0.25);
  await t.page.keyboard.down("w"); await t.advance(1); await t.page.keyboard.up("w");
  await t.place(0, -18, Math.PI, 0);
  await t.page.keyboard.down("w"); await t.page.keyboard.down("b");
  await t.advance(0.6);
  await t.q(() => { slowlight.player.pitch = -0.35; });
  await t.advance(0.6);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("b");
  // Thunder, then the taxi ride.
  await t.place(-(AVE + 2), 14, 0, 0.35);
  for (let i = 0; i < 120 && !(await t.q(() => slowlight.instance.goals[5].done)); i++) await t.advance(0.5);
  await t.place(-(AVE + 0.6), 14, 0);
  await t.q(() => slowlight.act());
  await t.advance(4);
  console.log("  taxi ride:", await t.q(() => !!slowlight.player.vehicle), await t.snap("city-ride"));
});

await run("pier", async () => {
  // Watch the lights come on, looking down the pier.
  await t.place(0, 30, 0, 0.03);
  for (let i = 0; i < 600 && !(await t.q(() => slowlight.instance.goals[0].done)); i++) await t.advance(0.25);
  console.log("  lights on:", await t.snap("pier-lights-on"));
  // Shooting gallery: throw exactly at where each target will really be.
  await t.place(-20, -130.8, 0, 0.02);
  for (let i = 0; i < 80 && (await t.q(() => slowlight.instance.gallery.score)) < 6; i++) {
    await t.q(() => {
      const g = slowlight.instance.gallery, e = slowlight.player.eye, o = e.clone().setY(e.y - 0.3);
      const tg = g.targets.find((x) => x.hitAt === null && !(x.aimed > slowlight.world.t) && Math.abs(x.m.at(slowlight.world.t).x - o.x) < 5);
      if (!tg) return;
      tg.aimed = slowlight.world.t + 5;
      const speed = 0.6 * slowlight.world.c;
      let T = Math.abs(tg.z - o.z) / speed, P;
      for (let k = 0; k < 6; k++) { P = tg.m.at(slowlight.world.t + T).setY(tg.y); T = P.distanceTo(o) / speed; }
      const vel = P.clone().sub(o).normalize().multiplyScalar(speed);
      vel.y += 0.25 * T;
      g.throwBall({ origin: o, vel, birth: slowlight.world.t, gravity: 0.5 });
      g.throws--;
    });
    await t.advance(0.5);
  }
  await t.place(-16, -143, 0);
  await t.q(() => slowlight.act());
  await t.advance(5);
  console.log("  wheel:", await t.q(() => !!slowlight.player.vehicle), await t.snap("pier-wheel-ride"));
  await t.advance(9);
  await t.q(() => slowlight.act());
  await t.place(-16, -122, 0);
  await t.advance(4);
  await t.place(17.6, -126, -Math.PI / 2);
  await t.q(() => slowlight.act());
  let shot = false;
  for (let i = 0; i < 600 && !(await t.q(() => slowlight.instance.goals[5].done)); i++) {
    await t.advance(0.5);
    if (!shot && (await t.q(() => slowlight.player.beta)) > 0.85) { shot = true; console.log("  coaster drop:", await t.snap("pier-drop")); }
  }
  await t.q(() => slowlight.act());
  // After dark: twin shells from the middle, then from the side, and the lighthouse.
  await t.place(0, -118, 0, 0.25);
  for (let i = 0; i < 500 && !(await t.q(() => slowlight.instance.goals[1].done)); i++) await t.advance(0.5);
  await t.place(-26, -160, 0, 0.25);
  for (let i = 0; i < 200 && !(await t.q(() => slowlight.instance.goals[2].done)); i++) await t.advance(0.5);
  await t.place(10, -165, -0.61, 0.15);
  for (let i = 0; i < 100 && !(await t.q(() => slowlight.instance.goals[10].done)); i++) await t.advance(0.25);
  // Hall of mirrors: walk in, wave, wait.
  await t.place(-32, 50.5, 1.57, 0);
  await t.advance(1);
  await t.page.keyboard.press("KeyX");
  await t.advance(1.2);
  console.log("  mirrors:", await t.snap("pier-mirrors"));
  for (let i = 0; i < 20 && !(await t.q(() => slowlight.instance.goals[9].done)); i++) await t.advance(0.25);
  // Ride a scooter down the pier at night.
  await t.q(() => slowlight.instance.day.set(0.85, slowlight.world.t)); // night
  await t.place(10.4, 45.2, Math.PI, 0);
  await t.q(() => slowlight.act());
  console.log("  on scooter:", await t.q(() => !!slowlight.player.bike));
  await t.q(() => { slowlight.player.pos.set(0, 0, 42); slowlight.player.yaw = 0; });
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  for (let i = 0; i < 60 && !(await t.q(() => slowlight.instance.goals[8].done)); i++) { await t.wait(100); await t.q(() => { const p = slowlight.player.pos; slowlight.player.yaw = Math.atan2(p.x, 3) * 0.8; }); }
  console.log("  scooter:", await t.snap("pier-scooter"));
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  await t.q(() => slowlight.act());
  console.log("  night:", await t.snap("pier-night"));
});

await run("highway", async () => {
  // From a standstill, switch on the beam and watch its pulses go.
  await t.page.keyboard.press("KeyF");
  await t.advance(0.6);
  console.log("  pulse from rest:", await t.snap("highway-pulse-rest"));
  await t.advance(2);
  // Up past 99%, overtaking the Comet (a steady 99%), then ease off to ride level with it.
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  for (let i = 0; i < 100 && (await t.q(() => slowlight.player.beta)) < 0.991; i++) await t.advance(0.05);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  await t.q(() => { slowlight.instance.comet.dz = 30; });
  for (let i = 0; i < 40 && !(await t.q(() => slowlight.instance.goals[2].done)); i++) await t.advance(0.5);
  console.log("  alongside:", await t.snap("highway-comet"));
  // Brake hard: it shoots ahead.
  await t.page.keyboard.down("s"); await t.advance(1.4); await t.page.keyboard.up("s");
  for (let i = 0; i < 20 && !(await t.q(() => slowlight.instance.goals[3].done)); i++) await t.advance(0.25);
  console.log("  ahead:", await t.snap("highway-comet-ahead"));
  // Past 99.99%, then cruise, set the beacon down again and chase its pulses.
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  for (let i = 0; i < 60 && (await t.q(() => slowlight.player.omb)) > 5e-5; i++) await t.advance(0.2);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  await t.page.keyboard.press("KeyF");
  for (let i = 0; i < 20 && !(await t.q(() => slowlight.instance.goals[5].done)); i++) await t.advance(0.25);
  console.log("  chase:", await t.q(() => slowlight.instance.readouts().filter(([k]) => /pulse|roadside|pulling/.test(k)).map((r) => r.join(" ")).join(", ")), await t.snap("highway-pulse-chase"));
  // Full throttle until nine nines, glancing back on the way.
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  await t.advance(4);
  await t.page.keyboard.down("b"); await t.advance(0.3); await t.page.keyboard.up("b");
  await t.advance(14);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  console.log("  speed:", await t.q(() => ({ omb: slowlight.player.omb, gamma: Math.round(slowlight.player.gamma), km: slowlight.instance.readouts()[0][1] })), await t.snap("highway-fast"));
});

await run("starship", async () => {
  const nav = (k) => t.q((k) => slowlight.instance.nav[k](), k);
  // Take the helm and go flat out.
  await t.q(() => { slowlight.player.ship.local.set(0, 0, -4); });
  await t.q(() => slowlight.act());
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  for (let i = 0; i < 80 && (await t.q(() => slowlight.player.ship.eta)) < 15.7; i++) await t.advance(0.5);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  console.log("  cruising: γ", await t.q(() => Math.round(slowlight.player.gamma)), await t.snap("starship-cruise"));
  // Get up and walk to the back bubble.
  await t.q(() => slowlight.act());
  await t.q(() => { const s = slowlight.player.ship; s.local.set(0, 0, 4.6); slowlight.player.yaw = s.heading + Math.PI; });
  await t.advance(0.5);
  console.log("  rear bubble:", await t.snap("starship-rear"));
  // Pip brings us in to the buoy.
  for (let i = 0; i < 300 && !(await t.q(() => slowlight.instance.goals[3].done)); i++) await t.advance(0.5);
  await t.q(() => { const p = slowlight.player; p.ship.local.set(0, 0, -4.75); p.yaw = p.ship.heading; p.pitch = 0.05; });
  await t.advance(0.3);
  console.log("  buoy:", await t.snap("starship-buoy"), Math.round(await nav("toBuoy")), "m from the buoy; cards so far:", await nav("cards"));
  // Home again: back to the helm and W.
  await t.q(() => slowlight.act());
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  for (let i = 0; i < 80 && (await t.q(() => slowlight.player.ship.eta)) < 15.7; i++) await t.advance(0.5);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  console.log("  cards at the buoy:", await nav("cards"));
  const arrivals = [];
  for (let i = 0; i < 300 && !(await t.q(() => slowlight.instance.goals[4].done)); i++) {
    await t.advance(0.5);
    const n = await nav("cards");
    if (n > arrivals.length) arrivals.push(`${n}@${(await t.q(() => slowlight.player.tau)).toFixed(0)}s`);
  }
  console.log("  cards on the way home:", arrivals.join(" "));
  await t.q(() => { const p = slowlight.player; p.yaw = p.ship.heading; p.pitch = 0.1; });
  await t.advance(0.3);
  console.log("  home:", Math.round(await nav("fromHome")), "m from the dock", await t.snap("starship-home"));
  for (let i = 0; i < 20 && !(await t.q(() => slowlight.instance.goals[5].done)); i++) await t.advance(0.25);
});

report(t.errors);
await t.close();
