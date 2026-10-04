// Shared helpers for the browser scripts.
import { chromium } from "playwright-core";

export const URL = process.env.URL ?? "http://localhost:5180/";
let shotCount = 0;

export async function open({ hash = "", size = [1440, 860], gpu = true } = {}) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: gpu ? ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] : [],
  });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL + hash);
  await page.waitForFunction(() => window.pacetime?.instance, null, { timeout: 15000 });
  const t = {
    browser, page, errors,
    q: (fn, arg) => page.evaluate(fn, arg),
    until: (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 50 }),
    wait: (ms) => page.waitForTimeout(ms),
    // Unique file names, so image viewers never show a stale copy.
    snap: async (name) => {
      const path = `shots/${name}-${Date.now().toString(36)}${shotCount++}.png`;
      await page.screenshot({ path });
      return path;
    },
    place: (x, z, yaw = 0, pitch = 0) => page.evaluate(([x, z, yaw, pitch]) => { pacetime.player.place(x, z, yaw); pacetime.player.pitch = pitch; }, [x, z, yaw, pitch]),
    advance: (s) => page.evaluate((s) => pacetime.advance(s), s),
    hud: (show) => page.evaluate((show) => { document.getElementById("hud").hidden = !show; }, show),
    goals: () => page.evaluate(() => (pacetime.instance.goals ?? []).map((g) => (g.done ? "✓ " : "· ") + g.text)),
    note: () => page.evaluate(() => pacetime.instance.note ?? ""),
    close: () => browser.close(),
  };
  return t;
}

export function report(errors) {
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? "ERRORS:\n  " + uniq.join("\n  ") : "no console errors");
  return uniq.length === 0;
}
