import { nameSize, setup2D, TAU, clamp, random, rgba, smoothstep, drawStyledName, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3, noise2, damp } from "../motion.js";

/**
 * Lava Lamp.
 *
 * Blobs are heated at the bottom of the lamp and cool at the top, so they rise,
 * hover, lose buoyancy and sink again — the slow convection that makes a real
 * lava lamp mesmerising. They are drawn additively, so when two blobs meet they
 * merge into one shape instead of overlapping as circles. Periodically the wax
 * gathers into the lettering, holds it molten for a moment, then melts apart.
 */
export function createMode({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#140817");
  const { ctx } = surface;
  const style = typeStyle("lava");
  let width = 1;
  let height = 1;
  let blobs = [];
  let targets = [];
  let lastBubble = 0;

  function makeBlob(index, count) {
    return {
      x: random(width * 0.18, width * 0.82),
      y: random(height * 0.25, height * 0.85),
      vx: random(-8, 8),
      vy: 0,
      radius: Math.min(width, height) * random(0.055, 0.115),
      heat: random(0.2, 0.9),
      phase: random(0, TAU),
      wobble: random(0.6, 1.5),
      hue: [12, 26, 344, 4][index % 4],
      index,
      count
    };
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const count = preview ? 5 : 11;
    blobs = Array.from({ length: count }, (_, index) => makeBlob(index, count));
    targets = showName ? scaledNameTargets(shape, w, h, preview ? 60 : 150, 0.4, preview ? 0.24 : 0.14) : [];
  }

  function frame(dt, time) {
    const step = Math.min(dt, 1 / 30);
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0d0716");
    bg.addColorStop(0.5, "#2a1024");
    bg.addColorStop(1, "#0f0918");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Lamp glass: a warm column of light behind the wax
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const column = ctx.createLinearGradient(0, height, 0, 0);
    column.addColorStop(0, "rgba(255,110,40,.22)");
    column.addColorStop(0.5, "rgba(180,60,40,.08)");
    column.addColorStop(1, "rgba(120,40,90,.03)");
    ctx.fillStyle = column;
    ctx.fillRect(width * 0.16, 0, width * 0.68, height);
    ctx.restore();

    const cycle = time % 20;
    const gather = showName ? smoothstep(5, 8.4, cycle) * (1 - smoothstep(13.6, 17.2, cycle)) : 0;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let index = 0; index < blobs.length; index++) {
      const blob = blobs[index];
      // Convection: heat near the base, cool near the top.
      const low = clamp(1 - (blob.y / height - 0.25) / 0.6, 0, 1);
      blob.heat = damp(blob.heat, low * 1.05, 2.2, step);
      blob.vy -= (blob.heat - 0.5) * 130 * step;
      blob.vy += 18 * step;
      blob.vx += fbm3(blob.x * 0.002, blob.y * 0.002, time * 0.08, { octaves: 2, seed: blob.index }) * 26 * step;
      blob.vx = damp(blob.vx, 0, 1.4, step);
      blob.vy *= Math.exp(-0.9 * step);
      blob.y += blob.vy * step;
      blob.x += blob.vx * step;

      let drawX = blob.x;
      let drawY = blob.y;
      if (gather > 0.001 && targets.length) {
        const target = targets[index % targets.length];
        const local = clamp((gather - (index / blobs.length) * 0.3) / 0.7, 0, 1);
        drawX += (target.x - drawX) * local;
        drawY += (target.y - drawY) * local;
      }

      if (drawY < height * 0.12) drawY = height * 0.12;
      if (drawY > height * 0.92) drawY = height * 0.92;
      if (drawX < width * 0.12) drawX = width * 0.12;
      if (drawX > width * 0.88) drawX = width * 0.88;

      // Squash and stretch as it moves through the fluid
      const speed = Math.hypot(blob.vx, blob.vy);
      const stretch = clamp(speed / 260, 0, 0.3);
      const wobblePhase = time * 0.5 + blob.phase;
      const rx = blob.radius * (1 + noise2(blob.phase, time * 0.35) * 0.16 - stretch * 0.4);
      const ry = blob.radius * (1 + Math.sin(wobblePhase) * 0.1 + stretch * 0.5);

      const gradient = ctx.createRadialGradient(drawX - rx * 0.22, drawY - ry * 0.26, rx * 0.05, drawX, drawY, Math.max(rx, ry) * 1.25);
      gradient.addColorStop(0, `hsla(${blob.hue + 18},100%,78%,${0.5 + blob.heat * 0.22})`);
      gradient.addColorStop(0.35, `hsla(${blob.hue},96%,56%,${0.3 + blob.heat * 0.16})`);
      gradient.addColorStop(1, `hsla(${blob.hue - 6},92%,40%,0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(drawX, drawY, rx, ry, Math.sin(wobblePhase * 0.6) * 0.25, 0, TAU);
      ctx.fill();

      // A bright core and a soft skin highlight
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = `hsla(${blob.hue + 22},100%,80%,.16)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(drawX, drawY, rx * 0.66, ry * 0.7, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (showName && gather > 0.12) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: nameSize(style, width, height),
        maxWidth: width * 0.56,
        maxHeight: height * 0.15,
        minSize: 12,
        language,
        time,
        alpha: smoothstep(0.3, 0.95, gather) * 0.88,
        glow: 1.2,
        paint: (context, { size }) => {
          const gradient = context.createLinearGradient(0, -size * 0.6, 0, size * 0.7);
          gradient.addColorStop(0, rgba("#ffe6b8", 0.9));
          gradient.addColorStop(0.5, rgba("#ff9445", 0.92));
          gradient.addColorStop(1, rgba("#ff4f22", 0.95));
          return gradient;
        },
        perLetter: ({ index, count, progress, time: now }) => {
          const delay = (index / Math.max(1, count)) * 0.35;
          const local = clamp((progress - delay) / 0.65, 0, 1);
          // Letters sag a little as the wax takes hold, then drip back
          const drip = Math.sin(now * 0.9 + index * 1.3) * (1 - local) * 6;
          return {
            alpha: local,
            dy: drip,
            scaleY: 0.92 + local * 0.08 + Math.sin(now * 1.4 + index) * (1 - local) * 0.06
          };
        },
        progress: gather
      });
    }

    drawVignette(ctx, width, height, 0.4);

    const bubble = Math.floor(time / 3.6);
    if (bubble !== lastBubble) {
      lastBubble = bubble;
      emitSound("bubble");
    }
  }

  return { resize, frame, destroy() {} };
}
