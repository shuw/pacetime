// Compares a set of views against reference screenshots in tests/looks/, to
// catch things that still work but look wrong. Each view is drawn at a fixed
// moment with fixed random numbers.
// Usage: node scripts/looks.mjs [--update]   (--update saves new references)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { open, report } from "./lib.mjs";

const UPDATE = process.argv.includes("--update") || process.env.LOOKS_UPDATE === "1";
const DIR = "tests/looks";
const SIZE = [800, 500];

// Each view: a place, then code run in the page before the shot.
const VIEWS = [
  ["pier-golden-hour", "pier", () => slowlight.advance(1)],
  ["pier-night", "pier", () => { slowlight.instance.day.set(0.85, slowlight.world.t); slowlight.player.place(0, -60, 0); slowlight.player.pitch = 0.05; slowlight.advance(1); }],
  ["highway-99.93", "highway", () => { slowlight.player.eta = 4; slowlight.advance(0.4); }],
  ["starship-cabin", "starship", () => slowlight.advance(1)],
  ["starship-cruise", "starship", () => { const s = slowlight.player.ship; s.helm = true; s.local.set(0, 0, -4.75); s.eta = 8; slowlight.advance(1); }],
  ["city", "city", () => slowlight.advance(2)],
  ["railway", "railway", () => { slowlight.advance(20); slowlight.player.place(-60, 12, 0.3); slowlight.player.pitch = 0.05; slowlight.advance(0.05); }],
];

mkdirSync(DIR, { recursive: true });
mkdirSync("shots", { recursive: true });
const t = await open({ size: SIZE, fixed: true });
await t.q(() => { slowlight.warp = 0; slowlight.adaptiveResolution = false; });
await t.page.addStyleTag({ content: "#hud, #toast, #minimap { display: none !important; }" });

// Pixels differing by more than 48 (of 255) in any channel, and the mean difference.
async function compare(a, b) {
  return t.page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = ia.width, h = ia.height;
    if (ib.width !== w || ib.height !== h) return { size: true };
    const px = (im) => { const c = new OffscreenCanvas(w, h).getContext("2d"); c.drawImage(im, 0, 0); return c.getImageData(0, 0, w, h).data; };
    const pa = px(ia), pb = px(ib);
    let off = 0, sum = 0;
    const diff = new OffscreenCanvas(w, h), dc = diff.getContext("2d"), out = dc.createImageData(w, h);
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
      sum += d;
      if (d > 48) off++;
      out.data.set(d > 48 ? [255, 40, 40, 255] : [pa[i] * 0.3, pa[i + 1] * 0.3, pa[i + 2] * 0.3, 255], i);
    }
    dc.putImageData(out, 0, 0);
    const blob = await diff.convertToBlob({ type: "image/png" });
    const diffUrl = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
    return { off: off / (w * h), mean: sum / (w * h), diffUrl };
  }, [a, b]);
}

let failed = 0;
for (const [name, place, setup] of VIEWS) {
  await t.q((id) => { slowlight.load(id); slowlight.closeMenu(); }, place);
  await t.q(setup);
  await t.q(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const shot = await t.page.screenshot({ type: "jpeg", quality: 85 });
  const ref = `${DIR}/${name}.jpg`;
  if (UPDATE || !existsSync(ref)) {
    writeFileSync(ref, shot);
    console.log(`saved   ${name}`);
    continue;
  }
  const url = (buf) => "data:image/jpeg;base64," + buf.toString("base64");
  const r = await compare(url(readFileSync(ref)), url(shot));
  const ok = !r.size && r.off < 0.01 && r.mean < 3;
  if (!ok) {
    failed++;
    writeFileSync(`shots/looks-${name}-now.jpg`, shot);
    if (r.diffUrl) writeFileSync(`shots/looks-${name}-diff.png`, Buffer.from(r.diffUrl.split(",")[1], "base64"));
  }
  console.log(`${ok ? "PASS" : "FAIL"}  looks: ${name}${r.size ? " (size changed)" : ` (${(r.off * 100).toFixed(2)}% of pixels differ, mean ${r.mean.toFixed(2)})`}${ok ? "" : ` · see shots/looks-${name}-now.jpg and -diff.png`}`);
}
report(t.errors);
await t.close();
process.exit(failed ? 1 : 0);
