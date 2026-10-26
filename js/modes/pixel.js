import { setup2D, clamp, smoothstep, drawScanlines, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { createFire } from "./fire.js";
import { noise2, fbm2, mulberry32 } from "../motion.js";

/**
 * Pixel Campfire.
 *
 * A chunky 8-bit campsite rendered into a 400×225 buffer and blown up with
 * nearest-neighbour scaling. The fire is the same combustion model as the big
 * scenes, just quantised; fireflies wander on noise paths; the name is built
 * one block at a time on a wooden sign with flames licking above it.
 */
const VIEW_W = 400;
const VIEW_H = 225;

export function createMode({ canvas, name, language = "bn", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#080e1c");
  const { ctx } = surface;
  const style = typeStyle("pixel");
  const buffer = document.createElement("canvas");
  buffer.width = VIEW_W;
  buffer.height = VIEW_H;
  const px = buffer.getContext("2d");
  const fire = createFire({ quality: preview ? 0.4 : 0.85, seed: 5 });
  const rng = mulberry32(99);
  let width = 1;
  let height = 1;
  let stars = [];
  let fireflies = [];
  let lastPop = -1;

  fire.configure({ x: 200, y: 182, baseWidth: 15, flameHeight: 26 });

  function block(x, y, w, h, color) {
    px.fillStyle = color;
    px.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    stars = Array.from({ length: preview ? 26 : 58 }, () => ({ x: Math.round(rng() * VIEW_W), y: Math.round(rng() * 130), phase: rng() * 8, speed: 0.4 + rng() * 1.2 }));
    fireflies = Array.from({ length: preview ? 5 : 11 }, () => ({ x: 120 + rng() * 160, y: 70 + rng() * 60, phase: rng() * 10, seed: rng() * 50 }));
  }

  function drawMoon(time) {
    block(316, 26, 22, 22, "#f2e3cd");
    block(320, 22, 14, 4, "#f2e3cd");
    block(312, 30, 4, 14, "#f2e3cd");
    block(328, 30, 4, 14, "#f2e3cd");
    block(322, 30, 5, 5, "rgba(206,190,170,.7)");
    block(330, 36, 3, 3, "rgba(206,190,170,.55)");
    const glow = 0.5 + 0.5 * Math.sin(time * 0.6);
    if (glow > 0.6) block(310, 20, 34, 34, "rgba(255,235,200,.05)");
  }

  function drawHills() {
    block(0, 128, 66, 24, "#1b2640");
    block(66, 121, 58, 31, "#1b2640");
    block(124, 134, 68, 18, "#1f2842");
    block(192, 118, 78, 34, "#1b2640");
    block(270, 133, 58, 19, "#1f2842");
    block(328, 123, 72, 28, "#1b2640");
    block(0, 150, VIEW_W, 8, "#16233a");
  }

  function drawTent() {
    block(48, 125, 64, 4, "#b96a5f");
    block(56, 117, 48, 8, "#c67d6a");
    block(65, 108, 30, 9, "#d69377");
    block(75, 100, 12, 8, "#e3ab85");
    block(63, 129, 35, 24, "#9c5250");
    block(75, 135, 12, 18, "#141f30");
    block(66, 131, 28, 3, "#f0c087");
    block(80, 108, 2, 20, "#f0c087");
  }

  function drawTrees(time) {
    for (const [x, y, c] of [[16, 131, "#132b2a"], [32, 136, "#173830"], [120, 132, "#132b2a"], [142, 139, "#173830"], [352, 133, "#132b2a"], [374, 140, "#173830"]]) {
      const sway = Math.round(Math.sin(time * 0.7 + x) * 0.6);
      block(x + 8, y - 24, 4, 24, "#5c4038");
      block(x + 4 + sway, y - 18, 13, 7, c);
      block(x + 1 + sway, y - 12, 19, 7, c);
      block(x - 2 + sway, y - 6, 25, 7, c);
    }
  }

  function drawLogs(time) {
    block(182, 176, 36, 6, "#6d4234");
    block(178, 182, 42, 5, "#52383a");
    const coal = 0.4 + fire.light * 0.6;
    for (let index = 0; index < 6; index++) {
      const flick = noise2(index * 2.3, time * 2.4) > 0 ? 1 : 0;
      block(184 + index * 5, 178, 3, 2, flick ? `rgba(255,${Math.round(110 + coal * 90)},60,${coal})` : "rgba(150,50,20,.7)");
    }
  }

  function drawFireflies(time, dt) {
    for (const fly of fireflies) {
      fly.x += (noise2(fly.seed, time * 0.25) * 22 + Math.sin(time * 0.6 + fly.phase) * 10) * dt;
      fly.y += (noise2(fly.seed + 9, time * 0.3) * 18 + Math.cos(time * 0.5 + fly.phase) * 8) * dt;
      fly.x = clamp(fly.x, 110, 290);
      fly.y = clamp(fly.y, 62, 132);
      const blink = Math.sin(time * 1.6 + fly.phase) * 0.5 + 0.5;
      if (blink > 0.62) {
        block(fly.x, fly.y, 2, 2, "#cdf5a6");
        if (blink > 0.9) block(fly.x - 2, fly.y, 6, 2, "rgba(160,235,130,.18)");
      }
    }
  }

  function drawSign(time) {
    const boardY = 40;
    block(112, boardY - 6, 4, 16, "#6b4a34");
    block(284, boardY - 6, 4, 16, "#6b4a34");
    block(96, boardY, 208, 34, "#3d2c33");
    block(96, boardY, 208, 2, "#5b4249");
    block(96, boardY + 32, 208, 2, "#241a20");
    block(100, boardY + 3, 200, 1, "rgba(255,193,126,.16)");
    block(114, 54, 172, 1, "rgba(255,193,126,.08)");
  }

  function frame(dt, time) {
    // Sky with a dithered band between colours
    const sky = px.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, "#0f1832");
    sky.addColorStop(0.6, "#221a3a");
    sky.addColorStop(1, "#4a3150");
    px.fillStyle = sky;
    px.fillRect(0, 0, VIEW_W, 170);
    for (let y = 96; y < 132; y += 4) {
      for (let x = (y % 8 ? 0 : 2); x < VIEW_W; x += 4) block(x, y, 2, 2, "rgba(90,60,96,.35)");
    }

    for (const star of stars) {
      if (Math.sin(time * star.speed + star.phase) > 0.25) block(star.x, star.y, 2, 2, "#dfe9ff");
    }
    drawMoon(time);
    drawHills();
    block(0, 158, VIEW_W, 67, "#141f2c");
    block(0, 158, VIEW_W, 2, "#2c3f47");
    for (let index = 0; index < 30; index++) {
      const x = (noise2(index * 4.1, 3) * 0.5 + 0.5) * VIEW_W;
      const y = 162 + (noise2(index * 2.7, 7) * 0.5 + 0.5) * 58;
      block(x, y, 2, 2, "rgba(40,58,58,.6)");
    }
    drawTent();
    drawTrees(time);

    fire.configure({ x: 200, y: 181, baseWidth: 15, flameHeight: 24 + fire.light * 6 });
    fire.update(dt, time, { wind: fbm2(time * 0.3, 2, { octaves: 2, seed: 3 }) * 0.4, intensity: 1, turbulence: 1.15 });
    fire.drawGlow(px, { radius: 92, color: [255, 140, 60], strength: 0.75 });
    drawLogs(time);
    fire.draw(px, { smokeAlpha: 0.55 });

    // Light thrown onto the tent and the ground
    px.save();
    px.globalCompositeOperation = "lighter";
    px.globalAlpha = 0.1 + fire.light * 0.12;
    px.fillStyle = "#ff8a3c";
    px.fillRect(120, 140, 160, 40);
    px.restore();

    drawFireflies(time, dt);

    if (showName) {
      drawSign(time);
      const cycle = time % 14;
      const progress = smoothstep(1.2, 4.2, cycle) * (1 - smoothstep(11, 13.4, cycle));
      drawStyledName(px, name, 200, 57, {
        style,
        size: 17,
        maxWidth: 190,
        maxHeight: 20,
        minSize: 7,
        language,
        time,
        alpha: 1,
        glow: 0.9,
        paint: (context, { size }) => {
          const gradient = context.createLinearGradient(0, -size, 0, size * 0.8);
          gradient.addColorStop(0, "#ffe9a8");
          gradient.addColorStop(0.55, "#ffb15c");
          gradient.addColorStop(1, "#ff7a2c");
          return gradient;
        },
        perLetter: ({ index, count, time: now }) => {
          const delay = (index / Math.max(1, count)) * 0.6;
          const raw = clamp((progress - delay) / 0.4, 0, 1);
          const stepped = Math.round(raw * 4) / 4;
          const flameFlick = noise2(index * 5.5, now * 4) > 0.1 ? 1 : 0.75;
          return {
            alpha: stepped * flameFlick,
            dy: Math.round((1 - stepped) * -4 / 2) * 2,
            scaleY: stepped > 0.5 ? 1 : 0.7
          };
        },
        progress
      });
      // Flames licking above the letters
      const count = Math.max(6, Math.min(16, name.length * 2));
      for (let index = 0; index < count; index++) {
        const x = 112 + (index + 0.5) * (176 / count);
        const step = Math.floor(time * 9 + index * 3) % 6;
        const height = 3 + ((step + index) % 4);
        const y = 30 - height * 0.6;
        block(x, y, 2, height, step % 2 ? "#ff8a3c" : "#ffd166");
        if (step > 3) block(x, y - 2, 2, 2, "rgba(255,220,150,.5)");
      }
      block(120, 74, 160, 1, "rgba(255,180,110,.12)");
    }

    // CRT dressing
    px.fillStyle = "rgba(6,11,22,.62)";
    px.fillRect(0, 214, VIEW_W, 11);
    px.fillStyle = "#a6c5ac";
    px.font = `400 8px "Hind Siliguri", monospace`;
    px.textAlign = "left";
    px.textBaseline = "middle";
    px.fillText(language === "bn" ? "শুভ রাত্রি · আগুনের পাশে" : "GOOD NIGHT · BY THE FIRE", 10, 220);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#080e1c";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(buffer, 0, 0, VIEW_W, VIEW_H, 0, 0, width, height);
    drawScanlines(ctx, 0, 0, width, height, { spacing: Math.max(3, Math.round(height / 150)), alpha: 0.13 });
    ctx.save();
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    const pop = Math.floor(time * 2.2);
    if (pop !== lastPop && fire.light > 0.85) lastPop = pop;
  }

  return {
    resize,
    frame,
    destroy() {
      buffer.width = 1;
      buffer.height = 1;
    }
  };
}
