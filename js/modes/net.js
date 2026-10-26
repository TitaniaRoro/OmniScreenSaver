import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { noise2 } from "../motion.js";

/**
 * Neural Network (after vanta.js `net`).
 *
 * Nodes drift through a shallow 3D volume; pairs link whenever they come close,
 * and pulses of light travel along the live links like signals crossing a mesh.
 * When the name gathers, letterform nodes are handed their place on the strokes,
 * so for a moment the wiring diagram *is* the lettering — before the pull lets
 * go and the net relaxes back into static snow.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#04070f");
  const { ctx } = surface;
  const style = typeStyle("net");
  let width = 1;
  let height = 1;
  let nodes = [];
  let links = [];
  let pulses = [];
  let lastCue = 0;
  let lastPulse = 0;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 50 : 160, 0.52, 0.22) : [];
    const freeCount = preview ? 26 : 90;
    const count = targets.length + freeCount;
    nodes = Array.from({ length: count }, (_, index) => {
      const target = targetAt(targets, index);
      const homeX = random(0, w);
      const homeY = random(0, h);
      return {
        x: random(0, w),
        y: random(0, h),
        vx: random(-8, 8),
        vy: random(-8, 8),
        homeX,
        homeY,
        named: index < targets.length,
        tx: target?.x ?? homeX,
        ty: target?.y ?? homeY,
        delay: random(0, 0.5),
        z: random(0.25, 1), // depth: nearer nodes are brighter and bigger
        r: random(1, 2.2),
        seed: random(0, 60)
      };
    });
    pulses = [];
  }

  function targetAt(targets, index) {
    return index < targets.length ? targets[index] : null;
  }

  function frame(dt, time) {
    const cycle = time % 17;
    const gather = showName ? smoothstep(3.2, 6.8, cycle) * (1 - smoothstep(12.8, 16, cycle)) : 0;

    // Trail fade keeps the signal streaks legible without smearing the whole screen.
    ctx.fillStyle = "rgba(4,7,15,.3)";
    ctx.fillRect(0, 0, width, height);

    for (const node of nodes) {
      if (node.named && gather > 0.001) {
        const local = clamp((gather - node.delay * 0.5) / (1 - node.delay * 0.5), 0, 1);
        const wob = noise2(node.seed, time * 0.5, 7) * 2.2;
        node.vx += (node.tx + wob - node.x) * (4 + local * 9) * dt;
        node.vy += (node.ty + wob * 0.7 - node.y) * (4 + local * 9) * dt;
        node.vx *= Math.exp(-3.2 * dt);
        node.vy *= Math.exp(-3.2 * dt);
      } else {
        // Idle: slow noise currents plus gentle mutual repulsion from home.
        node.vx += noise2(node.x * 0.004, node.y * 0.004, time * 0.12 + node.seed) * 14 * dt;
        node.vy += noise2(node.y * 0.004, node.x * 0.004, time * 0.12 + node.seed + 31) * 14 * dt;
        node.vx *= Math.exp(-0.5 * dt);
        node.vy *= Math.exp(-0.5 * dt);
      }
      node.x += node.vx * dt;
      node.y += node.vy * dt;
      if (node.x < -30) node.x = width + 30;
      if (node.x > width + 30) node.x = -30;
      if (node.y < -30) node.y = height + 30;
      if (node.y > height + 30) node.y = -30;
    }

    // Rebuild proximity links every frame (counts stay small enough to afford it).
    links = [];
    const maxDist = Math.min(width, height) * (preview ? 0.3 : 0.16);
    const maxDistSq = maxDist * maxDist;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDistSq) {
          const strength = 1 - Math.sqrt(d2) / maxDist;
          links.push({ a: i, b: j, strength });
        }
      }
    }

    ctx.lineWidth = preview ? 0.6 : 0.8;
    for (const link of links) {
      const a = nodes[link.a];
      const b = nodes[link.b];
      const alpha = link.strength * link.strength * (preview ? 0.55 : 0.3) * Math.min(a.z, b.z);
      ctx.strokeStyle = rgba("#5fd8ff", alpha);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Spawn travelling pulses along the strongest links.
    const pulseBudget = preview ? 6 : 26;
    if (time - lastPulse > 0.12 && pulses.length < pulseBudget && links.length) {
      lastPulse = time;
      const candidates = links.filter(link => link.strength > 0.45);
      if (candidates.length) {
        const link = candidates[Math.floor(Math.random() * candidates.length)];
        pulses.push({ link, t: 0, speed: random(0.5, 1.4), forward: Math.random() < 0.5 });
      }
    }
    ctx.globalCompositeOperation = "lighter";
    for (const pulse of pulses) {
      pulse.t += pulse.speed * dt;
      const link = links.find(entry => entry.a === pulse.link.a && entry.b === pulse.link.b);
      if (!link || pulse.t > 1) continue;
      const a = nodes[link.a];
      const b = nodes[link.b];
      const raw = pulse.forward ? pulse.t : 1 - pulse.t;
      const px = a.x + (b.x - a.x) * raw;
      const py = a.y + (b.y - a.y) * raw;
      const glow = Math.sin(pulse.t * Math.PI);
      ctx.fillStyle = rgba("#c8f6ff", glow * 0.85 * link.strength);
      ctx.beginPath();
      ctx.arc(px, py, preview ? 1.4 : 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    pulses = pulses.filter(pulse => pulse.t <= 1 && links.some(link => link.a === pulse.link.a && link.b === pulse.link.b));

    for (const node of nodes) {
      const bright = node.named ? 0.55 + gather * 0.45 : 0.4;
      ctx.fillStyle = rgba(node.named ? "#aef0ff" : "#7fb8d8", bright * node.z);
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r * node.z * (1 + gather * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.3) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.13, width * 0.07), 16, 92),
        maxWidth: width * 0.72,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp((gather - 0.3) * 1.2, 0, 0.55),
        progress: gather
      });
    }
    if (time - lastCue > 7.5) {
      lastCue = time;
      emitSound("digitalTick");
    }
  }

  return { resize, frame, destroy() {} };
}
