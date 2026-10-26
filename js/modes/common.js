import { splitGraphemes } from "../text.js";
import { TYPE_STYLES, DEFAULT_TYPE_STYLE, typeStyle, applyCase, nameSize as canonicalNameSize } from "./type-styles.js";
import { flicker, noise2 } from "../motion.js";

export const TAU = Math.PI * 2;
export { TYPE_STYLES, DEFAULT_TYPE_STYLE, typeStyle };

/**
 * Canonical name size for a viewport and type style (see type-styles.js).
 * Re-exported here so every mode pulls lettering dimensions through the same
 * shared helper instead of hardcoding per-mode fractions.
 */
export function nameSize(style, width, height, options = {}) {
  return canonicalNameSize(style, width, height, options);
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const random = (min = 0, max = 1) => min + Math.random() * (max - min);
export const pick = items => items[Math.floor(Math.random() * items.length)];
export const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = t => 1 - (1 - t) ** 3;

export function setup2D(canvas, background = "#050713") {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  let width = 1;
  let height = 1;
  let ratio = 1;
  function resize(nextWidth = innerWidth, nextHeight = innerHeight, pixelRatio = Math.min(2, devicePixelRatio || 1)) {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    ratio = Math.min(2, Math.max(1, pixelRatio || 1));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  return { ctx, get width() { return width; }, get height() { return height; }, get ratio() { return ratio; }, resize };
}

export function fontSizeToFit(ctx, text, maxWidth, maxHeight, base = 160, min = 20, family = TYPE_STYLES.starfield.family, weight = 700) {
  if (!text) return min;
  let size = base;
  ctx.font = `${weight} ${size}px ${family}`;
  const measured = ctx.measureText(text).width;
  const scale = Math.min(1, maxWidth / Math.max(1, measured), maxHeight / size);
  return Math.max(min, size * scale);
}

/* ------------------------------------------------------------------ *
 * Styled name rendering
 * ------------------------------------------------------------------ */

/** Measure every grapheme cluster of a name and the total inked width. */
export function measureName(ctx, text, style, size, language = "en") {
  ctx.font = `${style.weight} ${size}px ${style.family}`;
  const clusters = splitGraphemes(text, language).map(cluster => applyCase(cluster, style.caseTransform));
  const widths = clusters.map(cluster => ctx.measureText(cluster).width);
  const tracking = (style.tracking || 0) * size;
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, clusters.length - 1);
  return { clusters, widths, total, tracking };
}

/**
 * Draw a name in the type style of the current world.
 *
 * `perLetter` lets a mode animate each cluster on its own — rise from coals,
 * type itself out, wobble in the heat, scatter into stars. It receives
 * { index, cluster, count, width, progress, time } and returns
 * { dx, dy, rotate, scaleX, scaleY, alpha, color }.
 */
export function drawStyledName(ctx, text, x, y, options = {}) {
  if (!text) return { size: 0, width: 0, height: 0, count: 0 };
  const {
    style = DEFAULT_TYPE_STYLE,
    size: requestedSize = 120,
    maxWidth = 800,
    maxHeight = 160,
    minSize = 14,
    align = "center",
    baseline = "middle",
    alpha = 1,
    language = "en",
    time = 0,
    progress = 1,
    paint = null,
    stroke = null,
    strokeWidth = 1.4,
    glow = 1,
    perLetter = null,
    effects = style.effects || [],
    shadowColor = null,
    shadowBlur = null,
    composite = null,
    rotate = 0,
    slant = style.slant || 0
  } = options;

  let size = Math.max(minSize, requestedSize);
  let metrics = measureName(ctx, text, style, size, language);
  if (metrics.total > maxWidth && metrics.total > 0) size = Math.max(minSize, size * (maxWidth / metrics.total));
  if (size > maxHeight) size = Math.max(minSize, maxHeight);
  metrics = measureName(ctx, text, style, size, language);

  const palette = style.palette || DEFAULT_TYPE_STYLE.palette;
  const blur = shadowBlur ?? Math.max(6, size * 0.24) * glow;
  const glowColor = shadowColor ?? palette.glow;

  ctx.save();
  if (composite) ctx.globalCompositeOperation = composite;
  ctx.globalAlpha *= alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = baseline;
  ctx.font = `${style.weight} ${size}px ${style.family}`;

  const startX = align === "left" ? x : align === "right" ? x - metrics.total : x - metrics.total / 2;
  let cursor = startX;
  const results = [];

  for (let index = 0; index < metrics.clusters.length; index++) {
    const cluster = metrics.clusters[index];
    const width = metrics.widths[index];
    const centerX = cursor + width / 2;
    cursor += width + metrics.tracking;

    const modulation = perLetter
      ? perLetter({ index, cluster, count: metrics.clusters.length, width, x: centerX, y, progress, time, size }) || {}
      : {};
    if (modulation.skip) continue;
    const letterAlpha = modulation.alpha ?? 1;
    if (letterAlpha <= 0.002) continue;

    ctx.save();
    ctx.globalAlpha *= letterAlpha;
    ctx.translate(centerX + (modulation.dx || 0), y + (modulation.dy || 0));
    if (rotate) ctx.rotate(rotate);
    if (modulation.rotate) ctx.rotate(modulation.rotate);
    if (modulation.scaleY || modulation.scaleX) ctx.scale(modulation.scaleX ?? 1, modulation.scaleY ?? 1);
    if (slant) ctx.transform(1, 0, slant, 1, 0, 0);

    const paintOptions = { x: centerX, y, width, size, index, count: metrics.clusters.length, progress, time };
    const painted = typeof paint === "function" ? paint(ctx, paintOptions) : paint;
    const fill = modulation.color || painted || defaultPaint(ctx, palette, size, effects);
    if (effects.includes("glow")) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = blur * (modulation.glow ?? 1);
    } else if (shadowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = blur;
    }

    if (effects.includes("chromatic")) {
      const offset = Math.max(1, size * 0.035);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = "#ff3ea5";
      ctx.fillText(cluster, -offset, 0);
      ctx.fillStyle = "#3ef0ff";
      ctx.fillText(cluster, offset, 0);
      ctx.restore();
    }

    if (effects.includes("glitch")) {
      const slice = noise2(index * 3.1, time * 2.2) > 0.55 ? noise2(index, time * 9) * size * 0.09 : 0;
      ctx.save();
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = palette.edge;
      ctx.fillText(cluster, slice, 0);
      ctx.restore();
    }

    ctx.fillStyle = fill;
    if (stroke || effects.includes("outlineNeon") || effects.includes("outlineThin")) {
      const strokeResult = typeof stroke === "function" ? stroke(ctx, paintOptions) : stroke;
      const strokePaint = strokeResult === true || strokeResult == null ? palette.edge : strokeResult;
      ctx.lineWidth = effects.includes("outlineNeon") ? Math.max(1.4, size * 0.035) : strokeWidth;
      ctx.strokeStyle = strokePaint;
      ctx.lineJoin = "round";
      ctx.strokeText(cluster, 0, 0);
    }
    ctx.fillText(cluster, 0, 0);
    ctx.restore();
    results.push({ index, cluster, x: centerX, width });
  }

  ctx.restore();
  return { size, width: metrics.total, height: size, count: metrics.clusters.length, letters: results };
}

