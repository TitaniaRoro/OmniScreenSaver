import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { noise2, fbm3 } from "../motion.js";

/**
 * Topology Mesh (after vanta.js `topology`).
 *
 * A field of points lives on a slowly breathing height map. Contour lines are
 * traced where the field crosses evenly spaced levels, so the screen reads as a
 * living topographic map — and the mesh bulges around the name: letterform
 * nodes sit pinned on their strokes, lifting the terrain under them until the
 * contours crowd together and sketch the letters themselves.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#060b1c");
  const { ctx } = surface;
  const style = typeStyle("topology");
  let width = 1;
  let height = 1;
  let cols = 0;
  let rows = 0;
  let cell = 12;
  let field = new Float32Array(1);
  let nameNodes = [];
  let lastCue = 0;

  // Contour colours cycle through a cool spectrum, like Vanta's topology lines.
  const CONTOUR_COLORS = ["#48d6ff", "#7ea6ff", "#b58cff", "#ff7ad9", "#ff9f6e", "#5cf0c2"];

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    cell = preview ? 14 : Math.max(10, Math.min(22, Math.round(Math.min(w, h) / 34)));
    cols = Math.ceil(w / cell) + 2;
    rows = Math.ceil(h / cell) + 2;
    field = new Float32Array(cols * rows);
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 40 : 120, 0.52, 0.2) : [];
    nameNodes = targets.map((point, index) => ({
      x: point.x,
      y: point.y,
      phase: index * 0.37,
      seed: random(0, 40)
    }));
  }

  function buildField(time, lift) {
    const scale = 0.0032;
    const drift = time * 0.085;
    for (let row = 0; row < rows; row++) {
      const y = (row - 1) * cell;
      for (let col = 0; col < cols; col++) {
        const x = (col - 1) * cell;
        // Layered noise: a broad swell plus finer ridges, warped over time.
        let value = fbm3(x * scale, y * scale, drift, { octaves: 3, seed: 11 });
        value += 0.45 * noise2(x * scale * 2.6, y * scale * 2.6 + drift * 0.7, 3);
        // The name lifts the terrain into domes, so contours hug the lettering.
        if (lift > 0.001) {
          const radius = Math.min(width, height) * (preview ? 0.2 : 0.11);
          for (const node of nameNodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < radius * radius * 4) {
              const falloff = Math.exp(-d2 / (radius * radius * 0.55));
              value += lift * 1.5 * falloff * (1 + 0.18 * Math.sin(time * 1.4 + node.phase));
            }
          }
        }
        field[row * cols + col] = value;
      }
    }
  }

  /** Marching-squares segment table: which edges each case connects. */
  function segmentsForCase(code) {
    switch (code) {
      case 1: case 14: return [[3, 0]];
      case 2: case 13: return [[0, 1]];
      case 3: case 12: return [[3, 1]];
      case 4: case 11: return [[1, 2]];
      case 5: return [[3, 0], [1, 2]];
      case 6: case 9: return [[0, 2]];
      case 7: case 8: return [[3, 2]];
      case 10: return [[0, 1], [3, 2]];
      default: return [];
    }
  }

  function edgePoint(col, row, level, edge) {
    const i = row * cols + col;
    const v = field[i];
    switch (edge) {
      case 0: { // bottom edge (between this corner and the one below)
        const vb = field[i + cols];
        const t = (level - v) / (vb - v || 1e-6);
        return [(col + t) * cell - cell, (row + 1) * cell - cell];
      }
      case 1: { // right edge
        const vr = field[i + 1];
        const t = (level - v) / (vr - v || 1e-6);
        return [(col + 1) * cell - cell, (row + t) * cell - cell];
      }
      case 2: { // top edge
        const vt = field[i - cols];
        const t = (level - v) / (vt - v || 1e-6);
        return [(col + t) * cell - cell, (row - 1) * cell - cell];
      }
      default: { // left edge
        const vl = field[i - 1];
        const t = (level - v) / (vl - v || 1e-6);
        return [col * cell - cell, (row + t) * cell - cell];
      }
    }
  }

  function frame(dt, time) {
    const cycle = time % 20;
    const gather = showName ? smoothstep(3, 6.5, cycle) * (1 - smoothstep(14.5, 18, cycle)) : 0;

    ctx.fillStyle = "#060b1c";
    ctx.fillRect(0, 0, width, height);

    buildField(time, gather);

    const levels = 11;
    const span = 3.2;
    ctx.lineWidth = preview ? 0.8 : 1.05;
    ctx.globalCompositeOperation = "lighter";

    for (let level = 0; level < levels; level++) {
      const threshold = -span / 2 + (level + 0.5) * (span / levels) + 0.35 * Math.sin(time * 0.16 + level * 0.55);
      const color = CONTOUR_COLORS[level % CONTOUR_COLORS.length];
      ctx.strokeStyle = rgba(color, preview ? 0.5 : 0.34 + 0.1 * Math.sin(time * 0.5 + level));
      ctx.beginPath();
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < cols - 1; col++) {
          const tl = field[row * cols + col] >= threshold;
          const tr = field[row * cols + col + 1] >= threshold;
          const br = field[(row + 1) * cols + col + 1] >= threshold;
          const bl = field[(row + 1) * cols + col] >= threshold;
          const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
          for (const [a, b] of segmentsForCase(code)) {
            const [ax, ay] = edgePoint(col, row, threshold, a);
            const [bx, by] = edgePoint(col, row, threshold, b);
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
          }
        }
      }
      ctx.stroke();
    }

    // Soft highlight dots where the name sits, like survey pins on the map.
    if (gather > 0.05 && !preview) {
      for (const node of nameNodes) {
        const twinkle = 0.35 + 0.3 * Math.sin(time * 2 + node.seed);
        ctx.fillStyle = rgba("#dff2ff", gather * twinkle * 0.5);
        ctx.beginPath();
        ctx.arc(node.x, node.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.02) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.14, width * 0.075), 18, 96),
        maxWidth: width * 0.72,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp(gather * 0.85, 0, 0.85),
        progress: gather
      });
      if (time - lastCue > 6) {
        lastCue = time;
        emitSound("windChime");
      }
    }
  }

  return { resize, frame, destroy() {} };
}
