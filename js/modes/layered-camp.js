import { setup2D, clamp, smoothstep, drawVignette } from "./common.js";
import { typeStyle, fontString } from "./type-styles.js";
import { createFire } from "./fire.js";
import {
  createIsoView, drawIsoBox, drawIsoPine, drawIsoPyramid, drawIsoStack,
  measureTextCells
} from "./isometric.js";
import { noise2, fbm2, flicker, mulberry32 } from "../motion.js";

/**
 * Layered Camp — a 3D campsite built from stacked slabs.
 *
 * Nothing here is drawn as flat 2D pixel art. Every element of the scene lives
 * in one unit-space coordinate system and is projected through an isometric
 * camera with a single light direction: the ground is cut into depth strata
 * like a diorama on a riser, the pines are low-poly stacks of shrinking slabs,
 * the tent is a wedge of boxes, the rocks are stepped pyramids, and the name is
 * extruded into solid letter blocks that rise out of the earth one column at a
 * time while the firelight plays across their faces.
 */

const CELL = 5;            // glyph sampling step in world units
const DEPTH = 9;           // how thick each letter slab is
const CYCLE = 16;          // seconds per reveal → burn-down cycle

export function createMode({ canvas, name, language = "bn", showName, preview = false }) {
  const surface = setup2D(canvas, "#070b18");
  const { ctx } = surface;
  const style = typeStyle("layered");
  const rng = mulberry32(4021);
  const fire = createFire({ quality: preview ? 0.4 : 0.9, seed: 77 });

  let width = 1;
  let height = 1;
  let scale = 1;
  let originX = 0;
  let originY = 0;
  let view = null;
  let cells = [];
  let cellOrder = [];
  let stars = [];
  let fireflies = [];
  let strata = [];

  const toScreen = (x, y, z) => view.transform(x, y, z);

  function seedFireflies() {
    fireflies = Array.from({ length: preview ? 5 : 12 }, () => ({
      x: -90 + rng() * 180, z: -60 + rng() * 90, y: -30 + rng() * 40, phase: rng() * 10, seed: rng() * 60
    }));
  }

  function buildStrata() {
    // A shallow bowl of ground: rows of slabs, each row deeper than the last.
    strata = [];
    for (let row = 0; row < 7; row++) {
      const z = -78 + row * 26;
      const y = 6 + row * 1.6;
      const color = ["#2a3a4d", "#26364a", "#223145", "#1f2c40", "#1c283a", "#192435", "#16202f"][row];
      strata.push({ row, z, y, color });
    }
  }

  function rebuildName() {
    if (!showName || !name) { cells = []; cellOrder = []; return; }
    const measured = measureTextCells(ctx, name, {
      font: fontString(style, CELL * 4.4),
      cell: CELL,
      gap: 1,
      maxWidth: 200 // world units — keeps any name inside the diorama
    });
    cells = measured.cells.map(item => ({ ...item, z: 26 }));
    // Bottom rows first so the word grows upward out of the ground.
    cellOrder = cells.slice().sort((a, b) => (b.cy - a.cy) || (a.cx - b.cx));
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    scale = Math.min(w / 260, h / 150) * (preview ? 1.05 : 1);
    originX = w * 0.5;
    originY = h * (preview ? 0.56 : 0.58);
    view = createIsoView({ ox: originX, oy: originY, sx: scale, sy: scale });
    stars = Array.from({ length: preview ? 34 : 90 }, () => ({
      x: rng() * w, y: rng() * h * 0.46, phase: rng() * 8, speed: 0.35 + rng() * 1.3
    }));
    seedFireflies();
    buildStrata();
    rebuildName();
    if (!fireflies.length) seedFireflies();
    fire.configure({
      x: width * 0.5,
      y: height * (preview ? 0.74 : 0.72),
      baseWidth: Math.max(10, Math.min(width, height) * (preview ? 0.05 : 0.055)),
      flameHeight: height * (preview ? 0.2 : 0.17)
    });
  }

  /* ---------------------------------------------------------------- *
   * Scene layers, far to near
   * ---------------------------------------------------------------- */

  function drawSky(time) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#080d20");
    sky.addColorStop(0.42, "#141a38");
    sky.addColorStop(0.72, "#2b2447");
    sky.addColorStop(1, "#3a2b45");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    for (const star of stars) {
      const twinkle = 0.35 + 0.65 * (Math.sin(time * star.speed + star.phase) * 0.5 + 0.5);
      ctx.globalAlpha = twinkle * 0.9;
      ctx.fillStyle = "#dfe8ff";
      ctx.fillRect(star.x, star.y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    // Moon as a lit sphere sitting behind the ridge line
    const moonX = width * 0.78;
    const moonY = height * 0.18;
    const moonR = Math.min(width, height) * 0.055;
    const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 4);
    halo.addColorStop(0, "rgba(214,228,255,.22)");
    halo.addColorStop(1, "rgba(214,228,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 4, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createRadialGradient(moonX - moonR * 0.4, moonY - moonR * 0.4, moonR * 0.1, moonX, moonY, moonR);
    body.addColorStop(0, "#fdf6e6");
    body.addColorStop(1, "#b9c2da");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRidge(time) {
    // Distant hills, layered by depth so they read as receding planes.
    const bands = [
      { offset: 0, lift: 0.42, color: "#141c34" },
      { offset: 14, lift: 0.5, color: "#182138" },
      { offset: 26, lift: 0.58, color: "#1d2740" }
    ];
    for (const band of bands) {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 12) {
        const n = noise2(x * 0.006 + band.offset, band.offset * 0.7) * 0.5 + 0.5;
        ctx.lineTo(x, height * band.lift - n * height * 0.12 + band.offset);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = band.color;
      ctx.fill();
    }
    // A few far pines standing on the ridge, tiny because they are distant
    for (let index = 0; index < (preview ? 4 : 9); index++) {
      const x = ((index + 0.5) / (preview ? 4 : 9)) * width + noise2(index, 3) * 20;
      const y = height * 0.5 + noise2(index * 2.2, 1.5) * 12;
      const mini = createIsoView({ ox: x, oy: y, sx: scale * 0.32, sy: scale * 0.32 });
      drawIsoPine(ctx, { x: 0, y: 0, z: 0, width: 16, height: 26, color: "#131f2c", trunk: "#1a1a22" }, mini);
    }
  }

  function drawGround(time) {
    // Depth strata: each row is a wide slab stack, farther rows sit higher up.
    for (const layer of strata) {
      drawIsoStack(ctx, {
        x: 0, z: layer.z, w: 250, d: 26,
        layers: 3, baseY: layer.y, layerH: 2.2,
        colors: [layer.color, shadeDown(layer.color), shadeDown(layer.color)]
      }, view);
    }
    // Firelight pooling on the topmost stratum
    const pool = ctx.createRadialGradient(originX, originY + 12 * scale, 2, originX, originY + 12 * scale, 90 * scale);
    pool.addColorStop(0, `rgba(255,150,70,${0.16 + fire.light * 0.2})`);
    pool.addColorStop(1, "rgba(255,150,70,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function shadeDown(hex) {
    const value = hex.replace("#", "");
    const num = Number.parseInt(value, 16);
    const r = Math.max(0, ((num >> 16) & 255) - 12);
    const g = Math.max(0, ((num >> 8) & 255) - 12);
    const b = Math.max(0, (num & 255) - 10);
    return `rgb(${r},${g},${b})`;
  }

  function drawTent(time) {
    const baseX = -92;
    const baseZ = -34;
    const sway = Math.sin(time * 0.5) * 0.4;
    // Ridge pole then shrinking panels: a wedge made of boxes
    const panels = 6;
    for (let index = 0; index < panels; index++) {
      const t = index / (panels - 1);
      drawIsoBox(ctx, {
        x: baseX + (t - 0.5) * 34 + sway,
        y: -6 - Math.sin(t * Math.PI) * 20,
        z: baseZ,
        w: 8, h: 8 + Math.sin(t * Math.PI) * 34, d: 40,
        color: index % 2 ? "#8f4f57" : "#a35c62",
        edge: "rgba(10,12,22,.5)"
      }, view);
    }
    // Door slot
    drawIsoBox(ctx, { x: baseX + 15, y: -12, z: baseZ + 21, w: 10, h: 16, d: 2, color: "#121a28", edge: null }, view);
    // Guy line peg
    drawIsoBox(ctx, { x: baseX - 24, y: -2, z: baseZ + 10, w: 2, h: 6, d: 2, color: "#2c3446" }, view);
  }

  function drawTrees(time) {
    const trees = [
      { x: 96, z: -50, width: 26, height: 46, color: "#1c3a33" },
      { x: 118, z: -20, width: 20, height: 34, color: "#1a3730" },
      { x: -30, z: -66, width: 22, height: 38, color: "#182f2b" },
      { x: 62, z: -70, width: 18, height: 30, color: "#162c28" }
    ];
    for (const tree of trees) {
      const sway = Math.sin(time * 0.6 + tree.x * 0.1) * 0.7;
      drawIsoPine(ctx, { ...tree, y: 4, edge: "rgba(8,12,20,.45)", sway }, view);
    }
  }

  function drawRocks() {
    const rocks = [
      { x: -58, z: 34, w: 20, steps: 3 },
      { x: 46, z: 44, w: 14, steps: 2 },
      { x: -14, z: 52, w: 18, steps: 3 }
    ];
    for (const rock of rocks) {
      drawIsoPyramid(ctx, { x: rock.x, y: 6, z: rock.z, w: rock.w, d: rock.w * 0.9, steps: rock.steps, stepH: 4, color: "#3a4457", edge: "rgba(8,10,18,.4)" }, view);
    }
  }

  function drawFireRing(time) {
    // Circle of stone slabs around the fuel
    const stones = preview ? 6 : 9;
    for (let index = 0; index < stones; index++) {
      const angle = (index / stones) * Math.PI * 2;
      drawIsoBox(ctx, {
        x: Math.cos(angle) * 26, y: 4 + Math.sin(angle) * 8, z: 30 + Math.sin(angle) * 12,
        w: 9, h: 6, d: 8,
        color: index % 2 ? "#4a5468" : "#414b5e",
        edge: "rgba(6,8,16,.5)"
      }, view);
    }
    // Logs as long thin boxes crossing the ring
    for (const log of [{ x: -4, z: 28 }, { x: 6, z: 32 }]) {
      drawIsoBox(ctx, { x: log.x, y: 1, z: log.z, w: 34, h: 5, d: 6, color: "#6b4436", edge: "rgba(10,8,10,.4)" }, view);
    }
    // Coals glowing under the flame
    const glow = 0.35 + fire.light * 0.65;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let index = 0; index < 7; index++) {
      const flick = flicker(time * 2 + index, index) * 0.5 + 0.5;
      const [px, py] = toScreen(-14 + index * 4.6, -1, 30 + (index % 2) * 4);
      ctx.globalAlpha = glow * flick * 0.7;
      ctx.fillStyle = "#ff8a3c";
      ctx.beginPath();
      ctx.arc(px, py, 2.4 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFireflies(time, dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const fly of fireflies) {
      fly.x = clamp(fly.x + (noise2(fly.seed, time * 0.2) * 14) * dt, -120, 120);
      fly.z = clamp(fly.z + (noise2(fly.seed + 5, time * 0.18) * 12) * dt, -70, 60);
      const bob = Math.sin(time * 0.8 + fly.phase) * 6;
      const blink = Math.sin(time * 1.5 + fly.phase) * 0.5 + 0.5;
      if (blink < 0.35) continue;
      const [px, py] = toScreen(fly.x, fly.y + bob - 20, fly.z);
      ctx.globalAlpha = blink * 0.85;
      ctx.fillStyle = "#cdf5a6";
      ctx.beginPath();
      ctx.arc(px, py, 1.8 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = blink * 0.16;
      ctx.beginPath();
      ctx.arc(px, py, 6 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- *
   * The name: extruded letter slabs assembled out of the ground
   * ---------------------------------------------------------------- */

  function drawName(time) {
    if (!cells.length) return;
    const cycle = time % CYCLE;
    const buildIn = smoothstep(0.6, 5.2, cycle);
    const burnOut = 1 - smoothstep(CYCLE - 3.4, CYCLE - 0.6, cycle);
    const progress = buildIn * burnOut;
    const total = cellOrder.length || 1;

    // Cast shadow of the whole word, squashed onto the top stratum
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#05070f";
    for (const item of cellOrder) {
      const [sx, sy] = toScreen(item.cx * 1.1 - 6, 2.5, item.z + 6);
      ctx.fillRect(sx - 2, sy - 1, CELL * scale * 1.1, CELL * scale * 0.55);
    }
    ctx.restore();

    const heatColor = (mass) => {
      const warm = fire.light;
      const r = Math.round(255);
      const g = Math.round(190 + warm * 40);
      const b = Math.round(110 + mass * 60);
      return `rgb(${r},${g},${b})`;
    };

    for (let index = 0; index < cellOrder.length; index++) {
      const item = cellOrder[index];
      const delay = (index / total) * 0.72;
      const local = clamp((progress - delay) / 0.28, 0, 1);
      if (local <= 0.01) continue;
      const eased = easeOutBack(local);
      const riseFrom = (1 - eased) * 42;
      const jitter = noise2(index * 1.7, time * 1.6) * 0.6;
      const litTop = 0.6 + fire.light * 0.4;
      drawIsoBox(ctx, {
        x: item.cx + jitter,
        y: item.cy - 34 - riseFrom,
        z: item.z,
        w: CELL * 0.96, h: CELL * 0.96, d: DEPTH * (0.4 + local * 0.6),
        color: heatColor(item.mass),
        top: `rgba(255,${Math.round(232 * litTop)},${Math.round(180 * litTop)},1)`,
        side: `rgba(${Math.round(150 + fire.light * 60)},${Math.round(70 + fire.light * 40)},40,1)`,
        edge: "rgba(12,8,14,.35)"
      }, view);
    }

    // Sparks that fall back into the letters as they burn away
    if (burnOut < 0.9 && cycle > CYCLE - 4) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let index = 0; index < (preview ? 8 : 20); index++) {
        const t = ((time * 1.4 + index * 0.31) % 1);
        const item = cellOrder[(index * 7) % total];
        if (!item) continue;
        const [px, py] = toScreen(item.cx, item.cy - 34 - t * 26, item.z);
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.fillStyle = "#ffd08a";
        ctx.beginPath();
        ctx.arc(px, py, 1.6 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function easeOutBack(t) {
    const c1 = 1.7;
    const x = t - 1;
    return 1 + (c1 + 1) * x ** 3 + c1 * x ** 2;
  }

  /* ---------------------------------------------------------------- */

  function frame(dt, time) {
    drawSky(time);
    drawRidge(time);
    drawGround(time);
    drawTrees(time);
    drawTent(time);
    drawRocks();
    drawFireRing(time);

    fire.configure({ flameHeight: height * (preview ? 0.2 : 0.17) * (0.9 + flicker(time, 77, { speed: 1.2 }) * 0.18) });
    fire.update(dt, time, { wind: fbm2(time * 0.3, 2, { octaves: 2, seed: 9 }) * 0.35, intensity: 1, turbulence: 1.1 });
    fire.drawGlow(ctx, { radius: Math.min(width, height) * 0.55, color: [255, 148, 66], strength: 0.6 });
    fire.draw(ctx, { smokeAlpha: 0.5 });

    drawName(time);
    drawFireflies(time, dt);

    // Rim light along the front edges of the diorama, from the fire
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.05 + fire.light * 0.06;
    const rim = ctx.createLinearGradient(0, height, 0, height * 0.45);
    rim.addColorStop(0, "#ff8a3c");
    rim.addColorStop(1, "rgba(255,138,60,0)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    drawVignette(ctx, width, height, 0.42);
  }

  return {
    resize,
    frame,
    destroy() {
      cells = [];
      cellOrder = [];
      strata = [];
    }
  };
}
