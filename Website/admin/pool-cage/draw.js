/** SVG helpers for the pool cage designer. Plan inches are Y-north; SVG Y grows downward. */

export const WORLD = 4;

export function toWorld(x, y) {
  return { x: x * WORLD, y: -y * WORLD };
}

export function fromWorld(x, y) {
  return { x: x / WORLD, y: -y / WORLD };
}

export function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Screen-constant size expressed in the current viewBox units. */
export function screenUnits(camera, pixels, viewport) {
  const view = Math.max(320, viewport || 1000);
  return (pixels / view) * (camera.w || 1);
}

export function fitCamera(bounds, padInches) {
  const pad = padInches == null ? 56 : padInches;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minY = bounds.minY - pad;
  const maxY = bounds.maxY + pad;
  return {
    x: minX * WORLD,
    y: -maxY * WORLD,
    w: Math.max(WORLD, (maxX - minX) * WORLD),
    h: Math.max(WORLD, (maxY - minY) * WORLD),
  };
}

const CATEGORY_STYLE = {
  perimeter: { width: 3.4, color: "#1c1c1c", dash: "" },
  ring: { width: 2.8, color: "#243038", dash: "" },
  hip: { width: 2.3, color: "#1f4e79", dash: "" },
  ridge: { width: 3.6, color: "#8f0c25", dash: "" },
  rafter: { width: 1.6, color: "#3e4c55", dash: "" },
  internal: { width: 1.35, color: "#5c6b73", dash: "7 5" },
  header: { width: 5, color: "#8f0c25", dash: "" },
  jack: { width: 2.6, color: "#1c1c1c", dash: "" },
};

export function beamStyle(category, client) {
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE.internal;
  if (!client) return style;
  return {
    width: Math.max(1.4, style.width - 0.2),
    color: category === "header" || category === "ridge" ? "#8f0c25" : "#222",
    dash: "",
  };
}

export function categoryLabel(category) {
  const labels = {
    perimeter: "Perimeter",
    ring: "Roof beam",
    hip: "Hip",
    ridge: "Ridge",
    rafter: "Rafter",
    internal: "Roof beam",
    header: "Header",
    jack: "Corner jack",
  };
  return labels[category] || "Beam";
}

/**
 * Architectural dimension: extension lines, a dimension line, ticks, and horizontal text.
 * a/b and the outward vector are in plan inches.
 */
export function dimensionLine(a, b, text, outwardX, outwardY, font) {
  const len = Math.hypot(outwardX, outwardY) || 1;
  const ox = outwardX / len;
  const oy = outwardY / len;
  const gap = 8;
  const offset = 26;
  const start = toWorld(a.x + ox * gap, a.y + oy * gap);
  const end = toWorld(b.x + ox * gap, b.y + oy * gap);
  const dimA = toWorld(a.x + ox * offset, a.y + oy * offset);
  const dimB = toWorld(b.x + ox * offset, b.y + oy * offset);
  const label = toWorld((a.x + b.x) / 2 + ox * (offset + 16), (a.y + b.y) / 2 + oy * (offset + 16));
  const tick = Math.max(6, font * 0.45);
  return (
    '<g class="pcd-dim" pointer-events="none">' +
    '<line x1="' + start.x + '" y1="' + start.y + '" x2="' + dimA.x + '" y2="' + dimA.y + '" />' +
    '<line x1="' + end.x + '" y1="' + end.y + '" x2="' + dimB.x + '" y2="' + dimB.y + '" />' +
    '<line x1="' + dimA.x + '" y1="' + dimA.y + '" x2="' + dimB.x + '" y2="' + dimB.y + '" />' +
    '<line x1="' + (dimA.x - tick) + '" y1="' + (dimA.y + tick) + '" x2="' + (dimA.x + tick) + '" y2="' + (dimA.y - tick) + '" />' +
    '<line x1="' + (dimB.x - tick) + '" y1="' + (dimB.y + tick) + '" x2="' + (dimB.x + tick) + '" y2="' + (dimB.y - tick) + '" />' +
    '<text x="' + label.x + '" y="' + label.y + '" text-anchor="middle" dominant-baseline="middle" font-size="' + font + '">' +
    esc(text) +
    "</text></g>"
  );
}
