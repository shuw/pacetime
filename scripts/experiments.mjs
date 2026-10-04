// Plays the experiments with scripted moves and reports what the log saw.
// Usage: bun run dev (in another shell), then: node scripts/experiments.mjs [scene]
import { chromium } from "playwright-core";

const which = process.argv[2] ?? "railway";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(process.env.URL ?? "http://localhost:5180/");
await page.waitForTimeout(1500);

const state = () => page.evaluate(() => ({
  t: pacetime.world.t.toFixed(1),
  goals: [...document.querySelectorAll("#goals li")].map((li) => (li.classList.contains("done") ? "✓ " : "· ") + li.textContent),
  note: document.getElementById("note").textContent,
  log: [...document.querySelectorAll("#log li")].map((li) => li.innerText.replace(/\n/g, " | ")),
}));
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const place = (x, z, yaw) => page.evaluate(([x, z, yaw]) => pacetime.player.place(x, z, yaw), [x, z, yaw]);
const center = () => page.evaluate(() => pacetime.instance.train.centerAt(pacetime.world.t));

async function boardWhenPassing(atX) {
  // Wait for a fresh run to approach, stand beside it, and hop on.
  await until((x) => { const tr = pacetime.instance.train; const c = tr.centerAt(pacetime.world.t); return c > x - 6 && c < x; }, atX, 180000);
  const c = await center();
  await place(c, 4.6, -Math.PI / 2);
  await page.evaluate(() => pacetime.act());
  return page.evaluate(() => !!pacetime.player.vehicle);
}

await page.evaluate((id) => { pacetime.load(id); pacetime.closeMenu(); }, which);
await page.evaluate((w) => (pacetime.warp = w), Number(process.env.WARP ?? 6));

if (which === "railway") {
  const strikes = () => page.evaluate(() => pacetime.instance.log.seen.filter((e) => e.tag === "strike").length);
  const doors = () => page.evaluate(() => pacetime.instance.log.seen.filter((e) => e.tag === "door").length);
  await place(-90, 6.5, 0);
  await until(() => pacetime.instance.log.seen.filter((e) => e.tag === "strike").length >= 2);
  await page.screenshot({ path: "shots/rail-strike.png" });
  console.log("strike ring", JSON.stringify((await state()).note));
  const d0 = await doors();
  await place(-10, 17, 0);
  await until((n) => pacetime.instance.log.seen.filter((e) => e.tag === "door").length >= n + 2, d0);
  await page.screenshot({ path: "shots/rail-tunnel.png" });
  console.log("tunnel ring", JSON.stringify((await state()).note));
  await place(54, 12, -0.3);
  await until(() => pacetime.instance.trains.some((tr) => Math.abs(tr.centerAt(pacetime.world.t) - 62) < 4), null, 120000);
  await page.screenshot({ path: "shots/rail-clock.png" });
  // Board the next train at the start of the line and ride it to the end.
  await until(() => pacetime.instance.trains.some((tr) => { const c = tr.centerAt(pacetime.world.t); return c > -150 && c < -144; }), null, 120000);
  const c = await page.evaluate(() => pacetime.instance.trains.map((tr) => tr.centerAt(pacetime.world.t)).find((c) => c > -150 && c < -144));
  await place(c, 4.6, -Math.PI / 2);
  await page.evaluate(() => pacetime.act());
  console.log("boarded:", await page.evaluate(() => !!pacetime.player.vehicle));
  await until(() => pacetime.player.pos.x > -40, null, 120000);
  await page.screenshot({ path: "shots/rail-riding.png" });
  await until(() => !pacetime.player.vehicle, null, 180000);
  await page.waitForTimeout(500);
  console.log("after ride", JSON.stringify(await state(), null, 1));
}

if (which === "pier") {
  await place(-16, -122, 0);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "shots/pier-wheel.png" });
  await place(0, -118, 0);
  await page.evaluate(() => { pacetime.player.pitch = 0.25; });
  await until(() => pacetime.instance.log.seen.length >= 2, null, 60000);
  await page.screenshot({ path: "shots/pier-fireworks.png" });
  console.log("twin", JSON.stringify(await state(), null, 1));
  await place(24.4, -131, Math.PI);
  await until(() => pacetime.instance.action()?.label === "Board the coaster", null, 90000);
  await page.evaluate(() => pacetime.act());
  console.log("boarded:", await page.evaluate(() => !!pacetime.player.vehicle));
  await until(() => pacetime.player.pos.y > 12, null, 60000);
  await page.screenshot({ path: "shots/pier-lift.png" });
  await until(() => pacetime.player.beta > 0.85, null, 60000);
  await page.screenshot({ path: "shots/pier-drop.png" });
  await until(() => pacetime.instance.goals[4].done, null, 90000);
  console.log("lap", JSON.stringify(await state(), null, 1));
}

if (which === "beam") {
  await page.waitForTimeout(9000);
  await page.screenshot({ path: "shots/exp-beam-watch.png" });
  console.log("watch", JSON.stringify(await state(), null, 1));
  // Let a pulse pass, then chase it.
  await page.evaluate(() => { pacetime.player.place(2, 0, -Math.PI / 2); });
  await until(() => pacetime.world.t % 5 > 2.4 && pacetime.world.t % 5 < 2.6);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "shots/exp-beam-chase.png" });
  await page.evaluate(() => { pacetime.player.pitch = 0.5; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "shots/exp-beam-starbow.png" });
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  console.log("chase", JSON.stringify(await state(), null, 1));
}

await browser.close();
