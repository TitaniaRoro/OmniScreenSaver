import { nameSize,
  setup2D, TAU, clamp, lerp, smoothstep, rgba,
  drawStyledName, drawGlowDot, drawVignette, makeStarField, drawTwinklingStars
} from "./common.js";
import { typeStyle } from "./type-styles.js";
import { createFire } from "./fire.js";
import { waveHeight, noise2 } from "../motion.js";

/**
 * Beach Bonfire.
 *
 * Swell travels in from the horizon, steepens as the water shallows, breaks
 * into foam and runs up the sand. The tide writes the name into the wet sand
 * as it comes in and takes it back on the way out. A small fire burns on the
 * sand and throws its light across the wet patch.
 */
export function createMode({ canvas, name, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#081026");
  const { ctx } = surface;
  const style = typeStyle("beach");
  const fire = createFire({ quality: preview ? 0.42 : 1, seed: 31 });
  let width = 1;
  let height = 1;
  let stars = [];
  let lastWave = -1;
  let fireX = 0;
  let fireY = 0;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    stars = makeStarField(Math.round((preview ? 34 : 110) * clamp(width / 900, 0.6, 1.6)), width, height, { topRatio: 0.5 });
    fireX = width * (preview ? 0.5 : 0.31);
    fireY = height * (preview ? 0.8 : 0.82);
    fire.configure({
      x: fireX,
      y: fireY,
      baseWidth: Math.max(12, Math.min(width, height) * (preview ? 0.05 : 0.07)),
      flameHeight: height * (preview ? 0.16 : 0.13)
    });
  }

  function seaGradient(horizon, shoreY) {
    const gradient = ctx.createLinearGradient(0, horizon, 0, shoreY);
    gradient.addColorStop(0, "#123149");
    gradient.addColorStop(0.35, "#123a55");
    gradient.addColorStop(0.75, "#174a63");
    gradient.addColorStop(1, "#2b6a74");
    return gradient;
  }

  function drawWaveFronts(horizon, shoreY, time) {
    const fronts = preview ? 5 : 9;
    ctx.save();
    ctx.lineCap = "round";
    for (let index = 0; index < fronts; index++) {
      const p = ((index / fronts) + time * 0.055) % 1;
      const y = lerp(horizon + 2, shoreY, p * p * 0.98 + 0.02);
      const depth = p;
      const amplitude = lerp(1.2, 7.5, depth * depth);
      const alpha = lerp(0.1, 0.42, depth) * (0.55 + 0.45 * Math.sin(time * 1.3 + index));
      ctx.strokeStyle = `rgba(198,236,255,${clamp(alpha, 0.05, 0.5)})`;
      ctx.lineWidth = lerp(0.7, 2.2, depth);
      ctx.beginPath();
      for (let x = 0; x <= width; x += Math.max(6, width / 90)) {
        const h = waveHeight(x + index * 90, time, { amplitude, wavelength: lerp(90, 320, depth), speed: 0.9, octaves: 2, seed: index * 3 });
        const yy = y + h * (0.35 + depth * 0.9);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      // Foam where the wave is about to break
      if (depth > 0.9) {
        ctx.globalAlpha = (depth - 0.9) * 3.2;
        ctx.strokeStyle = "rgba(233,250,255,.5)";
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function drawMoonGlitter(moonX, horizon, shoreY, time) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let index = 0; index < (preview ? 16 : 46); index++) {
      const t = (index / 46 + (time * 0.06) % 1) % 1;
      const y = lerp(horizon + 4, shoreY, t * t);
      const spread = lerp(width * 0.02, width * 0.17, t);
      const wobble = noise2(index * 1.7, time * 0.5) * spread * 0.6;
      const x = moonX + wobble + Math.sin(time * 0.8 + index) * spread * 0.25;
      const length = lerp(6, width * 0.035, t) * (0.5 + Math.abs(noise2(index * 0.9, time * 1.1)) * 1.4);
      const alpha = clamp((1 - t) * 0.5 * (0.4 + 0.6 * Math.abs(noise2(index * 3.3, time * 1.6))), 0, 0.6);
      if (alpha < 0.02) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffe9c8";
      ctx.fillRect(x - length / 2, y, length, Math.max(1, lerp(1, 2.4, t)));
    }
    ctx.restore();
  }

  function frame(dt, time) {
    const horizon = height * 0.44;
    const shoreY = height * 0.7;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#060d24");
    sky.addColorStop(0.5, "#122246");
    sky.addColorStop(0.82, "#3b3a5a");
    sky.addColorStop(1, "#7b5a6a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon + 1);

    const moonX = width * (preview ? 0.5 : 0.71);
    const moonY = height * 0.17;
    const moonR = Math.min(width, height) * 0.04;
    const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 8);
    halo.addColorStop(0, "rgba(255,226,192,.26)");
    halo.addColorStop(0.35, "rgba(255,214,186,.09)");
    halo.addColorStop(1, "rgba(255,212,186,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(moonX - moonR * 8, moonY - moonR * 8, moonR * 16, moonR * 16);
    ctx.fillStyle = "#ffeccd";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(214,196,180,.22)";
    ctx.beginPath();
    ctx.arc(moonX - moonR * 0.3, moonY - moonR * 0.15, moonR * 0.3, 0, TAU);
    ctx.fill();

    drawTwinklingStars(ctx, stars, time, { color: "#e6ecff", base: 0.24 });

    ctx.fillStyle = seaGradient(horizon, shoreY);
    ctx.fillRect(0, horizon, width, shoreY - horizon);
    drawWaveFronts(horizon, shoreY, time);
    drawMoonGlitter(moonX, horizon, shoreY, time);

    // Tide: the edge of the water walks up the sand and back down again
    const tide = (Math.sin(time * 0.26) + Math.sin(time * 0.11 + 1.3) * 0.6) * 0.5;
    const wash = smoothstep(-0.35, 0.85, tide);
    const edgeY = shoreY - wash * height * 0.055;

    // Sand
    const sand = ctx.createLinearGradient(0, shoreY - height * 0.02, 0, height);
    sand.addColorStop(0, "#4a3a3c");
    sand.addColorStop(0.22, "#7c5a4c");
    sand.addColorStop(0.6, "#8c6450");
    sand.addColorStop(1, "#5a3f3a");
    ctx.fillStyle = sand;
    ctx.fillRect(0, shoreY - height * 0.02, width, height - shoreY + height * 0.02);

    // Grain
    if (!preview) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = "#ffe6c8";
      for (let index = 0; index < 120; index++) {
        const x = (noise2(index * 3.1, 5) * 0.5 + 0.5) * width;
        const y = shoreY + (noise2(index * 1.3, 9) * 0.5 + 0.5) * (height - shoreY);
        ctx.fillRect(x, y, 1.4, 1.4);
      }
      ctx.restore();
    }

    // Wet sand: darker, with a sheen that follows the water line
    const wetTop = edgeY;
    const wet = ctx.createLinearGradient(0, wetTop, 0, shoreY + height * 0.02);
    wet.addColorStop(0, "rgba(28,44,52,.55)");
    wet.addColorStop(0.4, "rgba(46,58,62,.32)");
    wet.addColorStop(1, "rgba(70,60,58,0)");
    ctx.fillStyle = wet;
    ctx.fillRect(0, wetTop, width, shoreY + height * 0.02 - wetTop);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.16 + wash * 0.18;
    ctx.fillStyle = "#cfe9ff";
    ctx.fillRect(0, wetTop - 1, width, 1.6);
    ctx.restore();

    // Foam edge riding the water line
    ctx.save();
    for (let x = 0; x <= width; x += Math.max(5, width / 120)) {
      const h = waveHeight(x, time * 1.6, { amplitude: 4 + wash * 5, wavelength: 140, speed: 1.4, octaves: 2, seed: 4 });
      const blob = Math.abs(noise2(x * 0.02, time * 1.1)) * 3.4;
      ctx.globalAlpha = 0.25 + blob * 0.14;
      ctx.fillStyle = "#f2fbff";
      ctx.fillRect(x, edgeY + h, Math.max(5, width / 120), 1.8 + blob);
    }
    ctx.restore();

    // Firelight on the sand
    fire.update(dt, time, { wind: Math.sin(time * 0.23) * 0.35, intensity: 1, turbulence: 1 });
    fire.drawGlow(ctx, { radius: Math.min(width, height) * 0.42, color: [255, 150, 74], strength: preview ? 0.35 : 0.55 });
    ctx.save();
    ctx.strokeStyle = "#4a3428";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(5, height * 0.014);
    ctx.beginPath();
    ctx.moveTo(fireX - height * 0.035, fireY + height * 0.012);
    ctx.lineTo(fireX + height * 0.04, fireY + height * 0.03);
    ctx.moveTo(fireX - height * 0.03, fireY + height * 0.03);
    ctx.lineTo(fireX + height * 0.035, fireY + height * 0.008);
    ctx.stroke();
    const coal = 0.4 + fire.light * 0.6;
    drawGlowDot(ctx, fireX, fireY + height * 0.012, height * 0.012, `rgba(255,${Math.round(110 + coal * 70)},60,${coal * 0.7})`, height * 0.05, 1);
    ctx.restore();
    fire.draw(ctx, { smokeAlpha: preview ? 0.4 : 0.9 });

    // The name is written where the water has just been: carved, then taken back
    if (showName) {
      const written = wash;
      const nameY = height * (preview ? 0.88 : 0.9);
      drawStyledName(ctx, name, width / 2, nameY, {
        style,
        size: nameSize(style, width, height),
        maxWidth: width * 0.68,
        maxHeight: height * 0.08,
        minSize: 10,
        language,
        time,
        alpha: 0.95,
        glow: 0.35,
        paint: (context) => "rgba(46,28,24,.72)",
        effects: [],
        shadowColor: "rgba(255,214,176,.5)",
        shadowBlur: Math.max(3, height * 0.012),
        perLetter: ({ index, count, time: now, x }) => {
          const sweep = (index / Math.max(1, count)) * 0.55;
          const local = clamp((written - sweep) / 0.45, 0, 1);
          const surfaceWave = waveHeight(x, now, { amplitude: 5, wavelength: 240, speed: 0.8, octaves: 2, seed: 3 });
          const slope = (waveHeight(x + 3, now, { amplitude: 5, wavelength: 240, speed: 0.8, octaves: 2, seed: 3 })
            - waveHeight(x - 3, now, { amplitude: 5, wavelength: 240, speed: 0.8, octaves: 2, seed: 3 })) / 6;
          return {
            alpha: local,
            dy: (1 - local) * height * 0.012 + surfaceWave * 0.14,
            rotate: Math.atan(slope * 0.14),
            scaleY: lerp(0.6, 1, local)
          };
        },
        progress: written
      });
      // Wet highlight along the top of each carved letter
      drawStyledName(ctx, name, width / 2, nameY - Math.max(1, height * 0.004), {
        style,
        size: nameSize(style, width, height),
        maxWidth: width * 0.68,
        maxHeight: height * 0.08,
        minSize: 10,
        language,
        time,
        alpha: 0.5,
        glow: 0,
        shadowBlur: 0,
        paint: () => "rgba(255,233,205,.4)",
        effects: [],
        perLetter: ({ index, count, time: now, x }) => {
          const sweep = (index / Math.max(1, count)) * 0.55;
          const local = clamp((written - sweep) / 0.45, 0, 1);
          const surfaceWave = waveHeight(x, now, { amplitude: 5, wavelength: 240, speed: 0.8, octaves: 2, seed: 3 });
          const slope = (waveHeight(x + 3, now, { amplitude: 5, wavelength: 240, speed: 0.8, octaves: 2, seed: 3 })
            - waveHeight(x - 3, now, { amplitude: 5, wavelength: 240, speed: 0.8, octaves: 2, seed: 3 })) / 6;
          return {
            alpha: local * 0.8,
            dy: (1 - local) * height * 0.012 + surfaceWave * 0.14,
            rotate: Math.atan(slope * 0.14),
            scaleY: lerp(0.6, 1, local)
          };
        },
        progress: written
      });
      // Firelight warms the letters closest to the fire
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + fire.light * 0.16 * written;
      ctx.fillStyle = "#ff9a4e";
      ctx.fillRect(width * 0.2, nameY - height * 0.05, width * 0.6, height * 0.08);
      ctx.restore();
    }

    drawVignette(ctx, width, height, 0.38);

    const waveNo = Math.floor(time / 5.5);
    if (waveNo !== lastWave) {
      lastWave = waveNo;
      emitSound("wave");
    }
  }

  return { resize, frame, destroy() {} };
}
