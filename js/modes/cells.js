import { makeNameTexture, hexToRgb } from "./three-world.js";
import { withThreeUpgrade } from "./three-helpers.js";
import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { noise2 } from "../motion.js";

/**
 * Living Cells (after vanta.js `cells`).
 *
 * Voronoi-like organisms: seed points wander on slow noise currents, each
 * pulling nutrients (brightness) toward itself, and cell membranes are drawn
 * where two seeds hold equal claim to a patch of space. Occasionally a cell
 * divides — a new seed buds off its parent — keeping the colony restless.
 * On the reveal beat some seeds are called onto the letterforms: the colony
 * briefly grows the name as living tissue before letting go.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#081410");
  const { ctx } = surface;
  const style = typeStyle("cells");
  let width = 1;
  let height = 1;
  let cells = [];
  let nextId = 0;
  let lastCue = 0;
  let lastDivide = 0;

  const HUES = [150, 168, 96, 185, 132];

  function makeCell(target = null, parent = null) {
    return {
      id: nextId++,
      x: target ? target.x : random(0, width),
      y: target ? target.y : random(0, height),
      vx: random(-4, 4),
      vy: random(-4, 4),
      hue: parent ? parent.hue : HUES[Math.floor(random(0, HUES.length))],
      pulse: random(0, Math.PI * 2),
      size: random(0.75, 1.25),
      named: Boolean(target),
      tx: target?.x ?? 0,
      ty: target?.y ?? 0,
      delay: random(0, 0.5),
      age: 0,
      seed: random(0, 60)
    };
  }

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 34 : 90, 0.5, 0.2) : [];
    const freeCount = preview ? 14 : 40;
    cells = [];
    for (const target of targets) cells.push(makeCell(target));
    for (let index = 0; index < freeCount; index++) cells.push(makeCell());
  }

  function frame(dt, time) {
    const cycle = time % 18;
    const gather = showName ? smoothstep(3.4, 7, cycle) * (1 - smoothstep(13.6, 17, cycle)) : 0;

    ctx.fillStyle = "rgba(8,20,16,.34)";
    ctx.fillRect(0, 0, width, height);

    // Movement: named cells home in during the gather; everyone drifts on noise.
    for (const cell of cells) {
      cell.age += dt;
      if (cell.named && gather > 0.001) {
        const local = clamp((gather - cell.delay * 0.5) / (1 - cell.delay * 0.5), 0, 1);
        cell.vx += (cell.tx - cell.x) * (3.5 + local * 8) * dt;
        cell.vy += (cell.ty - cell.y) * (3.5 + local * 8) * dt;
        cell.vx *= Math.exp(-3 * dt);
        cell.vy *= Math.exp(-3 * dt);
      } else {
        cell.vx += noise2(cell.x * 0.006, cell.y * 0.006, time * 0.16 + cell.seed) * 16 * dt;
        cell.vy += noise2(cell.y * 0.006 + 13, cell.x * 0.006, time * 0.16 + cell.seed) * 16 * dt;
        cell.vx *= Math.exp(-0.8 * dt);
        cell.vy *= Math.exp(-0.8 * dt);
      }
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      if (cell.x < 0) { cell.x = 0; cell.vx = Math.abs(cell.vx); }
      if (cell.x > width) { cell.x = width; cell.vx = -Math.abs(cell.vx); }
      if (cell.y < 0) { cell.y = 0; cell.vy = Math.abs(cell.vy); }
      if (cell.y > height) { cell.y = height; cell.vy = -Math.abs(cell.vy); }
      cell.pulse += dt * (1.1 + cell.size * 0.4);
    }

    // Division keeps the colony breathing.
    const budget = preview ? 18 : 56;
    if (time - lastDivide > 2.4 && cells.length < budget) {
      lastDivide = time;
      const parent = cells[Math.floor(Math.random() * cells.length)];
      if (parent && !parent.named) {
        const child = makeCell(null, parent);
        child.x = parent.x + random(-14, 14);
        child.y = parent.y + random(-14, 14);
        child.hue = parent.hue + random(-8, 8);
        cells.push(child);
        emitSound("bubble");
      }
    }
    // Death: oldest unnamed cells occasionally dissolve, making room.
    if (cells.length > budget * 0.8) {
      const candidates = cells.filter(cell => !cell.named && cell.age > 14);
      if (candidates.length && Math.random() < 0.01) {
        const victim = candidates[0];
        cells = cells.filter(cell => cell !== victim);
      }
    }

    // Bodies: soft glowing discs with a brighter nucleus.
    ctx.globalCompositeOperation = "lighter";
    for (const cell of cells) {
      const breathe = 1 + 0.16 * Math.sin(cell.pulse);
      const radius = (preview ? 12 : 26) * cell.size * breathe;
      const tint = cell.named ? 0.55 + gather * 0.4 : 0.42;
      const body = ctx.createRadialGradient(cell.x, cell.y, 0, cell.x, cell.y, radius);
      body.addColorStop(0, `hsla(${cell.hue},80%,72%,${tint * 0.5})`);
      body.addColorStop(0.55, `hsla(${cell.hue},75%,45%,${tint * 0.22})`);
      body.addColorStop(1, `hsla(${cell.hue},70%,30%,0)`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsla(${cell.hue},90%,85%,${tint * 0.7})`;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, radius * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Membranes: draw the boundary between close pairs — the perpendicular
    // bisector arc segment facing the other cell, like a Voronoi edge.
    const maxDist = Math.min(width, height) * (preview ? 0.4 : 0.26);
    ctx.lineWidth = preview ? 0.8 : 1.15;
    for (let i = 0; i < cells.length; i++) {
      const a = cells[i];
      for (let j = i + 1; j < cells.length; j++) {
        const b = cells[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist || dist < 1) continue;
        const strength = 1 - dist / maxDist;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const angle = Math.atan2(dy, dx);
        const hue = (a.hue + b.hue) / 2;
        ctx.strokeStyle = `hsla(${hue},85%,70%,${strength * strength * (preview ? 0.5 : 0.32)})`;
        ctx.beginPath();
        ctx.arc(midX, midY, dist * 0.5, angle + Math.PI / 2 - 0.5, angle + Math.PI / 2 + 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(midX, midY, dist * 0.5, angle - Math.PI / 2 - 0.5, angle - Math.PI / 2 + 0.5);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.3) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.14, width * 0.075), 16, 98),
        maxWidth: width * 0.72,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp((gather - 0.3) * 1.3, 0, 0.8),
        progress: gather
      });
      if (time - lastCue > 7) {
        lastCue = time;
        emitSound("softChime");
      }
    }
  }

  return { resize, frame, destroy() {} };
}

/**
 * The WebGL reading of the world: a gently tilted plane in perspective space
 * whose fragment shader computes animated 3D Worley cells entirely on the GPU
 * (seed points wander through a slab of depth, so the membranes parallax as
 * the camera drifts). During the reveal the name is sampled from its rendered
 * lettering and the colony grows it as living tissue — seeds inside the glyph
 * mask glow brighter, exactly like the canvas fallback's choreography.
 */
