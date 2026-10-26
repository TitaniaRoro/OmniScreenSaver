import { setup2D, TAU, clamp, random, measureName, rgba, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { fbm2, noise2 } from "../motion.js";

/**
 * Shattering Name.
 *
 * The freefrontend "shattering image gallery" trick, retuned for a
 * screensaver: the name is rendered once into an offscreen buffer, sliced on a
 * small grid, and every cell that actually carries ink becomes a shard with
 * its own 3D attitude. Gravity pulls the shards down *through* the plane of
 * the screen while they tumble about two axes; perspective scale plus a soft
 * ground shadow under each falling piece (drawn in "multiply") sells the
 * depth, exactly like the CSS card galleries that slice a picture into
 * fragments and drop them into space.
 *
 * The cycle breathes: the word holds and shimmers, a bright crack races
 * across it, the shards let go, fall, fade — then everything glides back and
 * reassembles out of the dark.
 */

const CYCLE = 12;          // seconds per hold → shatter → reform cycle
const CRACK_START = 2.7;   // when the visible crack begins sweeping
const SHATTER_AT = 3.5;    // release point inside the cycle
const FALL = 4.6;          // seconds of free falling
const REFORM = 2.6;        // seconds of gathering back together

export function createMode({ canvas, name, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#0b0713");
  const { ctx } = surface;
  const style = typeStyle("shatter");
  const palette = style.palette;
  const buffer = document.createElement("canvas");
  const bctx = buffer.getContext("2d");

  let shards = [];
  let dust = [];
  let width = 1;
  let height = 1;
  let releasedAt = -1;
  let reformCueAt = -1;
  let lastShatterCycle = -1;

  /** Render the name once into the buffer and cut it into falling quads. */
  function build() {
    shards = [];
    dust = [];
    releasedAt = -1;
    reformCueAt = -1;
    const text = showName ? name : "✦ ✧ ✦";
    const pad = 26;
    const size = clamp(Math.min(height * 0.3, width * 0.6), 22, 150);
    bctx.font = `${style.weight} ${size}px ${style.family}`;
    const metrics = measureName(bctx, text, style, size, language);
    const bw = Math.max(1, Math.ceil(metrics.total + pad * 2));
    const bh = Math.max(1, Math.ceil(size * 1.7 + pad * 2));
    buffer.width = bw;
    buffer.height = bh;
    bctx.clearRect(0, 0, bw, bh);
    bctx.font = `${style.weight} ${size}px ${style.family}`;
    bctx.textAlign = "left";
    bctx.textBaseline = "middle";
    bctx.fillStyle = palette.core;
    // Draw cluster by cluster so tracking behaves like drawStyledName.
    let cursor = pad;
    for (let index = 0; index < metrics.clusters.length; index++) {
      bctx.fillText(metrics.clusters[index], cursor, bh / 2);
      cursor += metrics.widths[index] + metrics.tracking;
    }

    const cell = preview ? 8 : clamp(Math.round(size / 11), 7, 13);
    const cols = Math.ceil(bw / cell);
    const rows = Math.ceil(bh / cell);
    const ox = (width - bw) / 2;
    const oy = (height - bh) / 2;
    let ink = null;
    try {
      ink = bctx.getImageData(0, 0, bw, bh).data;
    } catch {
      ink = null; // exotic contexts may refuse pixel reads; keep whole quads then
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sx = col * cell;
        const sy = row * cell;
        const sw = Math.min(cell, bw - sx);
        const sh = Math.min(cell, bh - sy);
        if (sw <= 0 || sh <= 0) continue;
        let coverage = 1;
        if (ink) {
          const cx = Math.floor(sx + sw / 2);
          const cy = Math.floor(sy + sh / 2);
          coverage = ink[(cy * bw + cx) * 4 + 3] / 255;
        }
        if (coverage < 0.12) continue;
        const hx = ox + sx + sw / 2;
        const hy = oy + sy + sh / 2;
        shards.push({
          sx, sy, sw, sh, hx, hy,
          x: hx, y: hy, z: 0,
          vx: 0, vy: 0, vz: 0,
          rotX: 0, rotY: 0, spinX: 0, spinY: 0,
          seed: col * 7.13 + row * 3.71,
          bias: (hx - width / 2) / Math.max(1, width / 2),   // -1..1 across the word
          weight: 0.75 + coverage * 0.5,
          edgeGlow: coverage
        });
      }
    }
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    build();
  }

  function release(time) {
    releasedAt = time;
    reformCueAt = -1;
    for (const shard of shards) {
      const swirl = fbm2(shard.seed, shard.sy * 0.05, { octaves: 2, seed: 7 });
      shard.x = shard.hx;
      shard.y = shard.hy;
      shard.z = 0;
      shard.vx = (shard.bias * 130 + swirl * 200 + random(-45, 45)) * (preview ? 0.55 : 1);
      shard.vy = -random(25, 150) * (preview ? 0.55 : 1);
      shard.vz = random(140, 620) * (preview ? 0.6 : 1);   // toward the viewer
      shard.rotX = 0;
      shard.rotY = 0;
      shard.spinX = random(-2.4, 2.4);
      shard.spinY = random(-2.8, 2.8);
    }
    dust = Array.from({ length: preview ? 24 : 90 }, () => ({
      x: random(width * 0.2, width * 0.8),
      y: random(height * 0.32, height * 0.62),
      vx: random(-70, 70),
      vy: random(-95, -10),
      life: random(0.6, 1.6),
      age: 0,
      r: random(0.6, 2.1)
    }));
    if (!preview) emitSound("glassBreak");
  }

  /** Shard alpha over the elapsed fall/reform window. */
  function shardAlpha(elapsed) {
    if (elapsed < 0) return 0;
    const appear = clamp(elapsed / 0.25, 0, 1);
    const fade = 1 - clamp((elapsed - FALL * 0.55) / (FALL * 0.45 + REFORM), 0, 1);
    return appear * clamp(fade, 0, 1) * 0.96;
  }

  function frame(dt, time) {
    const step = Math.min(dt, 1 / 30);
    const phase = time % CYCLE;
    const cycleIndex = Math.floor(time / CYCLE);

    // One shatter per cycle; reset so shuffle/long sessions never desync.
    if (phase >= CRACK_START && phase < SHATTER_AT + 0.35 && cycleIndex !== lastShatterCycle) {
      lastShatterCycle = cycleIndex;
      release(time);
    }
    if (releasedAt !== -1 && reformCueAt === -1 && time - releasedAt > FALL + REFORM * 0.5) {
      reformCueAt = time;
      if (!preview) emitSound("softChime");
    }

    /* ---------------- background ---------------- */
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0b0713");
    sky.addColorStop(0.55, "#151126");
    sky.addColorStop(1, "#0a0c18");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Slow drifting haze bands behind the word, driven by layered noise.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const tints = ["122,84,180", "64,120,190", "190,84,140"];
    for (let band = 0; band < 3; band++) {
      const t = time * 0.05 + band * 3.3;
      const bx = width * (0.3 + 0.2 * band) + noise2(t, band * 5.1) * width * 0.16;
      const by = height * (0.42 + 0.1 * band) + noise2(t + 9, band) * height * 0.1;
      const radius = Math.min(width, height) * (0.34 + band * 0.1);
      const glow = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      glow.addColorStop(0, `rgba(${tints[band]},${(0.05 + 0.02 * Math.sin(time * 0.4 + band)).toFixed(3)})`);
      glow.addColorStop(1, `rgba(${tints[band]},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(bx - radius, by - radius, radius * 2, radius * 2);
    }
    ctx.restore();

    // Faint drifting motes so the scene never feels frozen while holding.
    ctx.save();
    ctx.fillStyle = "rgba(210,190,255,0.5)";
    const moteCount = preview ? 14 : 40;
    for (let index = 0; index < moteCount; index++) {
      const mx = ((index * 137.5 + time * (6 + (index % 5) * 3)) % (width + 40)) - 20;
      const my = height * (0.1 + ((index * 0.618) % 1) * 0.8) + Math.sin(time * 0.5 + index) * 8;
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 1.4 + index * 2.3));
      ctx.fillRect(mx, my, 1.4, 1.4);
    }
    ctx.restore();

    /* ---------------- intact / crack / shards ---------------- */
    const elapsed = releasedAt === -1 ? -1 : time - releasedAt;
    const intact = elapsed < 0 ? 1 : clamp(1 - elapsed / 0.22, 0, 1);
    const crack = elapsed < 0
      ? (phase >= CRACK_START ? clamp((phase - CRACK_START) / (SHATTER_AT - CRACK_START), 0, 1) : -1)
      : (elapsed < 0.35 ? 1 : -1);
    const reforming = elapsed > FALL ? clamp((elapsed - FALL) / REFORM, 0, 1) : 0;
    const glowPulse = 0.85 + 0.15 * Math.sin(time * 1.1);
    const text = showName ? name : "✦ ✧ ✦";
    const size = clamp(Math.min(height * 0.3, width * 0.6), 22, 150);
    const metrics = measureName(ctx, text, style, size, language);
    const startX = (width - metrics.total) / 2;

    if (intact > 0.002) {
      // Fully assembled word: glowing type with a slow shimmer travelling along it.
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `${style.weight} ${size}px ${style.family}`;
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = Math.max(8, size * 0.22) * glowPulse;
      let cursor = startX;
      for (let index = 0; index < metrics.clusters.length; index++) {
        const cluster = metrics.clusters[index];
        const local = metrics.total > 0 ? (cursor + metrics.widths[index] / 2 - startX) / metrics.total : 0.5;
        const shimmer = 0.75 + 0.25 * Math.sin(time * 2.2 - local * 7 + Math.sin(time * 0.7) * 2);
        ctx.globalAlpha = intact * (0.85 + 0.15 * shimmer);
        ctx.fillStyle = palette.core;
        ctx.fillText(cluster, cursor, height / 2);
        ctx.globalAlpha = intact * 0.35 * shimmer;
        ctx.fillStyle = palette.accent || palette.edge;
        ctx.fillText(cluster, cursor, height / 2);
        cursor += metrics.widths[index] + metrics.tracking;
      }
      ctx.restore();

      // The crack itself: a bright jagged seam sweeping left→right.
      if (crack >= 0) {
        const cx = startX + metrics.total * crack;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rgba(palette.accent || "#ffffff", 0.85);
        ctx.lineWidth = Math.max(1, size * 0.012);
        ctx.shadowColor = palette.glow;
        ctx.shadowBlur = size * 0.16;
        ctx.beginPath();
        const top = height / 2 - size * 0.75;
        const bottom = height / 2 + size * 0.75;
        for (let yy = top; yy <= bottom; yy += 6) {
          const zig = noise2(yy * 0.12, time * 3) * size * 0.06;
          if (yy === top) ctx.moveTo(cx + zig, yy);
          else ctx.lineTo(cx + zig, yy);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        for (let branch = 0; branch < 4; branch++) {
          const by = top + (bottom - top) * ((branch + 0.5) / 4);
          ctx.beginPath();
          ctx.moveTo(cx, by);
          ctx.lineTo(cx + (branch % 2 ? -1 : 1) * size * 0.12, by + size * 0.08);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    if (shards.length && elapsed >= 0) {
      const speedScale = preview ? 0.7 : 1;
      // Reform easing: after the fall window, glide everything back home.
      const gather = reforming > 0 ? Math.min(1, reforming * reforming * step * 9) : 0;

      // Shadow pass first — every falling piece drags its own darkness.
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      for (const shard of shards) {
        updateShard(shard, step, elapsed, speedScale);
        if (gather > 0) gatherShard(shard, gather);
        const alpha = shardAlpha(elapsed);
        if (alpha <= 0.01) continue;
        const s = 1 + shard.z / 900;
        ctx.globalAlpha = clamp(alpha * clamp(1 - shard.z / 800, 0.15, 1), 0, 0.5);
        ctx.fillStyle = "rgba(6,4,12,1)";
        ctx.fillRect(shard.x - (shard.sw * s) / 2, shard.y + shard.z * 0.32, shard.sw * s, shard.sh * s * 0.4);
      }
      ctx.restore();

      // Ink pass: blit the sampled quad, rotated and scaled by perspective.
      for (const shard of shards) {
        const alpha = shardAlpha(elapsed);
        if (alpha <= 0.01) continue;
        const scale = 1 + shard.z / 700;                 // closer = bigger
        const tilt = Math.abs(Math.cos(shard.rotX));     // squash as it tumbles
        const yaw = Math.abs(Math.cos(shard.rotY));
        const w = shard.sw * scale * Math.max(0.14, yaw);
        const h = shard.sh * scale * Math.max(0.14, tilt);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(shard.x, shard.y - shard.z * 0.12);
        ctx.rotate(shard.rotY * 0.24 + shard.bias * 0.1);
        ctx.drawImage(buffer, shard.sx, shard.sy, shard.sw, shard.sh, -w / 2, -h / 2, w, h);
        if (alpha > 0.2 && !preview) {
          // Rim light keeps tumbling shards readable against the dark.
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = alpha * 0.22 * shard.edgeGlow;
          ctx.fillStyle = palette.glow;
          ctx.fillRect(-w / 2, -h / 2, w, Math.max(0.6, h * 0.14));
        }
        ctx.restore();
      }

      // Glass dust — tiny bright chips shed off the falling pieces.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const particle of dust) {
        particle.age += step;
        if (particle.age > particle.life) continue;
        particle.x += particle.vx * step;
        particle.y += particle.vy * step;
        particle.vy += 60 * step;
        const fade = 1 - particle.age / particle.life;
        ctx.globalAlpha = fade * 0.8;
        ctx.fillStyle = palette.accent || palette.core;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r * fade, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawVignette(ctx, width, height, 0.45);
  }

  /** Physics for one shard: gravity through the screen plane, drag, tumble. */
  function updateShard(shard, dt, elapsed, speedScale) {
    if (elapsed >= FALL + REFORM) return;
    const g = 520 * shard.weight * speedScale;
    shard.vy += g * dt;
    shard.vz += g * 0.9 * dt;
    shard.vx *= Math.exp(-0.35 * dt);
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;
    shard.z += shard.vz * dt;
    shard.rotX += shard.spinX * dt;
    shard.rotY += shard.spinY * dt;
  }

  /** Pull a shard back toward its home position during the reform phase. */
  function gatherShard(shard, amount) {
    shard.x += (shard.hx - shard.x) * amount;
    shard.y += (shard.hy - shard.y) * amount;
    shard.z += (0 - shard.z) * amount;
    shard.rotX *= 1 - amount;
    shard.rotY *= 1 - amount;
  }

  return { resize, frame };
}
