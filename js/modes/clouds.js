import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3, noise2 } from "../motion.js";

/**
 * Storm Clouds (after vanta.js `clouds2`).
 *
 * Volumetric-looking clouds built from layered fBm noise: several drifting
 * sheets of soft blobs at different scales and speeds, lit from a hidden moon.
 * Gusts push the whole sky sideways; when the name rises it condenses out of
 * the vapour — dark letterforms edged with silver lining, then dissolve back
 * into the weather.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#0b1020");
  const { ctx } = surface;
  const style = typeStyle("clouds");
  let width = 1;
  let height = 1;
  let puffs = [];
  let targets = [];
  let lastCue = 0;
  let lastFlash = -10;
  let flashEnergy = 0;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const count = preview ? 60 : 240;
    puffs = Array.from({ length: count }, () => makePuff(true));
    targets = showName ? scaledNameTargets(shape, w, h, preview ? 40 : 130, 0.5, 0.2) : [];
  }

  function makePuff(initial) {
    const layer = Math.floor(random(0, 3)); // 0 far .. 2 near
    return {
      x: initial ? random(-0.1, 1.1) * width : -width * 0.25,
      y: random(0.05, 0.9) * height,
      r: (preview ? 26 : 70) * [0.55, 0.85, 1.3][layer] * random(0.7, 1.4),
      layer,
      speed: [6, 14, 26][layer] * random(0.7, 1.3),
      seed: random(0, 60),
      alpha: [0.1, 0.16, 0.22][layer]
    };
  }

  function frame(dt, time) {
    const cycle = time % 21;
    const gather = showName ? smoothstep(4, 8, cycle) * (1 - smoothstep(15, 19, cycle)) : 0;

    // Sky gradient: deep storm blue with a faint moon glow high on the right.
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0a0f22");
    sky.addColorStop(0.55, "#101731");
    sky.addColorStop(1, "#0c1124");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const moonX = width * 0.78;
    const moonY = height * 0.2;
    const halo = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, Math.min(width, height) * 0.5);
    halo.addColorStop(0, "rgba(190,205,255,0.16)");
    halo.addColorStop(1, "rgba(190,205,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(226,234,255,0.5)";
    ctx.beginPath();
    ctx.arc(moonX, moonY, preview ? 5 : 10, 0, Math.PI * 2);
    ctx.fill();

    // Occasional sheet lightning illuminates the cloud undersides.
    if (time - lastFlash > random(9, 16) && !preview) {
      lastFlash = time;
      flashEnergy = random(0.35, 0.8);
      emitSound("firework");
    }
    const flash = flashEnergy * Math.exp(-(time - lastFlash) * 6) * (0.6 + 0.4 * Math.sin(time * 47));
    if (flash > 0.02) {
      ctx.fillStyle = rgba("#cfdcff", flash * 0.14);
      ctx.fillRect(0, 0, width, height);
    }

    const gust = 0.5 + 0.5 * Math.sin(time * 0.07) + 0.3 * noise2(time * 0.05, 8, 2);

    for (const puff of puffs) {
      puff.x += puff.speed * gust * dt;
      puff.y += fbm3(puff.seed, time * 0.18, 0, { octaves: 2, seed: 9 }) * 5 * dt;
      if (puff.x - puff.r > width) Object.assign(puff, makePuff(false));

      const breathe = 1 + 0.12 * noise2(puff.seed, time * 0.3, 5);
      const radius = puff.r * breathe;
      const lit = clamp((moonX - puff.x) / width, -0.3, 0.6);
      const gradient = ctx.createRadialGradient(puff.x, puff.y, radius * 0.1, puff.x, puff.y, radius);
      const coreTone = puff.layer === 2 ? 46 : 34;
      const tone = Math.round(clamp(coreTone + lit * 60, 0, 255));
      const toneGreen = Math.round(clamp(coreTone + lit * 66, 0, 255));
      const toneBlue = Math.round(clamp(coreTone + 24 + lit * 80, 0, 255));
      gradient.addColorStop(0, `rgba(${tone},${toneGreen},${toneBlue},${clamp(puff.alpha + flash * 0.1, 0, 1)})`);
      gradient.addColorStop(1, "rgba(20,26,48,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // The name condenses from vapour: silver-lined dark letterforms.
    if (showName && gather > 0.02) {
      // Soft mist gathering behind the strokes first.
      ctx.globalCompositeOperation = "lighter";
      for (const point of targets) {
        const wob = noise2(point.x * 0.01, time * 0.4, 3) * 3;
        ctx.fillStyle = rgba("#aebfe8", gather * 0.05);
        ctx.beginPath();
        ctx.arc(point.x + wob, point.y + wob * 0.6, (preview ? 8 : 16) * gather, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.16, width * 0.08), 18, 104),
        maxWidth: width * 0.72,
        maxHeight: height * 0.22,
        minSize: 12,
        language,
        time,
        alpha: clamp(gather * 0.95, 0, 0.95),
        progress: gather
      });
      if (time - lastCue > 8) {
        lastCue = time;
        emitSound("wind");
      }
    }
  }

  return { resize, frame, destroy() {} };
}
