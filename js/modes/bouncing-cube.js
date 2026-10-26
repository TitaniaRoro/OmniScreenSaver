import { setup2D, TAU, clamp, random, rgba, drawVignette } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { Spring } from "../motion.js";

/**
 * Isometric Bouncing Cube.
 *
 * The freefrontend "isometric 3D bouncing cube" animation as a living world:
 * one true cube — six faces, backface-culled and painter-sorted — hops across
 * an isometric floor grid with real gravity. Each landing squashes the body,
 * shrinks-and-darkens its ground shadow, rings the floor tile it hit, and
 * throws a few sparks. The cube keeps yawing about the vertical axis between
 * bounces so every face gets its turn at the light, and the name rides two
 * opposite faces as chunky arcade capitals stamped through the face's own
 * shear basis — the letters travel with the tumble instead of floating on top.
 */

const GRAVITY = 1500;        // unit-space px/s²
const RESTITUTION = 0.82;    // energy kept per bounce
const HALF = 7;              // cube half-extent in iso units

export function createMode({ canvas, name, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#0a0f1e");
  const { ctx } = surface;
  const style = typeStyle("cube");
  const palette = style.palette;

  const squashY = new Spring(1, { stiffness: 260, damping: 14 });
  const lean = new Spring(0, { stiffness: 90, damping: 10 });

  let width = 1;
  let height = 1;
  let unit = 1;              // pixels per iso unit
  let ox = 0;
  let oy = 0;

  // Motion state lives in unit space: x right along the floor, y up, z depth.
  let cx = 0;
  let cy = 26;               // bottom of the cube above the floor
  let vy = 0;
  let vx = 22;
  let yaw = 0.6;
  let lastBounce = -1;
  let rings = [];
  let sparks = [];

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    unit = Math.min(width, height) / (preview ? 44 : 32);
    ox = width / 2;
    oy = height * (preview ? 0.66 : 0.7);
    cx = clamp(cx || 0, -12, 12);
    cy = clamp(cy, 0, 40);
  }

  /** Project a unit-space point (x right, y up, z toward viewer) to pixels. */
  function P(x, y, z) {
    return [ox + (x - z) * unit * 0.86, oy + (x + z) * unit * 0.215 - y * unit];
  }

  function frame(dt, time) {
    const step = Math.min(dt, 1 / 30);

    /* ---------------- sky ---------------- */
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0a0f1e");
    sky.addColorStop(0.62, "#121c33");
    sky.addColorStop(1, "#0c1322");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Soft key light behind the play area.
    const haloX = ox + Math.sin(time * 0.2) * width * 0.05;
    const halo = ctx.createRadialGradient(haloX, oy - unit * 12, 0, haloX, oy - unit * 12, Math.max(width, height) * 0.55);
    halo.addColorStop(0, rgba(palette.glow, 0.09));
    halo.addColorStop(1, rgba(palette.glow, 0));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    /* ---------------- physics ---------------- */
    vy -= GRAVITY * step;
    cy += vy * step;
    cx += vx * step * 0.3;
    if (cx > 12 || cx < -12) {
      vx *= -1;
      cx = clamp(cx, -12, 12);
      lean.to(vx > 0 ? -0.14 : 0.14);
    }
    if (cy <= 0) {
      cy = 0;
      if (vy < -60) {
        const strength = clamp(-vy / 1100, 0.25, 1);
        vy = -vy * RESTITUTION;
        // Keep it lively: each landing tops the hop back up to a healthy arc.
        const target = Math.sqrt(2 * GRAVITY * (preview ? 16 : 24));
        vy = Math.max(vy, target);
        squashY.set(1 - 0.32 * strength).to(1);
        lean.velocity += random(-40, 40) * strength;
        rings.push({ x: cx, age: 0, life: 1 + strength * 0.6, power: strength });
        for (let index = 0; index < (preview ? 4 : 12); index++) {
          sparks.push({
            x: cx + random(-HALF, HALF),
            z: random(-HALF, HALF),
            vx: random(-20, 20),
            vz: random(-20, 20),
            vy: random(40, 160) * strength,
            age: 0,
            life: random(0.35, 0.8)
          });
        }
        if (time - lastBounce > 0.35) {
          lastBounce = time;
          if (!preview) emitSound("cubeBounce");
        }
      } else {
        vy = Math.sqrt(2 * GRAVITY * (preview ? 16 : 24));   // never settles
        squashY.set(0.86).to(1);
        rings.push({ x: cx, age: 0, life: 1.1, power: 0.6 });
        if (time - lastBounce > 0.35) {
          lastBounce = time;
          if (!preview) emitSound("cubeBounce");
        }
      }
    }
    yaw += (1.05 + Math.abs(vx) * 0.01) * step;
    squashY.step(step);
    lean.step(step);

    /* ---------------- floor ---------------- */
    drawFloor(time);
    for (const ring of rings) ring.age += step;
    rings = rings.filter(ring => ring.age < ring.life);
    for (const ring of rings) {
      const t = ring.age / ring.life;
      drawRing(ring.x, 3 + t * 24, rgba(palette.edge, (1 - t) * 0.45 * ring.power));
    }

    /* ---------------- ground shadow ---------------- */
    const airborne = clamp(cy / 26, 0, 1);
    const shadowScale = 1 - airborne * 0.4;
    const shadowAlpha = 0.45 * (1 - airborne * 0.6);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    drawRing(cx, HALF * shadowScale, `rgba(4,6,14,${shadowAlpha.toFixed(3)})`, true);
    ctx.restore();

    /* ---------------- cube ---------------- */
    drawCube(time);

    /* ---------------- sparks ---------------- */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const spark of sparks) {
      spark.age += step;
      if (spark.age >= spark.life) continue;
      spark.vy -= 380 * step;
      spark.x += spark.vx * step * 0.3;
      spark.z += spark.vz * step * 0.3;
      spark.y = Math.max(0, (spark.y || 0) + spark.vy * step);
      const fade = 1 - spark.age / spark.life;
      const [px, py] = P(spark.x, spark.y + 1, spark.z);
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(px, py, 1.6 * fade + 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    sparks = sparks.filter(spark => spark.age < spark.life);

    drawVignette(ctx, width, height, 0.42);
  }

  /** Isometric floor grid: lines along x and z, brighter toward the viewer. */
  function drawFloor(time) {
    const span = preview ? 8 : 13;
    const s = 2;
    ctx.save();
    ctx.lineWidth = 1;
    for (let line = -span; line <= span; line++) {
      const depth = (line + span) / (span * 2);
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.7 + line * 0.55);
      ctx.strokeStyle = rgba("#41608f", 0.05 + 0.14 * depth + pulse * 0.02);
      const a1 = P(line * s, 0, -span * s);
      const b1 = P(line * s, 0, span * s);
      const a2 = P(-span * s, 0, line * s);
      const b2 = P(span * s, 0, line * s);
      ctx.beginPath();
      ctx.moveTo(a1[0], a1[1]);
      ctx.lineTo(b1[0], b1[1]);
      ctx.moveTo(a2[0], a2[1]);
      ctx.lineTo(b2[0], b2[1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Diamond footprint on the floor at y=0 (filled when `fill` is true). */
  function drawRing(unitX, radiusUnits, stroke, fill = false) {
    const r = radiusUnits;
    const p0 = P(unitX - r, 0, 0);
    const p1 = P(unitX, 0, -r);
    const p2 = P(unitX + r, 0, 0);
    const p3 = P(unitX, 0, r);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = stroke;
      ctx.fill();
    } else {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  /**
   * Draw the cube: eight corners rotated by yaw, six faces culled by signed
   * screen area, survivors painted far-to-near with lambert-ish shading and
   * the name sheared onto the two word-bearing faces.
   */
  function drawCube(time) {
    const sq = clamp(squashY.value, 0.6, 1.15);
    const stretch = 1 / Math.sqrt(sq);                    // conserve volume
    const baseY = cy + HALF - HALF * sq;                  // feet stay planted
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);
    const tiltX = lean.value;

    // Corner index = iy*4 + ix*2 + iz, with iy 0 = bottom.
    const corners = [];
    for (let iy = 0; iy < 2; iy++) {
      for (let ix = 0; ix < 2; ix++) {
        for (let iz = 0; iz < 2; iz++) {
          const lx = (ix ? 1 : -1) * HALF * stretch;
          const ly = (iy ? 1 : -1) * HALF * sq;
          const lz = (iz ? 1 : -1) * HALF * stretch;
          const rx = lx * ca + lz * sa;
          const rz = -lx * sa + lz * ca;
          const rr = 1 + tiltX * (iy ? 1 : -1) * 0.12;
          corners.push(P(cx + rx * rr, baseY + ly, rz * rr));
        }
      }
    }

    // Corner index = iy*4 + ix*2 + iz (iy 0 = bottom). Quads are ordered so a
    // front-facing polygon runs counter-clockwise on screen (negative area).
    const faces = [
      { quad: [0, 1, 3, 2], n: [0, 0, -1], label: 3 },   // back  (-z): name
      { quad: [4, 6, 7, 5], n: [0, 0, 1], label: 0 },    // front (+z): name
      { quad: [1, 5, 7, 3], n: [1, 0, 0], label: 1 },    // right (+x)
      { quad: [2, 6, 4, 0], n: [-1, 0, 0], label: 4 },   // left  (-x)
      { quad: [4, 5, 7, 6], n: [0, 1, 0], label: 2 },    // top   (+y)
      { quad: [0, 2, 3, 1], n: [0, -1, 0], label: 5 }    // bottom(-y)
    ];

    const light = normalize([-0.55, 0.62, 0.55]);
    const drawn = [];
    for (const face of faces) {
      // Rotate the horizontal part of the normal by yaw for shading.
      const nx = face.n[0] * ca + face.n[2] * sa;
      const nz = -face.n[0] * sa + face.n[2] * ca;
      const dot = nx * light[0] + face.n[1] * light[1] + nz * light[2];
      const points = face.quad.map(index => corners[index]);
      let area = 0;
      for (let i = 0; i < 4; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % 4];
        area += x1 * y2 - x2 * y1;
      }
      if (area >= 0) continue;                             // back-facing
      const centroidY = points.reduce((sum, point) => sum + point[1], 0) / 4;
      drawn.push({ ...face, points, dot: Math.abs(dot), centroidY });
    }
    drawn.sort((a, b) => a.centroidY - b.centroidY);       // far (higher on screen) first

    for (const face of drawn) {
      const brightness = clamp(0.2 + face.dot * 0.75, 0.16, 0.95);
      polygon(face.points, mixHex("#1c2a50", palette.edge, brightness * 0.85), rgba("#08101f", 0.7));
      // Rim highlight along the lit edge.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(palette.glow, 0.16 + brightness * 0.22);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(face.points[0][0], face.points[0][1]);
      for (let index = 1; index < 4; index++) ctx.lineTo(face.points[index][0], face.points[index][1]);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      drawFaceLabel(face, time, brightness);
    }
  }

  /**
   * Stamp the name/glyph onto a face in the quad's own basis, so the letters
   * shear and travel with the tumbling cube instead of sitting on top of it.
   */
  function drawFaceLabel(face, time, brightness) {
    const text = faceText(face.label);
    const [p0, p1, p2, p3] = face.points;
    const midX = (p0[0] + p2[0]) / 2;
    const midY = (p0[1] + p2[1]) / 2;
    // Text rides the quad edge that runs most horizontally on screen.
    let e0 = [p1[0] - p0[0], p1[1] - p0[1]];
    let e1 = [p2[0] - p3[0], p2[1] - p3[1]];
    if (Math.abs(e1[1]) < Math.abs(e0[1])) [e0, e1] = [e1, e0];
    const ux = e0[0] + e1[0];
    const uy = e0[1] + e1[1];
    const faceWidth = Math.hypot(ux, uy) / 2;
    if (faceWidth < 14) return;
    const chars = [...text];
    const size = clamp(faceWidth * (chars.length > 2 ? 0.14 : 0.32), 7, 58);
    // The face's own slant carries through to every glyph.
    const shear = ux !== 0 ? (uy / ux) * 0.85 : 0;

    ctx.save();
    // Clip to the face first (screen space), then enter the face basis.
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.closePath();
    ctx.clip();
    ctx.translate(midX, midY);
    ctx.transform(1, 0, shear, 1, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${style.weight} ${size}px ${style.family}`;
    const tracking = (style.tracking || 0) * size;
    const widths = chars.map(char => ctx.measureText(char).width);
    const total = widths.reduce((sum, item) => sum + item, 0) + tracking * Math.max(0, chars.length - 1);
    ctx.globalAlpha = clamp(0.3 + brightness * 0.7, 0, 1)
      * (0.85 + 0.15 * Math.sin(time * 2.4 + face.label * 1.7));
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = size * 0.22;
    ctx.fillStyle = palette.core;
    let cursor = -total / 2;
    for (let index = 0; index < chars.length; index++) {
      ctx.fillText(chars[index], cursor + widths[index] / 2, 0);
      cursor += widths[index] + tracking;
    }
    ctx.restore();
  }

  function faceText(faceIndex) {
    if (!showName || !name) return ["✦", "◈", "✧", "◇", "✦", "◈"][faceIndex];
    if (faceIndex === 0 || faceIndex === 3) return name;
    return ["✦", "◈", "✧", "◇"][faceIndex % 4];
  }

  function polygon(points, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function normalize(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map(component => component / length);
  }

  function mixHex(from, to, amount) {
    const a = parseHex(from);
    const b = parseHex(to);
    const mix = index => Math.round(a[index] + (b[index] - a[index]) * clamp(amount, 0, 1));
    return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
  }

  function parseHex(hex) {
    const value = hex.replace("#", "");
    const number = Number.parseInt(value, 16);
    return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
  }

  return { resize, frame };
}
