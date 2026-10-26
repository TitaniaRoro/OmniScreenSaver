import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { noise2, fbm3 } from "../motion.js";
import { makeNameTexture, hexToRgb } from "./three-world.js";
import { withThreeUpgrade } from "./three-helpers.js";

/**
 * Topology Mesh (after vanta.js `topology`).
 *
 * A field of points lives on a slowly breathing height map. Contour lines are
 * traced where the field crosses evenly spaced levels, so the screen reads as a
 * living topographic map — and the mesh bulges around the name: letterform
 * nodes sit pinned on their strokes, lifting the terrain under them until the
 * contours crowd together and sketch the letters themselves.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#060b1c");
  const { ctx } = surface;
  const style = typeStyle("topology");
  let width = 1;
  let height = 1;
  let cols = 0;
  let rows = 0;
  let cell = 12;
  let field = new Float32Array(1);
  let nameNodes = [];
  let lastCue = 0;

  // Contour colours cycle through a cool spectrum, like Vanta's topology lines.
  const CONTOUR_COLORS = ["#48d6ff", "#7ea6ff", "#b58cff", "#ff7ad9", "#ff9f6e", "#5cf0c2"];

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    cell = preview ? 14 : Math.max(10, Math.min(22, Math.round(Math.min(w, h) / 34)));
    cols = Math.ceil(w / cell) + 2;
    rows = Math.ceil(h / cell) + 2;
    field = new Float32Array(cols * rows);
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 40 : 120, 0.52, 0.2) : [];
    nameNodes = targets.map((point, index) => ({
      x: point.x,
      y: point.y,
      phase: index * 0.37,
      seed: random(0, 40)
    }));
  }

  function buildField(time, lift) {
    const scale = 0.0032;
    const drift = time * 0.085;
    for (let row = 0; row < rows; row++) {
      const y = (row - 1) * cell;
      for (let col = 0; col < cols; col++) {
        const x = (col - 1) * cell;
        // Layered noise: a broad swell plus finer ridges, warped over time.
        let value = fbm3(x * scale, y * scale, drift, { octaves: 3, seed: 11 });
        value += 0.45 * noise2(x * scale * 2.6, y * scale * 2.6 + drift * 0.7, 3);
        // The name lifts the terrain into domes, so contours hug the lettering.
        if (lift > 0.001) {
          const radius = Math.min(width, height) * (preview ? 0.2 : 0.11);
          for (const node of nameNodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < radius * radius * 4) {
              const falloff = Math.exp(-d2 / (radius * radius * 0.55));
              value += lift * 1.5 * falloff * (1 + 0.18 * Math.sin(time * 1.4 + node.phase));
            }
          }
        }
        field[row * cols + col] = value;
      }
    }
  }

  /** Marching-squares segment table: which edges each case connects. */
  function segmentsForCase(code) {
    switch (code) {
      case 1: case 14: return [[3, 0]];
      case 2: case 13: return [[0, 1]];
      case 3: case 12: return [[3, 1]];
      case 4: case 11: return [[1, 2]];
      case 5: return [[3, 0], [1, 2]];
      case 6: case 9: return [[0, 2]];
      case 7: case 8: return [[3, 2]];
      case 10: return [[0, 1], [3, 2]];
      default: return [];
    }
  }

  function edgePoint(col, row, level, edge) {
    const i = row * cols + col;
    const v = field[i];
    switch (edge) {
      case 0: { // bottom edge (between this corner and the one below)
        const vb = field[i + cols];
        const t = (level - v) / (vb - v || 1e-6);
        return [(col + t) * cell - cell, (row + 1) * cell - cell];
      }
      case 1: { // right edge
        const vr = field[i + 1];
        const t = (level - v) / (vr - v || 1e-6);
        return [(col + 1) * cell - cell, (row + t) * cell - cell];
      }
      case 2: { // top edge
        const vt = field[i - cols];
        const t = (level - v) / (vt - v || 1e-6);
        return [(col + t) * cell - cell, (row - 1) * cell - cell];
      }
      default: { // left edge
        const vl = field[i - 1];
        const t = (level - v) / (vl - v || 1e-6);
        return [col * cell - cell, (row + t) * cell - cell];
      }
    }
  }

  function frame(dt, time) {
    const cycle = time % 20;
    const gather = showName ? smoothstep(3, 6.5, cycle) * (1 - smoothstep(14.5, 18, cycle)) : 0;

    ctx.fillStyle = "#060b1c";
    ctx.fillRect(0, 0, width, height);

    buildField(time, gather);

    const levels = 11;
    const span = 3.2;
    ctx.lineWidth = preview ? 0.8 : 1.05;
    ctx.globalCompositeOperation = "lighter";

    for (let level = 0; level < levels; level++) {
      const threshold = -span / 2 + (level + 0.5) * (span / levels) + 0.35 * Math.sin(time * 0.16 + level * 0.55);
      const color = CONTOUR_COLORS[level % CONTOUR_COLORS.length];
      ctx.strokeStyle = rgba(color, preview ? 0.5 : 0.34 + 0.1 * Math.sin(time * 0.5 + level));
      ctx.beginPath();
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < cols - 1; col++) {
          const tl = field[row * cols + col] >= threshold;
          const tr = field[row * cols + col + 1] >= threshold;
          const br = field[(row + 1) * cols + col + 1] >= threshold;
          const bl = field[(row + 1) * cols + col] >= threshold;
          const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
          for (const [a, b] of segmentsForCase(code)) {
            const [ax, ay] = edgePoint(col, row, threshold, a);
            const [bx, by] = edgePoint(col, row, threshold, b);
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
          }
        }
      }
      ctx.stroke();
    }

    // Soft highlight dots where the name sits, like survey pins on the map.
    if (gather > 0.05 && !preview) {
      for (const node of nameNodes) {
        const twinkle = 0.35 + 0.3 * Math.sin(time * 2 + node.seed);
        ctx.fillStyle = rgba("#dff2ff", gather * twinkle * 0.5);
        ctx.beginPath();
        ctx.arc(node.x, node.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.02) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.14, width * 0.075), 18, 96),
        maxWidth: width * 0.72,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp(gather * 0.85, 0, 0.85),
        progress: gather
      });
      if (time - lastCue > 6) {
        lastCue = time;
        emitSound("windChime");
      }
    }
  }

  return { resize, frame, destroy() {} };
}