function defaultPaint(ctx, palette, size, effects) {
  if (effects.includes("chrome")) {
    const gradient = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
    gradient.addColorStop(0, palette.core);
    gradient.addColorStop(0.34, palette.edge);
    gradient.addColorStop(0.52, palette.core);
    gradient.addColorStop(0.72, palette.accent || palette.edge);
    gradient.addColorStop(1, palette.edge);
    return gradient;
  }
  return palette.core;
}

/** Firelight-aware alpha wobble for the `flicker`/`ember` effects. */
export function fireFlicker(time, seed = 0, { amount = 0.28, speed = 3.4 } = {}) {
  return 1 - amount + flicker(time, seed, { speed }) * amount * 2;
}

/* ------------------------------------------------------------------ *
 * Scene helpers
 * ------------------------------------------------------------------ */

export function roundedRect(ctx, x, y, width, height, radius = 8) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, width, height, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export function drawGlowDot(ctx, x, y, radius, color, blur = 12, alpha = 1) {
  if (alpha <= 0.004 || radius <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * A dot with real volume: instead of a shadow-blurred flat disc, the light is
 * built from a radial gradient whose brightest point sits slightly off centre
 * — toward the key light, away from it falling off into translucency. Add a
 * tiny specular pin and the eye reads it as a sphere catching light, not a
 * sticker on the screen. Falls back to `drawGlowDot` for hairline radii where
 * a gradient would cost more than it buys.
 */
export function drawSphereDot(ctx, x, y, radius, color, options = {}) {
  const {
    alpha = 1,
    lightX = -0.34,
    lightY = -0.4,
    core = "#ffffff",
    rim = null,
    blur = 0,
    specular = 0.55
  } = options;
  if (alpha <= 0.004 || radius <= 0) return;
  if (radius < 1.6 && blur <= 0) {
    drawGlowDot(ctx, x, y, radius, color, 0, alpha);
    return;
  }
  const outer = Math.max(radius * 1.9, radius + blur);
  const lx = x + radius * lightX;
  const ly = y + radius * lightY;
  const gradient = ctx.createRadialGradient(lx, ly, radius * 0.06, x, y, outer);
  // Colours may arrive as hex or any CSS colour string; the alpha ramp below
  // only understands hex, so anything else keeps its own opacity.
  const tint = value => (value.startsWith("#") || value.startsWith("rgb"))
    ? rgba(value, alpha)
    : value;
  const rgbaSafe = (value, a) => (value.startsWith("#") || value.startsWith("rgb") ? rgba(value, a) : value);
  gradient.addColorStop(0, tint(core));
  gradient.addColorStop(0.32, tint(color));
  gradient.addColorStop(0.72, rgbaSafe(rim ?? color, alpha * 0.34));
  gradient.addColorStop(1, rgbaSafe(rim ?? color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, TAU);
  ctx.fill();
  // Specular pin — the cue that sells "round and lit".
  if (specular > 0.02 && radius >= 1.2) {
    ctx.globalAlpha = alpha * specular;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(lx, ly, Math.max(0.35, radius * 0.28), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Depth-of-field falloff: things farther away are dimmer, softer and smaller.
 * Returns { alpha, scale, blur } for a normalised depth (0 = near, 1 = far),
 * which every layered scene uses so the background actually recedes instead
 * of sitting on the same plane as the foreground.
 */
export function depthFalloff(depth, { minAlpha = 0.18, maxAlpha = 1, minScale = 0.35, maxScale = 1 } = {}) {
  const t = clamp(depth, 0, 1);
  const eased = t * t;
  return {
    alpha: lerp(maxAlpha, minAlpha, eased),
    scale: lerp(maxScale, minScale, eased),
    blur: eased * 6
  };
}

export function createStars(count, width, height, speed = 1) {
  return Array.from({ length: count }, () => ({
    x: random(-width / 2, width / 2),
    y: random(-height / 2, height / 2),
    z: random(0.08, 1),
    size: random(0.4, 1.7),
    speed: random(0.1, 1) * speed,
    twinkle: random(0, TAU)
  }));
}

export function drawStars(ctx, stars, width, height, time, centerX = width / 2, centerY = height / 2, warp = 0) {
  for (const star of stars) {
    star.z -= star.speed * (0.002 + warp * 0.018);
    if (star.z <= 0.02) {
      star.x = random(-width / 2, width / 2);
      star.y = random(-height / 2, height / 2);
      star.z = 1;
      star.speed = random(0.1, 1);
    }
    const perspective = 1 / star.z;
    const x = centerX + star.x * perspective;
    const y = centerY + star.y * perspective;
    if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue;
    const radius = Math.max(0.4, star.size * perspective * 0.65);
    const alpha = clamp(0.25 + Math.sin(time * 2 + star.twinkle) * 0.2 + warp * 0.45, 0.1, 0.95);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = star.twinkle % 3 > 1.5 ? "#c9f8ff" : "#ded3ff";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    if (warp > 0.1) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = radius * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(centerX + (x - centerX) * (1 + warp * 0.16), centerY + (y - centerY) * (1 + warp * 0.16));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * A night sky that actually twinkles: each star has its own slow rhythm and
 * a touch of scintillation instead of a single global sine. Depth is what
 * keeps it from looking like paint on a ceiling — faint dust sits far away
 * and barely moves, while the near handful are bright discs with a soft
 * atmospheric halo and a cross-flare, exactly how a lens renders them.
 */
export function drawTwinklingStars(ctx, stars, time, { color = "#e8ecff", base = 0.28, halos = true } = {}) {
  for (const star of stars) {
    const slow = 0.5 + 0.5 * Math.sin(time * star.speed + star.phase);
    const scintil = noise2(star.x * 0.01, time * 0.7 + star.phase) * 0.5 + 0.5;
    const alpha = clamp(base + slow * 0.45 + scintil * 0.3, 0.05, 1);
    const tint = star.warm ? "#ffe6c8" : color;
    // Depth cue baked into the size: big stars read as near, tiny ones as far.
    const nearness = clamp((star.r - 0.4) / 1.3, 0, 1);
    if (halos && nearness > 0.62 && alpha > 0.45) {
      const outer = star.r * (3.4 + nearness * 3.2);
      const gradient = ctx.createRadialGradient(star.x, star.y, 0.2, star.x, star.y, outer);
      gradient.addColorStop(0, rgba(tint, alpha * 0.5));
      gradient.addColorStop(0.4, rgba(tint, alpha * 0.12));
      gradient.addColorStop(1, rgba(tint, 0));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(star.x, star.y, outer, 0, TAU);
      ctx.fill();
      // Cross-flare on the brightest few — a lens artefact, not a dot.
      if (nearness > 0.85) {
        const arm = outer * (0.9 + scintil * 0.5);
        ctx.strokeStyle = rgba(tint, alpha * 0.16);
        ctx.lineWidth = Math.max(0.4, star.r * 0.22);
        ctx.beginPath();
        ctx.moveTo(star.x - arm, star.y);
        ctx.lineTo(star.x + arm, star.y);
        ctx.moveTo(star.x, star.y - arm * 0.8);
        ctx.lineTo(star.x, star.y + arm * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = tint;
    const r = star.r * (0.75 + alpha * 0.5);
    ctx.beginPath();
    ctx.arc(star.x, star.y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function makeStarField(count, width, height, { topRatio = 0.62, seed = 1 } = {}) {
  const stars = [];
  for (let index = 0; index < count; index++) {
    const n1 = noise2(index * 0.37, seed, seed);
    const n2 = noise2(index * 0.11 + 4.2, seed * 2, seed);
    stars.push({
      x: ((n1 * 0.5 + 0.5) * width * 1.02) % width,
      y: (n2 * 0.5 + 0.5) * height * topRatio,
      r: 0.4 + Math.abs(noise2(index * 1.7, seed * 3, seed)) * 1.3,
      phase: Math.abs(noise2(index * 0.9, seed * 5, seed)) * TAU,
      speed: 0.25 + Math.abs(noise2(index * 2.3, seed * 7, seed)) * 0.9,
      warm: noise2(index * 3.1, seed * 11, seed) > 0.55
    });
  }
  return stars;
}

export function drawGroundGrid(ctx, width, height, horizon, time, color = "rgba(88,239,218,.62)") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  for (let index = 0; index < 13; index++) {
    const x = (index / 12) * width;
    ctx.beginPath();
    ctx.moveTo(width / 2 + (x - width / 2) * 0.025, horizon);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  const phase = (time * 0.7) % 1;
  for (let index = 0; index < 19; index++) {
    const p = ((index / 18 + phase) % 1) ** 2;
    const y = horizon + p * (height - horizon);
    ctx.globalAlpha = 0.16 + p * 0.72;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A layered conifer that bends from the base up, so wind travels through the
 * tree instead of snapping the whole silhouette sideways.
 */
export function drawPine(ctx, x, groundY, height, color = "#071c23", sway = 0, { layers = 4, seed = 0 } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  const trunk = Math.max(1.5, height * 0.035);
  ctx.beginPath();
  ctx.moveTo(x - trunk, groundY);
  ctx.quadraticCurveTo(x - trunk * 0.4 + sway * 0.2, groundY - height * 0.2, x + sway * 0.5, groundY - height * 0.16);
  ctx.lineTo(x + trunk + sway * 0.5, groundY - height * 0.16);
  ctx.quadraticCurveTo(x + trunk * 0.6 + sway * 0.2, groundY - height * 0.2, x + trunk * 1.6, groundY);
  ctx.closePath();
  ctx.fill();
  for (let layer = 0; layer < layers; layer++) {
    const t = layer / layers;
    const baseY = groundY - height * (0.12 + t * 0.62);
    const tipY = baseY - height * (0.34 - t * 0.05);
    const half = height * (0.19 - t * 0.11) * (0.9 + noise2(seed + layer, seed) * 0.25);
    const bend = sway * (0.25 + t * 0.85);
    ctx.beginPath();
    ctx.moveTo(x - half + bend * 0.3, baseY);
    ctx.quadraticCurveTo(x - half * 0.55 + bend * 0.8, (baseY + tipY) / 2, x + bend, tipY);
    ctx.quadraticCurveTo(x + half * 0.55 + bend * 0.8, (baseY + tipY) / 2, x + half + bend * 0.3, baseY);
    ctx.quadraticCurveTo(x + bend * 0.6, baseY + height * 0.02, x - half + bend * 0.3, baseY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Soft radial light pool — firelight on the ground, moonlight on water. */
export function drawLightPool(ctx, x, y, radius, color, alpha = 0.5) {
  const gradient = ctx.createRadialGradient(x, y, 1, x, y, Math.max(1, radius));
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.45, rgba(color, alpha * 0.28));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.82, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function rgba(hex, alpha = 1) {
  if (hex.startsWith("rgb")) return hex;
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map(part => part + part).join("") : value;
  const number = Number.parseInt(full, 16);
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
}

/** Vertical gradient helper used by nearly every sky. */
export function verticalGradient(ctx, y0, y1, stops) {
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

/** Rounded, soft-edged silhouette from a list of [x, y] ridge points. */
export function fillRidge(ctx, points, width, height, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Vignette to keep the eye in the middle of a big, dark scene. */
export function drawVignette(ctx, width, height, strength = 0.4) {
  const gradient = ctx.createRadialGradient(width / 2, height * 0.52, Math.min(width, height) * 0.22, width / 2, height * 0.52, Math.max(width, height) * 0.78);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** Film grain / heat speckle, drawn sparingly. */
export function drawGrain(ctx, x, y, width, height, count, alpha = 0.05, color = "#ffffff") {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let index = 0; index < count; index++) {
    ctx.fillRect(x + Math.random() * width, y + Math.random() * height, 1, 1);
  }
  ctx.restore();
}

/** Horizontal scanlines over a box (CRT screens, chrome reflections). */
export function drawScanlines(ctx, x, y, width, height, { spacing = 3, alpha = 0.16, color = "#05070f" } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let offset = 0; offset < height; offset += spacing) ctx.fillRect(x, y + offset, width, 1);
  ctx.restore();
}
