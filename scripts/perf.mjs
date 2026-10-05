// Frame rate and draw calls per scene: node scripts/perf.mjs
import { open, report } from "./lib.mjs";

const t = await open({ size: [1440, 900] });
for (const [i, id] of ["pier", "highway", "starship", "city", "railway"].entries()) {
  await t.q((id) => { pacetime.load(id); pacetime.closeMenu(); }, id);
  await t.wait(i === 0 ? 7000 : 3500); // the first place also waits for shaders to compile
  const r = await t.q(() => ({ fps: pacetime.fps.toFixed(0), calls: pacetime.drawCalls }));
  console.log(id.padEnd(8), `${r.fps} fps`, `${r.calls} draw calls`);
}
report(t.errors);
await t.close();
