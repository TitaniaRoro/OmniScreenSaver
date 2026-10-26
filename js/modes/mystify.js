import { setup2D, TAU, clamp, random, smoothstep, drawStyledName, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3, noise2, damp } from "../motion.js";

/**
 * Mystify.
 *
 * Each ribbon is a chain: the head chases a wandering target and every link
 * behind it chases the link in front. That is what gives the whipping,
 * overshooting motion of the original. When the name comes round, the heads
 * are handed the letter outlines to chase, so the ribbons fold themselves
 * around the name before being released again.
 */
const LINKS = 26;

export function createMode({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#080416");
  const { ctx } = surface;
  const style = typeStyle("mystify");
  let width = 1;
  let height = 1;
  let ribbons = [];
  let outline = [];
  let lastCycle = -1;

  function makeRibbon(index) {
    const points = Array.from({ length: LINKS }, () => ({ x: width / 2, y: height / 2, vx: 0, vy: 0 }));
    return {
      points,
      hue: (258 + index * 26) % 360,
      phase: random(0, TAU),
      wobble: random(0.7, 1.5),
      speedScale: random(0.72, 1.28)
    };
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const count = preview ? 4 : 8;
    ribbons = Array.from({ length: count }, (_, index) => makeRibbon(index));
    outline = showName ? orderedOutline(shape, w, h) : [];
  }

  /** Sample the name mask and order the points into a single closed contour. */
  function orderedOutline(shape, w, h) {
    const targets = scaledNameTargets(shape, w, h, preview ? 90 : 220, 0.5, 0.2);
    if (targets.length < 8) return [];
    const cx = w / 2;
    const cy = h / 2;
    return targets
      .map(point => ({ ...point, angle: Math.atan2(point.y - cy, point.x - cx) }))
      .sort((a, b) => a.angle - b.angle);
  }

  function headTarget(ribbon, time, trace) {
    const cx = width / 2;
    const cy = height / 2;
    if (trace > 0.001 && outline.length) {
      const index = Math.floor((time * 26 * ribbon.speedScale + ribbon.phase * 9) % outline.length);
      const point = outline[index];
      const next = outline[(index + 1) % outline.length];
      const blend = (time * 26 * ribbon.speedScale) % 1;
      return {
        x: point.x + (next.x - point.x) * blend,
        y: point.y + (next.y - point.y) * blend
      };
    }
    const rx = width * 0.3 * (0.62 + 0.38 * Math.sin(time * 0.21 * ribbon.speedScale + ribbon.phase));
    const ry = height * 0.3 * (0.62 + 0.38 * Math.cos(time * 0.17 * ribbon.speedScale + ribbon.phase * 1.7));
    const drift = fbm3(ribbon.phase * 3.1, time * 0.12, ribbon.phase, { octaves: 2, seed: 3 });
    return {
      x: cx + Math.cos(time * 0.31 * ribbon.speedScale + ribbon.phase) * rx + drift * width * 0.05,
      y: cy + Math.sin(time * 0.27 * ribbon.speedScale + ribbon.phase * 0.8) * ry + noise2(ribbon.phase, time * 0.23) * height * 0.05
    };
  }

  function frame(dt, time) {
    const cycle = time % 15;
    const trace = showName ? smoothstep(4.4, 6.6, cycle) * (1 - smoothstep(10.6, 12.8, cycle)) : 0;
    const reveal = showName ? smoothstep(6.2, 7.8, cycle) * (1 - smoothstep(11.4, 13.2, cycle)) : 0;

    ctx.fillStyle = "rgba(7,5,20,.17)";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (const ribbon of ribbons) {
      const target = headTarget(ribbon, time, trace);
      const head = ribbon.points[0];
      // The head is springy; the rest of the chain just follows what it does.
      head.vx = damp(head.vx, (target.x - head.x) * 9, 0.09, dt);
      head.vy = damp(head.vy, (target.y - head.y) * 9, 0.09, dt);
      head.x += head.vx * dt;
      head.y += head.vy * dt;

      for (let index = 1; index < ribbon.points.length; index++) {
        const point = ribbon.points[index];
        const leader = ribbon.points[index - 1];
        const stiffness = 34 - index * 0.35;
        point.vx += (leader.x - point.x) * stiffness * dt;
        point.vy += (leader.y - point.y) * stiffness * dt;
        const damping = Math.exp(-(7 + index * 0.12) * dt);
        point.vx *= damping;
        point.vy *= damping;
        point.x += point.vx * dt;
        point.y += point.vy * dt;
      }

      const hue = (ribbon.hue + Math.sin(time * 0.4 + ribbon.phase) * 34 + 360) % 360;
      const gradient = ctx.createLinearGradient(
        ribbon.points[0].x, ribbon.points[0].y,
        ribbon.points[ribbon.points.length - 1].x, ribbon.points[ribbon.points.length - 1].y
      );
      gradient.addColorStop(0, `hsla(${hue}, 96%, 72%, .5)`);
      gradient.addColorStop(0.5, `hsla(${(hue + 48) % 360}, 96%, 66%, .38)`);
      gradient.addColorStop(1, `hsla(${(hue + 96) % 360}, 96%, 62%, .16)`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5 + (ribbon.wobble % 3) * 0.6;
      ctx.shadowColor = `hsla(${hue}, 98%, 70%, .85)`;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(ribbon.points[0].x, ribbon.points[0].y);
      for (let index = 1; index < ribbon.points.length; index++) ctx.lineTo(ribbon.points[index].x, ribbon.points[index].y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowBlur = 0;

    if (showName && reveal > 0.02) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: Math.min(height * 0.165, width * 0.09),
        maxWidth: width * 0.7,
        maxHeight: height * 0.18,
        minSize: 12,
        language,
        time,
        alpha: reveal * 0.92,
        glow: 1.1,
        paint: () => "rgba(11,7,26,.82)",
        stroke: (context, { size }) => {
          const gradient = context.createLinearGradient(-size * 2, 0, size * 4, 0);
          gradient.addColorStop(0, "#ff82df");
          gradient.addColorStop(0.5, "#d9b0ff");
          gradient.addColorStop(1, "#74f8ed");
          return gradient;
        },
        strokeWidth: Math.max(1.6, Math.min(height * 0.006, 3.4)),
        perLetter: ({ index, count, progress, time: now }) => {
          const delay = (index / Math.max(1, count)) * 0.5;
          const local = clamp((progress - delay) / 0.5, 0, 1);
          return {
            alpha: local,
            dy: Math.sin(now * 2 + index) * (1 - local) * 10,
            scaleY: 0.85 + local * 0.15
          };
        },
        progress: reveal
      });
    }

    drawVignette(ctx, width, height, 0.4);

    const current = Math.floor(time / 15);
    if (current !== lastCycle && cycle < 0.25) {
      lastCycle = current;
      emitSound("softChime");
    }
  }

  return { resize, frame, destroy() {} };
}
