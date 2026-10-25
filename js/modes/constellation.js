import { setup2D, clamp, random, smoothstep, rgba, drawStyledName, drawVignette, drawSphereDot, depthFalloff } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3, noise2, easeOutCubic } from "../motion.js";

/**
 * Particle Constellation.
 *
 * Free nodes drift on slow noise currents and link up when they pass close.
 * On the gathering beat the named nodes are handed a position in the lettering
 * and travel there with their own reaction times, so the name assembles ragged
 * at first and then snaps into focus — and the links between them draw the
 * strokes. Then they are released back into the dark.
 */
export function createMode({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#070a1d");
  const { ctx } = surface;
  const style = typeStyle("constellation");
  let width = 1;
  let height = 1;
  let nodes = [];
  let lastCue = 0;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const targetPoints = showName
      ? scaledNameTargets(shape, w, h, preview ? 60 : 150, 0.56, preview ? 0.32 : 0.22)
      : [];
    const extra = Math.round(preview ? 26 : 74);
    const count = targetPoints.length + extra;
    nodes = Array.from({ length: count }, (_, index) => {
      const target = targetPoints[index % Math.max(1, targetPoints.length)];
      const homeX = random(0, w);
      const homeY = random(0, h);
      return {
        x: homeX,
        y: homeY,
        vx: random(-6, 6),
        vy: random(-6, 6),
        homeX,
        homeY,
        named: index < targetPoints.length,
        tx: target?.x ?? homeX,
        ty: target?.y ?? homeY,
        delay: random(0, 0.6),
        // Depth lives on its own axis (0 near .. 1 far). The field parallaxes:
        // far nodes drift slower and sit dimmer, so the web has volume
        // instead of being one sheet of dots at the same distance.
        depth: random(0, 1),
        r: random(0.9, 2.4),
        phase: random(0, Math.PI * 2),
        seed: random(0, 50)
      };
    });
  }

  function frame(dt, time) {
    const cycle = time % 18;
    const gather = showName ? smoothstep(3.4, 7.2, cycle) * (1 - smoothstep(12.4, 16, cycle)) : 0;
    const release = showName ? smoothstep(16, 17.6, cycle) : 0;

    ctx.fillStyle = "rgba(4,7,19,.24)";
    ctx.fillRect(0, 0, width, height);

    const linkRadius = Math.min(width, height) * (preview ? 0.22 : 0.12);

    for (const node of nodes) {
      if (node.named && gather > 0.001 && release < 0.5) {
        const local = easeOutCubic(clamp((gather - node.delay * 0.55) / (1 - node.delay * 0.55), 0, 1));
        const wobble = fbm3(node.seed, time * 0.4, node.phase, { octaves: 2, seed: 5 }) * 2.4;
        const targetX = node.tx + wobble;
        const targetY = node.ty + wobble * 0.8;
        // Travel with weight, not by teleporting along an easing curve.
        node.vx += (targetX - node.x) * (5.5 + local * 8) * dt;
        node.vy += (targetY - node.y) * (5.5 + local * 8) * dt;
        node.vx *= Math.exp(-3.4 * dt);
        node.vy *= Math.exp(-3.4 * dt);
      } else if (release > 0) {
        const angle = Math.atan2(node.y - height / 2, node.x - width / 2);
        node.vx += Math.cos(angle) * release * 120 * dt;
        node.vy += Math.sin(angle) * release * 120 * dt;
      } else {
        const driftX = fbm3(node.x * 0.0012, node.y * 0.0012, time * 0.06, { octaves: 2, seed: 9 }) * 26;
        const driftY = fbm3(node.y * 0.0012 + 4, node.x * 0.0012, time * 0.05, { octaves: 2, seed: 13 }) * 26;
        // Parallax: distant nodes crawl, near ones wander faster.
        const pace = 1 - node.depth * 0.68;
        node.vx += (driftX * pace - node.vx) * dt * 0.9;
        node.vy += (driftY * pace - node.vy) * dt * 0.9;
      }
      node.x += node.vx * dt;
      node.y += node.vy * dt;

      if (!node.named && (node.x < -30 || node.x > width + 30 || node.y < -30 || node.y > height + 30)) {
        node.x = random(0, width);
        node.y = random(0, height);
        node.vx = random(-6, 6);
        node.vy = random(-6, 6);
      }
    }

    // Links — proximity in screen space, but opacity also carries depth so a
    // line between two far nodes fades into the haze like it would in air.
    ctx.save();
    ctx.lineCap = "round";
    const stride = preview ? 2 : 1;
    for (let i = 0; i < nodes.length; i += stride) {
      const a = nodes[i];
      let links = 0;
      for (let j = i + 1; j < nodes.length && links < 4; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);
        if (distance > linkRadius) continue;
        const strength = 1 - distance / linkRadius;
        const haze = 1 - ((a.depth + b.depth) / 2) * 0.55;
        const bothNamed = a.named && b.named && gather > 0.1;
        ctx.strokeStyle = bothNamed
          ? `rgba(168,222,255,${(0.28 + gather * 0.5) * strength})`
          : `rgba(150,168,255,${0.1 * strength * haze})`;
        ctx.lineWidth = bothNamed ? 1.25 : Math.max(0.35, 0.7 * haze);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        links++;
      }
    }
    ctx.restore();

    // Nodes: shaded spheres, dimmed and softened by their own depth layer.
    for (const node of nodes) {
      const twinkle = 0.6 + noise2(node.seed, time * 1.2) * 0.45;
      const named = node.named && gather > 0.05;
      const far = depthFalloff(node.named ? node.depth * 0.25 : node.depth, { minAlpha: 0.16 });
      const base = named
        ? clamp(0.35 + gather * 0.65 * twinkle, 0, 1)
        : clamp((0.35 + twinkle * 0.3) * far.alpha, 0, 1);
      drawSphereDot(ctx, node.x, node.y, (named ? node.r * 1.5 : node.r) * far.scale, named ? "#bfe3ff" : "#9c8cf5", {
        alpha: base,
        core: "#ffffff",
        rim: "#5f57b8",
        blur: named ? 8 : 4 + far.blur
      });
    }

    if (showName && gather > 0.22) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: Math.min(height * 0.16, width * 0.085),
        maxWidth: width * 0.6,
        maxHeight: height * 0.2,
        minSize: 11,
        language,
        time,
        alpha: smoothstep(0.35, 0.95, gather) * 0.5,
        glow: 0.9,
        paint: (context, { size }) => {
          const gradient = context.createLinearGradient(-size * 2, -size, size * 2, size);
          gradient.addColorStop(0, rgba("#cde8ff", 0.8));
          gradient.addColorStop(1, rgba("#a9c4ff", 0.55));
          return gradient;
        },
        perLetter: ({ index, count, progress, time: now }) => {
          const delay = (index / Math.max(1, count)) * 0.5;
          const local = clamp((progress - delay) / 0.5, 0, 1);
          return { alpha: local * (0.8 + noise2(index * 3.3, now * 1.1) * 0.25) };
        },
        progress: gather
      });
    }

    drawVignette(ctx, width, height, 0.4);

    const cycleNo = Math.floor(time / 18);
    if (cycleNo !== lastCue && cycle < 0.25) {
      lastCue = cycleNo;
      emitSound("twinkle");
    }
  }

  return { resize, frame, destroy() {} };
}
