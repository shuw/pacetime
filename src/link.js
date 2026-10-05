// The address bar mirrors where you are, e.g. #railway@-30.0,17.0,0.00,0.00&c=8&off=doppler,
// so a refresh or a shared link drops you back in the same spot.

// The link for a place, your pose, and any Lab settings that differ from the place's own.
export function linkFor({ id, player, c, c0, effects }) {
  const p = player;
  let h = `#${id}@${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)},${p.yaw.toFixed(2)},${p.pitch.toFixed(2)}`;
  if (Math.abs(c - c0) > 1e-3) h += `&c=${+c.toFixed(2)}`;
  const off = Object.keys(effects).filter((k) => k !== "ghosts" && !effects[k]);
  if (off.length) h += `&off=${off.join(",")}`;
  if (effects.ghosts) h += "&xray=1";
  return h;
}

// What a link asks for, or null if it isn't one of ours (a mangled link included).
export function readLink(hash, ids) {
  let text;
  try { text = decodeURIComponent(hash.slice(1)); } catch { return null; }
  const [head, ...rest] = text.split("&");
  const [id, pose] = head.split("@");
  if (!ids.includes(id)) return null;
  const opts = Object.fromEntries(rest.map((kv) => kv.split("=")));
  return { id, pose: pose?.split(",").map(Number), c: opts.c ? Number(opts.c) : null, off: opts.off ? opts.off.split(",") : [], xray: opts.xray === "1" };
}

// Keeps the address bar up to date, twice a second at most.
export function linkKeeper() {
  let clock = 0;
  return (dt, make) => {
    clock += dt;
    if (clock < 0.5) return;
    clock = 0;
    const h = make();
    if (h !== location.hash) {
      try { history.replaceState(null, "", h); } catch { /* embedded pages may not allow it */ }
    }
  };
}
