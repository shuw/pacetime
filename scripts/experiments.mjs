// Plays the experiments with scripted moves and reports what the log saw.
// Usage: bun run dev (in another shell), then: node scripts/experiments.mjs [scene]
import { chromium } from "playwright-core";

const which = process.argv[2] ?? "simultaneity";
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

if (which === "simultaneity") {
  await place(-10, 6.5, 0);
  await until(() => document.querySelectorAll("#log li").length >= 2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "shots/exp-simul-platform.png" });
  console.log("platform", JSON.stringify(await state(), null, 1));
  console.log("boarded:", await boardWhenPassing(-70));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "shots/exp-simul-riding.png" });
  await until(() => document.querySelectorAll("#log li").length >= 4, null, 180000);
  await page.screenshot({ path: "shots/exp-simul-riding-strike.png" });
  console.log("riding", JSON.stringify(await state(), null, 1));
}

if (which === "tunnel") {
  await place(-30, 17, 0);
  await until(() => document.querySelectorAll("#log li").length >= 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shots/exp-tunnel-inside.png" });
  await until(() => document.querySelectorAll("#log li").length >= 2);
  console.log("platform", JSON.stringify(await state(), null, 1));
  console.log("boarded:", await boardWhenPassing(-85));
  await until(() => pacetime.instance.train.centerAt(pacetime.world.t) > -48, null, 180000);
  await page.screenshot({ path: "shots/exp-tunnel-riding.png" });
  await until(() => document.querySelectorAll("#log li").length >= 4, null, 180000);
  console.log("riding", JSON.stringify(await state(), null, 1));
}

if (which === "lightclock") {
  await place(-6, 12, -0.4);
  await until(() => Math.abs(pacetime.instance.train.centerAt(pacetime.world.t) - 4) < 3, null, 120000);
  await page.screenshot({ path: "shots/exp-clock-platform.png" });
  console.log("platform", JSON.stringify(await state(), null, 1));
  console.log("boarded:", await boardWhenPassing(-50));
  await page.evaluate(() => { pacetime.player.yaw = Math.PI / 2 + 0.2; pacetime.player.pitch = 0.15; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "shots/exp-clock-riding.png" });
  await until(() => Math.abs(pacetime.player.pos.x) < 8, null, 120000);
  await page.evaluate(() => { pacetime.player.yaw = -0.3; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "shots/exp-clock-riding-past.png" });
  console.log("riding", JSON.stringify(await state(), null, 1));
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
