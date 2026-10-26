import { makeNameTexture, hexToRgb } from "./three-world.js";
import { withThreeUpgrade } from "./three-helpers.js";
import { setup2D, clamp, random, smoothstep, rgba, drawStyledName, TAU } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { fbm3, noise2 } from "../motion.js";

/**
 * Halo Rings (after vanta.js `halo`).
 *
 * Concentric rings of glowing points orbit a slowly wandering centre. Each ring
 * breathes — radius, tilt, and brightness all modulated by layered noise — so
 * the halo reads as volumes of light rather than flat bullseyes. On the reveal
 * beat, marked particles on the rings peel off onto the letterforms: the name
 * is assembled *from* the halo, then released back into its orbit.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#0a0614");
  const { ctx } = surface;
  const style = typeStyle("halo");
  let width = 1;
  let height = 1;
  let rings = [];
  let nameRiders = [];
  let lastCue = 0;

  const RING_COLORS = ["#ff7ad9", "#8f7bff", "#5fd8ff", "#ffd27a", "#7affc8"];

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const ringCount = preview ? 5 : 9;
    const maxRadius = Math.hypot(w, h) * 0.55;
    rings = Array.from({ length: ringCount }, (_, index) => ({
      baseRadius: maxRadius * (0.16 + (index / ringCount) * 0.9),
      dots: preview ? 26 : 70,
      speed: (index % 2 ? -1 : 1) * random(0.05, 0.16),
      phase: random(0, TAU),
      tilt: random(0.35, 0.95),
      wobbleSeed: random(0, 50),
      color: RING_COLORS[index % RING_COLORS.length],
      offset: random(-0.1, 0.1)
    }));
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 46 : 150, 0.5, 0.2) : [];
    nameRiders = targets.map((point, index) => {
      const ring = rings[index % rings.length];
      return {
        ring,
        angle: random(0, TAU),
        tx: point.x,
        ty: point.y,
        delay: random(0, 0.5),
        x: 0,
        y: 0
      };
    });
  }

  function ringPoint(ring, angle, time, cx, cy, squeeze = 1) {
    const breathe = 1 + 0.09 * fbm3(ring.wobbleSeed, time * 0.25, angle * 0.6, { octaves: 2, seed: 4 });
    const radius = ring.baseRadius * breathe * squeeze;
    const x = cx + Math.cos(angle + ring.phase) * radius;
    const y = cy + Math.sin(angle + ring.phase) * radius * ring.tilt + ring.offset * radius;
    return [x, y];
  }

  function frame(dt, time) {
    const cycle = time % 19;
    const gather = showName ? smoothstep(3.6, 7.4, cycle) * (1 - smoothstep(14, 17.4, cycle)) : 0;

    ctx.fillStyle = "rgba(10,6,20,.26)";
    ctx.fillRect(0, 0, width, height);

    // The halo centre wanders on a lazy Lissajous, never sitting still.
    const cx = width / 2 + Math.sin(time * 0.11) * width * 0.06 + noise2(time * 0.07, 3, 9) * width * 0.03;
    const cy = height / 2 + Math.cos(time * 0.083) * height * 0.08 + noise2(3, time * 0.06, 21) * height * 0.03;

    ctx.globalCompositeOperation = "lighter";

    for (const ring of rings) {
      ring.phase += ring.speed * dt;
      const intensity = 0.5 + 0.5 * Math.sin(time * 0.3 + ring.wobbleSeed);
      const dotAlpha = (preview ? 0.5 : 0.3) * (0.55 + intensity * 0.45);
      ctx.fillStyle = rgba(ring.color, dotAlpha);
      for (let index = 0; index < ring.dots; index++) {
        const angle = (index / ring.dots) * TAU;
        const [x, y] = ringPoint(ring, angle, time, cx, cy);
        const size = preview ? 1.1 : 1.5 + intensity * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      // Faint continuous ring line under the dots for body.
      ctx.strokeStyle = rgba(ring.color, dotAlpha * 0.28);
      ctx.lineWidth = preview ? 0.7 : 1;
      ctx.beginPath();
      for (let index = 0; index <= ring.dots; index++) {
        const angle = (index / ring.dots) * TAU;
        const [x, y] = ringPoint(ring, angle, time, cx, cy);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Riders: marked points that leave their ring and form the name.
    for (const rider of nameRiders) {
      let x; let y;
      if (gather > 0.001) {
        const local = clamp((gather - rider.delay * 0.5) / (1 - rider.delay * 0.5), 0, 1);
        const eased = local * local * (3 - 2 * local);
        const [rx, ry] = ringPoint(rider.ring, rider.angle, time, cx, cy);
        x = rx + (rider.tx - rx) * eased;
        y = ry + (rider.ty - ry) * eased;
        rider.angle += rider.ring.speed * dt;
      } else {
        rider.angle += rider.ring.speed * dt * 1.6;
        [x, y] = ringPoint(rider.ring, rider.angle, time, cx, cy);
      }
      rider.x = x;
      rider.y = y;
      ctx.fillStyle = rgba("#fff0ff", preview ? 0.6 : 0.35 + gather * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, preview ? 1.3 : 1.8 + gather * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bright core.
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.16);
    core.addColorStop(0, rgba("#e9d5ff", 0.32));
    core.addColorStop(1, "rgba(233,213,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(cx - width, cy - height, width * 2, height * 2);

    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.25) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.14, width * 0.075), 16, 96),
        maxWidth: width * 0.7,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp((gather - 0.25) * 1.4, 0, 0.8),
        progress: gather
      });
      if (time - lastCue > 6.5) {
        lastCue = time;
        emitSound("softChime");
      }
    }
  }

  return { resize, frame, destroy() {} };
}

/**
 * The WebGL reading of the world: glowing rings (torus geometry with additive
 * halo sprites) orbit a bright core in true perspective space. The name rides
 * on a textured plane that peels itself out of the rings during the reveal —
 * the same choreography as the canvas fallback, but with real depth.
 */
