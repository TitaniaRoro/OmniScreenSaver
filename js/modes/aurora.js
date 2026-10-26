import { nameSize, setup2D, clamp, smoothstep, drawStyledName, drawVignette, makeStarField, drawTwinklingStars, measureName, rgba } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { fbm3 } from "../motion.js";

/**
 * Aurora.
 *
 * A WebGL sky where the curtains are fractal noise rather than sine waves:
 * they form, stretch along the magnetic arc and fade, with fine vertical rays
 * running through them. The name is written by the curtain itself — a soft,
 * noisy wipe travels across it as the light passes through.
 */

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_reveal;
uniform sampler2D u_name;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.08;
  float aspect = u_resolution.x / max(1.0, u_resolution.y);

  // Night sky
  vec3 color = mix(vec3(0.012, 0.026, 0.075), vec3(0.03, 0.045, 0.115), uv.y);
  color += vec3(0.02, 0.03, 0.07) * (1.0 - uv.y);

  // Stars, denser towards the top
  vec2 cell = floor(uv * u_resolution / 2.5);
  float star = step(0.9965, hash(cell));
  float twinkle = 0.55 + 0.45 * sin(u_time * 1.6 + hash(cell + 4.0) * 9.0);
  color += vec3(0.72, 0.82, 1.0) * star * twinkle * smoothstep(0.25, 0.95, uv.y);

  // Aurora curtains
  vec3 aurora = vec3(0.0);
  for (int band = 0; band < 3; band++) {
    float fb = float(band);
    float drift = t * (0.6 + fb * 0.25);
    float arc = uv.x * (1.6 + fb * 0.7) + fb * 3.1;
    float shape = fbm(vec2(arc, drift + fb * 2.0));
    float base = 0.42 + shape * 0.42 - fb * 0.08;
    float thickness = 0.10 + shape * 0.16;
    float body = exp(-pow((uv.y - base) / thickness, 2.0));
    // Fine vertical rays
    float rays = 0.62 + 0.38 * sin(uv.x * 220.0 * aspect * 0.02 + shape * 12.0 + u_time * 0.35);
    float skirt = smoothstep(0.05, 0.55, uv.y) * (1.0 - smoothstep(0.72, 1.02, uv.y));
    vec3 tint = band == 0 ? vec3(0.16, 0.92, 0.62)
              : band == 1 ? vec3(0.22, 0.62, 0.95)
                          : vec3(0.62, 0.32, 0.92);
    aurora += tint * body * rays * skirt * (0.42 + 0.3 * sin(u_time * 0.35 + fb));
  }
  color += aurora * 0.85;

  // Snow line catching the light
  float ground = 1.0 - smoothstep(0.13, 0.17, uv.y);
  vec3 snow = mix(vec3(0.03, 0.06, 0.11), vec3(0.10, 0.20, 0.24), aurora.g * 0.8);
  color = mix(color, snow, ground);
  color += aurora * ground * 0.22;

  // The name, revealed by the passing light
  vec4 nameSample = texture2D(u_name, uv);
  float mask = nameSample.a;
  float edge = uv.x + fbm(vec2(uv.y * 6.0, u_time * 0.05)) * 0.05;
  float wipe = smoothstep(u_reveal - 0.14, u_reveal + 0.03, edge);
  float shown = mask * (1.0 - wipe);
  float rim = mask * smoothstep(u_reveal - 0.02, u_reveal + 0.1, edge) * wipe;
  vec3 nameColor = mix(vec3(0.55, 1.0, 0.85), vec3(0.78, 0.72, 1.0), 0.5 + 0.5 * sin(u_time * 0.4 + uv.x * 2.0));
  color += nameColor * shown * (0.75 + 0.3 * sin(u_time * 0.9));
  color += vec3(0.65, 1.0, 0.9) * rim * 0.7;
  // Halo
  float halo = texture2D(u_name, uv + vec2(0.0025, 0.0)).a + texture2D(u_name, uv - vec2(0.0025, 0.0)).a
             + texture2D(u_name, uv + vec2(0.0, 0.005)).a + texture2D(u_name, uv - vec2(0.0, 0.005)).a;
  color += vec3(0.2, 0.78, 0.64) * max(0.0, halo - 0.15) * (1.0 - wipe) * 0.16;

  float vignette = 1.0 - smoothstep(0.2, 1.2, length((uv - 0.5) * vec2(1.0, 0.78)));
  color *= 0.6 + vignette * 0.4;
  gl_FragColor = vec4(color, 1.0);
}
`;

function makeShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "Aurora shader could not compile");
  }
  return shader;
}

function createGlFallback(canvas, gl) {
  function resize(w, h, ratio) {
    const pixelRatio = Math.min(2, Math.max(1, ratio || 1));
    canvas.width = Math.round(w * pixelRatio);
    canvas.height = Math.round(h * pixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function frame(dt, time) {
    gl.clearColor(
      0.018 + 0.008 * Math.sin(time * 0.12),
      0.035 + 0.018 * Math.sin(time * 0.09 + 1),
      0.095 + 0.024 * Math.sin(time * 0.08 + 2),
      1
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  return { resize, frame, destroy() {} };
}

function createCanvasFallback(canvas, name, language, showName, preview) {
  const surface = setup2D(canvas, "#061029");
  const { ctx } = surface;
  const style = typeStyle("aurora");
  let width = 1;
  let height = 1;
  let lights = [];
  let stars = [];
  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    lights = Array.from({ length: preview ? 5 : 11 }, (_, index) => ({ x: index / 10, y: 0.3 + Math.sin(index * 1.7) * 0.16, phase: index * 1.3, hue: 150 + index * 12 }));
    stars = makeStarField(preview ? 30 : 110, w, h, { topRatio: 0.7, seed: 2 });
  }
  function frame(dt, time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#05101f");
    gradient.addColorStop(0.6, "#0a1c33");
    gradient.addColorStop(1, "#050a14");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    drawTwinklingStars(ctx, stars, time, { color: "#dbe6ff", base: 0.24 });
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const light of lights) {
      const wave = fbm3(light.x * 2.4, time * 0.08, light.phase, { octaves: 3, seed: 5 });
      const x = (light.x + Math.sin(time * 0.13 + light.phase) * 0.05) * width;
      const y = (light.y + wave * 0.1) * height;
      const radius = width * (0.12 + wave * 0.06);
      const glow = ctx.createRadialGradient(x, y, 1, x, y, radius);
      glow.addColorStop(0, `hsla(${light.hue},92%,64%,.26)`);
      glow.addColorStop(0.5, `hsla(${light.hue + 30},90%,58%,.1)`);
      glow.addColorStop(1, `hsla(${light.hue},90%,50%,0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
    if (showName) {
      const reveal = clamp(((time % 16) - 3) / 4.5, 0, 1);
      drawStyledName(ctx, name, width / 2, height * 0.5, {
        style,
        size: nameSize(style, width, height),
        maxWidth: width * 0.66,
        maxHeight: height * 0.16,
        minSize: 12,
        language,
        time,
        alpha: reveal * 0.92,
        glow: 1.2,
        paint: (context, { size }) => {
          const gradient2 = context.createLinearGradient(-size * 2, 0, size * 3, 0);
          gradient2.addColorStop(0, "#8dffd8");
          gradient2.addColorStop(0.5, "#f0fffa");
          gradient2.addColorStop(1, "#c3a8ff");
          return gradient2;
        },
        perLetter: ({ index, count }) => {
          const local = clamp((reveal - (index / Math.max(1, count)) * 0.5) / 0.5, 0, 1);
          return { alpha: local };
        },
        progress: reveal
      });
    }
    drawVignette(ctx, width, height, 0.42);
  }
  return { resize, frame, destroy() {} };
}

