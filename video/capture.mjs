// Records the hype video's frames: each shot sets up a place, then the game
// is stepped one video frame at a time while the camera path and captions
// play. Frames go to video/out/frames.
//   node video/capture.mjs              every frame
//   node video/capture.mjs --preview    three stills a shot, to check framing
//   node video/capture.mjs --shot=a,b   just those shots (with --preview, or full)
import { mkdirSync, rmSync } from "node:fs";
import { open } from "../scripts/lib.mjs";
import { CAPTIONS, FPS, LENGTH } from "./timeline.mjs";
import { SHOTS } from "./shots.mjs";

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const only = args.find((a) => a.startsWith("--shot="))?.slice(7).split(",");
const OUT = new URL("./out/", import.meta.url).pathname;
const FRAMES = OUT + (preview ? "preview/" : "frames/");
if (!only) rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const t = await open({ size: [1920, 1080], fixed: true });
await t.wait(1500);
await t.page.addStyleTag({ content: `
  #hud, #toast, #veil, #menu { display: none !important; }
  #vid { position: fixed; inset: 0; pointer-events: none; z-index: 50; font-family: "Big Shoulders Display", "Arial Narrow", sans-serif; }
  #vid-cap { position: absolute; left: 0; right: 0; bottom: 13%; text-align: center; font-weight: 800; font-size: 76px; line-height: 1; letter-spacing: 0.02em; text-transform: uppercase; color: #fff;
    text-shadow: 0 3px 0 rgba(0,0,0,0.35), 0 0 30px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.8); }
  #vid-counter { position: absolute; left: 0; right: 0; top: 11%; text-align: center; font-weight: 800; font-size: 120px; line-height: 1; color: #fff; font-variant-numeric: tabular-nums;
    text-shadow: 0 0 40px rgba(110,180,255,0.6), 0 3px 0 rgba(0,0,0,0.4); }
  #vid-counter small { display: block; margin-top: 14px; font: 500 22px "JetBrains Mono", monospace; letter-spacing: 0.3em; color: rgba(255,255,255,0.75); text-shadow: 0 0 12px rgba(0,0,0,0.8); }
  #vid-scrim { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(5,6,12,0.35), rgba(5,6,12,0.85)); }
  #vid-title { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 22px; text-align: center; color: #fff; }
  #vid-title .bar { width: 520px; height: 4px; background: linear-gradient(90deg, #4b2bd9, #6f8bff, #38d6ff, #7cff9a, #ffe45c, #ff9b3d, #ff6a4d, #8f1d2a); }
  #vid-title h1 { margin: 0; font-weight: 800; font-size: 210px; line-height: 0.9; letter-spacing: 0.04em; text-shadow: 0 0 60px rgba(120,150,255,0.45); }
  #vid-title p { margin: 0; font: 500 38px "Public Sans", sans-serif; letter-spacing: 0.04em; color: rgba(255,255,255,0.9); }
  #vid-title .url { font: 500 34px "JetBrains Mono", monospace; letter-spacing: 0.08em; color: #ffd38a; margin-top: 10px; }
  #vid-fade { position: absolute; inset: 0; background: #000; }
  #vid-cards { position: absolute; right: 80px; bottom: 110px; width: 700px; display: flex; flex-direction: column; gap: 18px; }
  #vid-cards .card { background: #fff6e6; color: #2b2340; border-radius: 6px; padding: 18px 22px 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.45);
    font: 500 34px/1.3 "Public Sans", sans-serif; transform-origin: 50% 100%; }
  #vid-cards .card b { display: block; margin-bottom: 8px; font: 500 19px "JetBrains Mono", monospace; letter-spacing: 0.14em; color: #c0485a; }
` });
await t.page.evaluate(() => {
  const d = document.createElement("div");
  d.id = "vid";
  d.innerHTML = `<div id="vid-scrim"></div><div id="vid-counter"></div><div id="vid-cards"></div><div id="vid-cap"></div>
    <div id="vid-title"><div class="bar"></div><h1>SLOWLIGHT</h1><p>Light at a walking pace. Relativity you can play.</p><p class="url">shuw.github.io/slowlight</p></div><div id="vid-fade"></div>`;
  document.body.append(d);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  window.V = {
    mix: (a, b, u) => a + (b - a) * u,
    ease: (u) => { u = clamp(u); return u * u * (3 - 2 * u); },
    cam(x, y, z, yaw, pitch) {
      const p = slowlight.player;
      p.pos.set(x, y, z); p.u.set(0, 0, 0); p.v.set(0, 0, 0);
      p.yaw = yaw; p.pitch = pitch;
    },
    free() { slowlight.instance.walk = [[-1e5, -1e5, 1e5, 1e5]]; slowlight.instance.colliders = []; },
    // The overlay for one frame.
    show({ cap, capK, counter, cards, title, fade }) {
      // Cards from home, newest at the bottom, popping in as they arrive.
      const box = document.getElementById("vid-cards");
      const list = cards ? (window.__cards ?? []).slice(-3) : [];
      box.innerHTML = list.map((n, i) => {
        const [, sent, text] = n.match(/sent (.*?): (.*)$/) ?? [null, "", n];
        window.__cardAge ??= {};
        const age = (window.__cardAge[n] = (window.__cardAge[n] ?? 0) + 1);
        const pop = Math.min(1, age / 6);
        return `<div class="card" style="transform: rotate(${i % 2 ? 1.5 : -1.2}deg) scale(${0.85 + 0.15 * pop}); opacity: ${pop * (i < list.length - 2 ? 0.75 : 1)}"><b>FROM HOME · ${sent}</b>${text}</div>`;
      }).join("");
      const c = document.getElementById("vid-cap");
      c.textContent = cap ?? "";
      c.style.opacity = capK;
      c.style.transform = `scale(${1 + 0.06 * (1 - Math.min(1, capK * 1.4))})`;
      const n = document.getElementById("vid-counter");
      n.style.opacity = counter ? 1 : 0;
      if (counter) n.innerHTML = `${document.getElementById("beta").textContent}<span style="font-size:0.5em"> c</span><small>OF THE SPEED OF LIGHT</small>`;
      document.getElementById("vid-title").style.opacity = title;
      document.getElementById("vid-scrim").style.opacity = Math.min(1, title * 1.2);
      document.getElementById("vid-fade").style.opacity = fade;
    },
  };
  slowlight.warp = 0;
  slowlight.adaptiveResolution = false;
  slowlight.closeMenu(); // so held keys reach the game from the first shot
});

