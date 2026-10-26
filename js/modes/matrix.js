import { setup2D, clamp, random, drawVignette, measureName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { splitGraphemes } from "../text.js";
import { noise2 } from "../motion.js";

const LATIN = Array.from("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz@$%+=<>/\\");
const BENGALI = splitGraphemes("অআইঈউঊঋএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহড়ঢ়য়ৎংঃঁ", "bn");

/**
 * Matrix Rain.
 *
 * Streams fall at their own speeds and each glyph holds still for a moment
 * before flipping — constant re-randomising is what makes cheap rain look
 * fake. The head of a stream is bright, the tail decays. In the middle of the
 * downpour the name resolves: the letters cycle through noise and lock in,
 * left to right, before washing away again.
 */
export function createMode({ canvas, name, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#020a07");
  const { ctx } = surface;
  const style = typeStyle("matrix");
  let width = 1;
  let height = 1;
  let columns = [];
  let chars = LATIN;
  let lastTick = 0;

  function makeColumn(fontSize, index) {
    const trail = Math.floor(random(6, 22));
    return {
      y: random(-height, 0),
      speed: random(48, 190) * (Math.random() < 0.12 ? 1.6 : 1),
      trail,
      fontSize,
      cells: Array.from({ length: trail + 2 }, () => ({ glyph: chars[Math.floor(random(0, chars.length))], until: 0 })),
      bright: Math.random() < 0.14,
      index
    };
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    chars = language === "bn" ? BENGALI : LATIN;
    const fontSize = Math.max(12, Math.min(22, Math.round(width / (preview ? 34 : 72))));
    const count = Math.ceil(width / fontSize) + 1;
    columns = Array.from({ length: count }, (_, index) => makeColumn(fontSize, index));
  }

  function frame(dt, time) {
    ctx.fillStyle = "rgba(1,8,6,.3)";
    ctx.fillRect(0, 0, width, height);

    for (const stream of columns) {
      stream.y += stream.speed * dt;
      if (stream.y - stream.trail * stream.fontSize > height) {
        Object.assign(stream, makeColumn(stream.fontSize, stream.index));
        stream.y = random(-height * 0.4, -20);
      }
      ctx.font = `${style.weight} ${stream.fontSize}px ${style.family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let line = 0; line < stream.trail; line++) {
        const y = stream.y - line * stream.fontSize;
        if (y < -stream.fontSize * 2 || y > height + stream.fontSize) continue;
        const cell = stream.cells[line % stream.cells.length];
        if (time > cell.until) {
          cell.glyph = chars[Math.floor(random(0, chars.length))];
          cell.until = time + random(0.05, 0.34);
        }
        const strength = 1 - line / stream.trail;
        ctx.globalAlpha = clamp(strength * (stream.bright ? 0.95 : 0.78), 0.06, 0.92);
        if (line === 0) {
          ctx.fillStyle = "#e6ffef";
          ctx.shadowColor = "#b6ffcf";
          ctx.shadowBlur = 14;
        } else {
          ctx.fillStyle = `hsl(${112 + strength * 34} 92% ${18 + strength * 52}%)`;
          ctx.shadowColor = "#2fd765";
          ctx.shadowBlur = line < 3 ? 8 : 0;
        }
        const sway = noise2(stream.index * 0.33, time * 0.08 + line * 0.1) * (stream.index % 3 === 0 ? 3.2 : 1.3);
        ctx.fillText(cell.glyph, stream.index * stream.fontSize + stream.fontSize / 2 + sway, y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (showName) {
      const cycle = time % 18;
      const progress = clamp(
        Math.min((cycle - 4.5) / 3.2, (13.4 - cycle) / 1.6),
        0,
        1
      );
      if (progress > 0.01) {
        // Dark panel so the name reads through the rain
        ctx.save();
        ctx.globalAlpha = 0.55 * progress;
        ctx.fillStyle = "rgba(1,10,7,.86)";
        ctx.fillRect(0, height * 0.38, width, height * 0.24);
        ctx.restore();

        const size = Math.min(height * 0.15, width * 0.075);
        const metrics = measureName(ctx, name, style, size, language);
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${style.weight} ${size}px ${style.family}`;
        let cursor = width / 2 - metrics.total / 2;
        for (let index = 0; index < metrics.clusters.length; index++) {
          const cluster = metrics.clusters[index];
          const clusterWidth = metrics.widths[index];
          const delay = (index / Math.max(1, metrics.clusters.length)) * 0.55;
          const local = clamp((progress - delay) / 0.45, 0, 1);
          const centre = cursor + clusterWidth / 2;
          cursor += clusterWidth + metrics.tracking;
          if (local >= 1) {
            ctx.shadowColor = "#22ff6a";
            ctx.shadowBlur = 26;
            ctx.fillStyle = `rgba(206,255,220,${0.86 + Math.sin(time * 2 + index) * 0.1})`;
            ctx.fillText(cluster, centre, height / 2);
          } else {
            // Still resolving: cycle through glyphs, then snap into place.
            const step = Math.floor(time * 14 + index * 3);
            const glyph = chars[(step * 7 + index * 13) % chars.length];
            ctx.shadowColor = "#1fd45f";
            ctx.shadowBlur = 12;
            ctx.fillStyle = `rgba(120,255,170,${0.35 + local * 0.5})`;
            ctx.fillText(glyph, centre, height / 2 + (1 - local) * 6);
          }
        }
        ctx.restore();
        ctx.shadowBlur = 0;
      }
    }

    drawVignette(ctx, width, height, 0.44);

    const tick = Math.floor(time * 1.6);
    if (tick !== lastTick) {
      lastTick = tick;
      if (!preview && Math.random() < 0.2) emitSound("digitalTick");
    }
  }

  return { resize, frame, destroy() {} };
}
