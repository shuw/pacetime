// Dev server: rebuilds the page whenever a source file changes, and you refresh
// to see it. (Bun 1.2's built-in hot reload breaks on stylesheet changes.)
import { watch } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
let files = new Map<string, Blob>();
let dirty = true;
let building: Promise<void> | null = null;

async function build() {
  const result = await Bun.build({ entrypoints: [join(root, "index.html")], root, sourcemap: "inline" });
  if (!result.success) {
    console.error(result.logs.join("\n"));
    return;
  }
  files = new Map(result.outputs.map((o) => [o.path.replace(/^\.\//, "/"), o]));
  dirty = false;
}

for (const path of ["src", "index.html"]) {
  watch(join(root, path), { recursive: true }, () => (dirty = true));
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 5180),
  async fetch(req) {
    if (dirty) await (building ??= build().finally(() => (building = null)));
    const path = new URL(req.url).pathname;
    const file = files.get(path === "/" ? "/index.html" : path);
    return file ? new Response(file, { headers: { "Cache-Control": "no-store" } }) : new Response("Not found", { status: 404 });
  },
});
console.log(`Pacetime on ${server.url}`);
