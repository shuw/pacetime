// Plays each everyday scene's goals with scripted moves, fast-forwarding where
// it can. Usage: node scripts/scenes.mjs [pier|city|highway|starship ...]
import { open, report } from "./lib.mjs";

const want = process.argv.slice(2);
const t = await open({ size: [1200, 750] });
const show = async (id) => console.log(id, (await t.goals()).join("\n" + " ".repeat(id.length + 1)), "\n  note:", await t.note());
const run = async (id, fn) => {
  if (want.length && !want.includes(id)) return;
  await t.q((id) => { pacetime.load(id); pacetime.closeMenu(); }, id);
  await fn();
  await show(id);
};

await run("city", async () => {
  await t.place(0, 0, 0);
  for (let i = 0; i < 40 && !(await t.q(() => pacetime.instance.goals[0].done)); i++) await t.advance(0.5);
  await t.place(1, 40, 0);
  for (let i = 0; i < 60 && !(await t.q(() => pacetime.instance.goals[1].done)); i++) await t.advance(0.5);
  // Face south... watch taxis coming north toward us on the east lane.
  await t.place(1.5, -20, Math.PI);
  // Keep looking at the nearest taxi we can see.
  let shotNear = false;
  for (let i = 0; i < 400 && !(await t.q(() => pacetime.instance.goals[3].done)); i++) {
    await t.advance(0.1);
    const d = await t.q(() => {
      const eye = pacetime.player.eye;
      const near = pacetime.instance.cabs.map((c) => ({ c, s: c.m.seen(eye) })).filter((x) => x.s.pos.distanceTo(eye) > 6).sort((a, b) => a.s.pos.distanceTo(eye) - b.s.pos.distanceTo(eye))[0];
      const p = near.s.pos;
      pacetime.player.yaw = Math.atan2(-(p.x - eye.x), -(p.z - eye.z));
      pacetime.player.pitch = -0.05;
      const toward = near.c.m.vel.clone().normalize().dot(eye.clone().sub(p).normalize());
      return toward > 0 ? p.distanceTo(eye) : -p.distanceTo(eye);
    });
    if (!shotNear && d > 15 && d < 25) { shotNear = true; console.log("  oncoming taxi:", await t.snap("city-oncoming")); }
  }
  // The secret billboard: walk at it, then walk away looking back.
  await t.place(1, -5, 0, 0.25);
  await t.page.keyboard.down("w"); await t.advance(1); await t.page.keyboard.up("w");
  await t.place(1, -18, Math.PI, 0);
  await t.page.keyboard.down("w"); await t.page.keyboard.down("b");
  await t.advance(0.6);
  await t.q(() => { pacetime.player.pitch = -0.35; });
  await t.advance(0.6);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("b");
  await t.place(0, 0, 0, 0.3);
  for (let i = 0; i < 120 && !(await t.q(() => pacetime.instance.goals[5].done)); i++) await t.advance(0.5);
  await t.place(-AVE_FIX(), 12, 0);
  await t.q(() => pacetime.act());
  await t.advance(4);
  console.log("  taxi ride:", await t.q(() => !!pacetime.player.vehicle), await t.snap("city-ride"));
});

function AVE_FIX() { return 7.6; }

