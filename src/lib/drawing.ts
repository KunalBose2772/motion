// ============================================================
// Canvas drawing utilities for bounding box overlays
// Designed for light-background video overlays
// ============================================================

import type { Detection, LiveTrack } from "@/types";

// Class → hue in HSL (will be rendered with opacity)
const CLASS_COLORS: Record<string, { stroke: string; fill: string; text: string }> = {
  bed:     { stroke: "#059669", fill: "rgba(5,150,105,0.12)",  text: "#fff" },
  chair:   { stroke: "#2563eb", fill: "rgba(37,99,235,0.12)",  text: "#fff" },
  table:   { stroke: "#d97706", fill: "rgba(217,119,6,0.12)",  text: "#fff" },
  sofa:    { stroke: "#7c3aed", fill: "rgba(124,58,237,0.12)", text: "#fff" },
  lamp:    { stroke: "#ca8a04", fill: "rgba(202,138,4,0.12)",  text: "#fff" },
  monitor: { stroke: "#0891b2", fill: "rgba(8,145,178,0.12)",  text: "#fff" },
  cabinet: { stroke: "#ea580c", fill: "rgba(234,88,12,0.12)",  text: "#fff" },
  person:  { stroke: "#dc2626", fill: "rgba(220,38,38,0.12)",  text: "#fff" },
};
const DEFAULT_COLOR = { stroke: "#4f46e5", fill: "rgba(79,70,229,0.12)", text: "#fff" };

function getColor(cls: string) {
  return CLASS_COLORS[cls] ?? DEFAULT_COLOR;
}

export function clearCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
}

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: (Detection | LiveTrack)[],
  cw: number,
  ch: number,
  vw: number,
  vh: number
): void {
  clearCanvas(ctx, cw, ch);

  const sx = cw / (vw || cw);
  const sy = ch / (vh || ch);

  for (const det of detections) {
    const [x, y, w, h] = det.box;
    const rx = x * sx;
    const ry = y * sy;
    const rw = w * sx;
    const rh = h * sy;
    const c  = getColor(det.class);

    // Tinted fill
    ctx.fillStyle = c.fill;
    ctx.fillRect(rx, ry, rw, rh);

    // Crisp border
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth   = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    // Corner accents (4 corners)
    const cs = Math.min(10, rw * 0.15, rh * 0.15);
    ctx.lineWidth = 3;
    const corners: [number, number, number, number][] = [
      [rx,      ry,      cs,  cs ],   // TL
      [rx + rw, ry,     -cs,  cs ],   // TR
      [rx,      ry + rh,  cs, -cs],   // BL
      [rx + rw, ry + rh, -cs, -cs],   // BR
    ];
    for (const [cx2, cy2, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx2 + dx, cy2);
      ctx.lineTo(cx2, cy2);
      ctx.lineTo(cx2, cy2 + dy);
      ctx.stroke();
    }

    // Label
    const conf = det.confidence ? ` ${Math.round(det.confidence * 100)}%` : "";
    const label = `${det.class} #${det.id}${conf}`;
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    const tm  = ctx.measureText(label);
    const lw  = tm.width + 10;
    const lh  = 20;
    const lx  = rx;
    const ly  = ry > lh + 2 ? ry - lh - 2 : ry + 2;

    ctx.fillStyle = c.stroke;
    // Pill shape
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, 4);
    ctx.fill();

    ctx.fillStyle    = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx + 5, ly + lh / 2);
  }
}
