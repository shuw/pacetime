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
  await t.advance(1);
  await t.wait(300);
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
  for (let i = 0; i < 200 && !(await t.q(() => pacetime.instance.goals[2].done)); i++) {
    await t.advance(0.25);
    const facing = await t.q(() => {
      // Turn to face the nearest seen taxi.
      return true;
    });
  }
  await t.place(-AVE_FIX(), 12, 0);
  await t.q(() => pacetime.act());
  await t.advance(4);
  console.log("  taxi ride:", await t.q(() => !!pacetime.player.vehicle), await t.snap("city-ride"));
});

function AVE_FIX() { return 7.6; }

await run("pier", async () => {
  await t.place(0, -118, 0, 0.25);
  for (let i = 0; i < 80 && !(await t.q(() => pacetime.instance.goals[0].done)); i++) await t.advance(0.5);
  await t.place(-16, -122, 0);
  await t.advance(4);
  await t.place(24.4, -131, Math.PI);
  for (let i = 0; i < 120 && (await t.q(() => pacetime.instance.action()?.label)) !== "Board the coaster"; i++) await t.advance(0.25);
  await t.q(() => pacetime.act());
  for (let i = 0; i < 200 && !(await t.q(() => pacetime.instance.goals[4].done)); i++) await t.advance(0.5);
});

report(t.errors);
await t.close();
