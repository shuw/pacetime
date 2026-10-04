// Drives each scene in Chrome and saves screenshots to shots/.
// Usage: bun run dev (in another shell), then: node scripts/playtest.mjs
import { chromium } from "playwright-core";

const URL = process.env.URL ?? "http://localhost:5180/";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL);
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/00-title.png" });

const enter = async (id) => {
  await page.evaluate((id) => { pacetime.load(id); pacetime.closeMenu(); }, id);
  await page.waitForTimeout(600);
};
const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
};
const snap = (name) => page.screenshot({ path: `shots/${name}.png` });
const state = () => page.evaluate(() => ({
  beta: pacetime.player.beta.toFixed(3), tau: pacetime.player.tau.toFixed(2), t: pacetime.world.t.toFixed(2),
  goals: [...document.querySelectorAll("#goals li")].map((li) => (li.classList.contains("done") ? "✓ " : "· ") + li.textContent),
}));

for (const id of (process.env.SCENES ?? "meadow,choir,garden,tea").split(",")) {
  await enter(id);
  await snap(`${id}-1-rest`);
  await hold(["w"], 1500);
  await snap(`${id}-2-walk`);
  await page.keyboard.down("Shift");
  await hold(["w"], 2500);
  await snap(`${id}-3-sprint`);
  await page.keyboard.down("b");
  await hold(["w"], 400);
  await snap(`${id}-4-lookback`);
  await page.keyboard.up("b");
  await page.keyboard.up("Shift");
  console.log(id, JSON.stringify(await state()));
}

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
await browser.close();
