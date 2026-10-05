// Shared helpers for the browser scripts.
import { chromium } from "playwright-core";

export const URL = process.env.URL ?? "http://localhost:5180/";
let shotCount = 0;

// The dev server's log, where build errors show up.
export const DEV_LOG = process.env.PACETIME_LOG ?? "/tmp/pacetime-dev.log";

// fixed: the same random numbers and the same date on every run, for
// screenshots that can be compared.
export async function open({ hash = "", size = [1440, 860], gpu = true, fixed = false } = {}) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: gpu ? ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] : [],
  });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  if (fixed) {
    await page.addInitScript(() => {
      let s = 12345;
      Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const day = Date.UTC(2026, 9, 4, 12);
      Date.now = () => day;
    });
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL + hash);
  try {
    // With a place in the address, wait for it; otherwise the title screen is enough.
    await page.waitForFunction((h) => (h ? window.pacetime?.instance : window.pacetime), hash, { timeout: 15000 });
  } catch (e) {
    // Bun serves its error page when the build fails; it's a script, so read
    // the dev server log for why instead.
    const { readFileSync } = await import("node:fs");
    let log = "";
    try { log = readFileSync(DEV_LOG, "utf8").split("\n").slice(-8).join("\n").replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), ""); } catch {}
    console.error("Page didn't start. Build error?\n" + log);
    throw e;
  }
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
