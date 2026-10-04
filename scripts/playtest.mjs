// Loads each experiment in Chrome, takes screenshots, and reports errors.
// Usage: bun run dev (in another shell), then: node scripts/playtest.mjs
import { chromium } from "playwright-core";

const URL = process.env.URL ?? "http://localhost:5180/";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(m.text()));

await page.goto(URL);
await page.waitForTimeout(4000);
await page.screenshot({ path: "shots/00-title.png" });

const snap = (name) => page.screenshot({ path: `shots/${name}.png` });
const state = () => page.evaluate(() => ({
  beta: pacetime.player.beta.toFixed(3), t: pacetime.world.t.toFixed(1), tau: pacetime.player.tau.toFixed(1),
  riding: !!pacetime.player.vehicle,
  goals: [...document.querySelectorAll("#goals li")].map((li) => (li.classList.contains("done") ? "✓ " : "· ") + li.textContent),
  note: document.getElementById("note").textContent,
}));

for (const id of (process.env.SCENES ?? "simultaneity,tunnel,lightclock,beam").split(",")) {
  await page.evaluate((id) => { pacetime.load(id); pacetime.closeMenu(); }, id);
  await page.waitForTimeout(3000);
  await snap(`${id}-1`);
  console.log(id, JSON.stringify(await state()));
}

console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].slice(0, 20).join("\n") : "no console errors");
await browser.close();
