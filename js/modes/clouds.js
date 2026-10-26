import { makeNameTexture, hexToRgb } from "./three-world.js";
import { withThreeUpgrade } from "./three-helpers.js";
import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3, noise2 } from "../motion.js";

/**
 * Storm Clouds (after vanta.js `clouds2`).
 *
 * Volumetric-looking clouds built from layered fBm noise: several drifting
 * sheets of soft blobs at different scales and speeds, lit from a hidden moon.
 * Gusts push the whole sky sideways; when the name rises it condenses out of
 * the vapour — dark letterforms edged with silver lining, then dissolve back
 * into the weather.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#0b1020");
  const { ctx } = surface;
  const style = typeStyle("clouds");
  let width = 1;
  let height = 1;
  let puffs = [];
  let targets = [];
  let lastCue = 0;
  let lastFlash = -10;
  let flashEnergy = 0;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const count = preview ? 60 : 240;
    puffs = Array.from({ length: count }, () => makePuff(true));
    targets = showName ? scaledNameTargets(shape, w, h, preview ? 40 : 130, 0.5, 0.2) : [];
  }

  function makePuff(initial) {
    const layer = Math.floor(random(0, 3)); // 0 far .. 2 near
    return {
      x: initial ? random(-0.1, 1.1) * width : -width * 0.25,
      y: random(0.05, 0.9) * height,
      r: (preview ? 26 : 70) * [0.55, 0.85, 1.3][layer] * random(0.7, 1.4),
      layer,
      speed: [6, 14, 26][layer] * random(0.7, 1.3),
      seed: random(0, 60),
      alpha: [0.1, 0.16, 0.22][layer]
    };
  }

  function frame(dt, time) {
    const cycle = time % 21;
    const gather = showName ? smoothstep(4, 8, cycle) * (1 - smoothstep(15, 19, cycle)) : 0;

    // Sky gradient: deep storm blue with a faint moon glow high on the right.
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0a0f22");
    sky.addColorStop(0.55, "#101731");
    sky.addColorStop(1, "#0c1124");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const moonX = width * 0.78;
    const moonY = height * 0.2;
    const halo = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, Math.min(width, height) * 0.5);
    halo.addColorStop(0, "rgba(190,205,255,0.16)");
    halo.addColorStop(1, "rgba(190,205,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(226,234,255,0.5)";
    ctx.beginPath();
    ctx.arc(moonX, moonY, preview ? 5 : 10, 0, Math.PI * 2);
    ctx.fill();

    // Occasional sheet lightning illuminates the cloud undersides.
    if (time - lastFlash > random(9, 16) && !preview) {
      lastFlash = time;
      flashEnergy = random(0.35, 0.8);
      emitSound("firework");
    }
    const flash = flashEnergy * Math.exp(-(time - lastFlash) * 6) * (0.6 + 0.4 * Math.sin(time * 47));
    if (flash > 0.02) {
      ctx.fillStyle = rgba("#cfdcff", flash * 0.14);
      ctx.fillRect(0, 0, width, height);
    }

    const gust = 0.5 + 0.5 * Math.sin(time * 0.07) + 0.3 * noise2(time * 0.05, 8, 2);

    for (const puff of puffs) {
      puff.x += puff.speed * gust * dt;
      puff.y += fbm3(puff.seed, time * 0.18, 0, { octaves: 2, seed: 9 }) * 5 * dt;
      if (puff.x - puff.r > width) Object.assign(puff, makePuff(false));

      const breathe = 1 + 0.12 * noise2(puff.seed, time * 0.3, 5);
      const radius = puff.r * breathe;
      const lit = clamp((moonX - puff.x) / width, -0.3, 0.6);
      const gradient = ctx.createRadialGradient(puff.x, puff.y, radius * 0.1, puff.x, puff.y, radius);
      const coreTone = puff.layer === 2 ? 46 : 34;
      const tone = Math.round(clamp(coreTone + lit * 60, 0, 255));
      const toneGreen = Math.round(clamp(coreTone + lit * 66, 0, 255));
      const toneBlue = Math.round(clamp(coreTone + 24 + lit * 80, 0, 255));
      gradient.addColorStop(0, `rgba(${tone},${toneGreen},${toneBlue},${clamp(puff.alpha + flash * 0.1, 0, 1)})`);
      gradient.addColorStop(1, "rgba(20,26,48,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // The name condenses from vapour: silver-lined dark letterforms.
    if (showName && gather > 0.02) {
      // Soft mist gathering behind the strokes first.
      ctx.globalCompositeOperation = "lighter";
      for (const point of targets) {
        const wob = noise2(point.x * 0.01, time * 0.4, 3) * 3;
        ctx.fillStyle = rgba("#aebfe8", gather * 0.05);
        ctx.beginPath();
        ctx.arc(point.x + wob, point.y + wob * 0.6, (preview ? 8 : 16) * gather, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.16, width * 0.08), 18, 104),
        maxWidth: width * 0.72,
        maxHeight: height * 0.22,
        minSize: 12,
        language,
        time,
        alpha: clamp(gather * 0.95, 0, 0.95),
        progress: gather
      });
      if (time - lastCue > 8) {
        lastCue = time;
        emitSound("wind");
      }
    }
  }

  return { resize, frame, destroy() {} };
}

/**
 * The WebGL reading of the world: a full-screen quad raymarches a 3D fBm
 * cloud volume — real volumetric depth, moonlight from above, lightning
 * flashes inside the mass. During the reveal the name is sampled from its
 * rendered lettering and condenses out of the vapour as dark glyphs lined
 * with silver, exactly like the canvas fallback's choreography.
 */
