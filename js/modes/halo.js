import { setup2D, clamp, random, smoothstep, rgba, drawStyledName, TAU } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3, noise2 } from "../motion.js";

/**
 * Halo Rings (after vanta.js `halo`).
 *
 * Concentric rings of glowing points orbit a slowly wandering centre. Each ring
 * breathes — radius, tilt, and brightness all modulated by layered noise — so
 * the halo reads as volumes of light rather than flat bullseyes. On the reveal
 * beat, marked particles on the rings peel off onto the letterforms: the name
 * is assembled *from* the halo, then released back into its orbit.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#0a0614");
  const { ctx } = surface;
  const style = typeStyle("halo");
  let width = 1;
  let height = 1;
  let rings = [];
  let nameRiders = [];
  let lastCue = 0;

  const RING_COLORS = ["#ff7ad9", "#8f7bff", "#5fd8ff", "#ffd27a", "#7affc8"];

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const ringCount = preview ? 5 : 9;
    const maxRadius = Math.hypot(w, h) * 0.55;
    rings = Array.from({ length: ringCount }, (_, index) => ({
      baseRadius: maxRadius * (0.16 + (index / ringCount) * 0.9),
      dots: preview ? 26 : 70,
      speed: (index % 2 ? -1 : 1) * random(0.05, 0.16),
      phase: random(0, TAU),
      tilt: random(0.35, 0.95),
      wobbleSeed: random(0, 50),
      color: RING_COLORS[index % RING_COLORS.length],
      offset: random(-0.1, 0.1)
    }));
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 46 : 150, 0.5, 0.2) : [];
    nameRiders = targets.map((point, index) => {
      const ring = rings[index % rings.length];
      return {
        ring,
        angle: random(0, TAU),
        tx: point.x,
        ty: point.y,
        delay: random(0, 0.5),
        x: 0,
        y: 0
      };
    });
  }

  function ringPoint(ring, angle, time, cx, cy, squeeze = 1) {
    const breathe = 1 + 0.09 * fbm3(ring.wobbleSeed, time * 0.25, angle * 0.6, { octaves: 2, seed: 4 });
    const radius = ring.baseRadius * breathe * squeeze;
    const x = cx + Math.cos(angle + ring.phase) * radius;
    const y = cy + Math.sin(angle + ring.phase) * radius * ring.tilt + ring.offset * radius;
    return [x, y];
  }

  function frame(dt, time) {
    const cycle = time % 19;
    const gather = showName ? smoothstep(3.6, 7.4, cycle) * (1 - smoothstep(14, 17.4, cycle)) : 0;

    ctx.fillStyle = "rgba(10,6,20,.26)";
    ctx.fillRect(0, 0, width, height);

    // The halo centre wanders on a lazy Lissajous, never sitting still.
    const cx = width / 2 + Math.sin(time * 0.11) * width * 0.06 + noise2(time * 0.07, 3, 9) * width * 0.03;
    const cy = height / 2 + Math.cos(time * 0.083) * height * 0.08 + noise2(3, time * 0.06, 21) * height * 0.03;

    ctx.globalCompositeOperation = "lighter";

    for (const ring of rings) {
      ring.phase += ring.speed * dt;
      const intensity = 0.5 + 0.5 * Math.sin(time * 0.3 + ring.wobbleSeed);
      const dotAlpha = (preview ? 0.5 : 0.3) * (0.55 + intensity * 0.45);
      ctx.fillStyle = rgba(ring.color, dotAlpha);
      for (let index = 0; index < ring.dots; index++) {
        const angle = (index / ring.dots) * TAU;
        const [x, y] = ringPoint(ring, angle, time, cx, cy);
        const size = preview ? 1.1 : 1.5 + intensity * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      // Faint continuous ring line under the dots for body.
      ctx.strokeStyle = rgba(ring.color, dotAlpha * 0.28);
      ctx.lineWidth = preview ? 0.7 : 1;
      ctx.beginPath();
      for (let index = 0; index <= ring.dots; index++) {
        const angle = (index / ring.dots) * TAU;
        const [x, y] = ringPoint(ring, angle, time, cx, cy);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Riders: marked points that leave their ring and form the name.
    for (const rider of nameRiders) {
      let x; let y;
      if (gather > 0.001) {
        const local = clamp((gather - rider.delay * 0.5) / (1 - rider.delay * 0.5), 0, 1);
        const eased = local * local * (3 - 2 * local);
        const [rx, ry] = ringPoint(rider.ring, rider.angle, time, cx, cy);
        x = rx + (rider.tx - rx) * eased;
        y = ry + (rider.ty - ry) * eased;
        rider.angle += rider.ring.speed * dt;
      } else {
        rider.angle += rider.ring.speed * dt * 1.6;
        [x, y] = ringPoint(rider.ring, rider.angle, time, cx, cy);
      }
      rider.x = x;
      rider.y = y;
      ctx.fillStyle = rgba("#fff0ff", preview ? 0.6 : 0.35 + gather * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, preview ? 1.3 : 1.8 + gather * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bright core.
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.16);
    core.addColorStop(0, rgba("#e9d5ff", 0.32));
    core.addColorStop(1, "rgba(233,213,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(cx - width, cy - height, width * 2, height * 2);

    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.25) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.14, width * 0.075), 16, 96),
        maxWidth: width * 0.7,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp((gather - 0.25) * 1.4, 0, 0.8),
        progress: gather
      });
      if (time - lastCue > 6.5) {
        lastCue = time;
        emitSound("softChime");
      }
    }
  }

  return { resize, frame, destroy() {} };
}
