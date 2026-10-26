import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { noise2 } from "../motion.js";

/**
 * Living Cells (after vanta.js `cells`).
 *
 * Voronoi-like organisms: seed points wander on slow noise currents, each
 * pulling nutrients (brightness) toward itself, and cell membranes are drawn
 * where two seeds hold equal claim to a patch of space. Occasionally a cell
 * divides — a new seed buds off its parent — keeping the colony restless.
 * On the reveal beat some seeds are called onto the letterforms: the colony
 * briefly grows the name as living tissue before letting go.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#081410");
  const { ctx } = surface;
  const style = typeStyle("cells");
  let width = 1;
  let height = 1;
  let cells = [];
  let nextId = 0;
  let lastCue = 0;
  let lastDivide = 0;

  const HUES = [150, 168, 96, 185, 132];

  function makeCell(target = null, parent = null) {
    return {
      id: nextId++,
      x: target ? target.x : random(0, width),
      y: target ? target.y : random(0, height),
      vx: random(-4, 4),
      vy: random(-4, 4),
      hue: parent ? parent.hue : HUES[Math.floor(random(0, HUES.length))],
      pulse: random(0, Math.PI * 2),
      size: random(0.75, 1.25),
      named: Boolean(target),
      tx: target?.x ?? 0,
      ty: target?.y ?? 0,
      delay: random(0, 0.5),
      age: 0,
      seed: random(0, 60)
    };
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 34 : 90, 0.5, 0.2) : [];
    const freeCount = preview ? 14 : 40;
    cells = [];
    for (const target of targets) cells.push(makeCell(target));
    for (let index = 0; index < freeCount; index++) cells.push(makeCell());
  }

  function frame(dt, time) {
    const cycle = time % 18;
    const gather = showName ? smoothstep(3.4, 7, cycle) * (1 - smoothstep(13.6, 17, cycle)) : 0;

    ctx.fillStyle = "rgba(8,20,16,.34)";
    ctx.fillRect(0, 0, width, height);

    // Movement: named cells home in during the gather; everyone drifts on noise.
    for (const cell of cells) {
      cell.age += dt;
      if (cell.named && gather > 0.001) {
        const local = clamp((gather - cell.delay * 0.5) / (1 - cell.delay * 0.5), 0, 1);
        cell.vx += (cell.tx - cell.x) * (3.5 + local * 8) * dt;
        cell.vy += (cell.ty - cell.y) * (3.5 + local * 8) * dt;
        cell.vx *= Math.exp(-3 * dt);
        cell.vy *= Math.exp(-3 * dt);
      } else {
        cell.vx += noise2(cell.x * 0.006, cell.y * 0.006, time * 0.16 + cell.seed) * 16 * dt;
        cell.vy += noise2(cell.y * 0.006 + 13, cell.x * 0.006, time * 0.16 + cell.seed) * 16 * dt;
        cell.vx *= Math.exp(-0.8 * dt);
        cell.vy *= Math.exp(-0.8 * dt);
      }
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      if (cell.x < 0) { cell.x = 0; cell.vx = Math.abs(cell.vx); }
      if (cell.x > width) { cell.x = width; cell.vx = -Math.abs(cell.vx); }
      if (cell.y < 0) { cell.y = 0; cell.vy = Math.abs(cell.vy); }
      if (cell.y > height) { cell.y = height; cell.vy = -Math.abs(cell.vy); }
      cell.pulse += dt * (1.1 + cell.size * 0.4);
    }

    // Division keeps the colony breathing.
    const budget = preview ? 18 : 56;
    if (time - lastDivide > 2.4 && cells.length < budget) {
      lastDivide = time;
      const parent = cells[Math.floor(Math.random() * cells.length)];
      if (parent && !parent.named) {
        const child = makeCell(null, parent);
        child.x = parent.x + random(-14, 14);
        child.y = parent.y + random(-14, 14);
        child.hue = parent.hue + random(-8, 8);
        cells.push(child);
        emitSound("bubble");
      }
    }
    // Death: oldest unnamed cells occasionally dissolve, making room.
    if (cells.length > budget * 0.8) {
      const candidates = cells.filter(cell => !cell.named && cell.age > 14);
      if (candidates.length && Math.random() < 0.01) {
        const victim = candidates[0];
        cells = cells.filter(cell => cell !== victim);
      }
    }

    // Bodies: soft glowing discs with a brighter nucleus.
    ctx.globalCompositeOperation = "lighter";
    for (const cell of cells) {
      const breathe = 1 + 0.16 * Math.sin(cell.pulse);
      const radius = (preview ? 12 : 26) * cell.size * breathe;
      const tint = cell.named ? 0.55 + gather * 0.4 : 0.42;
      const body = ctx.createRadialGradient(cell.x, cell.y, 0, cell.x, cell.y, radius);
      body.addColorStop(0, `hsla(${cell.hue},80%,72%,${tint * 0.5})`);
      body.addColorStop(0.55, `hsla(${cell.hue},75%,45%,${tint * 0.22})`);
      body.addColorStop(1, `hsla(${cell.hue},70%,30%,0)`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsla(${cell.hue},90%,85%,${tint * 0.7})`;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, radius * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Membranes: draw the boundary between close pairs — the perpendicular
    // bisector arc segment facing the other cell, like a Voronoi edge.
    const maxDist = Math.min(width, height) * (preview ? 0.4 : 0.26);
    ctx.lineWidth = preview ? 0.8 : 1.15;
    for (let i = 0; i < cells.length; i++) {
      const a = cells[i];
      for (let j = i + 1; j < cells.length; j++) {
        const b = cells[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist || dist < 1) continue;
        const strength = 1 - dist / maxDist;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const angle = Math.atan2(dy, dx);
        const hue = (a.hue + b.hue) / 2;
        ctx.strokeStyle = `hsla(${hue},85%,70%,${strength * strength * (preview ? 0.5 : 0.32)})`;
        ctx.beginPath();
        ctx.arc(midX, midY, dist * 0.5, angle + Math.PI / 2 - 0.5, angle + Math.PI / 2 + 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(midX, midY, dist * 0.5, angle - Math.PI / 2 - 0.5, angle - Math.PI / 2 + 0.5);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.3) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.14, width * 0.075), 16, 98),
        maxWidth: width * 0.72,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp((gather - 0.3) * 1.3, 0, 0.8),
        progress: gather
      });
      if (time - lastCue > 7) {
        lastCue = time;
        emitSound("softChime");
      }
    }
  }

  return { resize, frame, destroy() {} };
}