function createThreeRenderer(THREE, { canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const style = typeStyle("clouds");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setClearColor(new THREE.Color("#0b1020"), 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
    uFlash: { value: 0 },
    uAspect: { value: 1 },
    uQuality: { value: preview ? 5 : 9 },
    uNameTex: { value: nameTexture },
    uHasName: { value: nameTexture ? 1 : 0 },
    uSkyTop: { value: new THREE.Color(...hexToRgb("#1a2440")) },
    uSkyBottom: { value: new THREE.Color(...hexToRgb("#0b1020")) },
    uCloudLit: { value: new THREE.Color(...hexToRgb(style.palette.accent)) },
    uCloudDark: { value: new THREE.Color(...hexToRgb("#232c48")) },
    uRim: { value: new THREE.Color(...hexToRgb(style.palette.core)) }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform float uGather;
      uniform float uFlash;
      uniform float uAspect;
      uniform int uQuality;
      uniform float uHasName;
      uniform sampler2D uNameTex;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyBottom;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudDark;
      uniform vec3 uRim;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.56);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(1.3, 7.7);
          a *= 0.5;
        }
        return v;
      }
      // 3D density from stacked warped 2D fBm slices — cheap volumetrics.
      float density(vec3 p) {
        float base = fbm(p.xy * 1.4 + p.z * 0.35);
        float detail = fbm(p.xy * 3.1 - p.z * 0.6);
        float d = base * 0.75 + detail * 0.35;
        d -= p.z * 0.45; // thin out with distance
        return clamp(d - 0.32, 0.0, 1.0);
      }
      void main() {
        vec2 uv = vUv;
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        float drift = uTime * 0.02;
        vec3 col = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, uv.y));

        // Raymarch the cloud slab front-to-back.
        float t = 0.0;
        float acc = 0.0;
        float lightAcc = 0.0;
        int steps = uQuality;
        for (int i = 0; i < 9; i++) {
          if (i >= steps) break;
          vec3 q = vec3(p * (1.6 + t * 0.5), t * 0.9 + drift * 6.0);
          q.x += sin(uTime * 0.05 + q.y * 0.8) * 0.25; // wind shear
          float d = density(q);
          if (d > 0.001) {
            // Sample toward the hidden moon for self-lighting.
            float lit = density(q + vec3(0.28, 0.42, 0.25));
            float shade = clamp((d - lit) * 2.4, -1.0, 1.0);
            acc += d * (1.0 - acc) * 0.24;
            lightAcc += shade * d * 0.2;
          }
          t += 0.11;
        }
        vec3 cloudCol = mix(uCloudDark, uCloudLit, clamp(lightAcc * 1.6 + 0.35, 0.0, 1.0));
        cloudCol += uRim * pow(clamp(lightAcc, 0.0, 1.0), 3.0) * 0.6;
        cloudCol += vec3(0.9, 0.95, 1.0) * uFlash * acc; // lightning illuminates the mass
        col = mix(col, cloudCol, clamp(acc, 0.0, 1.0));

        // Condense the name out of the vapour.
        if (uHasName > 0.5 && uGather > 0.001) {
          vec2 nameUv = vec2((uv.x - 0.5) * 1.0 + 0.5, uv.y);
          vec2 centered = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
          vec2 texUv = centered / vec2(11.0 * 0.09 * uAspect, 0.28) * 0.5 + 0.5;
          if (abs(centered.x) < 5.5 * 0.09 * uAspect && abs(centered.y) < 0.14) {
            float mask = texture2D(uNameTex, texUv).a;
            float wobble = (fbm(p * 6.0 + uTime * 0.4) - 0.5) * 0.02;
            float edge = texture2D(uNameTex, texUv + vec2(wobble + 0.004, 0.0)).a;
            float rim = clamp(edge - mask, 0.0, 1.0);
            float presence = mask * uGather;
            col = mix(col, uCloudDark * 0.55, presence * 0.85);
            col += uRim * rim * uGather * 1.2; // silver lining
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), material);
  scene.add(quad);

  let lastCue = 0;
  let lastFlash = -12;
  let flashEnergy = 0;

  function resize(w, h, ratio) {
    renderer.setPixelRatio(Math.min(ratio || 1, preview ? 1 : 1.5));
    renderer.setSize(w, h, false);
    uniforms.uAspect.value = w / h;
  }

  function frame(dt, time) {
    const cycle = time % 19;
    const gather = showName ? smoothstep(4, 7.5, cycle) * (1 - smoothstep(14, 17, cycle)) : 0;
    if (time - lastFlash > random(7, 13)) {
      lastFlash = time;
      flashEnergy = 1;
    }
    flashEnergy = Math.max(0, flashEnergy - dt * 2.4);
    uniforms.uTime.value = time;
    uniforms.uGather.value = gather;
    uniforms.uFlash.value = flashEnergy * flashEnergy;
    renderer.render(scene, camera);
    if (flashEnergy > 0.9) emitSound("thunder");
    if (showName && gather > 0.6 && time - lastCue > 6) {
      lastCue = time;
      emitSound("windChime");
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
