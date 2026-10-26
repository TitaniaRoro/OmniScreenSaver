import {
  setup2D, TAU, clamp, rgba, roundedRect,
  drawStyledName, drawVignette, makeStarField, drawTwinklingStars
} from "./common.js";
import { typeStyle } from "./type-styles.js";
import { banglaCalendarDate, dhakaTimeParts } from "../calendar.js";
import { translate } from "../i18n.js";
import { fbm3, easeOutCubic } from "../motion.js";

/**
 * Flip Clock.
 *
 * Only the cards that change actually flip, and they do it the way a real
 * split-flap does: the top half of the old digit falls away, and the bottom
 * half of the new one drops into place with a shadow travelling across it.
 * Underneath, clouds drift and the greeting turns over word by word.
 */
const FLIP_DURATION = 0.62;

export function createMode({ canvas, name, language = "en", showName, preview = false }) {
  const surface = setup2D(canvas, "#091026");
  const { ctx } = surface;
  const style = typeStyle("clock");
  let width = 1;
  let height = 1;
  let stars = [];
  let clouds = [];
  let cachedTime = null;
  let cards = [
    { value: "0", previous: "0", flip: 1 },
    { value: "0", previous: "0", flip: 1 },
    { value: "0", previous: "0", flip: 1 },
    { value: "0", previous: "0", flip: 1 }
  ];
  let lastTimeText = "";
  let greetingPhase = 1;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    stars = makeStarField(preview ? 24 : 90, w, h, { topRatio: 0.62, seed: 21 });
    clouds = Array.from({ length: preview ? 1 : 3 }, (_, index) => ({
      x: (index + 0.5) / 3,
      y: 0.2 + index * 0.09,
      scale: 0.7 + index * 0.3,
      speed: 0.004 + index * 0.0022,
      seed: index * 13
    }));
  }

  function cardFace(x, y, w, h, text, { top = false, bottom = false } = {}) {
    ctx.save();
    ctx.beginPath();
    if (top) ctx.rect(x, y, w, h / 2);
    else if (bottom) ctx.rect(x, y + h / 2, w, h / 2);
    else roundedRect(ctx, x, y, w, h, Math.min(14, h * 0.12));
    ctx.clip();
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, "#1b284f");
    gradient.addColorStop(0.5, "#131e3f");
    gradient.addColorStop(1, "#0d1732");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#eaf1ff";
    ctx.font = `700 ${h * 0.62}px "Baloo Da 2", "Hind Siliguri", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(126,172,255,.45)";
    ctx.shadowBlur = h * 0.14;
    ctx.fillText(text, x + w / 2, y + h / 2 + h * 0.01);
    ctx.restore();
  }

  function drawCard(x, y, w, h, card, time) {
    const flipping = card.flip < 1;
    ctx.save();
    ctx.shadowColor = "rgba(20,40,110,.5)";
    ctx.shadowBlur = h * 0.3;
    ctx.fillStyle = "#0b1228";
    roundedRect(ctx, x, y, w, h, Math.min(14, h * 0.12));
    ctx.fill();
    ctx.restore();

    if (!flipping) {
      cardFace(x, y, w, h, card.value);
    } else {
      const p = card.flip;
      // Static halves: the new digit above, the old one below.
      cardFace(x, y, w, h, card.value, { top: true });
      cardFace(x, y, w, h, card.previous, { bottom: true });

      ctx.save();
      ctx.beginPath();
      if (p < 0.5) ctx.rect(x, y, w, h / 2);
      else ctx.rect(x, y + h / 2, w, h / 2);
      ctx.clip();
      const scaleY = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2;
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(1, Math.max(0.02, scaleY));
      ctx.font = `700 ${h * 0.62}px "Baloo Da 2", "Hind Siliguri", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // The falling flap carries the old top half, then the new bottom half.
      const faceGradient = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      faceGradient.addColorStop(0, "#1b284f");
      faceGradient.addColorStop(1, "#0f1a38");
      ctx.fillStyle = faceGradient;
      ctx.fillRect(-w / 2, p < 0.5 ? -h / 2 : 0, w, h / 2 + 1);
      ctx.fillStyle = "#eaf1ff";
      ctx.fillText(p < 0.5 ? card.previous : card.value, 0, p < 0.5 ? -h / 4 + h * 0.01 : h / 4 + h * 0.01);
      // Shadow across the flap as it turns
      const shade = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      shade.addColorStop(0, "rgba(0,0,0,.55)");
      shade.addColorStop(1, "rgba(0,0,0,.05)");
      ctx.fillStyle = shade;
      ctx.globalAlpha = 0.5 * (1 - Math.abs(p - 0.5) * 2);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Hinge line
    ctx.fillStyle = "rgba(4,8,21,.5)";
    ctx.fillRect(x + 1, y + h / 2 - 1, w - 2, 2);
    ctx.strokeStyle = "rgba(181,199,255,.16)";
    ctx.lineWidth = 1;
    roundedRect(ctx, x, y, w, h, Math.min(14, h * 0.12));
    ctx.stroke();
  }

  function frame(dt, time) {
    const now = new Date();
    const parts = dhakaTimeParts(now, language);
    const hourText = (parts?.hourText || "12").padStart(2, language === "bn" ? "০" : "0");
    const minuteText = (parts?.minuteText || "00").padStart(2, language === "bn" ? "০" : "0");
    const digits = [...hourText, ...minuteText].slice(0, 4);
    const timeText = digits.join("");

    if (timeText !== lastTimeText) {
      for (let index = 0; index < cards.length; index++) {
        if (cards[index].value !== digits[index]) {
          cards[index].previous = cards[index].value;
          cards[index].value = digits[index];
          cards[index].flip = 0;
        }
      }
      lastTimeText = timeText;
    }
    for (const card of cards) card.flip = Math.min(1, card.flip + dt / FLIP_DURATION);

    // Greeting turns over when the hour changes
    const greetKey = parts?.hour < 12
      ? (language === "bn" ? "bnGoodMorning" : "goodMorning")
      : parts?.hour < 17
        ? (language === "bn" ? "bnGoodAfternoon" : "goodAfternoon")
        : parts?.hour < 21
          ? (language === "bn" ? "bnGoodEvening" : "goodEvening")
          : (language === "bn" ? "bnGoodNight" : "goodNight");
    const greeting = translate(language, greetKey) + (showName && name ? `, ${name}` : "");
    if (greeting !== cachedTime) {
      cachedTime = greeting;
      greetingPhase = 0;
    }
    greetingPhase = Math.min(1, greetingPhase + dt * 0.55);

    // Sky
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0a1230");
    bg.addColorStop(0.45, "#182449");
    bg.addColorStop(1, "#070c1c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const moonX = width * 0.82;
    const moonY = height * 0.2;
    const moonR = Math.min(width, height) * 0.045;
    const moon = ctx.createRadialGradient(moonX - moonR * 0.3, moonY - moonR * 0.3, 1, moonX, moonY, moonR * 1.4);
    moon.addColorStop(0, "#fbf4ff");
    moon.addColorStop(0.55, "#b9c9ff");
    moon.addColorStop(1, "rgba(135,161,230,0)");
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 1.5, 0, TAU);
    ctx.fill();

    drawTwinklingStars(ctx, stars, time, { color: "#e8e7ff", base: 0.22 });

    // Clouds
    ctx.save();
    for (const cloud of clouds) {
      const x = ((cloud.x + time * cloud.speed) % 1.4 - 0.2) * width;
      const y = cloud.y * height;
      const w = width * 0.3 * cloud.scale;
      const h = height * 0.045 * cloud.scale;
      const gradient = ctx.createLinearGradient(0, y - h, 0, y + h);
      gradient.addColorStop(0, "rgba(150,175,235,.13)");
      gradient.addColorStop(1, "rgba(80,100,180,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      for (let index = 0; index < 4; index++) {
        const bump = fbm3(index * 2.1 + cloud.seed, time * 0.04, cloud.seed, { octaves: 2, seed: cloud.seed });
        ctx.moveTo(x + (index / 3 - 0.5) * w + w * 0.2, y + bump * h);
        ctx.ellipse(x + (index / 3 - 0.5) * w, y + bump * h * 0.5, w * 0.22, h * (0.5 + Math.abs(bump) * 0.7), 0, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();

    // Cards
    const cardH = Math.min(height * 0.3, width * 0.34, 240);
    const cardY = height * 0.28;
    const cardGap = Math.max(4, cardH * 0.03);
    const cardW = Math.min(width * 0.135, cardH * 0.78);
    const groupGap = Math.max(10, width * 0.02);
    const groupW = cardW * 2 + cardGap;
    const totalW = groupW * 2 + groupGap + cardW * 0.18;
    const startX = (width - totalW) / 2;

    drawCard(startX, cardY, cardW, cardH, cards[0], time);
    drawCard(startX + cardW + cardGap, cardY, cardW, cardH, cards[1], time);
    ctx.fillStyle = "#c8d6ff";
    ctx.font = `700 ${cardH * 0.26}px "Baloo Da 2", "Hind Siliguri", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.cos(now.getMilliseconds() / 1000 * Math.PI));
    ctx.fillText(":", startX + groupW + groupGap / 2, cardY + cardH / 2);
    ctx.globalAlpha = 1;
    const rightX = startX + groupW + groupGap + cardW * 0.18;
    drawCard(rightX, cardY, cardW, cardH, cards[2], time);
    drawCard(rightX + cardW + cardGap, cardY, cardW, cardH, cards[3], time);

    ctx.fillStyle = "#aebcdb";
    ctx.font = `500 ${Math.max(11, cardH * 0.1)}px "Hind Siliguri", sans-serif`;
    ctx.fillText(`${parts?.dayPeriod || ""}  ·  ${language === "bn" ? "ঢাকা, বাংলাদেশ" : "DHAKA, BANGLADESH"}`, width / 2, cardY + cardH + Math.max(16, cardH * 0.14));

    if (showName) {
      drawStyledName(ctx, greeting, width / 2, height * 0.73, {
        style,
        size: Math.min(height * 0.075, width * 0.045),
        maxWidth: width * 0.82,
        maxHeight: height * 0.08,
        minSize: 12,
        language,
        time,
        alpha: 0.95,
        glow: 0.9,
        paint: (context, { size }) => {
          const gradient = context.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
          gradient.addColorStop(0, "#f4f7ff");
          gradient.addColorStop(0.6, "#d8e2ff");
          gradient.addColorStop(1, "#b9c9ff");
          return gradient;
        },
        perLetter: ({ index, count }) => {
          const delay = (index / Math.max(1, count)) * 0.6;
          const local = easeOutCubic(clamp((greetingPhase - delay) / 0.4, 0, 1));
          return { alpha: local, dy: (1 - local) * 8, rotate: (1 - local) * 0.12 };
        },
        progress: greetingPhase
      });
    }

    const banglaDate = banglaCalendarDate(now, language);
    ctx.fillStyle = "rgba(196,207,240,.72)";
    ctx.font = `400 ${Math.max(11, Math.min(17, width * 0.014))}px "Hind Siliguri", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${parts?.dateText || ""}  ·  ${banglaDate.text}`, width / 2, height * 0.82, width * 0.88);

    // Tree line along the bottom
    const ridgeY = height * 0.94;
    ctx.fillStyle = "rgba(6,11,28,.9)";
    ctx.beginPath();
    ctx.moveTo(0, ridgeY);
    for (let x = 0; x <= width; x += Math.max(10, width / 40)) {
      const bump = Math.abs(fbm3(x * 0.002, 7.3, 0, { octaves: 3, seed: 31 }));
      ctx.lineTo(x, ridgeY - bump * height * 0.08);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    drawVignette(ctx, width, height, 0.44);
  }

  return { resize, frame, destroy() {} };
}