function createThreeRenderer(THREE, { canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const style = typeStyle("cells");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !preview, alpha: false });
  renderer.setClearColor(new THREE.Color("#081410"), 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 7;

  let nameTexture = null;
  if (showName && name) {
    const textureCanvas = makeNameTexture({ name, style, language, width: 1024, height: 256 });
    if (textureCanvas) {
      nameTexture = new THREE.CanvasTexture(textureCanvas);
      nameTexture.flipY = false;
    }
  }

  const uniforms = {
    uTime: { value: 0 },
    uGather: { value: 0 },
    uAspect: { value: 1 },
    uNameTex: { value: nameTexture },
    uHasName: { value: nameTexture ? 1 : 0 },
    uCellScale: { value: 3.2 },
    uCore: { value: new THREE.Color(...hexToRgb(style.palette.core)) },
    uEdge: { value: new THREE.Color(...hexToRgb(style.palette.edge)) },
    uGlow: { value: new THREE.Color(...hexToRgb(style.palette.glow)) },
    uBg: { value: new THREE.Color("#081410") }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform float uGather;
      uniform float uAspect;
      uniform float uHasName;
      uniform float uCellScale;
      uniform sampler2D uNameTex;
      uniform vec3 uCore;
      uniform vec3 uEdge;
      uniform vec3 uGlow;
      uniform vec3 uBg;
      varying vec2 vUv;

      vec2 hash2(vec2 p, float z) {
        p = fract(p * vec2(123.34, 456.21) + z * 78.233);
        p += dot(p, p + 45.32);
        return fract(vec2(p.x * p.y * 17.43, p.x + p.y * 9.17));
      }
      // 3-cell Worley over a shallow depth slab for parallax membranes.
      void worley(vec2 p, float time, out float f1, out float f2) {
        vec2 g = floor(p);
        vec2 f = fract(p);
        float best = 8.0;
        float second = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 cell = g + offset;
            vec2 seed = hash2(cell, 0.0);
            vec2 seed2 = hash2(cell, 3.7);
            vec2 point = offset + 0.5 + 0.4 * sin(time * 0.6 + 6.2831 * seed + seed2 * 3.0);
            float d = length(f - point);
            if (d < best) { second = best; best = d; }
            else if (d < second) { second = d; }
          }
        }
        f1 = best;
        f2 = second;
      }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float f1, f2;
        worley(p * uCellScale * 2.2, uTime, f1, f2);
        float membrane = smoothstep(0.0, 0.06, f2 - f1);
        float nucleus = smoothstep(0.22, 0.0, f1);

        vec3 col = uBg;
        col += uEdge * (1.0 - membrane) * 0.5;             // glowing walls
        col += uGlow * nucleus * 0.35;                     // soft interiors
        col += uCore * pow(nucleus, 3.0) * 0.5;            // bright hearts
        float breathe = 0.85 + 0.15 * sin(uTime * 0.7 + f1 * 9.0);
        col *= breathe;

        if (uHasName > 0.5 && uGather > 0.001) {
          vec2 texUv = vec2(vUv.x, 1.0 - vUv.y);
          float mask = texture2D(uNameTex, texUv).a;
          // Inside the glyphs the colony blooms: membranes thicken, hearts ignite.
          col = mix(col, col * 1.9 + uCore * mask * 0.5 * uGather, mask * uGather);
          col += uEdge * mask * uGather * (1.0 - membrane) * 1.4;
        }
        float vignette = smoothstep(1.1, 0.35, length(p));
        col *= 0.55 + 0.45 * vignette;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(11, 7.4), material);
  quad.rotation.x = -0.28;
  scene.add(quad);

  let lastCue = 0;

  function resize(w, h, ratio) {
    renderer.setPixelRatio(Math.min(ratio || 1, preview ? 1 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = Math.max(w / h, 1) * 1.15;
  }

  function frame(dt, time) {
    const cycle = time % 18;
    const gather = showName ? smoothstep(3.5, 7, cycle) * (1 - smoothstep(13.5, 16.5, cycle)) : 0;
    uniforms.uTime.value = time;
    uniforms.uGather.value = gather;
    quad.rotation.z = Math.sin(time * 0.05) * 0.06;
    camera.position.x = Math.sin(time * 0.07) * 1.1;
    camera.position.y = Math.cos(time * 0.05) * 0.6 + 0.4;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    if (showName && gather > 0.6 && time - lastCue > 6) {
      lastCue = time;
      emitSound("softPulse");
    }
  }

  function destroy() {
    nameTexture?.dispose();
    quad.geometry.dispose();
    material.dispose();
    renderer.dispose();
  }

  return { resize, frame, destroy, three: true };
}

export function createMode(options) {
  return withThreeUpgrade(options, () => createCanvasRenderer(options), THREE => createThreeRenderer(THREE, options));
}
