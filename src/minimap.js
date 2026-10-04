// A small top-down map of where you really are (not where the bent light
// makes things look). North is up. It fades in while you move.
const SIZE = 150; // CSS pixels
const RANGE = 70; // metres from the centre to the edge

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = canvas.height = SIZE * dpr;
    this.ctx.scale(dpr, dpr);
    this.trail = [];
    this.idle = 99;
  }

  reset() {
    this.trail = [];
    this.idle = 99;
  }

  update(player, instance, dt) {
    const moving = player.u.length() > 0.2 || !!player.vehicle;
    this.idle = moving ? 0 : this.idle + dt;
    const show = this.idle < 2.5;
    this.canvas.classList.toggle("show", show);
    const p = player.pos;
    const last = this.trail.at(-1);
    if (!last || Math.hypot(p.x - last[0], p.z - last[1]) > 0.8) {
      this.trail.push([p.x, p.z]);
      if (this.trail.length > 160) this.trail.shift();
    }
    if (show) this.draw(player, instance);
  }

  draw(player, instance) {
    const g = this.ctx, k = SIZE / 2 / RANGE, cx = player.pos.x, cz = player.pos.z;
    const X = (x) => SIZE / 2 + (x - cx) * k, Y = (z) => SIZE / 2 + (z - cz) * k;
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(8, 12, 24, 0.72)";
    g.fillRect(0, 0, SIZE, SIZE);
    // Ground you can walk on.
    g.fillStyle = "rgba(233, 210, 170, 0.32)";
    for (const [x0, z0, x1, z1] of instance.walk ?? []) g.fillRect(X(x0), Y(z0), (x1 - x0) * k, (z1 - z0) * k);
    const map = instance.map ?? {};
    g.lineWidth = 1.5;
    for (const { pts, color = "rgba(126, 232, 220, 0.8)", closed = false } of map.paths ?? []) {
      g.strokeStyle = color;
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
      if (closed) g.closePath();
      g.stroke();
    }
    for (const { x, z, r, color = "rgba(255, 190, 120, 0.85)", fill = false } of map.rings ?? []) {
      g.beginPath();
      g.arc(X(x), Y(z), Math.max(2, r * k), 0, Math.PI * 2);
      if (fill) { g.fillStyle = color; g.fill(); } else { g.strokeStyle = color; g.stroke(); }
    }
    // Things you can bump into.
    g.fillStyle = "rgba(200, 205, 220, 0.55)";
    for (const c of instance.colliders ?? []) {
      g.beginPath();
      g.arc(X(c.x), Y(c.z), Math.max(1.2, c.r * k), 0, Math.PI * 2);
      g.fill();
    }
    // Where you've been.
    g.strokeStyle = "rgba(255, 179, 107, 0.45)";
    g.lineWidth = 2;
    g.beginPath();
    this.trail.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.lineTo(X(cx), Y(cz));
    g.stroke();
    // You: an arrow pointing the way you face.
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(-player.yaw);
    g.fillStyle = "#ffb36b";
    g.strokeStyle = "#1a1420";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5.5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5.5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.strokeStyle = "rgba(159, 180, 255, 0.35)";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(233, 236, 245, 0.7)";
    g.font = "600 10px 'JetBrains Mono', monospace";
    g.textAlign = "center";
    g.fillText("N", SIZE / 2, 12);
  }
}