export function createMode({ canvas, name, language = "en", showName, preview = false }) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
  } catch {
    gl = null;
  }
  if (!gl) return createCanvasFallback(canvas, name, language, showName, preview);

  let program;
  let timeLocation;
  let resolutionLocation;
  let revealLocation;
  let texture;
  let textCanvas;
  let textCtx;
  try {
    const vertex = makeShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = makeShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Aurora program could not link");
    gl.useProgram(program);

    const position = gl.getAttribLocation(program, "a_position");
    timeLocation = gl.getUniformLocation(program, "u_time");
    resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    revealLocation = gl.getUniformLocation(program, "u_reveal");
    const textureLocation = gl.getUniformLocation(program, "u_name");

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    textCanvas = document.createElement("canvas");
    textCanvas.width = 1024;
    textCanvas.height = 256;
    textCtx = textCanvas.getContext("2d");
    const style = typeStyle("aurora");
    if (showName) {
      // Render the name through the same measurement + palette pipeline the
      // Canvas fallback uses, so the WebGL curtain and the 2D aurora show the
      // identical lettering (same tracking, size cap and colours).
      textCtx.textAlign = "center";
      textCtx.textBaseline = "middle";
      const fontSize = nameSize(style, 1024 / 0.08 * 0.6, 256 / 0.15 * 0.6, { min: 44, max: 105 });
      const metrics = measureName(textCtx, name, style, fontSize, language);
      let cursor = 512 - metrics.total / 2;
      const paint = textCtx.createLinearGradient(0, 60, 0, 200);
      paint.addColorStop(0, rgba(style.palette.core, 0.98));
      paint.addColorStop(0.5, rgba(style.palette.edge, 0.95));
      paint.addColorStop(1, rgba(style.palette.accent, 0.96));
      textCtx.font = `${style.weight} ${fontSize}px ${style.family}`;
      textCtx.shadowColor = style.palette.glow;
      textCtx.shadowBlur = 16;
      textCtx.fillStyle = paint;
      for (let index = 0; index < metrics.clusters.length; index++) {
        textCtx.fillText(metrics.clusters[index], cursor + metrics.widths[index] / 2, 128);
        cursor += metrics.widths[index] + metrics.tracking;
      }
    }

    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.uniform1i(textureLocation, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  } catch {
    if (program) {
      try { gl.deleteProgram(program); } catch { /* best effort */ }
    }
    return createGlFallback(canvas, gl);
  }

  function resize(w, h, ratio) {
    const pixelRatio = Math.min(2, Math.max(1, ratio || 1));
    canvas.width = Math.round(w * pixelRatio);
    canvas.height = Math.round(h * pixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function frame(dt, time) {
    gl.useProgram(program);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, time % 4096);
    // Hold the name for a while, then let the light take it back.
    const cycle = time % 22;
    const reveal = showName
      ? clamp(Math.min(smoothstep(2.5, 6.5, cycle), 1 - smoothstep(16, 20.5, cycle)), 0, 1) * 1.2
      : 0;
    gl.uniform1f(revealLocation, reveal);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    resize,
    frame,
    destroy() {
      if (texture) gl.deleteTexture(texture);
      if (program) gl.deleteProgram(program);
    }
  };
}
