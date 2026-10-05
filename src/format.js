// Numbers for people: speeds, fractions of light speed, and times.

// Speeds for people: km/h, with a decimal while they're small.
export function kmh(v) {
  const k = v * 3.6;
  if (k >= 1e9) return `${Number((k / 1e9).toFixed(2))} billion km/h`;
  if (k >= 1e6) return `${Number((k / 1e6).toFixed(1))} million km/h`;
  if (k >= 100) return `${Math.round(k).toLocaleString("en-US")} km/h`;
  return `${Number(k.toFixed(1))} km/h`;
}

// 0.533, 0.990, 0.99996…: enough digits to show every nine.
export function formatBeta(b, omb) {
  if (b < 0.99) return b.toFixed(3);
  const nines = Math.floor(-Math.log10(Math.max(omb, 1e-15)));
  const k = Math.min(15, nines + 2);
  return (Math.floor((1 - omb) * 10 ** k) / 10 ** k).toFixed(k);
}

// Seconds, until they get long: then minutes, hours, days and years.
export function formatTime(s, unit = "") {
  if (s < 10000) return s.toFixed(1) + unit;
  const units = [[60, "min"], [3600, "h"], [86400, "days"], [31557600, "years"]];
  let [d, name] = units[0];
  for (const u of units) if (s >= u[0] * 2) [d, name] = u;
  const v = s / d;
  return `${v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} ${name}`;
}

// For sentences: "32 seconds", "12 minutes", "1 hour 43 minutes", "3.2 days".
export function humanTime(s) {
  const n = (v, unit) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (s < 90) return n(Math.round(s), "second");
  if (s < 5400) return n(Math.round(s / 60), "minute");
  if (s < 172800) { const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60); return m ? `${n(h, "hour")} ${n(m, "minute")}` : n(h, "hour"); }
  if (s < 3 * 31557600) return `${(s / 86400).toFixed(s < 864000 ? 1 : 0)} days`;
  return `${(s / 31557600).toLocaleString("en-US", { maximumFractionDigits: 1 })} years`;
}
