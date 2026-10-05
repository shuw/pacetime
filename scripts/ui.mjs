// Checks the shell: number keys, help, mute, pace speeds and refresh-restore via the URL hash.
// Usage: bun run dev (in another shell), then: node scripts/ui.mjs
import { chromium } from "playwright-core";

const URL = process.env.URL ?? "http://localhost:5180/";
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const ok = (label, cond) => console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
const q = (fn, arg) => page.evaluate(fn, arg);

await page.goto(URL);
await page.waitForTimeout(1500);
await page.keyboard.press("Digit5");
await page.waitForTimeout(400);
ok("5 on the title screen starts Einstein's Railway", await q(() => document.getElementById("menu").hidden && document.getElementById("scene-title").textContent === "Einstein's Railway"));

await q(() => { pacetime.player.yaw = -Math.PI / 2; }); // along the platform
await page.keyboard.down("w");
await page.waitForTimeout(3500);
const beta = await q(() => pacetime.player.beta);
ok(`W alone sprints, to 95% of c where c = 5 m/s (got ${(beta * 100).toFixed(1)}%)`, Math.abs(beta - 0.95) < 0.01);
await page.keyboard.down("Shift");
await page.waitForTimeout(2500);
const boosted = await q(() => pacetime.player.beta);
await page.keyboard.up("w");
await page.keyboard.up("Shift");
ok(`holding Shift steps up to the afterburner, 99.5% (got ${(boosted * 100).toFixed(1)}%)`, Math.abs(boosted - 0.995) < 0.002);
ok("the mouse hint goes once you've used the movement keys", await q(() => document.getElementById("look-hint").hidden));
await q(() => { pacetime.player.place(-96, 11, Math.PI / 2); }); // back along the platform
await page.keyboard.down("Alt");
await page.keyboard.down("w");
await page.waitForTimeout(2500);
const walked = await q(() => pacetime.player.beta);
await page.keyboard.up("w");
await page.keyboard.up("Alt");
ok(`holding Alt steps down to a walk, 53% (got ${(walked * 100).toFixed(1)}%)`, Math.abs(walked - 0.532) < 0.01);

await page.waitForTimeout(2500); // coast to a stop
const hash = await q(() => location.hash);
ok(`address bar tracks state (${hash})`, /^#railway@/.test(hash));
const before = await q(() => ({ x: pacetime.player.pos.x, z: pacetime.player.pos.z, yaw: pacetime.player.yaw }));

await page.keyboard.press("KeyL");
await page.click("#fx-doppler");
await page.keyboard.press("KeyL");
await page.waitForTimeout(800);
ok("switching an effect off shows in the address", (await q(() => location.hash)).includes("off=doppler"));

await page.reload();
await page.waitForTimeout(1500);
const after = await q(() => ({ x: pacetime.player.pos.x, z: pacetime.player.pos.z, yaw: pacetime.player.yaw, menu: !document.getElementById("menu").hidden, doppler: pacetime.effects.doppler, title: document.getElementById("scene-title").textContent }));
ok("refresh returns to the same experiment, in game", after.title === "Einstein's Railway" && !after.menu);
ok(`refresh restores position (${before.x.toFixed(1)},${before.z.toFixed(1)} → ${after.x.toFixed(1)},${after.z.toFixed(1)})`, Math.abs(after.x - before.x) < 0.2 && Math.abs(after.z - before.z) < 0.2 && Math.abs(after.yaw - before.yaw) < 0.02);
ok("refresh restores Lab settings", after.doppler === false && (await q(() => !document.getElementById("fx-doppler").checked)));

await page.keyboard.press("Shift+Slash");
ok("? opens help", await q(() => !document.getElementById("help").hidden));
await page.keyboard.press("Escape");
ok("Esc closes help", await q(() => document.getElementById("help").hidden));

await page.keyboard.press("KeyN");
ok("N mutes", await q(() => !document.getElementById("sound-toggle").checked));
await page.keyboard.press("KeyN");
ok("N unmutes", await q(() => document.getElementById("sound-toggle").checked));

await page.evaluate(() => { location.hash = "#city"; });
await page.waitForTimeout(800);
ok("editing the hash to #city switches place", await q(() => document.getElementById("scene-title").textContent === "Neon Crossroads"));

await page.evaluate(() => { history.replaceState(null, "", location.pathname); pacetime.effects.doppler = true; });
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no console errors");
await browser.close();