function createThreeRenderer(THREE, { canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const style = typeStyle("halo");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !preview, alpha: false });
  renderer.setClearColor(new THREE.Color("#0a0714"), 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 10;

  const ringColors = [style.palette.edge, style.palette.glow, style.palette.accent];
  const group = new THREE.Group();
  scene.add(group);

  const rings = [];
  for (let i = 0; i < 6; i++) {
    const radius = 1.4 + i * 0.85;
    const tube = 0.02 + Math.random() * 0.03;
    const geometry = new THREE.TorusGeometry(radius, tube, 10, 128);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...hexToRgb(ringColors[i % ringColors.length])),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(random(-0.6, 0.6), random(-0.6, 0.6), random(0, Math.PI));
    mesh.userData.spin = random(0.05, 0.22) * (i % 2 ? -1 : 1);
    mesh.userData.wobble = random(0, Math.PI * 2);
    group.add(mesh);
    rings.push(mesh);
  }

  // Soft halo sprite behind the core.
  const glowSize = 128;
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = glowSize;
  const glowCtx = glowCanvas.getContext("2d");
  if (glowCtx) {
    const grad = glowCtx.createRadialGradient(glowSize / 2, glowSize / 2, 0, glowSize / 2, glowSize / 2, glowSize / 2);
    grad.addColorStop(0, "rgba(255,240,255,0.9)");
    grad.addColorStop(0.35, "rgba(255,122,217,0.35)");
    grad.addColorStop(1, "rgba(143,123,255,0)");
    glowCtx.fillStyle = grad;
    glowCtx.fillRect(0, 0, glowSize, glowSize);
  }
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.setScalar(6);
  scene.add(core);

  // Orbiting spark points for parallax depth.
  const sparkCount = preview ? 60 : 220;
  const sparkPositions = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    const theta = random(0, Math.PI * 2);
    const phi = Math.acos(random(-1, 1));
    const r = random(3.2, 8);
    sparkPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    sparkPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    sparkPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
    size: 0.07, map: glowTexture, color: new THREE.Color(...hexToRgb(style.palette.core)),
    transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(sparks);

  // The name: a textured plane that fades in as the rings peel it off.
  let nameMesh = null;
  let nameTexture = null;
  if (showName && name) {
    const textureCanvas = makeNameTexture({ name, style, language, width: 1024, height: 256 });
    if (textureCanvas) {
      nameTexture = new THREE.CanvasTexture(textureCanvas);
      nameMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 2.75),
        new THREE.MeshBasicMaterial({ map: nameTexture, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      scene.add(nameMesh);
    }
  }

  let lastCue = 0;

  function resize(w, h, ratio) {
    renderer.setPixelRatio(Math.min(ratio || 1, preview ? 1 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(dt, time) {
    const cycle = time % 18;
    const gather = showName ? smoothstep(3.5, 7, cycle) * (1 - smoothstep(13.5, 16.5, cycle)) : 0;

    group.rotation.y = time * 0.12;
    group.rotation.x = Math.sin(time * 0.09) * 0.35;
    for (const ring of rings) {
      ring.rotation.z += ring.userData.spin * dt;
      ring.rotation.x = Math.sin(time * 0.3 + ring.userData.wobble) * 0.4;
      ring.material.opacity = 0.35 + 0.3 * Math.sin(time * 0.8 + ring.userData.wobble) + gather * 0.2;
    }
    sparks.rotation.y = -time * 0.03;
    const pulse = 5.4 + Math.sin(time * 1.1) * 0.4;
    core.scale.setScalar(pulse * (1 - gather * 0.4));
    if (nameMesh) {
      nameMesh.material.opacity = gather * 0.9;
      nameMesh.position.z = (1 - gather) * 4;
      nameMesh.scale.setScalar(0.85 + gather * 0.15);
    }
    camera.position.x = Math.sin(time * 0.05) * 1.2;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    if (showName && gather > 0.6 && time - lastCue > 6) {
      lastCue = time;
      emitSound("padSwell");
    }
  }

  function destroy() {
    for (const ring of rings) { ring.geometry.dispose(); ring.material.dispose(); }
    sparkGeometry.dispose();
    sparks.material.dispose();
    glowTexture.dispose();
    nameTexture?.dispose();
    nameMesh?.geometry.dispose();
    nameMesh?.material.dispose();
    renderer.dispose();
  }

  return { resize, frame, destroy, three: true };
}

export function createMode(options) {
  return withThreeUpgrade(options, () => createCanvasRenderer(options), THREE => createThreeRenderer(THREE, options));
}