await run("pier", async () => {
  // Watch the lights come on, looking down the pier.
  await t.place(0, 30, 0, 0.03);
  for (let i = 0; i < 600 && !(await t.q(() => pacetime.instance.goals[0].done)); i++) await t.advance(0.25);
  console.log("  lights on:", await t.snap("pier-lights-on"));
  // Shooting gallery: throw exactly at where each target will really be.
  await t.place(-20, -130.8, 0, 0.02);
  for (let i = 0; i < 80 && (await t.q(() => pacetime.instance.gallery.score)) < 6; i++) {
    await t.q(() => {
      const g = pacetime.instance.gallery, e = pacetime.player.eye, o = e.clone().setY(e.y - 0.3);
      const tg = g.targets.find((x) => x.hitAt === null && !(x.aimed > pacetime.world.t) && Math.abs(x.m.at(pacetime.world.t).x - o.x) < 5);
      if (!tg) return;
      tg.aimed = pacetime.world.t + 5;
      const speed = 0.6 * pacetime.world.c;
      let T = Math.abs(tg.z - o.z) / speed, P;
      for (let k = 0; k < 6; k++) { P = tg.m.at(pacetime.world.t + T).setY(tg.y); T = P.distanceTo(o) / speed; }
      const vel = P.clone().sub(o).normalize().multiplyScalar(speed);
      vel.y += 0.25 * T;
      g.throwBall({ origin: o, vel, birth: pacetime.world.t, gravity: 0.5 });
      g.throws--;
    });
    await t.advance(0.5);
  }
  await t.place(-16, -143, 0);
  await t.q(() => pacetime.act());
  await t.advance(5);
  console.log("  wheel:", await t.q(() => !!pacetime.player.vehicle), await t.snap("pier-wheel-ride"));
  await t.advance(9);
  await t.q(() => pacetime.act());
  await t.place(-16, -122, 0);
  await t.advance(4);
  await t.place(24.4, -131, Math.PI);
  for (let i = 0; i < 800 && (await t.q(() => pacetime.instance.action()?.label)) !== "Board the coaster"; i++) await t.advance(0.25);
  await t.q(() => pacetime.act());
  let shot = false;
  for (let i = 0; i < 600 && !(await t.q(() => pacetime.instance.goals[5].done)); i++) {
    await t.advance(0.5);
    if (!shot && (await t.q(() => pacetime.player.beta)) > 0.85) { shot = true; console.log("  coaster drop:", await t.snap("pier-drop")); }
  }
  await t.q(() => pacetime.act());
  // After dark: twin shells from the middle, then from the side, and the lighthouse.
  await t.place(0, -118, 0, 0.25);
  for (let i = 0; i < 500 && !(await t.q(() => pacetime.instance.goals[1].done)); i++) await t.advance(0.5);
  await t.place(-26, -160, 0, 0.25);
  for (let i = 0; i < 200 && !(await t.q(() => pacetime.instance.goals[2].done)); i++) await t.advance(0.5);
  await t.place(10, -165, -0.61, 0.15);
  for (let i = 0; i < 100 && !(await t.q(() => pacetime.instance.goals[10].done)); i++) await t.advance(0.25);
  // Hall of mirrors: walk in, wave, wait.
  await t.place(-32, 50.5, 1.57, 0);
  await t.advance(1);
  await t.page.keyboard.press("KeyX");
  await t.advance(1.2);
  console.log("  mirrors:", await t.snap("pier-mirrors"));
  for (let i = 0; i < 20 && !(await t.q(() => pacetime.instance.goals[9].done)); i++) await t.advance(0.25);
  // Ride a scooter down the pier at night.
  await t.q(() => pacetime.instance.day.set(0.85, pacetime.world.t)); // night
  await t.place(10.4, 45.2, Math.PI, 0);
  await t.q(() => pacetime.act());
  console.log("  on scooter:", await t.q(() => !!pacetime.player.bike));
  await t.q(() => { pacetime.player.pos.set(0, 0, 42); pacetime.player.yaw = 0; });
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  for (let i = 0; i < 60 && !(await t.q(() => pacetime.instance.goals[8].done)); i++) { await t.wait(100); await t.q(() => { const p = pacetime.player.pos; pacetime.player.yaw = Math.atan2(p.x, 3) * 0.8; }); }
  console.log("  scooter:", await t.snap("pier-scooter"));
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  await t.q(() => pacetime.act());
  console.log("  night:", await t.snap("pier-night"));
});

