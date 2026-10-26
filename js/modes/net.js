import { setup2D, clamp, random, smoothstep, rgba, drawStyledName } from "./common.js";
import { typeStyle } from "./type-styles.js";
import { scaledNameTargets } from "../name-shape.js";
import { noise2 } from "../motion.js";
import { makeNameTexture, hexToRgb } from "./three-world.js";
import { withThreeUpgrade } from "./three-helpers.js";

/**
 * Neural Network (after vanta.js `net`).
 *
 * Nodes drift through a shallow 3D volume; pairs link whenever they come close,
 * and pulses of light travel along the live links like signals crossing a mesh.
 * When the name gathers, letterform nodes are handed their place on the strokes,
 * so for a moment the wiring diagram *is* the lettering — before the pull lets
 * go and the net relaxes back into static snow.
 */
function createCanvasRenderer({ canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const surface = setup2D(canvas, "#04070f");
  const { ctx } = surface;
  const style = typeStyle("net");
  let width = 1;
  let height = 1;
  let nodes = [];
  let links = [];
  let pulses = [];
  let lastCue = 0;
  let lastPulse = 0;

  function resize(w, h, ratio) {
    surface.resize(w, h, ratio);
    width = w;
    height = h;
    const targets = showName ? scaledNameTargets(shape, w, h, preview ? 50 : 160, 0.52, 0.22) : [];
    const freeCount = preview ? 26 : 90;
    const count = targets.length + freeCount;
    nodes = Array.from({ length: count }, (_, index) => {
      const target = targetAt(targets, index);
      const homeX = random(0, w);
      const homeY = random(0, h);
      return {
        x: random(0, w),
        y: random(0, h),
        vx: random(-8, 8),
        vy: random(-8, 8),
        homeX,
        homeY,
        named: index < targets.length,
        tx: target?.x ?? homeX,
        ty: target?.y ?? homeY,
        delay: random(0, 0.5),
        z: random(0.25, 1), // depth: nearer nodes are brighter and bigger
        r: random(1, 2.2),
        seed: random(0, 60)
      };
    });
    pulses = [];
  }

  function targetAt(targets, index) {
    return index < targets.length ? targets[index] : null;
  }

  function frame(dt, time) {
    const cycle = time % 17;
    const gather = showName ? smoothstep(3.2, 6.8, cycle) * (1 - smoothstep(12.8, 16, cycle)) : 0;

    // Trail fade keeps the signal streaks legible without smearing the whole screen.
    ctx.fillStyle = "rgba(4,7,15,.3)";
    ctx.fillRect(0, 0, width, height);

    for (const node of nodes) {
      if (node.named && gather > 0.001) {
        const local = clamp((gather - node.delay * 0.5) / (1 - node.delay * 0.5), 0, 1);
        const wob = noise2(node.seed, time * 0.5, 7) * 2.2;
        node.vx += (node.tx + wob - node.x) * (4 + local * 9) * dt;
        node.vy += (node.ty + wob * 0.7 - node.y) * (4 + local * 9) * dt;
        node.vx *= Math.exp(-3.2 * dt);
        node.vy *= Math.exp(-3.2 * dt);
      } else {
        // Idle: slow noise currents plus gentle mutual repulsion from home.
        node.vx += noise2(node.x * 0.004, node.y * 0.004, time * 0.12 + node.seed) * 14 * dt;
        node.vy += noise2(node.y * 0.004, node.x * 0.004, time * 0.12 + node.seed + 31) * 14 * dt;
        node.vx *= Math.exp(-0.5 * dt);
        node.vy *= Math.exp(-0.5 * dt);
      }
      node.x += node.vx * dt;
      node.y += node.vy * dt;
      if (node.x < -30) node.x = width + 30;
      if (node.x > width + 30) node.x = -30;
      if (node.y < -30) node.y = height + 30;
      if (node.y > height + 30) node.y = -30;
    }

    // Rebuild proximity links every frame (counts stay small enough to afford it).
    links = [];
    const maxDist = Math.min(width, height) * (preview ? 0.3 : 0.16);
    const maxDistSq = maxDist * maxDist;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDistSq) {
          const strength = 1 - Math.sqrt(d2) / maxDist;
          links.push({ a: i, b: j, strength });
        }
      }
    }

    ctx.lineWidth = preview ? 0.6 : 0.8;
    for (const link of links) {
      const a = nodes[link.a];
      const b = nodes[link.b];
      const alpha = link.strength * link.strength * (preview ? 0.55 : 0.3) * Math.min(a.z, b.z);
      ctx.strokeStyle = rgba("#5fd8ff", alpha);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Spawn travelling pulses along the strongest links.
    const pulseBudget = preview ? 6 : 26;
    if (time - lastPulse > 0.12 && pulses.length < pulseBudget && links.length) {
      lastPulse = time;
      const candidates = links.filter(link => link.strength > 0.45);
      if (candidates.length) {
        const link = candidates[Math.floor(Math.random() * candidates.length)];
        pulses.push({ link, t: 0, speed: random(0.5, 1.4), forward: Math.random() < 0.5 });
      }
    }
    ctx.globalCompositeOperation = "lighter";
    for (const pulse of pulses) {
      pulse.t += pulse.speed * dt;
      const link = links.find(entry => entry.a === pulse.link.a && entry.b === pulse.link.b);
      if (!link || pulse.t > 1) continue;
      const a = nodes[link.a];
      const b = nodes[link.b];
      const raw = pulse.forward ? pulse.t : 1 - pulse.t;
      const px = a.x + (b.x - a.x) * raw;
      const py = a.y + (b.y - a.y) * raw;
      const glow = Math.sin(pulse.t * Math.PI);
      ctx.fillStyle = rgba("#c8f6ff", glow * 0.85 * link.strength);
      ctx.beginPath();
      ctx.arc(px, py, preview ? 1.4 : 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    pulses = pulses.filter(pulse => pulse.t <= 1 && links.some(link => link.a === pulse.link.a && link.b === pulse.link.b));

    for (const node of nodes) {
      const bright = node.named ? 0.55 + gather * 0.45 : 0.4;
      ctx.fillStyle = rgba(node.named ? "#aef0ff" : "#7fb8d8", bright * node.z);
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r * node.z * (1 + gather * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    if (showName && gather > 0.3) {
      drawStyledName(ctx, name, width / 2, height / 2, {
        style,
        size: clamp(Math.min(height * 0.13, width * 0.07), 16, 92),
        maxWidth: width * 0.72,
        maxHeight: height * 0.2,
        minSize: 12,
        language,
        time,
        alpha: clamp((gather - 0.3) * 1.2, 0, 0.55),
        progress: gather
      });
    }
    if (time - lastCue > 7.5) {
      lastCue = time;
      emitSound("digitalTick");
    }
  }

  return { resize, frame, destroy() {} };
}

/**
 * The WebGL reading of the world: nodes live in a real perspective volume,
 * links are drawn as line segments against that depth, and travelling pulses
 * ride the links as bright additive points. The name is pinned into the mesh
 * by sampling its rendered lettering — nodes whose home pixel lies inside a
 * glyph get pulled onto the strokes when the choreography gathers.
 */
function createThreeRenderer(THREE, { canvas, name, shape, language = "en", showName, emitSound = () => {}, preview = false }) {
  const style = typeStyle("net");
  const nodeColor = new THREE.Color(...hexToRgb(style.palette.edge));
  const pulseColor = new THREE.Color(...hexToRgb(style.palette.core));
  const linkColor = new THREE.Color(...hexToRgb(style.palette.glow));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !preview, alpha: false });
  renderer.setClearColor(new THREE.Color("#04070f"), 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.z = 9;

  const freeCount = preview ? 40 : 150;
  const bounds = { x: 8, y: 4.6, z: 3 };
  const nodes = Array.from({ length: freeCount }, () => ({
    pos: new THREE.Vector3(random(-bounds.x, bounds.x), random(-bounds.y, bounds.y), random(-bounds.z, bounds.z)),
    vel: new THREE.Vector3(random(-0.3, 0.3), random(-0.3, 0.3), random(-0.15, 0.15)),
    seed: random(0, 60),
    target: null
  }));

  // Pin named nodes onto the letterforms by sampling the styled name texture.
  let nameCanvas = null;
  if (showName && name) {
    nameCanvas = makeNameTexture({ name, style, language, width: 512, height: 128 });
    if (nameCanvas) {
      const ctx = nameCanvas.getContext("2d");
      const data = ctx?.getImageData?.(0, 0, nameCanvas.width, nameCanvas.height)?.data;
      if (data) {
        const picked = [];
        for (let attempt = 0; attempt < 4000 && picked.length < nodes.length; attempt++) {
          const px = Math.floor(Math.random() * nameCanvas.width);
          const py = Math.floor(Math.random() * nameCanvas.height);
          if (data[(py * nameCanvas.width + px) * 4 + 3] > 140) {
            picked.push([px / nameCanvas.width, py / nameCanvas.height]);
          }
        }
        for (let i = 0; i < picked.length && i < nodes.length; i++) {
          const [u, v] = picked[i];
          nodes[i].target = new THREE.Vector3((u - 0.5) * 11, (0.5 - v) * 2.8, random(-0.4, 0.8));
        }
      }
    }
  }

  const maxLinks = preview ? 900 : 2600;
  const linkPositions = new Float32Array(maxLinks * 6);
  const linkGeometry = new THREE.BufferGeometry();
  linkGeometry.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3));
  const linkMaterial = new THREE.LineBasicMaterial({ color: linkColor, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
  const links = new THREE.LineSegments(linkGeometry, linkMaterial);
  scene.add(links);

  const dotSize = preview ? 96 : 128;
  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = dotSize;
  const dotCtx = dotCanvas.getContext("2d");
  if (dotCtx) {
    const grad = dotCtx.createRadialGradient(dotSize / 2, dotSize / 2, 0, dotSize / 2, dotSize / 2, dotSize / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(160,220,255,0.8)");
    grad.addColorStop(1, "rgba(40,120,255,0)");
    dotCtx.fillStyle = grad;
    dotCtx.fillRect(0, 0, dotSize, dotSize);
  }
  const dotTexture = new THREE.CanvasTexture(dotCanvas);

  const nodePositions = new Float32Array(nodes.length * 3);
  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
  const nodeMaterial = new THREE.PointsMaterial({ size: 0.16, map: dotTexture, color: nodeColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  scene.add(new THREE.Points(nodeGeometry, nodeMaterial));

  const pulseCount = preview ? 30 : 90;
  const pulseState = Array.from({ length: pulseCount }, () => ({ link: -1, t: 0, speed: random(0.4, 1.2) }));
  const pulsePositions = new Float32Array(pulseCount * 3);
  const pulseGeometry = new THREE.BufferGeometry();
  pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
  const pulseMaterial = new THREE.PointsMaterial({ size: 0.12, map: dotTexture, color: pulseColor, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  scene.add(new THREE.Points(pulseGeometry, pulseMaterial));

  let lastCue = 0;
  const linkLimit = 2.1;

  function resize(w, h, ratio) {
    renderer.setPixelRatio(Math.min(ratio || 1, preview ? 1 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(dt, time) {
    const cycle = time % 17;
    const gather = showName ? smoothstep(3.2, 6.8, cycle) * (1 - smoothstep(12.8, 16, cycle)) : 0;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (gather > 0.001 && node.target) {
        node.vel.lerp(node.pos.clone().sub(node.target).multiplyScalar(-(3.5 + gather * 6)), clamp(dt * 4, 0, 1));
      } else {
        node.vel.x += noise2(node.seed, time * 0.3, 3) * 0.6 * dt;
        node.vel.y += noise2(node.seed + 17, time * 0.3, 9) * 0.6 * dt;
      }
      node.vel.multiplyScalar(Math.exp(-0.6 * dt));
      node.pos.addScaledVector(node.vel, dt);
      for (const axis of ["x", "y", "z"]) {
        if (Math.abs(node.pos[axis]) > bounds[axis]) {
          node.pos[axis] = Math.sign(node.pos[axis]) * bounds[axis];
          node.vel[axis] *= -0.85;
        }
      }
      nodePositions[i * 3] = node.pos.x;
      nodePositions[i * 3 + 1] = node.pos.y;
      nodePositions[i * 3 + 2] = node.pos.z;
    }
    nodeGeometry.attributes.position.needsUpdate = true;

    // Rebuild proximity links every frame (cheap at these counts).
    let linkIndex = 0;
    for (let i = 0; i < nodes.length && linkIndex < maxLinks; i++) {
      for (let j = i + 1; j < nodes.length && linkIndex < maxLinks; j++) {
        const d = nodes[i].pos.distanceTo(nodes[j].pos);
        if (d < linkLimit) {
          const o = linkIndex * 6;
          linkPositions[o] = nodes[i].pos.x; linkPositions[o + 1] = nodes[i].pos.y; linkPositions[o + 2] = nodes[i].pos.z;
          linkPositions[o + 3] = nodes[j].pos.x; linkPositions[o + 4] = nodes[j].pos.y; linkPositions[o + 5] = nodes[j].pos.z;
          linkIndex++;
        }
      }
    }
    linkGeometry.setDrawRange(0, linkIndex * 2);
    linkGeometry.attributes.position.needsUpdate = true;

    for (let p = 0; p < pulseCount; p++) {
      const pulse = pulseState[p];
      if (pulse.link >= linkIndex) {
        pulse.link = linkIndex > 0 ? Math.floor(Math.random() * linkIndex) : -1;
        pulse.t = 0;
      }
      if (pulse.link < 0) {
        pulsePositions[p * 3 + 1] = 1e6; // park it off-screen
        continue;
      }
      pulse.t += pulse.speed * dt;
      if (pulse.t > 1) pulse.t -= 1;
      const o = pulse.link * 6;
      pulsePositions[p * 3] = linkPositions[o] + (linkPositions[o + 3] - linkPositions[o]) * pulse.t;
      pulsePositions[p * 3 + 1] = linkPositions[o + 1] + (linkPositions[o + 4] - linkPositions[o + 1]) * pulse.t;
      pulsePositions[p * 3 + 2] = linkPositions[o + 2] + (linkPositions[o + 5] - linkPositions[o + 2]) * pulse.t;
    }
    pulseGeometry.attributes.position.needsUpdate = true;

    camera.position.x = Math.sin(time * 0.08) * 1.4;
    camera.position.y = Math.cos(time * 0.06) * 0.7;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    if (showName && gather > 0.6 && time - lastCue > 6) {
      lastCue = time;
      emitSound("blip");
    }
  }

  function destroy() {
    linkGeometry.dispose();
    nodeGeometry.dispose();
    pulseGeometry.dispose();
    linkMaterial.dispose();
    nodeMaterial.dispose();
    pulseMaterial.dispose();
    dotTexture.dispose();
    renderer.dispose();
  }

  return { resize, frame, destroy, three: true };
}

export function createMode(options) {
  return withThreeUpgrade(options, () => createCanvasRenderer(options), THREE => createThreeRenderer(THREE, options));
}
