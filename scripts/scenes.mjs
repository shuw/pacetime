// Plays each everyday scene's goals with scripted moves, fast-forwarding where
// it can. Usage: node scripts/scenes.mjs [pier|city|village ...]
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

await run("village", async () => {
  // Read the church clock from far away.
  await t.place(-30, 60, 0.3, 0.2);
  await t.q(() => { const c = pacetime.instance; const e = pacetime.player.eye; const toC = { x: 18 - e.x, z: -80 - e.z }; pacetime.player.yaw = Math.atan2(-toC.x, -toC.z); });
  await t.advance(3);
  // Watch for a steam train from beside the track.
  await t.place(8, 62, 1.4, 0);
  for (let i = 0; i < 300 && !(await t.q(() => pacetime.instance.goals[1].done)); i++) {
    await t.advance(0.2);
    await t.q(() => {
      // Turn toward the nearer engine as you see it.
      const e = pacetime.player.eye;
      const best = pacetime.instance.engineSeen?.(e);
      if (best) pacetime.player.yaw = Math.atan2(-(best.x - e.x), -(best.z - e.z));
    });
  }
  // Ride the carousel for 20 s of your time.
  await t.place(-17, -22, 0);
  await t.q(() => pacetime.act());
  await t.advance(22);
  console.log("  riding:", await t.q(() => !!pacetime.player.vehicle), await t.snap("village-carousel"));
  await t.q(() => pacetime.act());
  // Sprint through the snow.
  await t.place(-60, 40, 0);
  await t.page.keyboard.down("Shift"); await t.page.keyboard.down("w");
  await t.wait(2500);
  console.log("  snow sprint:", await t.snap("village-snow"));
  await t.page.keyboard.up("w"); await t.page.keyboard.up("Shift");
  // Wait at the station for a train, board, ride a while.
  await t.place(4, 74, Math.PI);
  for (let i = 0; i < 140 && (await t.q(() => pacetime.instance.action()?.label)) !== "Board the steam train"; i++) await t.advance(1);
  await t.q(() => pacetime.act());
  await t.advance(6);
  console.log("  train:", await t.q(() => !!pacetime.player.vehicle), await t.snap("village-train"));
  // Stand near the track and wait for an engine to pass.
  await t.q(() => pacetime.act());
});

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
  await t.place(0, 0, 0, 0.3);
  for (let i = 0; i < 120 && !(await t.q(() => pacetime.instance.goals[4].done)); i++) await t.advance(0.5);
  await t.place(-AVE_FIX(), 12, 0);
  await t.q(() => pacetime.act());
  await t.advance(4);
  console.log("  taxi ride:", await t.q(() => !!pacetime.player.vehicle), await t.snap("city-ride"));
});

function AVE_FIX() { return 7.6; }

await run("pier", async () => {
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
  await t.place(0, -118, 0, 0.25);
  for (let i = 0; i < 80 && !(await t.q(() => pacetime.instance.goals[0].done)); i++) await t.advance(0.5);
  await t.place(-16, -122, 0);
  await t.advance(4);
  await t.place(24.4, -131, Math.PI);
  for (let i = 0; i < 800 && (await t.q(() => pacetime.instance.action()?.label)) !== "Board the coaster"; i++) await t.advance(0.25);
  await t.q(() => pacetime.act());
  let shot = false;
  for (let i = 0; i < 600 && !(await t.q(() => pacetime.instance.goals[4].done)); i++) {
    await t.advance(0.5);
    if (!shot && (await t.q(() => pacetime.player.beta)) > 0.85) { shot = true; console.log("  coaster drop:", await t.snap("pier-drop")); }
  }
});

report(t.errors);
await t.close();
