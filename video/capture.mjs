// Records the trailer's frames: each shot sets up a place, then the game is
// stepped one video frame at a time while the camera path and captions play.
// Each frame blends sub-frames over half the frame time (a 180° shutter), for
// motion blur. The game's sound effects are logged as they happen and
// rendered, with the game's own recipes, to video/out/effects.wav.
//   node video/capture.mjs              every frame
//   node video/capture.mjs --preview    three stills a shot, no blur, to check framing
//   node video/capture.mjs --shot=a,b   just those shots (with --preview, or full)
//   node video/capture.mjs --preview --stills=8   more stills a shot
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { open } from "../scripts/lib.mjs";
import { CAPTIONS, FPS, LENGTH } from "./timeline.mjs";
import { SHOTS } from "./shots.mjs";

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const only = args.find((a) => a.startsWith("--shot="))?.slice(7).split(",");
const STILLS = Number(args.find((a) => a.startsWith("--stills="))?.slice(9) ?? 3);
const OUT = new URL("./out/", import.meta.url).pathname;
const FRAMES = OUT + (preview ? "preview/" : "frames/");
const SUB = preview ? 1 : 8, SHUTTER = 0.5;
if (!only) rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const t = await open({ size: [1920, 1080], fixed: true });
await t.wait(1500);
await t.page.addStyleTag({ content: `
  #hud, #toast, #veil, #menu { display: none !important; }
  #acc { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: none; }
  #vid { position: fixed; inset: 0; pointer-events: none; z-index: 50; font-family: "Big Shoulders Display", "Arial Narrow", sans-serif; }
  #vid .lbox { position: absolute; left: 0; right: 0; height: 138px; margin: 0; padding: 0; border: 0; background: #000; }
  #vid-cap { position: absolute; left: 0; right: 0; bottom: 178px; display: flex; justify-content: center; flex-wrap: wrap; gap: 0 0.28em; padding: 0 120px;
    font-weight: 800; font-size: 84px; line-height: 1.05; letter-spacing: 0.02em; text-transform: uppercase; color: #fff; }
  #vid-cap span { display: inline-block; text-shadow: 0 4px 0 rgba(0,0,0,0.35), 0 0 34px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.9); }
  #vid-cap span.hot { color: #ffd38a; }
  #vid-counter { position: absolute; left: 0; right: 0; top: 168px; text-align: center; font-weight: 800; font-size: 120px; line-height: 1; color: #fff; font-variant-numeric: tabular-nums;
    text-shadow: 0 0 40px rgba(110,180,255,0.6), 0 3px 0 rgba(0,0,0,0.4); }
  #vid-counter small { display: block; margin-top: 12px; font: 500 22px "JetBrains Mono", monospace; letter-spacing: 0.3em; color: rgba(255,255,255,0.8); text-shadow: 0 0 12px rgba(0,0,0,0.8); }
  #vid-labels { position: absolute; inset: 0; }
  #vid-labels svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  #vid-labels .lab { position: absolute; transform: translate(-50%, -100%); font: 500 32px "JetBrains Mono", monospace; letter-spacing: 0.12em; padding: 8px 14px; border-radius: 4px; white-space: nowrap;
    background: rgba(5, 8, 20, 0.78); border: 2px solid currentColor; }
  #vid-scrim { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(5,6,12,0.35), rgba(5,6,12,0.85)); }
  #vid-title { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 22px; text-align: center; color: #fff; }
  #vid-title .spec { width: 520px; height: 4px; background: linear-gradient(90deg, #4b2bd9, #6f8bff, #38d6ff, #7cff9a, #ffe45c, #ff9b3d, #ff6a4d, #8f1d2a); }
  #vid-title h1 { margin: 0; font-weight: 800; font-size: 210px; line-height: 0.9; letter-spacing: 0.04em; text-shadow: 0 0 60px rgba(120,150,255,0.45); }
  #vid-title p { margin: 0; font: 500 38px "Public Sans", sans-serif; letter-spacing: 0.04em; color: rgba(255,255,255,0.9); }
  #vid-title .url { font: 500 34px "JetBrains Mono", monospace; letter-spacing: 0.08em; color: #ffd38a; margin-top: 10px; }
  #vid-fade { position: absolute; inset: 0; background: #000; }
  #vid-blk { position: absolute; inset: 0; background: #000; }
  #vid-split { position: absolute; top: 138px; bottom: 138px; width: 4px; margin-left: -2px; background: #fff; box-shadow: 0 0 24px rgba(255,255,255,0.8); }
  #vid-split b { position: absolute; bottom: 40px; font: 800 44px "Big Shoulders Display", sans-serif; letter-spacing: 0.08em; white-space: nowrap; text-shadow: 0 0 20px rgba(0,0,0,0.9); }
  #vid-split b.off { right: 28px; color: #c9cede; } #vid-split b.on { left: 28px; color: #ffd38a; }
  #vid-cards { position: absolute; right: 90px; bottom: 170px; width: 680px; display: flex; flex-direction: column; gap: 16px; }
  #vid-cards .card { background: #fff6e6; color: #2b2340; border-radius: 6px; padding: 16px 22px 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.45); font: 500 32px/1.3 "Public Sans", sans-serif; transform-origin: 50% 100%; }
  #vid-cards .card b { display: block; margin-bottom: 6px; font: 500 18px "JetBrains Mono", monospace; letter-spacing: 0.14em; color: #c0485a; }
` });
await t.page.evaluate(({ sub, shutter }) => {
  const d = document.createElement("div");
  d.id = "vid";
  d.innerHTML = `<div id="vid-blk"></div><div id="vid-scrim"></div><div id="vid-split"><b class="off">EINSTEIN OFF</b><b class="on">EINSTEIN ON</b></div><div id="vid-labels"><svg></svg></div><div id="vid-counter"></div><div id="vid-cards"></div><div id="vid-cap"></div>
    <div id="vid-title"><div class="spec"></div><h1>SLOWLIGHT</h1><p>Light at a walking pace. Relativity you can play.</p><p class="url">shuw.github.io/slowlight</p></div>
    <div class="lbox" style="top:0"></div><div class="lbox" style="bottom:0"></div><div id="vid-fade"></div>`;
  document.body.append(d);
  // The blended frame sits over the game's own canvas.
  const gl = document.getElementById("view");
  const acc = document.createElement("canvas");
  acc.id = "acc";
  document.body.append(acc);
  const ac = acc.getContext("2d");
  const tmp = document.createElement("canvas"), tc = tmp.getContext("2d");
  const sh = slowlight.shared;
  // Draw this moment as it would look with relativity switched off.
  const renderOff = () => {
    const keep = [sh.uFlags.value.clone(), sh.uDelay.value, sh.uContract.value];
    sh.uFlags.value.set(0, 0, 0, 0); sh.uDelay.value = 0; sh.uContract.value = 0;
    slowlight.render();
    sh.uFlags.value.copy(keep[0]); sh.uDelay.value = keep[1]; sh.uContract.value = keep[2];
  };
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const v = new slowlight.camera.position.constructor();
  window.V = {
    mix: (a, b, u) => a + (b - a) * u,
    ease: (u) => { u = clamp(u); return u * u * (3 - 2 * u); },
    cam(x, y, z, yaw, pitch) {
      const p = slowlight.player;
      p.pos.set(x, y, z); p.u.set(0, 0, 0); p.v.set(0, 0, 0);
      p.yaw = yaw; p.pitch = pitch;
    },
    // Aim from (x, y, z) at a point: [yaw, pitch].
    aim(x, y, z, at) {
      const dx = at[0] - x, dy = at[1] - y - 1.6, dz = at[2] - z;
      return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
    },
    free() { slowlight.instance.walk = [[-1e5, -1e5, 1e5, 1e5]]; slowlight.instance.colliders = []; },
    // The x-ray copies of moving things, brighter for a reveal.
    xray(on, opacity = 0.55) {
      slowlight.effects.ghosts = on;
      slowlight.instance?.group.traverse((o) => { if (o.material?.defines?.GHOST !== undefined) o.material.uniforms.uOpacity.value = on ? opacity : 0.22; });
    },
    labels: [],
    // Step the world one video frame (or hold it, for a freeze) and blend the sub-frames.
    step(dt, hold, split) {
      const W = gl.width, H = gl.height;
      if (acc.width !== W) { acc.width = tmp.width = W; acc.height = tmp.height = H; }
      if (hold) slowlight.advance(1e-6, { live: true }); // the world stands still; the camera can still move
      else slowlight.advance(dt * (1 - (sub > 1 ? shutter : 0)), { live: sub === 1 });
      const k = hold ? 1 : sub;
      for (let i = 0; i < k; i++) {
        if (!hold && k > 1) slowlight.advance((dt * shutter) / k, { live: true });
        slowlight.render();
        let src = gl;
        if (split > 0) {
          tc.drawImage(gl, 0, 0);
          renderOff();
          const x = Math.round(W * split);
          tc.drawImage(gl, 0, 0, x, H, 0, 0, x, H);
          src = tmp;
        }
        ac.globalAlpha = 1 / (i + 1);
        ac.drawImage(src, 0, 0);
      }
    },
    // The overlay for one frame.
    show({ words, counter, cards, title, fade, black, split }) {
      document.getElementById("vid-blk").style.opacity = black ? 1 : 0;
      const sp = document.getElementById("vid-split");
      sp.style.display = split > 0 && split < 1 ? "block" : "none";
      sp.style.left = (split ?? 0) * 100 + "%";
      const c = document.getElementById("vid-cap");
      c.innerHTML = words.map((w) => `<span class="${w.hot ? "hot" : ""}" style="opacity:${w.k};transform:scale(${1 + 0.35 * (1 - w.pop) ** 2}) translateY(${(1 - w.pop) * 14}px)">${w.text}</span>`).join("");
      const n = document.getElementById("vid-counter");
      n.style.opacity = counter ? 1 : 0;
      if (counter) n.innerHTML = `${document.getElementById("beta").textContent}<span style="font-size:0.5em"> c</span><small>OF THE SPEED OF LIGHT</small>`;
      // Labels pinned to things in the scene, with a line down to each.
      const box = document.getElementById("vid-labels"), svg = box.querySelector("svg");
      box.querySelectorAll(".lab").forEach((e) => e.remove());
      let lines = "";
      for (const l of V.labels) {
        v.set(...l.at).project(slowlight.camera);
        if (v.z > 1) continue;
        const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight, lx = x + (l.dx ?? 0), ly = y - (l.up ?? 120);
        const e = document.createElement("div");
        e.className = "lab"; e.textContent = l.text;
        Object.assign(e.style, { left: lx + "px", top: ly + "px", color: l.color, opacity: l.k ?? 1 });
        box.append(e);
        lines += `<line x1="${lx}" y1="${ly}" x2="${x}" y2="${y}" stroke="${l.color}" stroke-width="3" opacity="${l.k ?? 1}"/><circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${l.color}" stroke-width="3" opacity="${l.k ?? 1}"/>`;
      }
      svg.innerHTML = lines;
      const box2 = document.getElementById("vid-cards");
      const list = cards ? (window.__cards ?? []).slice(-3) : [];
      window.__cardAge ??= {};
      box2.innerHTML = list.map((n, i) => {
        const [, sent, text] = n.match(/sent (.*?): (.*)$/) ?? [null, "", n];
        const age = (window.__cardAge[n] = (window.__cardAge[n] ?? 0) + 1), pop = Math.min(1, age / 6);
        return `<div class="card" style="transform: rotate(${i % 2 ? 1.5 : -1.2}deg) scale(${0.85 + 0.15 * pop}); opacity: ${pop * (i < list.length - 2 ? 0.75 : 1)}"><b>FROM HOME · ${sent}</b>${text}</div>`;
      }).join("");
      document.getElementById("vid-title").style.opacity = title;
      document.getElementById("vid-scrim").style.opacity = Math.min(1, title * 1.2);
      document.getElementById("vid-fade").style.opacity = fade;
    },
  };
  // Log the game's sound effects with the video time they happen at.
  const KEEP = new Set(["bonk", "horn", "clang", "bang", "strike", "doorShut", "doorOpen", "zap", "board", "alight", "toss", "swoosh"]);
  window.__sfx = []; window.__vt = 0; window.__rec = false;
  for (const name of Object.keys(slowlight.sfx)) {
    const play = slowlight.sfx[name];
    slowlight.sfx[name] = (...a) => {
      if (window.__rec && KEEP.has(name)) {
        const p = slowlight.player, y = p.yaw + (p.looking ? Math.PI : 0);
        window.__sfx.push({ at: window.__vt, name, args: a.map((x) => (x?.isVector3 ? x.toArray() : x)), eye: p.eye.toArray(), right: [Math.cos(y), 0, -Math.sin(y)] });
      }
      return play(...a);
    };
  }
  slowlight.warp = 0;
  slowlight.adaptiveResolution = false;
  slowlight.closeMenu(); // so held keys reach the game from the first shot
}, { sub: SUB, shutter: SHUTTER });

