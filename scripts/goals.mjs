// Plays the choir and tea goals with scripted steering to check they can be won.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(process.env.URL ?? "http://localhost:5180/");
await page.waitForTimeout(800);
const goals = () => page.evaluate(() => [...document.querySelectorAll("#goals li")].map((li) => (li.classList.contains("done") ? "✓ " : "· ") + li.textContent));
const toast = () => page.evaluate(() => document.getElementById("toast").textContent);

// Choir: walk to the stump and wait a few beats.
await page.evaluate(() => { pacetime.load("choir"); pacetime.closeMenu(); });
await page.keyboard.down("w");
await page.waitForFunction(() => pacetime.player.pos.z < 0.6, null, { timeout: 60000 });
await page.keyboard.up("w");
await page.waitForTimeout(7000);
console.log("choir", await goals(), "|", await toast());
await page.screenshot({ path: "shots/goal-choir.png" });

// Tea: walk to the kettle, sprint laps on a circle of radius 9, then come home.
await page.evaluate(() => { pacetime.load("tea"); pacetime.closeMenu(); });
await page.evaluate(() => { pacetime.player.yaw = 0; });
await page.keyboard.down("w");
await page.waitForFunction(() => document.querySelector("#goals li")?.classList.contains("done"), null, { timeout: 20000 });
await page.keyboard.down("Shift");
await page.evaluate(() => {
  window.steer = setInterval(() => {
    const p = pacetime.player.pos;
    const a = Math.atan2(p.z, p.x);
    const r = Math.hypot(p.x, p.z);
    // Aim along the tangent, nudged toward radius 9.
    const ta = a + Math.PI / 2 - (9 - r) * 0.08;
    const dx = Math.cos(ta), dz = Math.sin(ta);
    pacetime.player.yaw = Math.atan2(-dx, -dz);
  }, 16);
});
await page.waitForFunction(() => pacetime.player.tau > 33, null, { timeout: 60000 });
await page.evaluate(() => {
  clearInterval(window.steer);
  window.steer = setInterval(() => {
    const p = pacetime.player.pos;
    pacetime.player.yaw = Math.atan2(p.x, p.z);
  }, 16);
});
await page.waitForFunction(() => Math.hypot(pacetime.player.pos.x, pacetime.player.pos.z) < 1.8, null, { timeout: 20000 });
await page.keyboard.up("w");
await page.keyboard.up("Shift");
await page.evaluate(() => clearInterval(window.steer));
await page.waitForTimeout(2500);
console.log("tea", await goals(), "|", await toast());
await page.screenshot({ path: "shots/goal-tea.png" });
await browser.close();
