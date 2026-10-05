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
  t: slowlight.world.t.toFixed(1),
  goals: [...document.querySelectorAll("#goals li")].map((li) => (li.classList.contains("done") ? "✓ " : "· ") + li.textContent),
  note: document.getElementById("note").textContent,
  log: [...document.querySelectorAll("#log li")].map((li) => li.innerText.replace(/\n/g, " | ")),
}));
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const place = (x, z, yaw) => page.evaluate(([x, z, yaw]) => slowlight.player.place(x, z, yaw), [x, z, yaw]);
await page.evaluate((id) => { slowlight.load(id); slowlight.closeMenu(); }, which);
await page.evaluate((w) => (slowlight.warp = w), Number(process.env.WARP ?? 6));

if (which === "railway") {
  const doors = () => page.evaluate(() => slowlight.instance.log.seen.filter((e) => e.tag === "door").length);
  await place(-90, 6.5, 0);
  await until(() => slowlight.instance.log.seen.filter((e) => e.tag === "strike").length >= 2);
  await page.screenshot({ path: "shots/rail-strike.png" });
  console.log("strike ring", JSON.stringify((await state()).note));
  const d0 = await doors();
  await place(-10, 17, 0);
  await until((n) => slowlight.instance.log.seen.filter((e) => e.tag === "door").length >= n + 2, d0);
  await page.screenshot({ path: "shots/rail-tunnel.png" });
  console.log("tunnel ring", JSON.stringify((await state()).note));
  // Platform edge as a train flies past.
  await place(-50, 4, 0, 0);
  await until(() => slowlight.instance.goals[6].done, null, 120000);
  await page.screenshot({ path: "shots/rail-terrell.png" });
  await place(54, 12, -0.3);
  await until(() => slowlight.instance.trains.some((tr) => Math.abs(tr.centerAt(slowlight.world.t) - 62) < 4), null, 120000);
  await page.screenshot({ path: "shots/rail-clock.png" });
  // Board the next train at the start of the line and ride it to the end.
  await until(() => slowlight.instance.trains.some((tr) => { const c = tr.centerAt(slowlight.world.t); return c > -150 && c < -144; }), null, 120000);
  const c = await page.evaluate(() => slowlight.instance.trains.map((tr) => tr.centerAt(slowlight.world.t)).find((c) => c > -150 && c < -144));
  await place(c, 4.6, -Math.PI / 2);
  await page.evaluate(() => slowlight.act());
  console.log("boarded:", await page.evaluate(() => !!slowlight.player.vehicle));
  await until(() => slowlight.player.pos.x > -40, null, 120000);
  await page.screenshot({ path: "shots/rail-riding.png" });
  await until(() => !slowlight.player.vehicle, null, 180000);
  await page.waitForTimeout(500);
  console.log("after ride", JSON.stringify(await state(), null, 1));
}

await browser.close();