/** GLSL shared by the vertex displacement and the contour colouring. */
const TOPOLOGY_GLSL_NOISE = `
  float tHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float tNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = tHash(i);
    float b = tHash(i + vec2(1.0, 0.0));
    float c = tHash(i + vec2(0.0, 1.0));
    float d = tHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
  }
  float tFbm(vec2 p) {
    float value = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
      value += amp * tNoise(p);
      p = p * 2.07 + vec2(1.7, 9.2);
      amp *= 0.5;
    }
    return value;
  }
  float tHeight(vec2 p, float time) {
    vec2 warp = vec2(tNoise(p * 0.6 + time * 0.11), tNoise(p * 0.5 - time * 0.09)) * 0.45;
    float h = tFbm(p + warp + vec2(time * 0.05, time * 0.021));
    h += 0.45 * tNoise(p * 2.6 + time * 0.06);
    return h;
  }
`;

function createThreeRenderer(THREE, { canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const style = typeStyle("topology");
  const colors = CONTOUR_COLORS.map(hexToRgb);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !preview, alpha: false });
  renderer.setClearColor(new THREE.Color("#060b1c"), 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color("#060b1c").getHex(), 0.055);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);

  const segments = preview ? 96 : 200;
  const geometry = new THREE.PlaneGeometry(16, 9, segments, Math.round(segments * 0.56));
  const uniforms = {
    uTime: { value: 0 },
    uGather: { value: 0 },
    uScale: { value: 0.42 },
    uHeight: { value: 1.05 },
    uNameTex: { value: null },
    uLevels: { value: 11.0 },
    uSpan: { value: 3.4 },
    uColorA: { value: new THREE.Color(colors[0][0], colors[0][1], colors[0][2]) },
    uColorB: { value: new THREE.Color(colors[2][0], colors[2][1], colors[2][2]) },
    uColorC: { value: new THREE.Color(colors[3][0], colors[3][1], colors[3][2]) },
    uBg: { value: new THREE.Color("#060b1c") }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      uniform float uGather;
      uniform float uScale;
      uniform float uHeight;
      uniform sampler2D uNameTex;
      varying vec3 vWorld;
      varying vec3 vLocal;
      ${TOPOLOGY_GLSL_NOISE}
      void main() {
        vec3 pos = position;
        float h = tHeight(pos.xy * uScale, uTime) * uHeight;
        if (uGather > 0.001) {
          vec2 uv = vec2(pos.x / 16.0 + 0.5, 0.5 - pos.y / 9.0);
          float mask = texture2D(uNameTex, uv).a;
          h += uGather * mask * 2.1 * (1.0 + 0.15 * sin(uTime * 1.4));
        }
        pos.z += h;
        vLocal = pos;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform float uLevels;
      uniform float uSpan;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform vec3 uBg;
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main() {
        float level = -uSpan / 2.0;
        float stepSize = uSpan / uLevels;
        vec3 glow = vec3(0.0);
        // Contour bands: crisp lines where the height crosses each level.
        for (float i = 0.0; i < 11.0; i++) {
          float threshold = level + (i + 0.5) * stepSize + 0.35 * sin(uTime * 0.16 + i * 0.55);
          float d = abs(vLocal.z - threshold);
          float w = max(fwidth(vLocal.z), 1e-4);
          float line = smoothstep(w * 1.6, 0.0, d);
          vec3 tint = mix(uColorA, uColorB, abs(sin(i * 1.1)));
          tint = mix(tint, uColorC, 0.5 + 0.5 * sin(i * 2.3 + 1.0));
          glow += line * tint * (0.55 + 0.25 * sin(uTime * 0.5 + i));
        }
        // Faint terrain shading so the surface still reads as 3D between lines.
        float shade = smoothstep(-1.6, 1.8, vLocal.z);
        vec3 base = uBg + uColorA * shade * 0.06;
        float depthFade = smoothstep(26.0, 8.0, length(vWorld - vec3(0.0, 0.0, 6.2)));
        vec3 color = base + glow * (0.35 + 0.65 * depthFade);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -0.5;
  scene.add(mesh);

  let width = 1;
  let height = 1;
  let lastCue = 0;
  let disposed = false;

  if (showName && name) {
    const textureCanvas = makeNameTexture({ name, style, language, width: 1024, height: 256 });
    if (textureCanvas) {
      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.flipY = false;
      uniforms.uNameTex.value = texture;
    }
  }

  function resize(w, h, ratio) {
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(ratio || 1, preview ? 1 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the plane covering the viewport at the camera's distance.
    const distance = 6.2;
    const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * distance;
    const halfWidth = halfHeight * camera.aspect;
    const scale = Math.max(w / (halfWidth * 2), h / (halfHeight * 2)) * 0.9;
    mesh.scale.setScalar(clamp(scale / 1.1, 0.35, 2.4));
    camera.updateProjectionMatrix();
  }

  function frame(dt, time) {
    if (disposed) return;
    const cycle = time % 20;
    const gather = showName ? smoothstep(3, 6.5, cycle) * (1 - smoothstep(14.5, 18, cycle)) : 0;
    uniforms.uTime.value = time;
    uniforms.uGather.value = gather;
    camera.position.set(Math.sin(time * 0.07) * 0.9, 0.55 + Math.sin(time * 0.05) * 0.2, 6.2);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    if (showName && gather > 0.55 && time - lastCue > 6) {
      lastCue = time;
      emitSound("windChime");
    }
  }

  function destroy() {
    disposed = true;
    if (uniforms.uNameTex.value) uniforms.uNameTex.value.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  }

  return { resize, frame, destroy, three: true };
}

/**
 * Topology prefers a real WebGL surface; browsers without GL keep the
 * marching-squares Canvas-2D reading of the same world.
 */
export function createMode(options) {
  return withThreeUpgrade(options, () => createCanvasRenderer(options), THREE => createThreeRenderer(THREE, options));
}
