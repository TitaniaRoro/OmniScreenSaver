import { nameSize,
  setup2D, TAU, clamp, rgba,
  drawStyledName, drawScanlines, drawVignette, makeStarField, drawTwinklingStars
} from "./common.js";
import { typeStyle } from "./type-styles.js";
import { fbm3 } from "../motion.js";

/**
 * Synthwave.
 *
 * A sun sliced by its own bands, a grid running away to the horizon with the
 * rows scrolling toward you, cloud banks drifting on noise, and chrome italics
 * hanging over it all with a reflection on the floor and scanlines through the
 * whole picture.
 */
export function createMode({ canvas, name, language = "en", showName, preview = false }) {
  const surface = setup2D(canvas, "#10132d");
  const { ctx } = surface;
  const style = typeStyle("synthwave");
  let width = 1;
  let height = 1;
  let stars = [];
  let clouds = [];

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    stars = makeStarField(preview ? 26 : 90, w, h, { topRatio: 0.5, seed: 8 });
    clouds = Array.from({ length: preview ? 2 : 5 }, (_, index) => ({
      x: (index + 0.5) / 5,
      y: 0.16 + (index % 3) * 0.06,
      scale: 0.6 + (index % 3) * 0.28,
      speed: 0.006 + (index % 3) * 0.004,
      seed: index * 7
    }));
  }

  function drawSun(horizon, time) {
    const radius = Math.min(width * 0.17, height * 0.26);
    const sunY = horizon * 0.72;
    ctx.save();
    ctx.beginPath();
    ctx.arc(width / 2, sunY, radius, Math.PI, 0);
    ctx.lineTo(width / 2 + radius, sunY);
    ctx.lineTo(width / 2 - radius, sunY);
    ctx.closePath();
    ctx.clip();
    const sun = ctx.createLinearGradient(0, sunY - radius, 0, sunY + radius);
    sun.addColorStop(0, "#fff3c4");
    sun.addColorStop(0.35, "#ffb06a");
    sun.addColorStop(0.75, "#ff5f9e");
    sun.addColorStop(1, "#c93a9b");
    ctx.fillStyle = sun;
    ctx.fillRect(width / 2 - radius, sunY - radius, radius * 2, radius * 1.2);
    // Bands, thicker towards the bottom
    for (let index = 0; index < 9; index++) {
      const t = index / 9;
      const y = sunY - radius * 0.05 + radius * (0.1 + t * t * 1.05);
      const thickness = Math.max(1.5, height * (0.004 + t * 0.01));
      ctx.fillStyle = `rgba(26,14,48,${clamp(0.25 + t * 0.7, 0, 0.92)})`;
      ctx.fillRect(width / 2 - radius, y, radius * 2, thickness);
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const bloom = ctx.createRadialGradient(width / 2, sunY, radius * 0.4, width / 2, sunY, radius * 2.6);
    bloom.addColorStop(0, "rgba(255,120,170,.3)");
    bloom.addColorStop(1, "rgba(255,90,150,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(width / 2 - radius * 2.6, sunY - radius * 2.6, radius * 5.2, radius * 5.2);
    ctx.restore();
  }

  function drawClouds(time) {
    ctx.save();
    for (const cloud of clouds) {
      const x = ((cloud.x + time * cloud.speed) % 1.3 - 0.15) * width;
      const y = cloud.y * height;
      const w = width * 0.28 * cloud.scale;
      const h = height * 0.05 * cloud.scale;
      const gradient = ctx.createLinearGradient(0, y - h, 0, y + h);
      gradient.addColorStop(0, "rgba(255,150,190,.16)");
      gradient.addColorStop(1, "rgba(120,80,190,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      for (let index = 0; index < 5; index++) {
        const bump = fbm3(index * 1.7 + cloud.seed, time * 0.05, cloud.seed, { octaves: 2, seed: cloud.seed });
        const bx = x + (index / 4 - 0.5) * w;
        const by = y + bump * h * 0.5;
        ctx.moveTo(bx + w * 0.18, by);
        ctx.ellipse(bx, by, w * 0.2, h * (0.5 + Math.abs(bump) * 0.6), 0, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMountains(horizon) {
    ctx.save();
    ctx.fillStyle = "rgba(18,16,44,.94)";
    ctx.beginPath();
    ctx.moveTo(0, horizon + 4);
    for (let x = 0; x <= width; x += Math.max(8, width / 60)) {
      const peak = Math.abs(fbm3(x * 0.0022, 5.4, 0, { octaves: 3, seed: 12 }));
      ctx.lineTo(x, horizon - peak * height * 0.16);
    }
    ctx.lineTo(width, horizon + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,120,200,.35)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawGrid(horizon, time) {
    ctx.save();
    ctx.strokeStyle = "rgba(94,246,224,.5)";
    ctx.shadowColor = "rgba(94,246,224,.6)";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1;
    const columns = 15;
    for (let index = 0; index <= columns; index++) {
      const t = index / columns;
      ctx.beginPath();
      ctx.moveTo(width / 2 + (t - 0.5) * width * 0.04, horizon);
      ctx.lineTo(width / 2 + (t - 0.5) * width * 2.6, height);
      ctx.stroke();
    }
    const rows = preview ? 8 : 16;
    const phase = (time * 0.32) % 1;
    for (let index = 0; index < rows; index++) {
      const p = ((index / rows + phase) % 1) ** 2.4;
      const y = horizon + p * (height - horizon);
      ctx.globalAlpha = 0.14 + p * 0.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame(dt, time) {
    const horizon = height * 0.56;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#0d1030");
    sky.addColorStop(0.42, "#3a2160");
    sky.addColorStop(0.78, "#8b3a72");
    sky.addColorStop(1, "#f0808f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon + 2);

    drawTwinklingStars(ctx, stars, time, { color: "#e6d9ff", base: 0.2 });
    drawClouds(time);
    drawSun(horizon, time);
    drawMountains(horizon);

    ctx.fillStyle = "#0a0a1e";
    ctx.fillRect(0, horizon, width, height - horizon);
    drawGrid(horizon, time);

    if (showName) {
      const y = Math.min(height * 0.36, horizon - height * 0.06);
      const size = nameSize(style, width, height);
      // Reflection on the floor
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.translate(width / 2, horizon);
      ctx.scale(1, -0.38);
      drawStyledName(ctx, name, 0, y - horizon, {
        style,
        size,
        maxWidth: width * 0.72,
        maxHeight: height * 0.15,
        minSize: 12,
        language,
        time,
        alpha: 0.6,
        glow: 0.5,
        paint: (context, { size: letterSize }) => {
          const gradient = context.createLinearGradient(0, -letterSize * 0.7, 0, letterSize * 0.7);
          gradient.addColorStop(0, "rgba(255,122,192,.22)");
          gradient.addColorStop(0.6, "rgba(255,217,160,.14)");
          gradient.addColorStop(1, "rgba(142,244,255,.02)");
          return gradient;
        }
      });
      ctx.restore();

      // Extruded shadow stack behind the chrome
      for (let depth = 7; depth >= 1; depth--) {
        drawStyledName(ctx, name, width / 2 + depth * 0.8, y + depth * 1.5, {
          style,
          size,
          maxWidth: width * 0.72,
          maxHeight: height * 0.15,
          minSize: 12,
          language,
          time,
          alpha: 1,
          effects: [],
          shadowBlur: 0,
          paint: `rgba(${Math.round(70 + depth * 8)},${Math.round(20 + depth * 5)},${Math.round(90 + depth * 6)},1)`
        });
      }

      drawStyledName(ctx, name, width / 2, y, {
        style,
        size,
        maxWidth: width * 0.72,
        maxHeight: height * 0.15,
        minSize: 12,
        language,
        time,
        alpha: 1,
        glow: 1.2,
        stroke: "rgba(255,255,255,.62)",
        strokeWidth: 1.2,
        paint: (context, { size: letterSize, time: now }) => {
          const sweep = (now * 0.16) % 1;
          const gradient = context.createLinearGradient(0, -letterSize * 0.7, 0, letterSize * 0.7);
          gradient.addColorStop(0, "#fff6d8");
          gradient.addColorStop(0.24, "#ffc2e2");
          gradient.addColorStop(0.46, "#fff2fb");
          gradient.addColorStop(0.56, "#a6f2ff");
          gradient.addColorStop(0.78, "#ff8ad0");
          gradient.addColorStop(1, "#ffe0a4");
          return gradient;
        }
      });

      // A bright band travels across the chrome
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.18;
      const bandY = y - size * 0.7 + ((time * 0.4) % 1) * size * 1.6;
      const band = ctx.createLinearGradient(0, bandY - size * 0.12, 0, bandY + size * 0.12);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, "rgba(255,255,255,.85)");
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.fillRect(width * 0.12, bandY - size * 0.12, width * 0.76, size * 0.24);
      ctx.restore();
    }

    drawScanlines(ctx, 0, 0, width, height, { spacing: preview ? 6 : 4, alpha: 0.075 });
    drawVignette(ctx, width, height, 0.44);
  }

  return { resize, frame, destroy() {} };
}