await run("highway", async () => {
  // From a standstill, fire a pulse and watch it go.
  await t.page.keyboard.press("KeyF");
  await t.advance(0.6);
  console.log("  pulse from rest:", await t.snap("highway-pulse-rest"));
  await t.advance(2);
  // Up past 99%, then cruise while the Comet catches up.
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  await t.advance(3.5);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  for (let i = 0; i < 40 && !(await t.q(() => pacetime.instance.goals[2].done)); i++) await t.advance(0.5);
  console.log("  alongside:", await t.snap("highway-comet"));
  // Brake hard: it shoots ahead.
  await t.page.keyboard.down("s"); await t.advance(1.4); await t.page.keyboard.up("s");
  for (let i = 0; i < 20 && !(await t.q(() => pacetime.instance.goals[3].done)); i++) await t.advance(0.25);
  console.log("  ahead:", await t.snap("highway-comet-ahead"));
  // Past 99.99%, then cruise, fire a pulse and chase it.
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  for (let i = 0; i < 60 && (await t.q(() => pacetime.player.omb)) > 5e-5; i++) await t.advance(0.2);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  await t.page.keyboard.press("KeyF");
  for (let i = 0; i < 20 && !(await t.q(() => pacetime.instance.goals[5].done)); i++) await t.advance(0.25);
  console.log("  chase:", await t.q(() => pacetime.instance.readouts().filter(([k]) => /pulse|pulling/.test(k)).map((r) => r.join(" ")).join(", ")), await t.snap("highway-pulse-chase"));
  // Full throttle until nine nines, glancing back on the way.
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  await t.advance(4);
  await t.page.keyboard.down("b"); await t.advance(0.3); await t.page.keyboard.up("b");
  await t.advance(14);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  console.log("  speed:", await t.q(() => ({ omb: pacetime.player.omb, gamma: Math.round(pacetime.player.gamma), km: pacetime.instance.readouts()[0][1] })), await t.snap("highway-fast"));
});

await run("starship", async () => {
  const nav = (k) => t.q((k) => pacetime.instance.nav[k](), k);
  // Take the helm and go flat out.
  await t.q(() => { pacetime.player.ship.local.set(0, 0, -4); });
  await t.q(() => pacetime.act());
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  await t.advance(14);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  console.log("  cruising: γ", await t.q(() => Math.round(pacetime.player.gamma)), await t.snap("starship-cruise"));
  // Get up and walk to the back bubble.
  await t.q(() => pacetime.act());
  await t.q(() => { const s = pacetime.player.ship; s.local.set(0, 0, 4.6); pacetime.player.yaw = s.heading + Math.PI; });
  await t.advance(0.5);
  console.log("  rear bubble:", await t.snap("starship-rear"));
  // Pip brings us in to the buoy.
  for (let i = 0; i < 300 && !(await t.q(() => pacetime.instance.goals[3].done)); i++) await t.advance(0.5);
  await t.q(() => { const p = pacetime.player; p.ship.local.set(0, 0, -4.75); p.yaw = p.ship.heading; p.pitch = 0.05; });
  await t.advance(0.3);
  console.log("  buoy:", await t.snap("starship-buoy"), Math.round(await nav("toBuoy")), "m from the buoy; cards so far:", await nav("cards"));
  // Home again: back to the helm and W.
  await t.q(() => pacetime.act());
  await t.page.keyboard.down("w"); await t.page.keyboard.down("Shift");
  await t.advance(16);
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  console.log("  cards at the buoy:", await nav("cards"));
  const arrivals = [];
  for (let i = 0; i < 300 && !(await t.q(() => pacetime.instance.goals[4].done)); i++) {
    await t.advance(0.5);
    const n = await nav("cards");
    if (n > arrivals.length) arrivals.push(`${n}@${(await t.q(() => pacetime.player.tau)).toFixed(0)}s`);
  }
  console.log("  cards on the way home:", arrivals.join(" "));
  await t.q(() => { const p = pacetime.player; p.yaw = p.ship.heading; p.pitch = 0.1; });
  await t.advance(0.3);
  console.log("  home:", Math.round(await nav("fromHome")), "m from the dock", await t.snap("starship-home"));
  for (let i = 0; i < 20 && !(await t.q(() => pacetime.instance.goals[5].done)); i++) await t.advance(0.25);
});

report(t.errors);
await t.close();
