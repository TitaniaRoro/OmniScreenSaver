import {
  setup2D, TAU, clamp, random, rgba, smoothstep,
  drawStyledName, drawVignette, makeStarField, drawTwinklingStars, drawSphereDot
} from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { noise2, flicker, fbm3 } from "../motion.js";

/**
 * Fireworks.
 *
 * Shells leave a trail as they climb, slow under gravity and air drag, and
 * burst at apex. Fragments fly out on a slightly uneven sphere, burn down with
 * drag and gravity, and leave smoke that drifts. Between bursts the name is
 * written the same way the bursts are: sparks rise, find their place in the
 * lettering and light it up from the bottom edge.
 */
const COLORS = ["#ffc778", "#fd91ce", "#9ce9ff", "#c3a5ff", "#b8ffd6", "#ffe9a8"];

export function createMode({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#070916");
  const { ctx } = surface;
  const style = typeStyle("fireworks");
  let width = 1;
  let height = 1;
  let shells = [];
  let sparks = [];
  let smoke = [];
  let stars = [];
  let targets = [];
  let launchAt = 0.9;
  let lastBurst = -1;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    stars = makeStarField(preview ? 34 : 120, w, h, { topRatio: 0.78, seed: 6 });
    targets = showName
      ? scaledNameTargets(shape, w, h, preview ? 70 : 210, 0.52, preview ? 0.34 : 0.2, { x: 0, y: -height * 0.06 })
      : [];
    shells = [];
    sparks = [];
    smoke = [];
  }

  function launch(time) {
    const targetY = random(height * 0.16, height * 0.5);
    const duration = random(1.15, 1.7);
    shells.push({
      x: random(width * 0.14, width * 0.86),
      y: height + 12,
      vy: -(height - targetY) / duration,
      vx: random(-22, 22),
      color: COLORS[Math.floor(random(0, COLORS.length))],
      life: duration,
      trail: [],
      time
    });
    emitSound("firework");
  }

  function explode(shell) {
    const count = Math.round((preview ? 26 : random(48, 96)) * (0.7 + Math.random() * 0.5));
    const baseAngle = random(0, TAU);
    for (let index = 0; index < count; index++) {
      const angle = baseAngle + (index / count) * TAU + random(-0.05, 0.05);
      // Not a perfect circle: an uneven shell looks like a real burst
      const velocity = random(60, 210) * (0.72 + noise2(index * 0.3, shell.x) * 0.35 + 0.3);
      sparks.push({
        x: shell.x,
        y: shell.y,
        px: shell.x,
        py: shell.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 1,
        maxLife: random(1.1, 2.5),
        color: noise2(index * 1.7, shell.y) > 0.55 ? COLORS[Math.floor(random(0, COLORS.length))] : shell.color,
        size: random(1, 2.6),
        crackle: Math.random() < 0.12
      });
    }
    for (let index = 0; index < (preview ? 2 : 6); index++) {
      smoke.push({
        x: shell.x + random(-16, 16),
        y: shell.y + random(-16, 16),
        vx: random(-14, 14),
        vy: random(-24, -6),
        life: 1,
        maxLife: random(2.4, 4.4),
        size: random(14, 34)
      });
    }
  }

  function frame(dt, time) {
    const step = Math.min(dt, 1 / 30);
    ctx.fillStyle = "rgba(5,7,18,.2)";
    ctx.fillRect(0, 0, width, height);

    drawTwinklingStars(ctx, stars, time, { color: "#e3deff", base: 0.24 });

    // Distant skyline so the bursts have something to sit behind
    ctx.fillStyle = "#050813";
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += Math.max(12, width / 40)) {
      const ridge = height * 0.9 - Math.abs(fbm3(x * 0.0016, 3.1, 0, { octaves: 3, seed: 9 })) * height * 0.14;
      ctx.lineTo(x, ridge);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    if (time >= launchAt) {
      launch(time);
      launchAt = time + random(1.6, 3.6);
    }

    // Shells
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let index = shells.length - 1; index >= 0; index--) {
      const shell = shells[index];
      shell.vy += 118 * step;
      shell.vx *= Math.exp(-0.35 * step);
      shell.x += shell.vx * step;
      shell.y += shell.vy * step;
      shell.life -= step;
      shell.trail.push({ x: shell.x, y: shell.y, life: 1 });
      if (shell.trail.length > 14) shell.trail.shift();
      for (const point of shell.trail) point.life -= step * 3.2;
      for (const point of shell.trail) {
        if (point.life <= 0) continue;
        ctx.globalAlpha = point.life * 0.5;
        ctx.fillStyle = shell.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.6 * point.life + 0.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.9;
      // The shell head is a burning sphere: hot white core falling off to the
      // mix colour, not a flat dot with a shadow blur stuck on it.
      drawSphereDot(ctx, shell.x, shell.y, 2.6, shell.color, {
        alpha: 0.95,
        core: "#fff8e2",
        rim: shell.color,
        blur: 12,
        specular: 0.7
      });
      ctx.globalAlpha = 1;
      if (shell.life <= 0 || shell.vy >= -12) {
        explode(shell);
        shells.splice(index, 1);
      }
    }
    ctx.restore();

    // Smoke drifts behind the sparks
    ctx.save();
    for (let index = smoke.length - 1; index >= 0; index--) {
      const puff = smoke[index];
      puff.life -= step / puff.maxLife;
      if (puff.life <= 0) { smoke.splice(index, 1); continue; }
      puff.vy -= 8 * step;
      puff.vx += fbm3(puff.x * 0.004, puff.y * 0.004, time * 0.3, { octaves: 2, seed: 4 }) * 24 * step;
      puff.vx *= Math.exp(-0.6 * step);
      puff.vy *= Math.exp(-0.6 * step);
      puff.x += puff.vx * step;
      puff.y += puff.vy * step;
      const size = puff.size * (1 + (1 - puff.life) * 2.2);
      const gradient = ctx.createRadialGradient(puff.x, puff.y, 1, puff.x, puff.y, size);
      gradient.addColorStop(0, `rgba(196,186,208,${0.1 * puff.life})`);
      gradient.addColorStop(1, "rgba(160,150,180,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Sparks
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let index = sparks.length - 1; index >= 0; index--) {
      const spark = sparks[index];
      spark.px = spark.x;
      spark.py = spark.y;
      spark.vy += 58 * step;
      const drag = Math.exp(-1.15 * step);
      spark.vx *= drag;
      spark.vy *= drag;
      spark.x += spark.vx * step;
      spark.y += spark.vy * step;
      spark.life -= step / spark.maxLife;
      if (spark.life <= 0) {
        if (spark.crackle && !preview) {
          for (let extra = 0; extra < 6; extra++) {
            sparks.push({
              x: spark.x, y: spark.y, px: spark.x, py: spark.y,
              vx: random(-70, 70), vy: random(-70, 70),
              life: 0.9, maxLife: random(0.3, 0.7), color: "#fff2c8", size: random(0.8, 1.6)
            });
          }
        }
        sparks.splice(index, 1);
        continue;
      }
      const alpha = clamp(spark.life, 0, 1) ** 0.7;
      const twinkle = 0.7 + flicker(time * 2, spark.x + spark.y, { speed: 3.4 }) * 0.5;
      ctx.globalAlpha = clamp(alpha * twinkle, 0, 1);
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = spark.size * (0.5 + alpha);
      ctx.shadowColor = spark.color;
      ctx.shadowBlur = 8 * alpha;
      ctx.beginPath();
      ctx.moveTo(spark.px, spark.py);
      ctx.lineTo(spark.x, spark.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Name: sparks find their place and light the letters
    const cycle = time % 20;
    const ignite = showName ? smoothstep(4.2, 7.4, cycle) * (1 - smoothstep(14, 17.4, cycle)) : 0;
    if (showName && ignite > 0.01 && targets.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let index = 0; index < targets.length; index++) {
        const point = targets[index];
        const delay = (index / targets.length) * 0.45;
        const local = clamp((ignite - delay) / 0.55, 0, 1);
        if (local <= 0.01) continue;
        const heat = flicker(time * 1.6, index * 0.6, { speed: 2.8 });
        ctx.globalAlpha = local * (0.4 + heat * 0.6);
        ctx.fillStyle = index % 4 === 0 ? "#fff3c8" : "#ffb45c";
        ctx.shadowColor = "#ff9a3c";
        ctx.shadowBlur = 10 * local;
        ctx.beginPath();
        ctx.arc(point.x + Math.sin(time * 1.4 + index) * 1.6, point.y + (1 - local) * 12, 1 + local * 1.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      ctx.shadowBlur = 0;
    }
    if (showName && ignite > 0.15) {
      drawStyledName(ctx, name, width / 2, height * 0.44, {
        style,
        size: Math.min(height * 0.16, width * 0.09),
        maxWidth: width * 0.62,
        maxHeight: height * 0.18,
        minSize: 12,
        language,
        time,
        alpha: smoothstep(0.25, 0.9, ignite) * 0.9,
        glow: 1.3,
        paint: (context, { size }) => {
          const gradient = context.createLinearGradient(0, size * 0.6, 0, -size * 0.6);
          gradient.addColorStop(0, rgba("#ff8a3c", 0.95));
          gradient.addColorStop(0.45, rgba("#ffc061", 0.85));
          gradient.addColorStop(1, rgba("#fff3d4", 0.6));
          return gradient;
        },
        perLetter: ({ index, count, progress, time: now }) => {
          const delay = (index / Math.max(1, count)) * 0.4;
          const local = clamp((progress - delay) / 0.6, 0, 1);
          const heat = flicker(now * 1.4, index * 2.9, { speed: 2.2 });
          return {
            alpha: local,
            dy: (1 - local) * 14,
            scaleY: 0.88 + local * 0.12,
            glow: 0.5 + heat * 0.8
          };
        },
        progress: ignite
      });
    }

    drawVignette(ctx, width, height, 0.34);

    const cycleNo = Math.floor(time / 20);
    if (cycleNo !== lastBurst && cycle < 0.25) {
      lastBurst = cycleNo;
      if (showName && !preview) emitSound("softChime");
    }
  }

  return { resize, frame, destroy() {} };
}
