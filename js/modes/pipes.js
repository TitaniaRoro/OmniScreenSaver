import { setup2D, TAU, clamp, random, lerp, rgba, drawStyledName, drawVignette, drawGlowDot } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { noise2, fbm3 } from "../motion.js";

/**
 * 3D Pipes.
 *
 * Pipes grow through an isometric lattice one elbow at a time, easing in and
 * out of each turn. Depth is respected: pipes are sorted back to front and
 * shaded as cylinders, so the lattice reads as solid. The name is cut from the
 * same plumbing — chrome filled with travelling highlights.
 */
const AXES = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1]
];

export function createMode({ canvas, name, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#061017");
  const { ctx } = surface;
  const style = typeStyle("pipes");
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  const chromeCanvas = document.createElement("canvas");
  const chromeCtx = chromeCanvas.getContext("2d");
  let width = 1;
  let height = 1;
  let pipes = [];
  let motes = [];
  let unit = 30;
  let lastTick = -1;

  function project(gx, gy, gz) {
    return {
      x: width * 0.5 + (gx - gz) * unit * 0.866,
      y: height * 0.52 + (gx + gz) * unit * 0.5 - gy * unit * 0.78
    };
  }

  function buildPipe(seed) {
    const grid = 7;
    const cells = [];
    let gx = Math.floor(random(0, grid));
    let gy = Math.floor(random(0, grid));
    let gz = Math.floor(random(0, grid));
    let axis = Math.floor(random(0, 6));
    const segments = Math.floor(random(4, 11));
    cells.push({ gx, gy, gz });
    for (let index = 0; index < segments; index++) {
      const turn = noise2(seed + index * 0.7, index * 1.3) > 0.15 ? 0 : (Math.random() < 0.5 ? 1 : 5);
      axis = (axis + turn) % 6;
      const [dx, dy, dz] = AXES[axis];
      gx = clamp(gx + dx, 0, grid);
      gy = clamp(gy + dy, 0, grid);
      gz = clamp(gz + dz, 0, grid);
      cells.push({ gx, gy, gz });
    }
    const depth = cells.reduce((sum, cell) => sum + cell.gx + cell.gy * 0.5 + cell.gz, 0) / cells.length;
    return {
      cells,
      depth,
      color: ["#63e8cf", "#6fb6ff", "#b39dff", "#ffc07a", "#7ef0b6"][Math.floor(random(0, 5))],
      phase: random(0, 1),
      thickness: random(0.2, 0.32),
      speed: random(0.06, 0.13)
    };
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    unit = Math.max(12, Math.min(w, h) / 13);
    maskCanvas.width = Math.max(1, Math.round(w));
    maskCanvas.height = Math.max(1, Math.round(h));
    chromeCanvas.width = maskCanvas.width;
    chromeCanvas.height = maskCanvas.height;
    const count = preview ? 5 : Math.round(clamp((w * h) / 26000, 12, 34));
    pipes = Array.from({ length: count }, (_, index) => buildPipe(index * 3.7));
    pipes.sort((a, b) => a.depth - b.depth);
    motes = Array.from({ length: preview ? 12 : 70 }, () => ({ x: random(0, w), y: random(0, h), p: random(0, TAU), r: random(0.8, 2.4), speed: random(0.2, 0.7) }));
  }

  function drawPipe(pipe, time, context, thicknessScale = 1) {
    const progress = (time * pipe.speed + pipe.phase) % 1.35;
    const grow = progress < 1 ? 1 - (1 - progress) ** 3 : 1;
    const fadeOut = progress > 1.15 ? clamp(1 - (progress - 1.15) / 0.2, 0, 1) : 1;
    if (grow <= 0.001 || fadeOut <= 0.001) return;
    const total = pipe.cells.length - 1;
    const reached = grow * total;
    const full = Math.floor(reached);
    const partial = reached - full;
    const points = [];
    for (let index = 0; index <= Math.min(total, full + 1); index++) {
      const cell = pipe.cells[index];
      let point = project(cell.gx, cell.gy, cell.gz);
      if (index === full + 1 && full + 1 <= total) {
        const previous = project(pipe.cells[full].gx, pipe.cells[full].gy, pipe.cells[full].gz);
        point = { x: lerp(previous.x, point.x, partial), y: lerp(previous.y, point.y, partial) };
      }
      points.push(point);
    }
    if (points.length < 2) return;

    const thickness = Math.max(3, unit * pipe.thickness * thicknessScale);
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = fadeOut;

    // Shadow / depth: a darker, wider stroke underneath.
    context.strokeStyle = "rgba(3,8,16,.72)";
    context.lineWidth = thickness * 1.25;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) context.lineTo(points[index].x, points[index].y);
    context.stroke();

    // Body, shaded as a cylinder: darker at the edges, bright along the top.
    const body = context.createLinearGradient(points[0].x - thickness, points[0].y - thickness, points[0].x + thickness, points[0].y + thickness);
    body.addColorStop(0, rgba(pipe.color, 0.35));
    body.addColorStop(0.4, pipe.color);
    body.addColorStop(1, rgba(pipe.color, 0.4));
    context.strokeStyle = body;
    context.lineWidth = thickness;
    context.stroke();

    context.strokeStyle = "rgba(255,255,255,.42)";
    context.lineWidth = Math.max(1, thickness * 0.16);
    context.beginPath();
    context.moveTo(points[0].x - thickness * 0.16, points[0].y - thickness * 0.16);
    for (let index = 1; index < points.length; index++) context.lineTo(points[index].x - thickness * 0.16, points[index].y - thickness * 0.16);
    context.stroke();

    // Joints
    for (const point of points) {
      context.fillStyle = "rgba(6,16,26,.9)";
      context.strokeStyle = pipe.color;
      context.lineWidth = Math.max(1, thickness * 0.16);
      context.beginPath();
      context.arc(point.x, point.y, thickness * 0.62, 0, TAU);
      context.fill();
      context.stroke();
    }
    context.restore();
  }

  function frame(dt, time) {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#05101a");
    bg.addColorStop(0.55, "#0d1531");
    bg.addColorStop(1, "#060f1a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // A soft floor haze so the lattice sits in a space
    ctx.save();
    ctx.globalAlpha = 0.5;
    const haze = ctx.createRadialGradient(width / 2, height * 0.62, 4, width / 2, height * 0.62, Math.max(width, height) * 0.5);
    haze.addColorStop(0, "rgba(40,120,140,.16)");
    haze.addColorStop(1, "rgba(6,16,26,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    for (const pipe of pipes) drawPipe(pipe, time, ctx);

    for (const mote of motes) {
      mote.p += dt * mote.speed;
      const drift = fbm3(mote.x * 0.002, mote.y * 0.002, time * 0.1, { octaves: 2, seed: 4 });
      const alpha = 0.16 + 0.3 * (Math.sin(mote.p) + 1) / 2;
      drawGlowDot(ctx, mote.x + Math.sin(mote.p) * 6, mote.y + drift * 8, mote.r, "#9ffbe8", 8, alpha);
    }

    if (showName) {
      const nameY = height * 0.5;
      // Chrome plate behind the lettering
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "rgba(4,11,22,.72)";
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(width * 0.16, nameY - height * 0.14, width * 0.68, height * 0.28, Math.min(28, height * 0.05))
        : ctx.rect(width * 0.16, nameY - height * 0.14, width * 0.68, height * 0.28);
      ctx.fill();
      ctx.strokeStyle = "rgba(99,232,207,.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      maskCtx.clearRect(0, 0, width, height);
      drawStyledName(maskCtx, name, width / 2, nameY, {
        style,
        size: Math.min(height * 0.15, width * 0.075),
        maxWidth: width * 0.6,
        maxHeight: height * 0.15,
        minSize: 12,
        language,
        time,
        paint: "#fff",
        effects: [],
        shadowBlur: 0
      });

      chromeCtx.clearRect(0, 0, width, height);
      const chrome = chromeCtx.createLinearGradient(0, nameY - height * 0.12, width, nameY + height * 0.1);
      const shift = (time * 0.12) % 1;
      chrome.addColorStop(0, `hsl(${168 + Math.sin(time * 0.3) * 16}, 88%, ${58 + shift * 8}%)`);
      chrome.addColorStop(0.35, "#e6fffa");
      chrome.addColorStop(0.55, "#63cfc9");
      chrome.addColorStop(0.8, "#c7c1ff");
      chrome.addColorStop(1, "#5ce0d2");
      chromeCtx.fillStyle = chrome;
      chromeCtx.fillRect(0, 0, width, height);
      for (const pipe of pipes) drawPipe(pipe, time, chromeCtx, 0.85);
      // Travelling specular band
      chromeCtx.save();
      chromeCtx.globalCompositeOperation = "lighter";
      const bandX = ((time * 0.22) % 1.4 - 0.2) * width;
      const band = chromeCtx.createLinearGradient(bandX - width * 0.12, 0, bandX + width * 0.12, 0);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, "rgba(255,255,255,.55)");
      band.addColorStop(1, "rgba(255,255,255,0)");
      chromeCtx.fillStyle = band;
      chromeCtx.fillRect(0, 0, width, height);
      chromeCtx.restore();
      chromeCtx.globalCompositeOperation = "destination-in";
      chromeCtx.drawImage(maskCanvas, 0, 0, width, height);
      chromeCtx.globalCompositeOperation = "source-over";

      ctx.save();
      ctx.shadowColor = "rgba(83,244,224,.55)";
      ctx.shadowBlur = 22;
      ctx.drawImage(chromeCanvas, 0, 0, width, height);
      ctx.restore();

      drawStyledName(ctx, name, width / 2, nameY, {
        style,
        size: Math.min(height * 0.15, width * 0.075),
        maxWidth: width * 0.6,
        maxHeight: height * 0.15,
        minSize: 12,
        language,
        time,
        alpha: 0.9,
        glow: 0.35,
        paint: "rgba(226,255,251,.1)",
        stroke: "rgba(232,255,252,.6)",
        strokeWidth: 1.1,
        shadowColor: "#45ddd1",
        shadowBlur: 10
      });
    }

    drawVignette(ctx, width, height, 0.42);

    const tick = Math.floor(time * 0.9);
    if (tick !== lastTick) {
      lastTick = tick;
      if (Math.random() < 0.26) emitSound("waterDrop");
    }
  }

  return {
    resize,
    frame,
    destroy() {
      maskCanvas.width = 1;
      maskCanvas.height = 1;
      chromeCanvas.width = 1;
      chromeCanvas.height = 1;
    }
  };
}
