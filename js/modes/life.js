import { setup2D, rgba, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3 } from "../motion.js";

/**
 * Game of Life.
 *
 * Cells begin in the shape of the name and then get on with living. Each cell
 * keeps an age and a fade value, so births brighten into view and deaths dim
 * out instead of popping — that alone is the difference between a simulation
 * that looks alive and one that looks like a spreadsheet.
 */
export function createMode({ canvas, name, shape, showName, preview = false }) {
  const surface = setup2D(canvas, "#03100e");
  const { ctx } = surface;
  const style = typeStyle("life");
  let width = 1;
  let height = 1;
  let cols = 0;
  let rows = 0;
  let cell = 9;
  let current;
  let next;
  let age;
  let fade;
  let accumulator = 0;
  let generation = 0;
  let lastReset = 0;

  function seed() {
    current = new Uint8Array(cols * rows);
    next = new Uint8Array(cols * rows);
    age = new Float32Array(cols * rows);
    fade = new Float32Array(cols * rows);
    if (showName) {
      const targets = scaledNameTargets(shape, width, height, Math.min(1500, Math.floor(cols * rows * 0.26)), 0.54, 0.23);
      for (const target of targets) {
        const x = Math.floor(target.x / cell);
        const y = Math.floor(target.y / cell);
        if (x >= 0 && x < cols && y >= 0 && y < rows) current[y * cols + x] = 1;
      }
    }
    // A scatter of random life so the colony keeps discovering things
    for (let index = 0; index < Math.floor(cols * rows * 0.014); index++) {
      const x = Math.floor(Math.random() * cols);
      const y = Math.floor(Math.random() * rows);
      current[y * cols + x] = 1;
      if (Math.random() < 0.5) current[y * cols + Math.min(cols - 1, x + 1)] = 1;
    }
    generation = 0;
    accumulator = 0;
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    cell = Math.max(6, Math.min(12, Math.round(Math.min(w / (preview ? 60 : 130), h / (preview ? 34 : 72)))));
    cols = Math.ceil(width / cell);
    rows = Math.ceil(height / cell);
    seed();
  }

  function step() {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let neighbours = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = (x + dx + cols) % cols;
            const ny = (y + dy + rows) % rows;
            neighbours += current[ny * cols + nx];
          }
        }
        const index = y * cols + x;
        next[index] = current[index] ? (neighbours === 2 || neighbours === 3 ? 1 : 0) : neighbours === 3 ? 1 : 0;
      }
    }
    [current, next] = [next, current];
    generation++;
  }

  function frame(dt, time) {
    const stepTime = preview ? 0.2 : 0.15;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= stepTime && steps < 3) {
      step();
      accumulator -= stepTime;
      steps++;
    }
    if (generation > 460 || time - lastReset > 24) {
      seed();
      lastReset = time;
    }

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#05130f");
    bg.addColorStop(0.56, "#061a16");
    bg.addColorStop(1, "#050f16");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Lattice
    ctx.fillStyle = "rgba(51,220,143,.045)";
    for (let x = 0; x < cols; x++) ctx.fillRect(x * cell, 0, 1, height);
    for (let y = 0; y < rows; y++) ctx.fillRect(0, y * cell, width, 1);

    const palette = style.palette;
    for (let index = 0; index < current.length; index++) {
      const alive = current[index];
      age[index] = alive ? Math.min(1, age[index] + dt * 2.2) : 0;
      // Cells fade in and out instead of switching.
      fade[index] += ((alive ? 1 : 0) - fade[index]) * Math.min(1, dt * 7.5);
      const value = fade[index];
      if (value < 0.02) continue;
      const x = index % cols;
      const y = Math.floor(index / cols);
      const young = 1 - age[index];
      const shimmer = 0.7 + fbm3(x * 0.12, y * 0.12, time * 0.3, { octaves: 2, seed: 3 }) * 0.3;
      const inset = cell * (0.5 - value * 0.42);
      ctx.fillStyle = young > 0.6
        ? rgba("#d8ffe8", value * (0.55 + shimmer * 0.4))
        : rgba(palette.edge, value * (0.45 + shimmer * 0.35));
      ctx.shadowColor = rgba(palette.glow, 0.7 * value);
      ctx.shadowBlur = cell * (0.5 + young * 0.9);
      ctx.fillRect(x * cell + inset, y * cell + inset, Math.max(1, cell - inset * 2), Math.max(1, cell - inset * 2));
    }
    ctx.shadowBlur = 0;

    // A slow scan passes over the colony
    const scanY = ((time * 26) % (height + 120)) - 60;
    const scan = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
    scan.addColorStop(0, "rgba(94,255,175,0)");
    scan.addColorStop(0.5, "rgba(94,255,175,.055)");
    scan.addColorStop(1, "rgba(94,255,175,0)");
    ctx.fillStyle = scan;
    ctx.fillRect(0, scanY - 40, width, 80);

    drawVignette(ctx, width, height, 0.42);
  }

  return { resize, frame, destroy() {} };
}
