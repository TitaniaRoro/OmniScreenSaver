import { setup2D, TAU, clamp, random, drawStyledName, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { noise2, fbm3, Spring } from "../motion.js";

/**
 * Bouncing Name.
 *
 * Proper gravity, a little air drag, energy lost on each bounce, spin picked
 * up from the walls, and squash-and-stretch on impact — the things that make a
 * bouncing object read as having weight. It never settles: each landing puts
 * back just enough energy to keep travelling.
 */
export function createMode({ canvas, name, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#090d1d");
  const { ctx } = surface;
  const style = typeStyle("bounce");
  const squash = new Spring(0, { stiffness: 210, damping: 13 });
  const spin = new Spring(0, { stiffness: 60, damping: 9 });
  const GRAVITY = 760;
  const RESTITUTION = 0.84;
  let width = 1;
  let height = 1;
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let angle = 0;
  let spinVelocity = 0;
  // Classic arcade paddle-blue (hue ~200) instead of a full rainbow cycle, so
  // the lettering matches the scene's cool blue glow.
  let hue = 200;
  let trail = [];
  let ripples = [];
  let lastSound = -1;
  let impact = 0;

  function label() {
    return showName ? name : "✦";
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    x = clamp(x || w / 2, w * 0.25, w * 0.75);
    y = clamp(y || h * 0.4, h * 0.2, h * 0.7);
    if (!vx) {
      vx = (random(0.35, 0.75) * (Math.random() < 0.5 ? -1 : 1)) * w;
      vy = 0;
    }
    trail = [];
    ripples = [];
  }

  function frame(dt, time) {
    const step = Math.min(dt, 1 / 30);
    const text = label();
    const size = clamp(Math.min(width * 0.1, height * 0.15), 22, 110);
    ctx.font = `${style.weight} ${size}px ${style.family}`;
    const textWidth = ctx.measureText(text).width + (style.tracking || 0) * size * text.length;
    const radiusX = textWidth / 2 + size * 0.22;
    const radiusY = size * 0.62;

    // Physics
    vy += GRAVITY * step;
    vx *= Math.exp(-0.06 * step);
    vy *= Math.exp(-0.06 * step);
    x += vx * step;
    y += vy * step;
    spinVelocity += (vx * 0.0016 - spinVelocity) * Math.min(1, step * 2);
    angle += spinVelocity * step;

    let bounced = false;
    if (x - radiusX < 0) { x = radiusX; vx = Math.abs(vx) * RESTITUTION; spinVelocity += 0.9; bounced = true; }
    if (x + radiusX > width) { x = width - radiusX; vx = -Math.abs(vx) * RESTITUTION; spinVelocity -= 0.9; bounced = true; }
    if (y - radiusY < 0) { y = radiusY; vy = Math.abs(vy) * RESTITUTION; bounced = true; }
    if (y + radiusY > height) {
      y = height - radiusY;
      vy = -Math.abs(vy) * RESTITUTION;
      vx += (noise2(time * 0.7, 3) * 60);
      bounced = true;
    }

    if (bounced) {
      const speed = Math.hypot(vx, vy);
      impact = clamp(speed / 900, 0.1, 1);
      squash.velocity -= impact * 22;
      spin.velocity += (Math.random() - 0.5) * impact * 6;
      ripples.push({ x, y, radius: radiusX * 0.6, life: 1, hue });
      // Keep it alive: every bounce adds back a little of what was lost.
      const energy = Math.hypot(vx, vy);
      const target = Math.max(width, height) * 0.42;
      if (energy < target) {
        const boost = clamp(target / Math.max(60, energy), 1, 1.35);
        vx *= boost;
        vy *= boost * (Math.abs(vy) > 40 ? 1 : 0.9);
      }
      vy -= Math.min(120, Math.abs(vy) * 0.06);
      if (time - lastSound > 0.12) {
        lastSound = time;
        emitSound(Math.abs(vx) < 120 && Math.abs(vy) < 120 ? "softChord" : "bell");
      }
    }

    squash.step(step);
    spin.step(step);
    const squashAmount = squash.value;
    const stretch = clamp(Math.abs(vy) / 1400, 0, 0.22);

    trail.push({ x, y, angle, life: 1 });
    if (trail.length > (preview ? 6 : 16)) trail.shift();
    for (const point of trail) point.life -= step * 3.4;

    // Scene
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#090e22");
    bg.addColorStop(0.55, "#141b38");
    bg.addColorStop(1, "#0b1125");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Soft room light that follows the name around
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const light = ctx.createRadialGradient(x, y, 6, x, y, Math.max(radiusX, radiusY) * 3.4);
    light.addColorStop(0, `hsla(${hue},88%,64%,.17)`);
    light.addColorStop(1, `hsla(${hue},88%,52%,0)`);
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(radiusX, radiusY) * 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Impact rings
    for (let index = ripples.length - 1; index >= 0; index--) {
      const ripple = ripples[index];
      ripple.life -= step * 1.6;
      ripple.radius += step * 320;
      if (ripple.life <= 0) { ripples.splice(index, 1); continue; }
      ctx.save();
      ctx.globalAlpha = ripple.life * 0.28;
      ctx.strokeStyle = `hsl(${ripple.hue},92%,72%)`;
      ctx.lineWidth = 2 + ripple.life * 3;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, ripple.radius, ripple.radius * 0.86, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Motion trail
    if (!preview) {
      for (const point of trail) {
        if (point.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = point.life * 0.16;
        drawStyledName(ctx, text, point.x, point.y, {
          style,
          size,
          maxWidth: width * 0.8,
          maxHeight: height * 0.2,
          minSize: 14,
          language,
          time,
          paint: `hsl(${hue + 30},95%,72%)`,
          effects: [],
          shadowBlur: 0,
          rotate: point.angle * 0.4,
          perLetter: () => ({ scaleX: 1 - stretch * 0.4 + squashAmount * 0.5, scaleY: 1 + stretch - squashAmount * 0.4 })
        });
        ctx.restore();
      }
    }

    drawStyledName(ctx, text, x, y, {
      style,
      size,
      maxWidth: width * 0.8,
      maxHeight: height * 0.2,
      minSize: 14,
      language,
      time,
      alpha: 1,
      glow: 1.1,
      rotate: angle * 0.5 + spin.value * 0.3,
      paint: (context, { size: letterSize }) => {
        const gradient = context.createLinearGradient(-letterSize * 2, -letterSize, letterSize * 2, letterSize * 0.6);
        gradient.addColorStop(0, `hsl(${hue + 46},100%,84%)`);
        gradient.addColorStop(0.48, "#fff8fd");
        gradient.addColorStop(1, `hsl(${hue - 14},100%,82%)`);
        return gradient;
      },
      perLetter: ({ index, count, time: now }) => {
        // The leading edge of the motion lags very slightly behind.
        const lag = Math.sin(now * 3 + index * 0.6) * 0.02;
        return {
          scaleX: (1 - stretch * 0.5 + squashAmount * 0.55) + lag,
          scaleY: (1 + stretch * 1.1 - squashAmount * 0.45) - lag,
          rotate: Math.sin(now * 1.4 + index * 0.8) * 0.02
        };
      }
    });

    // Gentle shimmer around the base arcade blue — no drifting through every
    // colour of the wheel, which used to clash with the scene palette.
    const drift = fbm3(time * 0.2, 1, 0, { octaves: 2, seed: 4 });
    hue = 200 + clamp(drift * 18, -18, 18);
    impact *= Math.exp(-3 * step);
    drawVignette(ctx, width, height, 0.34);
  }

  return { resize, frame, destroy() {} };
}