const nextFrame = () => t.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const captionAt = (time) => {
  const c = CAPTIONS.find((x) => time >= x.from && time < x.to);
  if (!c) return { cap: "", capK: 0 };
  return { cap: c.text, capK: Math.min(1, (time - c.from) / 0.18, (c.to - time) / 0.35) };
};

for (const shot of SHOTS) {
  if (only && !only.includes(shot.id)) continue;
  const started = Date.now();
  // On its own, a shot that carries on from the one before starts from a fresh copy of its place.
  if (only && only[0] === shot.id && !shot.setup.toString().includes("slowlight.load")) await t.page.evaluate((id) => slowlight.load(id), shot.place);
  if (shot.setup.constructor.name === "AsyncFunction") await shot.setup(t);
  else await t.page.evaluate(`(${shot.setup.toString()})()`);
  await t.page.evaluate(`window.__frame = ${shot.frame.toString()}; slowlight.closeMenu();`);
  // Let shaders compile and exposure settle before the first frame.
  for (let i = 0; i < 20; i++) await nextFrame();
  const n = Math.round((shot.to - shot.from) * FPS);
  const stills = preview ? new Set([0, Math.floor(n / 2), n - 1]) : null;
  for (let f = 0; f < n; f++) {
    const time = shot.from + f / FPS;
    const u = f / (n - 1), s = f / FPS;
    const overlay = {
      ...captionAt(time),
      counter: !!shot.counter,
      title: shot.title ? Math.min(1, Math.max(0, (time - (shot.from + 1.2)) / 1.2)) : 0,
      cards: !!shot.cards,
      fade: time < 0.6 ? 1 - time / 0.6 : time > LENGTH - 0.8 ? (time - (LENGTH - 0.8)) / 0.8 : 0,
    };
    await t.page.evaluate(([u, s, o, k]) => { window.__frame(u, s); slowlight.advance(k / 30, { live: true }); V.show(o); }, [u, s, overlay, shot.speed ?? 1]);
    await nextFrame();
    if (!stills || stills.has(f)) {
      const name = preview ? `${shot.id}-${String(f).padStart(3, "0")}.jpg` : `${String(Math.round(time * FPS)).padStart(5, "0")}.jpg`;
      await t.page.screenshot({ path: FRAMES + name, type: "jpeg", quality: preview ? 80 : 94 });
    }
  }
  console.log(`${shot.id}: ${n} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
console.log(t.errors.length ? "ERRORS:\n" + [...new Set(t.errors)].join("\n") : "no console errors");
await t.close();
