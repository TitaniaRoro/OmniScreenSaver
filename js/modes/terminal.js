import { setup2D, clamp, nameSize, roundedRect, drawScanlines, drawVignette, measureName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { splitGraphemes } from "../text.js";
import { noise2, flicker } from "../motion.js";

/**
 * Hacker Terminal.
 *
 * A friendly console that boots, thinks, and types. Lines appear at their own
 * typing speeds with a caret, the panel has the faint instability of a real
 * CRT, and the name is typed out last, one cluster at a time, before it starts
 * to glow.
 */
export function createMode({ canvas, name, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#020707");
  const { ctx } = surface;
  const style = typeStyle("terminal");
  let width = 1;
  let height = 1;
  let lastCue = -1;

  function messages() {
    return language === "bn"
      ? ["সিস্টেম প্রস্তুত করা হচ্ছে…", "নিরাপদ সংযোগ তৈরি হয়েছে", "ব্যবহারকারী শনাক্ত হয়েছে", `স্বাগতম, ${showName ? name : "বন্ধু"}`, "আলোর জগৎ লোড হচ্ছে…"]
      : ["Initializing visual engine…", "Secure session established", "Identity recognized", `Welcome, ${showName ? name : "friend"}`, "Loading a little wonder…"];
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
  }

  function frame(dt, time) {
    ctx.fillStyle = "#020707";
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(width * 0.84, 940);
    const panelH = Math.min(height * 0.78, 580);
    const left = (width - panelW) / 2;
    const top = (height - panelH) / 2;
    const crt = 0.86 + flicker(time, 3, { speed: 5.5 }) * 0.14;

    ctx.save();
    ctx.globalAlpha = crt;
    ctx.shadowColor = "rgba(37,230,153,.14)";
    ctx.shadowBlur = 42;
    ctx.fillStyle = "rgba(4,15,13,.97)";
    ctx.strokeStyle = "rgba(81,219,158,.32)";
    ctx.lineWidth = 1;
    roundedRect(ctx, left, top, panelW, panelH, 16);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    const bar = ctx.createLinearGradient(left, top, left + panelW, top + 30);
    bar.addColorStop(0, "rgba(39,129,96,.42)");
    bar.addColorStop(1, "rgba(24,67,61,.26)");
    ctx.fillStyle = bar;
    roundedRect(ctx, left + 1, top + 1, panelW - 2, 40, 15);
    ctx.fill();
    ctx.fillStyle = "#68cfa4";
    ctx.font = `400 ${Math.max(10, Math.min(13, panelW * 0.018))}px "Hind Siliguri", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(language === "bn" ? "অমনিস্ক্রিনসেভার · নিরাপদ সেশন" : "OMNISCREENSAVER · SECURE SESSION", left + 22, top + 22);
    ["#ff8585", "#f4ce81", "#82e1ae"].forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = (index === 2 ? 0.9 : 0.55) * crt;
      ctx.beginPath();
      ctx.arc(left + panelW - 54 + index * 15, top + 20, 3.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    const lines = messages();
    const cycle = time % 22;
    const lineGap = Math.max(24, Math.min(40, panelH * 0.082));
    const firstY = top + 84;
    const bodySize = Math.max(12, Math.min(18, panelW * 0.022));
    let caret = null;

    for (let index = 0; index < lines.length; index++) {
      const start = index * 2.6 + 0.6;
      const graphemes = splitGraphemes(lines[index], language);
      const typed = clamp((cycle - start) / Math.max(0.9, graphemes.length * 0.07), 0, 1) * graphemes.length;
      if (typed <= 0) break;
      const shown = graphemes.slice(0, Math.floor(typed)).join("");
      const y = firstY + index * lineGap;
      ctx.font = `400 ${bodySize}px ${style.family}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = index === 3 ? "#b8ffd8" : "#72d8a5";
      ctx.shadowColor = "rgba(75,255,163,.45)";
      ctx.shadowBlur = 6;
      ctx.fillText(`${index === 3 ? "✦" : "›"} ${shown}`, left + 26, y, panelW - 52);
      ctx.shadowBlur = 0;
      if (typed < graphemes.length) {
        caret = { x: left + 30 + ctx.measureText(`${index === 3 ? "✦" : "›"} ${shown}`).width, y, size: bodySize };
      }
    }

    if (caret && Math.sin(time * 9) > -0.2) {
      ctx.fillStyle = "#a9ffca";
      ctx.fillRect(caret.x, caret.y + 2, Math.max(5, caret.size * 0.5), caret.size * 1.05);
    }

    // The name, typed out and then held in a glow
    const nameStart = lines.length * 2.6 + 0.8;
    if (showName && cycle > nameStart) {
      const progress = clamp((cycle - nameStart) / 2.6, 0, 1);
      // One canonical size for the panel box (see type-styles.js): measure and
      // draw share it so the typed-out clusters sit exactly where they were
      // measured, instead of a second hardcoded fraction drifting from it.
      const size = nameSize(style, panelW * 0.84, panelH, { min: 20, max: 72 });
      const metrics = measureName(ctx, name, style, size, language);
      const revealGraphemes = metrics.clusters.length;
      const typedCount = Math.ceil(progress * revealGraphemes * 1.25);

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${style.weight} ${size}px ${style.family}`;
      const nameY = top + panelH * 0.74;
      let cursor = width / 2 - metrics.total / 2;
      for (let index = 0; index < metrics.clusters.length; index++) {
        const cluster = metrics.clusters[index];
        const clusterWidth = metrics.widths[index];
        const centre = cursor + clusterWidth / 2;
        cursor += clusterWidth + metrics.tracking;
        if (index >= typedCount) continue;
        const glow = 0.7 + noise2(index * 2.3, time * 1.4) * 0.3;
        ctx.shadowColor = "#40d98b";
        ctx.shadowBlur = 22 * glow;
        const gradient = ctx.createLinearGradient(centre - clusterWidth, nameY - size * 0.5, centre + clusterWidth, nameY + size * 0.5);
        gradient.addColorStop(0, "#42c987");
        gradient.addColorStop(0.5, "#e6fff0");
        gradient.addColorStop(1, "#6ef0ae");
        ctx.fillStyle = gradient;
        ctx.fillText(cluster, centre, nameY);
      }
      ctx.restore();
      ctx.shadowBlur = 0;

      if (progress < 1 && Math.sin(time * 9) > -0.2) {
        ctx.fillStyle = "#a9ffca";
        ctx.fillRect(width / 2 + metrics.total / 2 + 6, top + panelH * 0.74 - size * 0.4, Math.max(6, size * 0.42), size * 0.8);
      }

      // A little progress bar that fills while the world loads
      const load = clamp((cycle - nameStart - 1) / 6, 0, 1);
      const barW = panelW * 0.5;
      const barX = left + (panelW - barW) / 2;
      const barY = top + panelH - 54;
      ctx.fillStyle = "rgba(81,219,158,.14)";
      roundedRect(ctx, barX, barY, barW, 6, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(120,240,180,.75)";
      roundedRect(ctx, barX, barY, barW * load, 6, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(119,215,165,.5)";
      ctx.font = `400 ${Math.max(9, Math.min(12, panelW * 0.016))}px "Hind Siliguri", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        language === "bn"
          ? `সব অ্যানিমেশন চলছে · ${Math.round(load * 100)}%`
          : `ALL VISUAL SYSTEMS NOMINAL · ${Math.round(load * 100)}%`,
        width / 2,
        barY + 22
      );
    }

    ctx.restore();

    drawScanlines(ctx, left, top, panelW, panelH, { spacing: preview ? 6 : 4, alpha: 0.09 });
    drawVignette(ctx, width, height, 0.42);

    const cue = Math.floor(time / 22);
    if (cue !== lastCue) {
      lastCue = cue;
      if (!preview) emitSound("keyboard");
    }
  }

  return { resize, frame, destroy() {} };
}
