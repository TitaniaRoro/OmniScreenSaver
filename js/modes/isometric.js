/**
 * Isometric / voxel drawing helpers.
 *
 * A tiny software renderer for "stacked slab" geometry: every object lives in
 * unit space (x to the right, y down, z toward the viewer) and is projected
 * with a classic 2:1 isometric ramp so it reads as real depth instead of flat
 * pixel art. Boxes are drawn face by face with painter's-order sorting, so a
 * whole campsite — ground strata, logs, tent, pines, stacked letter slabs —
 * can share one coordinate system and one light direction.
 *
 * All functions take a CanvasRenderingContext2D and never mutate global state,
 * which keeps them usable both in fullscreen scenes and in the small gallery
 * preview tiles.
 */

export const ISO_SKEW = 0.5;          // dy per dx on the receding axis (2:1 iso)
export const DEFAULT_LIGHT = -0.9273; // atan2(-1, -3): light from upper-left-front

/** Project a unit-space point into screen pixels around an origin. */
export function projectIso(x, y, z, { ox = 0, oy = 0, sx = 1, sy = 1, skew = ISO_SKEW } = {}) {
  return [ox + (x + z * skew) * sx, oy + (y + z * skew) * sy];
}

function polygon(ctx, points, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/**
 * Draw one axis-aligned box in unit space.
 * `box` = { x, y, z, w, h, d, color, edge, top, side } where x/y/z is the
 * centre and h grows downward (screen convention). Faces are shaded from a
 * single light direction so the stack reads as solid, not skinned.
 */
export function drawIsoBox(ctx, box, view) {
  const { transform } = view;
  const { x, y, z, w, h, d, color, edge = null, top = null, face = null, side = null } = box;
  const hw = w / 2, hh = h / 2, hd = d / 2;

  const shade = colorShades(color, { top, face, side }, view);
  const frontTop = transform(x - hw, y - hh, z + hd);
  const frontTopRight = transform(x + hw, y - hh, z + hd);
  const frontBottomRight = transform(x + hw, y + hh, z + hd);
  const frontBottom = transform(x - hw, y + hh, z + hd);
  const backTop = transform(x - hw, y - hh, z - hd);
  const backTopRight = transform(x + hw, y - hh, z - hd);
  const backBottomRight = transform(x + hw, y + hh, z - hd);
  const backBottom = transform(x - hw, y + hh, z - hd);

  // Right-hand receding face
  polygon(ctx, [frontTopRight, backTopRight, backBottomRight, frontBottomRight], shade.side, edge, 1);
  // Left-facing receding faces are hidden by the ramp direction; the front slab
  // carries the detail, so draw it last.
  polygon(ctx, [frontTop, frontTopRight, frontBottomRight, frontBottom], shade.face, edge, 1);
  // Top cap catches the most light
  polygon(ctx, [backTop, frontTop, frontTopRight, backTopRight], shade.top, edge, 1);
}

const SHADE_CACHE = new Map();

/** Derive consistent top/front/side tints from a base colour. */
export function colorShades(base, overrides = {}, view = {}) {
  const plain = !overrides.top && !overrides.face && !overrides.side;
  if (plain) {
    const cached = SHADE_CACHE.get(base);
    if (cached) return cached;
  }
  const light = view.light ?? DEFAULT_LIGHT;
  const rgb = parseColor(base);
  const tint = (amount) => `rgb(${mix(rgb[0], amount > 0 ? 255 : 0, Math.abs(amount))},${mix(rgb[1], amount > 0 ? 255 : 0, Math.abs(amount))},${mix(rgb[2], amount > 0 ? 255 : 0, Math.abs(amount))})`;
  const result = {
    top: overrides.top || tint(0.26),
    face: overrides.face || tint(0.02),
    side: overrides.side || tint(-0.34),
    light
  };
  if (plain && SHADE_CACHE.size < 128) SHADE_CACHE.set(base, result);
  return result;
}

/** Read `#rgb`, `#rrggbb` or an rgb()/rgba()-style colour into three channels. */
function parseColor(hex) {
  if (typeof hex !== "string") return [200, 200, 220];
  const functional = /^(rgb|rgba|hsl|hsla)\(([^)]*)\)/i.exec(hex.trim());
  if (functional) {
    const numbers = functional[2].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (numbers.length >= 3 && numbers.slice(0, 3).every(Number.isFinite)) {
      return [numbers[0], numbers[1], numbers[2]];
    }
    return [200, 200, 220];
  }
  let value = hex.trim().replace("#", "");
  if (value.length === 3) value = value.split("").map(ch => ch + ch).join("");
  const num = Number.parseInt(value.slice(0, 6), 16);
  if (Number.isNaN(num)) return [200, 200, 220];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

const mix = (channel, target, amount) => Math.round(channel + (target - channel) * amount);

/** Create a projection bound to a screen origin and scale. */
export function createIsoView({ ox = 0, oy = 0, sx = 1, sy = 1, skew = ISO_SKEW, light = DEFAULT_LIGHT } = {}) {
  const transform = (x, y, z) => projectIso(x, y, z, { ox, oy, sx, sy, skew });
  return { ox, oy, sx, sy, skew, light, transform };
}

/** Depth key for painter's sort: farther objects first. */
export const isoDepth = ({ x = 0, y = 0, z = 0 }) => z * 1.0 + x * 0.06 - y * 0.02;

export function sortByDepth(items) {
  return items.slice().sort((a, b) => isoDepth(a) - isoDepth(b));
}

/**
 * A vertical stack of slabs sharing one footprint — the building block for
 * terrain strata, sign posts, log piles and extruded letterforms.
 */
export function drawIsoStack(ctx, { x, z, w, d, layers, baseY = 0, layerH = 3, colors, edge = null }, view) {
  for (let index = 0; index < layers; index++) {
    const y = baseY + index * layerH + layerH / 2;
    drawIsoBox(ctx, {
      x, y, z, w, h: layerH, d,
      color: Array.isArray(colors) ? colors[index % colors.length] : colors,
      edge
    }, view);
  }
}

/**
 * A stepped pyramid of slabs (used for rocks, ember mounds, tree crowns).
 */
export function drawIsoPyramid(ctx, { x, y, z, w, d, steps, stepH = 4, shrink = 0.7, color, edge = null }, view) {
  let currentW = w;
  let currentD = d;
  for (let index = 0; index < steps; index++) {
    drawIsoBox(ctx, {
      x, y: y - index * stepH - stepH / 2, z,
      w: currentW, h: stepH, d: currentD,
      color, edge
    }, view);
    currentW *= shrink;
    currentD *= shrink;
  }
}

/**
 * A pine crown built from stacked, rotated square slabs — a low-poly tree that
 * still shares the scene's light direction.
 */
export function drawIsoPine(ctx, { x, y, z, width = 22, height = 40, color = "#1d4038", trunk = "#5a3f30", edge = null, sway = 0 }, view) {
  const steps = 4;
  const stepH = height / (steps + 1);
  drawIsoBox(ctx, { x, y: y - stepH / 2, z, w: 4, h: stepH, d: 4, color: trunk, edge }, view);
  let currentW = width;
  for (let index = 0; index < steps; index++) {
    const offset = sway * (index + 1) * 0.6;
    drawIsoBox(ctx, {
      x: x + offset, y: y - stepH * (index + 1) - stepH / 2, z,
      w: currentW, h: stepH * 0.9, d: currentW * 0.9,
      color, edge
    }, view);
    currentW *= 0.74;
  }
}

/**
 * Extrude a text string into solid slabs. The glyph mask is sampled once per
 * string size, then each marching column becomes a shallow box, so the name
 * has a real body, a lit top cap and a cast shadow instead of flat ink.
 *
 * Returns { cells, advance } so callers can animate individual blocks.
 */
/**
 * Sample a string into a grid of slab cells. The glyph mask is read from an
 * offscreen canvas; when pixel data is unavailable (a mocked or restricted
 * context) a coarse block spelling is produced instead, so callers always get
 * something solid to extrude.
 */
export function measureTextCells(ctx, text, { font, cell = 6, gap = 1, maxWidth = Infinity } = {}) {
  let mask = null;
  try {
    mask = glyphMask(ctx, text, font, cell);
  } catch {
    mask = null;
  }
  if (!mask) return syntheticCells(text, cell, gap);
  const cells = mask.cells.map(item => ({
    ...item,
    cx: item.cx * (maxWidth < mask.width ? maxWidth / mask.width : 1),
    cy: item.cy * (maxWidth < mask.width ? maxWidth / mask.width : 1)
  }));
  return { cells, cell, step: cell + gap, width: mask.width * (maxWidth < mask.width ? maxWidth / mask.width : 1), height: mask.height };
}

/** Rasterise `text` and collapse the ink into a coarse grid of cells. */
function glyphMask(ctx, text, font, cell) {
  if (typeof document === "undefined" || !document.createElement) return null;
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext && scratch.getContext("2d");
  if (!sctx) return null;
  ctx.font = font;
  const measured = ctx.measureText(text);
  const sizeMatch = /([\d.]+)px/.exec(font);
  const fontSize = Number(sizeMatch?.[1] || 24);
  const rawWidth = Number(measured?.width);
  if (!Number.isFinite(rawWidth) || rawWidth <= 0) return null;
  const width = Math.max(8, Math.min(2048, Math.ceil(rawWidth) + cell * 2));
  const height = Math.max(cell * 2, Math.ceil(fontSize * 1.5));
  scratch.width = width;
  scratch.height = height;
  sctx.clearRect(0, 0, width, height);
  sctx.font = font;
  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.fillStyle = "#ffffff";
  sctx.fillText(text, width / 2, height / 2);
  if (!sctx.getImageData) return null;
  const data = sctx.getImageData(0, 0, width, height).data;
  if (!data || !data.length) return null;

  const step = cell + 1;
  const cells = [];
  for (let gy = 0; gy + step <= height; gy += step) {
    for (let gx = 0; gx + step <= width; gx += step) {
      let hits = 0;
      for (let sy = 0; sy < step; sy++) {
        for (let sx = 0; sx < step; sx++) {
          if (data[((gy + sy) * width + (gx + sx)) * 4 + 3] > 110) hits++;
        }
      }
      if (hits >= step * step * 0.22) cells.push({ cx: gx + step / 2 - width / 2, cy: gy + step / 2 - height / 2, mass: hits / (step * step) });
    }
  }
  if (!cells.length) return null;
  return { cells, width, height };
}

/** Block spelling used when real glyph sampling is impossible. */
function syntheticCells(text, cell, gap = 1) {
  const clusters = [...String(text || "").trim()].slice(0, 16);
  const step = cell + gap;
  const rows = 5;
  const colsPerGlyph = 3;
  const cells = [];
  let penX = 0;
  for (const cluster of clusters) {
    if (cluster === " ") { penX += colsPerGlyph + 1; continue; }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < colsPerGlyph; col++) {
        const hollow = row > 0 && row < rows - 1 && col > 0 && col < colsPerGlyph - 1;
        if (hollow && (row + col + penX) % 3 === 0) continue;
        cells.push({ cx: (penX + col) * step, cy: (row - (rows - 1) / 2) * step, mass: hollow ? 0.5 : 1 });
      }
    }
    penX += colsPerGlyph + 1;
  }
  const half = (penX * step) / 2;
  return { cells: cells.map(item => ({ ...item, cx: item.cx - half })), cell, step, width: penX * step, height: rows * step };
}
export function drawIsoName(ctx, cells, { x, y, z = 0, depth = 8, color = "#ffcf7a", edge = null, lift = (index, time) => 0, alpha = () => 1 }, view) {
  const ordered = cells.slice().sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
  for (let index = 0; index < ordered.length; index++) {
    const item = ordered[index];
    const a = alpha(index, item);
    if (a <= 0.02) continue;
    ctx.globalAlpha = a;
    const rise = lift(index, item);
    drawIsoBox(ctx, {
      x: x + item.cx, y: y + item.cy - rise, z,
      w: cells.cell * 0.98, h: cells.cell * 0.98, d: depth,
      color, edge
    }, view);
  }
  ctx.globalAlpha = 1;
}
