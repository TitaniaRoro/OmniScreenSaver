import {
  setup2D, TAU, clamp, smoothstep, random, rgba,
  drawStyledName, drawGlowDot, drawPine, drawVignette, makeStarField, drawTwinklingStars
} from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { createFire } from "./fire.js";
import { fbm2, noise2, flicker, drift } from "../motion.js";

/**
 * Campfire Night.
 *
 * A real fire sits in the middle of the frame: hot gas rises, bends in the
 * draught, throws flickering light onto the ground, the logs and the pines,
 * and sends sparks up into the dark. When the name appears it is carried in
 * on those sparks — embers settle into the letterforms, the letters glow from
 * their base like coals, and then the fire takes them back.
 */
export function createMode({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#070b16");
  const { ctx } = surface;
  const style = typeStyle("campfire");
  const quality = preview ? 0.4 : 1;
  const fire = createFire({ quality: preview ? 0.5 : 1, seed: 12 });
  const logs = [
    { dx: -0.9, dy: 0.02, length: 1.15, angle: -0.16 },
    { dx: 0.85, dy: 0.05, length: 1.05, angle: 0.21 },
    { dx: -0.05, dy: 0.12, length: 0.92, angle: -0.04 }
  ];
  let width = 1;
  let height = 1;
  let stars = [];
  let embers = [];
  let namePoints = [];
  let nextCrackle = 2.7;
  let crackleIndex = 0;
  let horizon = 0;
  let fireX = 0;
  let fireY = 0;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    horizon = height * 0.7;
    fireX = width * 0.5;
    fireY = height * (preview ? 0.78 : 0.8);
    stars = makeStarField(Math.round((preview ? 40 : 130) * clamp(width / 900, 0.6, 1.6)), width, height, { topRatio: 0.66 });
    embers = Array.from({ length: Math.round((preview ? 12 : 46) * quality) }, () => ({ x: fireX + random(-30, 30), y: fireY, vx: random(-14, 14), vy: random(-70, -18), life: random(0.2, 1), size: random(0.9, 2.6), seed: random(0, 90) }));
    namePoints = showName
      ? scaledNameTargets(shape, width, height, Math.round((preview ? 42 : 190)), 0.38, preview ? 0.25 : 0.15, { x: 0, y: -height * 0.24 })
      : [];
    fire.configure({ x: fireX, y: fireY, baseWidth: Math.max(16, Math.min(width, height) * (preview ? 0.06 : 0.085)), flameHeight: height * (preview ? 0.2 : 0.17) });
  }

  function ridge(seed) {
    const points = [];
    for (let index = 0; index <= 26; index++) {
      const t = index / 26;
      const bump = fbm2(t * 2.6 + seed, seed * 3.1, { octaves: 3, seed: Math.round(seed * 31) });
      points.push([t * width, horizon - height * (0.04 + bump * 0.05 + 0.055)]);
    }
    return points;
  }

  function drawLogs(light, time) {
    const logLength = Math.max(28, Math.min(width, height) * 0.13);
    const thickness = Math.max(6, logLength * 0.19);
    ctx.save();
    ctx.lineCap = "round";
    for (const log of logs) {
      const cx = fireX + log.dx * logLength * 0.55;
      const cy = fireY + log.dy * logLength;
      const len = logLength * log.length;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(log.angle);
      // Bark
      const bark = ctx.createLinearGradient(0, -thickness, 0, thickness);
      bark.addColorStop(0, "#3b2a22");
      bark.addColorStop(0.5, "#241a15");
      bark.addColorStop(1, "#140e0c");
      ctx.fillStyle = bark;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-len / 2, -thickness / 2, len, thickness, thickness / 2) : ctx.rect(-len / 2, -thickness / 2, len, thickness);
      ctx.fill();
      // Grain
      ctx.strokeStyle = "rgba(120,88,66,.28)";
      ctx.lineWidth = 1;
      for (let index = 0; index < 3; index++) {
        const y = -thickness / 2 + thickness * (0.28 + index * 0.22);
        ctx.beginPath();
        ctx.moveTo(-len * 0.42, y);
        ctx.quadraticCurveTo(0, y + Math.sin(index + 1) * 1.6, len * 0.42, y);
        ctx.stroke();
      }
      // Embers glowing inside the wood, breathing with the fire
      const coalGlow = 0.35 + light * 0.65;
      for (let index = 0; index < 7; index++) {
        const t = index / 6;
        const x = -len * 0.36 + t * len * 0.72;
        const y = Math.sin(index * 2.1) * thickness * 0.18;
        const hot = coalGlow * (0.35 + flicker(time + index, index * 3.3, { speed: 1.4 }) * 0.75);
        drawGlowDot(ctx, x, y, thickness * 0.16, `rgba(255,${Math.round(90 + hot * 90)},${Math.round(30 + hot * 40)},${clamp(hot, 0, 1) * 0.85})`, thickness * 0.55, 1);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function frame(dt, time) {
    const light = fire.light;
    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#04081a");
    sky.addColorStop(0.42, "#0a1226");
    sky.addColorStop(0.72, "#1a1b30");
    sky.addColorStop(1, "#0b0f16");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Moon and halo
    const moonX = width * 0.78;
    const moonY = height * 0.17;
    const moonR = Math.min(width, height) * 0.045;
    const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.6, moonX, moonY, moonR * 7);
    halo.addColorStop(0, "rgba(178,205,255,.20)");
    halo.addColorStop(0.4, "rgba(140,175,255,.07)");
    halo.addColorStop(1, "rgba(120,160,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(moonX - moonR * 7, moonY - moonR * 7, moonR * 14, moonR * 14);
    ctx.fillStyle = "#e8eeff";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(10,16,32,.16)";
    ctx.beginPath();
    ctx.arc(moonX - moonR * 0.35, moonY - moonR * 0.2, moonR * 0.28, 0, TAU);
    ctx.fill();

    drawTwinklingStars(ctx, stars, time, { color: "#dfe8ff", base: 0.3 });

    // Distant ridge and tree line
    ctx.fillStyle = "#080d1a";
    ctx.beginPath();
    ctx.moveTo(0, horizon + 20);
    for (let index = 0; index <= 26; index++) {
      const t = index / 26;
      const bump = fbm2(t * 2.6 + 1.7, 4.2, { octaves: 3, seed: 5 });
      ctx.lineTo(t * width, horizon - height * (0.03 + bump * 0.05 + 0.05));
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    const groundY = height * 0.745;
    const ground = ctx.createLinearGradient(0, groundY - height * 0.05, 0, height);
    ground.addColorStop(0, "#0d1319");
    ground.addColorStop(0.35, "#121a1c");
    ground.addColorStop(1, "#070b0e");
    ctx.fillStyle = ground;
    ctx.fillRect(0, groundY - height * 0.05, width, height - groundY + height * 0.05);

    // Firelight on the ground: a pool that breathes with the flame
    const poolRadius = Math.min(width, height) * (0.42 + light * 0.16);
    const pool = ctx.createRadialGradient(fireX, fireY, 4, fireX, fireY, poolRadius);
    pool.addColorStop(0, rgba("#ff9a45", 0.4 * (0.55 + light * 0.6)));
    pool.addColorStop(0.35, rgba("#e8622a", 0.16 * (0.55 + light * 0.6)));
    pool.addColorStop(1, rgba("#ff6a2a", 0));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(fireX, fireY + height * 0.02, poolRadius, poolRadius * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Pines, rim-lit on the side facing the fire
    const treeCount = preview ? 6 : 13;
    for (let index = 0; index <= treeCount; index++) {
      const t = index / treeCount;
      const x = t * width + noise2(index * 3.7, 11) * width * 0.02;
      const distance = Math.abs(t - 0.5) * 2;
      const treeHeight = height * (0.16 + (1 - distance) * 0.1 + noise2(index * 1.7, 3) * 0.03);
      const sway = drift(time, index * 2.3, { speed: 0.16, amount: 4 }) + Math.sin(time * 0.7 + index) * 1.2;
      const baseY = groundY + height * 0.06 * (0.4 + distance * 0.6);
      drawPine(ctx, x, baseY, treeHeight, index % 2 ? "#060d13" : "#081219", sway, { seed: index * 5 });
      // Warm rim light on the fire-facing side
      const rim = clamp(light * (1 - distance * 0.75), 0, 1) * 0.5;
      if (rim > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = rim;
        ctx.strokeStyle = "#ff8a3c";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - Math.sign(x - fireX) * treeHeight * 0.001 + sway, baseY - treeHeight);
        ctx.lineTo(x + Math.sign(fireX - x) * treeHeight * 0.13 + sway, baseY - treeHeight * 0.4);
        ctx.lineTo(x + sway, baseY);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawLogs(light, time);

    // The fire itself
    fire.configure({ x: fireX, y: fireY - Math.min(width, height) * 0.012 });
    fire.update(dt, time, { wind: drift(time, 3.1, { speed: 0.11, amount: 0.35 }), intensity: 1, turbulence: 1 });
    fire.draw(ctx, { smokeAlpha: preview ? 0.5 : 1 });
    fire.drawGlow(ctx, { radius: Math.min(width, height) * 0.5, color: [255, 146, 60], strength: preview ? 0.4 : 0.6 });

    // Loose embers carried above the flame
    for (const ember of embers) {
      ember.vy -= 26 * dt;
      ember.vy += 12 * dt * (1 - ember.life);
      ember.vx += Math.sin(time * 1.3 + ember.seed) * 22 * dt + drift(time, ember.seed, { speed: 0.5, amount: 14 }) * dt;
      ember.vx *= Math.exp(-0.7 * dt);
      ember.vy *= Math.exp(-0.55 * dt);
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
      ember.life -= dt * 0.16;
      if (ember.life <= 0.02 || ember.y < height * 0.16) {
        Object.assign(ember, {
          x: fireX + random(-Math.min(width, height) * 0.05, Math.min(width, height) * 0.05),
          y: fireY - Math.min(width, height) * 0.01,
          vx: random(-18, 18),
          vy: random(-95, -30),
          life: random(0.45, 1),
          size: random(0.9, 2.6),
          seed: random(0, 90)
        });
      }
      drawGlowDot(ctx, ember.x, ember.y, ember.size, `rgba(255,${Math.round(120 + ember.life * 90)},${Math.round(40 + ember.life * 60)},${clamp(ember.life, 0, 1)})`, ember.size * 6, clamp(ember.life * 0.9, 0, 1));
    }

    // Name: embers settle into the letters, the letters glow, the fire takes it back
    const cycle = time % 22;
    const gather = showName ? smoothstep(3.4, 6.4, cycle) * (1 - smoothstep(14.5, 18.4, cycle)) : 0;
    if (showName && gather > 0.01 && namePoints.length) {
      for (let index = 0; index < namePoints.length; index++) {
        const point = namePoints[index];
        const settle = clamp((gather - index / namePoints.length * 0.35) * 1.5, 0, 1);
        const glow = 0.35 + flicker(time * 1.2, index * 0.7, { speed: 2.6 }) * 0.75;
        const jitter = Math.sin(time * 2 + index) * 1.4;
        drawGlowDot(ctx, point.x + jitter, point.y, 1.1 + settle * 1.5, index % 5 === 0 ? "#fff0c2" : "#ffab4d", 10, gather * settle * glow);
      }
    }
    if (showName && gather > 0.12) {
      const hold = smoothstep(0.25, 0.85, gather);
      drawStyledName(ctx, name, width / 2, height * 0.27, {
        style,
        size: Math.min(height * 0.12, width * 0.105),
        maxWidth: width * 0.62,
        maxHeight: height * 0.14,
        language,
        time,
        alpha: hold * 0.92,
        glow: 1.15,
        paint: (context, { size }) => {
          const gradient = context.createLinearGradient(0, -size * 0.55, 0, size * 0.55);
          gradient.addColorStop(0, rgba("#ffe6bd", 0.5));
          gradient.addColorStop(0.55, rgba("#ffb968", 0.86));
          gradient.addColorStop(1, rgba("#ff7a2e", 0.95));
          return gradient;
        },
        perLetter: ({ index, count, progress, time: now }) => {
          const delay = (index / Math.max(1, count)) * 0.5;
          const local = clamp((progress - delay) / 0.5, 0, 1);
          const emberHeat = flicker(now * 1.1, index * 4.1, { speed: 2.2 });
          return {
            dy: (1 - local) * 26,
            alpha: local * (0.72 + emberHeat * 0.28),
            scaleY: 0.9 + local * 0.1,
            glow: 0.7 + emberHeat * 0.6
          };
        },
        progress: hold
      });
    }

    drawVignette(ctx, width, height, 0.42);

    if (time >= nextCrackle) {
      emitSound("crackle");
      nextCrackle += 2.5 + (noise2(crackleIndex * 1.7, 7) * 0.5 + 0.5) * 2.6;
      crackleIndex++;
    }
  }

  return { resize, frame, destroy() {} };
}
