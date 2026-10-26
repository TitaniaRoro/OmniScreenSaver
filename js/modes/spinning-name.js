import { setup2D, TAU, clamp, random, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { splitGraphemes } from "../text.js";
import { fbm3, noise2 } from "../motion.js";

/**
 * 3D Spinning Name — true perspective renderer.
 *
 * The name is not faked with stacked text anymore. Every glyph is sampled
 * into a dense point cloud, lifted into real 3D space (x, y, z per vertex),
 * and the whole word rotates on two axes under a pinhole camera with
 * painter's-sort depth. Each particle is shaded as a lit sphere: a fixed key
 * light in the upper left, a cool rim light behind, a specular hotspot that
 * slides across the letters exactly when they face the light — the moment
 * chrome catches the sun. A blurred bloom pass, a mirrored reflection that
 * breaks apart into ripples, drifting bokeh dust and a ground shadow sell it
 * as a physical object floating in space.
 */

const FOCAL = 900;          // pinhole focal length in scene units
const MAX_PARTICLES = 5200; // full-screen budget
const PREVIEW_BUDGET = 760; // gallery-tile budget

export function createMode({ canvas, name, language = "en", showName, preview = false }) {
  const surface = setup2D(canvas, "#05070f");
  const { ctx } = surface;
  const style = typeStyle("spin");
  const clusters = splitGraphemes(name, language);

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let particles = [];        // { x, y, z, radius, warm, jitter, phase }
  let glowSprites = null;    // pre-rendered halo images per tone
  let bloomCanvas = null;
  let bloomCtx = null;
  let stars = [];
  let motes = [];

  /* ------------------------------------------------------------------ *
   * Build the glyph point cloud once per resize
   * ------------------------------------------------------------------ */
  function sampleGlyphs(w, h) {
    const pr = pixelRatio;
    const work = document.createElement("canvas");
    work.width = Math.max(8, Math.round(w * pr));
    work.height = Math.max(8, Math.round(h * pr));
    const wc = work.getContext("2d");
    wc.fillStyle = "#000";
    wc.fillRect(0, 0, work.width, work.height);

    // Font metrics are multiplied by pr below, so glyph detail lands on the
    // device-pixel grid rather than being upsampled (crisp, not chunky).
    const size = clamp(Math.min(h * 0.42, w * 0.86 / Math.max(1, clusters.length * 0.62)), 26, 220) * pr;
    wc.font = `${style.weight} ${size}px ${style.family}`;
    wc.textAlign = "center";
    wc.textBaseline = "middle";
    wc.fillStyle = "#fff";
    // Letter-spacing by hand so tracking works for Bengali clusters too.
    const tracking = size * 0.04;
    const widths = clusters.map(cluster => wc.measureText(cluster).width);
    const total = widths.reduce((sum, value) => sum + value, 0) + tracking * Math.max(0, clusters.length - 1);
    let cursor = work.width / 2 - total / 2;
    for (let index = 0; index < clusters.length; index++) {
      wc.fillText(clusters[index], cursor + widths[index] / 2, work.height / 2);
      cursor += widths[index] + tracking;
    }

    let data = null;
    try {
      data = wc.getImageData(0, 0, work.width, work.height).data;
    } catch {
      data = null;
    }
    if (!data || !data.length) {
      // No pixel access (exotic environments): fall back to a deterministic
      // lattice so the word still occupies real 3D space.
      const scale = 1 / Math.max(w, h);
      const cols = 26;
      const rows = 7;
      const spreadW = 0.42, spreadH = 0.1;
      const points = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const u = c / (cols - 1) * 2 - 1;
          const v = r / (rows - 1) * 2 - 1;
          points.push({
            x: u * spreadW,
            y: v * spreadH + Math.sin(u * 5 + v * 2) * 0.02,
            edge: r === 0 || r === rows - 1 || c === 0 || c === cols - 1
          });
        }
      }
      void scale;
      return points;
    }
    // Sample on the true device-pixel grid so dense clouds stay crisp on
    // HiDPI screens instead of collapsing into fat, blurry dots.
    const step = preview ? 5 : 4;
    const scale = 1 / Math.max(w, h);
    const points = [];
    for (let y = 0; y < work.height; y += step) {
      for (let x = 0; x < work.width; x += step) {
        const alpha = data[Math.floor((y * work.width + x)) * 4];
        if (alpha > 128) {
          points.push({
            x: (x - work.width / 2) * scale,
            y: (y - work.height / 2) * scale,
            edge: alpha < 210 // thin outer samples get a brighter gold rim tone
          });
        }
      }
    }
    return points;
  }

  function buildParticles(w, h) {
    const points = sampleGlyphs(w, h);
    const budget = preview ? PREVIEW_BUDGET : MAX_PARTICLES;
    const stride = Math.max(1, Math.ceil(points.length / budget));
    const radius = Math.max(1.4, Math.min(w, h) * (preview ? 0.011 : 0.0055));
    particles = [];
    for (let index = 0; index < points.length; index += stride) {
      const point = points[index];
      particles.push({
        x: point.x,
        y: point.y,
        edge: point.edge,
        z: random(-radius * 1.6, radius * 1.6), // genuine thickness in depth
        radius: radius * random(0.82, 1.12),
        warm: point.edge,
        jitter: random(0, TAU),
        phase: random(0, TAU)
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Pre-rendered soft-glow sprites (cheap bloom halos, no shadowBlur)
   * ------------------------------------------------------------------ */
  function buildGlowSprites() {
    const tones = [
      [255, 244, 236], // warm core
      [150, 190, 255], // cool body
      [196, 150, 255], // violet bounce
      [255, 205, 150]  // specular flash
    ];
    glowSprites = tones.map(([r, g, b]) => {
      const sprite = document.createElement("canvas");
      sprite.width = 64;
      sprite.height = 64;
      const sc = sprite.getContext("2d");
      const grad = sc.createRadialGradient(32, 32, 1, 32, 32, 32);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},0.28)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      sc.fillStyle = grad;
      sc.fillRect(0, 0, 64, 64);
      return sprite;
    });
  }

  function ensureBloomBuffer() {
    if (!bloomCanvas) {
      bloomCanvas = document.createElement("canvas");
      bloomCtx = bloomCanvas.getContext("2d");
    }
    const bw = Math.max(2, Math.round(width / 4));
    const bh = Math.max(2, Math.round(height / 4));
    if (bloomCanvas.width !== bw || bloomCanvas.height !== bh) {
      bloomCanvas.width = bw;
      bloomCanvas.height = bh;
    }
  }

  /* ------------------------------------------------------------------ *
   * Resize
   * ------------------------------------------------------------------ */
  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    pixelRatio = clamp(surface.ratio || ratio || 1, 1, 2);
    if (!glowSprites) buildGlowSprites();
    ensureBloomBuffer();
    if (showName && clusters.length) buildParticles(w, h);
    else particles = [];
    stars = Array.from({ length: preview ? 34 : 110 }, () => ({
      x: random(0, w), y: random(0, h), r: random(0.4, 1.5), p: random(0, TAU), s: random(0.4, 1.4)
    }));
    motes = Array.from({ length: preview ? 8 : 26 }, () => ({
      x: random(0, w), y: random(0, h), r: random(6, 26), vx: random(-6, 6), vy: random(-9, -2),
      p: random(0, TAU), tone: Math.floor(random(0, 3))
    }));
  }

  /* ------------------------------------------------------------------ *
   * Per-particle lighting colour, returned as a css string
   * ------------------------------------------------------------------ */
  function shadeFor(nx, ny, nz, warm, facing) {
    // Key light from upper-left-front, rim light from behind-right.
    const diffuse = clamp(nx * -0.55 + ny * -0.5 + nz * 0.62, 0, 1);
    const rim = clamp(nz * -0.8 + nx * 0.3, 0, 1);
    const l = 0.24 + diffuse * 0.72;
    let r = l * 236 + rim * 90;
    let g = l * 240 + rim * 118;
    let b = l * 252 + rim * 170;
    if (warm) { r += 20; g *= 0.86; b *= 0.66; } // gold edge tint
    // Specular band: tight highlight where the surface faces the light.
    const spec = Math.pow(clamp(diffuse - 0.55, 0, 1) * 2.2, 3) * (0.6 + 0.4 * facing);
    r += spec * 255; g += spec * 250; b += spec * 235;
    return `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, b) | 0})`;
  }

  /* ------------------------------------------------------------------ *
   * Frame
   * ------------------------------------------------------------------ */
  function frame(dt, time) {
    // Deep-space backdrop with a slow-breathing nebula
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#070a1c");
    bg.addColorStop(0.5, "#100d26");
    bg.addColorStop(1, "#04060f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const nx = width * (0.25 + 0.5 * i) + fbm3(time * 0.03, i * 4.1, 0, { octaves: 2, seed: 7 + i }) * width * 0.1;
      const ny = height * (0.3 + 0.2 * i) + noise2(time * 0.04, i * 9.3) * height * 0.08;
      const rad = Math.min(width, height) * (0.3 + i * 0.12);
      const neb = ctx.createRadialGradient(nx, ny, 1, nx, ny, rad);
      neb.addColorStop(0, ["rgba(70,60,160,0.10)", "rgba(30,90,140,0.08)", "rgba(120,50,130,0.07)"][i]);
      neb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neb;
      ctx.fillRect(nx - rad, ny - rad, rad * 2, rad * 2);
    }
    ctx.restore();

    // Stars, gently twinkling
    ctx.save();
    for (const star of stars) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(star.p + time * star.s));
      ctx.fillStyle = `rgba(206,220,255,${tw * 0.7})`;
      ctx.fillRect(star.x, star.y, star.r, star.r);
    }
    ctx.restore();

    const cx = width / 2;
    const cy = height * 0.46;

    if (!showName || !particles.length) {
      // No name: an orbiting ring of light stands in for the object
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = "rgba(170,200,255,.5)";
      ctx.lineWidth = 1.5;
      const spin = time * 0.5;
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.min(width, height) * (0.14 + ring * 0.05),
          Math.min(width, height) * (0.14 + ring * 0.05) * Math.abs(Math.cos(spin + ring * 0.7)), spin + ring, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      drawBokeh(dt, time);
      drawVignette(ctx, width, height, 0.45);
      return;
    }

    // Two-axis rotation: yaw sweeps the word around, pitch nods slowly.
    const yaw = time * 0.5 + fbm3(time * 0.05, 1.2, 3.3, { octaves: 2, seed: 14 }) * 0.5;
    const pitch = Math.sin(time * 0.23) * 0.32 + 0.06;
    const sy = Math.sin(yaw), cyw = Math.cos(yaw);
    const sp = Math.sin(pitch), cp = Math.cos(pitch);

    const spread = Math.min(width * 0.92, height * 1.7);
    const bob = Math.sin(time * 0.7) * height * 0.012;

    // Transform every particle through the model view, then the camera.
    const projected = new Array(particles.length);
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const x1 = p.x * cyw + p.z * sy;           // rotate around Y
      const z1 = -p.x * sy + p.z * cyw;
      const y1 = p.y * cp - z1 * sp;             // rotate around X
      const z2 = p.y * sp + z1 * cp;
      const persp = FOCAL / (FOCAL + z2 * spread * 0.32); // pinhole foreshortening
      const breathe = 1 + Math.sin(time * 0.9 + p.phase) * 0.012;
      const sx = cx + x1 * spread * persp * breathe;
      const syy = cy + y1 * spread * persp * breathe + bob;
      if (z2 < minZ) minZ = z2;
      if (z2 > maxZ) maxZ = z2;
      projected[i] = { sx, sy: syy, z: z2, persp, p };
    }
    // Painter's algorithm: far particles first so near ones occlude them.
    projected.sort((a, b) => b.z - a.z);
    const zRange = Math.max(0.001, maxZ - minZ);

    // Facing ratio drives the specular sweep intensity over the turn.
    const facing = 0.5 + 0.5 * Math.cos(yaw);

    // Bloom pass target
    ensureBloomBuffer();
    bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);

    // Ground contact shadow (blurred ellipse below the object)
    const shadowW = spread * 0.42 * (0.8 + 0.2 * Math.abs(cyw));
    ctx.save();
    ctx.translate(cx, cy + height * 0.34);
    ctx.scale(1, 0.16);
    const shadow = ctx.createRadialGradient(0, 0, 1, 0, 0, shadowW);
    shadow.addColorStop(0, `rgba(2,4,12,${0.5 + 0.18 * Math.abs(cyw)})`);
    shadow.addColorStop(1, "rgba(2,4,12,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, shadowW, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Draw the solid letter-body layer (sorted back to front)
    for (let i = 0; i < projected.length; i++) {
      const item = projected[i];
      const p = item.p;
      const depthT = (item.z - minZ) / zRange; // 0 far .. 1 near
      const size = p.radius * item.persp * (0.75 + depthT * 0.5) * 2.1;
      // Surface normal approximated from stored jitter + depth so each
      // sphere on the cloud catches the key light slightly differently.
      const nx = Math.sin(p.jitter) * 0.6 - item.z * 0.5;
      const ny = Math.cos(p.jitter) * 0.4 - 0.3;
      const nz = 0.6 + depthT * 0.4;
      const len = Math.hypot(nx, ny, nz) || 1;
      ctx.fillStyle = shadeFor(nx / len, ny / len, nz / len, p.warm, facing);
      ctx.globalAlpha = 0.55 + depthT * 0.45;
      ctx.beginPath();
      ctx.arc(item.sx, item.sy, size * 0.5, 0, TAU);
      ctx.fill();

      // Hot particles feed the bloom buffer
      if (depthT > 0.62 && (p.warm || Math.sin(p.jitter * 3 + yaw) > 0.55)) {
        const bs = size * 1.6;
        bloomCtx.drawImage(glowSprites[p.warm ? 3 : 0], item.sx / 4 - bs / 2, item.sy / 4 - bs / 2, bs, bs);
      }
    }
    ctx.globalAlpha = 1;

    // Mirrored reflection: same cloud, flipped, rippling apart as it fades
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const mirrorY = cy + height * 0.34;
    const fadeBand = height * 0.26;
    for (let i = 0; i < projected.length; i += preview ? 3 : 2) {
      const item = projected[i];
      const ry = mirrorY + (mirrorY - item.sy);
      if (ry > mirrorY + fadeBand || ry < mirrorY) continue;
      const t = (ry - mirrorY) / fadeBand; // 0 at floor .. 1 at end
      const ripple = Math.sin(ry * 0.06 + time * 2.2) * (2 + t * 7);
      const size = item.p.radius * item.persp * 2;
      ctx.globalAlpha = (1 - t) * 0.16;
      ctx.fillStyle = item.p.warm ? "rgba(255,214,160,1)" : "rgba(186,214,255,1)";
      ctx.beginPath();
      ctx.arc(item.sx + ripple, ry, size * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Composite the blurred bloom on top — this is what makes it feel premium
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = "blur(6px)";
    ctx.globalAlpha = preview ? 0.5 : 0.72;
    ctx.drawImage(bloomCanvas, 0, 0, width, height);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();

    drawBokeh(dt, time);
    drawVignette(ctx, width, height, 0.42);
  }

  function drawBokeh(dt, time) {
    if (!glowSprites) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const m of motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -m.r) { m.y = height + m.r; m.x = random(0, width); }
      if (m.x < -m.r) m.x = width + m.r;
      if (m.x > width + m.r) m.x = -m.r;
      const twinkle = 0.5 + 0.5 * Math.sin(m.p + time * 0.8);
      const r = m.r * (0.9 + 0.2 * Math.sin(time * 0.5 + m.p));
      ctx.globalAlpha = 0.05 + twinkle * 0.08;
      ctx.drawImage(glowSprites[m.tone], m.x - r, m.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  return {
    resize,
    frame,
    destroy() {
      particles = [];
      stars = [];
      motes = [];
      bloomCanvas = null;
      bloomCtx = null;
      glowSprites = null;
    }
  };
}
