// Screenshots each style preview: at rest, walking, sprinting, and glancing back.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(process.env.URL ?? "http://localhost:5180/");
await page.waitForTimeout(800);

const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
};

for (const id of (process.env.STYLES ?? "style-neon,style-monolith,style-manifold,style-cosmic").split(",")) {
  await page.evaluate((id) => {
    pacetime.load(id);
    pacetime.closeMenu();
    document.getElementById("hud").hidden = true;
  }, id);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/${id}-1-rest.png` });
  await hold(["w"], 1600);
  await page.screenshot({ path: `shots/${id}-2-walk.png` });
  await page.keyboard.down("Shift");
  await hold(["w"], 2600);
  await page.screenshot({ path: `shots/${id}-3-sprint.png` });
  await page.keyboard.down("b");
  await hold(["w"], 500);
  await page.screenshot({ path: `shots/${id}-4-back.png` });
  await page.keyboard.up("b");
  await page.keyboard.up("Shift");
}
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no console errors");
await browser.close();