const nextFrame = () => t.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// Caption words pop in one after another, then the line fades out.
const wordsAt = (time) => {
  const c = CAPTIONS.find((x) => time >= x.from && time < x.to);
  if (!c) return [];
  const out = Math.min(1, (c.to - time) / 0.3);
  return c.text.split(" ").map((w, i) => {
    const at = c.from + i * (c.per ?? 0.25);
    const pop = Math.max(0, Math.min(1, (time - at) / 0.12)); // pops in, then just fades out
    return { text: w.replace(/^\*|\*$/g, ""), hot: /^\*.*\*$/.test(w), pop, k: pop * out };
  });
};

for (const shot of SHOTS) {
  if (only && !only.includes(shot.id)) continue;
  const started = Date.now();
  // On its own, a shot that carries on from the one before starts from a fresh copy of its place.
  if (only && only[0] === shot.id && !shot.setup.toString().includes("slowlight.load")) await t.page.evaluate((id) => slowlight.load(id), shot.place);
  await t.page.evaluate(() => { window.__rec = false; V.labels = []; V.xray(false); });
  if (shot.setup.constructor.name === "AsyncFunction") await shot.setup(t);
  else await t.page.evaluate(`(${shot.setup.toString()})()`);
  await t.page.evaluate(`window.__frame = ${shot.frame.toString()}; slowlight.closeMenu();`);
  // Let shaders compile and exposure settle before the first frame.
  for (let i = 0; i < 20; i++) await nextFrame();
  const f0 = Math.round(shot.from * FPS), n = Math.round(shot.to * FPS) - f0;
  const stills = preview ? new Set(Array.from({ length: STILLS }, (_, i) => Math.round((i * (n - 1)) / (STILLS - 1)))) : null;
  for (let f = 0; f < n; f++) {
    const time = (f0 + f) / FPS;
    const u = f / (n - 1), s = f / FPS;
    const overlay = {
      black: !!shot.black,
      words: wordsAt(time),
      counter: !!shot.counter,
      cards: !!shot.cards,
      title: shot.title ? Math.min(1, Math.max(0, (time - (shot.from + 1.2)) / 1.2)) : 0,
      fade: time < 0.4 ? 1 - time / 0.4 : time > LENGTH - 0.8 ? (time - (LENGTH - 0.8)) / 0.8 : 0,
    };
    await t.page.evaluate(([u, s, o, k, time]) => {
      window.__vt = time; window.__rec = true;
      const r = window.__frame(u, s);
      V.step(k / 30, r === "hold", r?.split);
      V.show({ ...o, split: r?.split });
    }, [u, s, overlay, shot.speed ?? 1, time]);
    await nextFrame();
    if (!stills || stills.has(f)) {
      const name = preview ? `${shot.id}-${String(f).padStart(3, "0")}.jpg` : `${String(f0 + f).padStart(5, "0")}.jpg`;
      await t.page.screenshot({ path: FRAMES + name, type: "jpeg", quality: preview ? 80 : 94 });
    }
  }
  console.log(`${shot.id}: ${n} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

// The sound effects, rendered with the game's own recipes.
if (!preview && !only) {
  const events = await t.page.evaluate(() => { window.__rec = false; return window.__sfx; });
  writeFileSync(OUT + "effects.json", JSON.stringify(events, null, 1));
  const pcm = await t.page.evaluate(async (len) => {
    const buf = await slowlight.renderEffects(window.__sfx, len);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, out = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { out[2 * i] = Math.max(-32767, Math.min(32767, L[i] * 32767)); out[2 * i + 1] = Math.max(-32767, Math.min(32767, R[i] * 32767)); }
    const bytes = new Uint8Array(out.buffer);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { b64: btoa(s), sr: buf.sampleRate };
  }, LENGTH);
  const data = Buffer.from(pcm.b64, "base64"), head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(pcm.sr, 24); head.writeUInt32LE(pcm.sr * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  writeFileSync(OUT + "effects.wav", Buffer.concat([head, data]));
  console.log(`effects.wav: ${events.length} sound effects`);
}
console.log(t.errors.length ? "ERRORS:\n" + [...new Set(t.errors)].join("\n") : "no console errors");
await t.close();
