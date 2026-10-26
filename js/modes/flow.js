import { nameSize, setup2D, clamp, random, smoothstep, rgba, drawStyledName, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { curl2, fbm3, noise2 } from "../motion.js";

/**
 * Flow Field.
 *
 * Particles ride a divergence-free curl field, so they braid and fold the way
 * smoke does instead of sliding along parallel lines. When the name rises, the
 * field gently takes hold of the letterforms: particles are pulled onto the
 * strokes and swept along them, which is what makes the threads look like they
 * are weaving the name rather than colliding with it.
 */
export function createMode({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#050d18");
  const { ctx } = surface;
  const style = typeStyle("flow");
  let width = 1;
  let height = 1;
  let particles = [];
  let targets = [];
  let lastCue = 0;

  function respawn(particle) {
    // Each thread lives on its own depth layer. Far threads are slower,
    // thinner and dimmer; near ones sweep across everything else. Without
    // this the whole field reads as one sheet of identical silk ribbons.
    const depth = random(0, 1);
    Object.assign(particle, {
      x: random(-20, width + 20),
      y: random(-20, height + 20),
      px: particle?.x ?? 0,
      py: particle?.y ?? 0,
      age: random(0, 6),
      life: random(6, 15),
      hue: random(168, 250),
      speed: random(26, 108) * (0.45 + (1 - depth) * 0.9),
      weight: random(0.6, 1.5) * (0.55 + (1 - depth) * 0.85),
      depth
    });
    particle.px = particle.x;
    particle.py = particle.y;
    return particle;
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const count = Math.round(Math.min(preview ? 90 : 780, Math.max(60, (w * h) / (preview ? 4200 : 2600))));
    particles = Array.from({ length: count }, () => respawn({}));
    targets = showName ? scaledNameTargets(shape, w, h, preview ? 110 : 300, 0.5, 0.2) : [];
  }

  function frame(dt, time) {
    const cycle = time % 16;
    const reveal = showName ? smoothstep(5, 7.4, cycle) * (1 - smoothstep(11.6, 14.2, cycle)) : 0;

    ctx.fillStyle = "rgba(4,11,22,.155)";
    ctx.fillRect(0, 0, width, height);

    if (showName && reveal > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: nameSize(style, width, height),
        maxWidth: width * 0.72,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: reveal * 0.5,
        glow: 1,
        paint: (context, { size }) => {
          const gradient = context.createLinearGradient(-size * 2, 0, size * 4, 0);
          gradient.addColorStop(0, rgba("#31c8de", 0.5));
          gradient.addColorStop(0.5, rgba("#c7b2ff", 0.85));
          gradient.addColorStop(1, rgba("#4ef1cf", 0.55));
          return gradient;
        },
        perLetter: ({ index, count, progress, time: now }) => {
          const delay = (index / Math.max(1, count)) * 0.4;
          const local = clamp((progress - delay) / 0.6, 0, 1);
          return {
            alpha: local * (0.72 + noise2(index * 1.9, now * 0.9) * 0.3),
            dx: (1 - local) * 18
          };
        },
        progress: reveal
      });
      ctx.restore();
    }

    const step = Math.min(dt, 1 / 30);
    for (const particle of particles) {
      particle.px = particle.x;
      particle.py = particle.y;

      const flow = curl2(particle.x, particle.y, time * 0.6, { scale: 0.0016, seed: 7, strength: 1 });
      let vx = flow.x * particle.speed;
      let vy = flow.y * particle.speed;

      if (reveal > 0.05 && targets.length) {
        // Pull toward the nearest stroke, then slide along it.
        const target = targets[Math.floor(Math.abs(fbm3(particle.x * 0.001, particle.y * 0.001, 0, { octaves: 2, seed: 2 })) * targets.length) % targets.length];
        const dx = target.x - particle.x;
        const dy = target.y - particle.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance < Math.min(width, height) * 0.42) {
          const pull = (1 - distance / (Math.min(width, height) * 0.42)) * reveal * 130;
          const tangentX = -dy / distance;
          const tangentY = dx / distance;
          vx = vx * (1 - reveal * 0.7) + (dx / distance * pull * 0.45 + tangentX * pull) * 0.9;
          vy = vy * (1 - reveal * 0.7) + (dy / distance * pull * 0.45 + tangentY * pull) * 0.9;
        }
      }

      particle.x += vx * step;
      particle.y += vy * step;
      particle.age += step;

      if (particle.age > particle.life || particle.x < -30 || particle.x > width + 30 || particle.y < -30 || particle.y > height + 30) {
        respawn(particle);
        continue;
      }

      const speedNow = Math.hypot(vx, vy);
      const nearName = reveal > 0.08 && Math.abs(particle.x - width / 2) < width * 0.38 && Math.abs(particle.y - height / 2) < height * 0.2;
      const fade = clamp(Math.min(particle.age, particle.life - particle.age) / 1.4, 0, 1);
      // Aerial perspective: distant threads lose saturation and brightness,
      // the way haze eats detail in a real landscape.
      const haze = 1 - particle.depth * 0.62;
      ctx.strokeStyle = nearName
        ? `hsla(${particle.hue + 26}, 100%, ${74 + haze * 12}%, ${(0.16 + fade * 0.42) * (0.5 + haze * 0.5)})`
        : `hsla(${particle.hue}, ${58 + haze * 30}%, ${52 + haze * 24}%, ${(0.06 + fade * 0.2) * (0.4 + haze * 0.6)})`;
      ctx.lineWidth = (nearName ? 1.5 : 0.8) * particle.weight;
      ctx.beginPath();
      ctx.moveTo(particle.px, particle.py);
      ctx.lineTo(particle.x, particle.y);
      ctx.stroke();
    }

    drawVignette(ctx, width, height, 0.36);

    const cue = Math.floor(time / 7.5);
    if (cue !== lastCue) {
      lastCue = cue;
      emitSound("windChime");
    }
  }

  return { resize, frame, destroy() {} };
}
