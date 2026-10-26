import { setup2D, drawStyledName } from "./common.js";

/**
 * Shared scaffolding for the true-3D Vanta-style worlds (topology, net, halo,
 * clouds, cells).
 *
 * The originals these worlds are modelled on are WebGL effects, so these five
 * render real 3D scenes with three.js — perspective camera, depth, lighting.
 * This module keeps that promise honest everywhere the app runs:
 *
 *   - `loadThree()` resolves the bundled three.js module lazily, so pages and
 *     gallery tiles that never need it do not pay up front.
 *   - `webglAvailable()` cheaply probes whether a GL context can be created.
 *   - `makeNameTexture()` rasterises a mode's styled name into an RGBA canvas
 *     that shaders can sample as a texture, so the lettering choreography is
 *     identical in the 3D scene and in the Canvas-2D fallback renderer.
 *   - `hexToRgb` / `mixHex` keep palettes in sync between the two paths.
 */

let threePromise = null;

/** Lazily load three.js once; resolves null when the import fails. */
export function loadThree() {
  if (!threePromise) {
    threePromise = import("../vendor/three.module.js").catch(() => null);
  }
  return threePromise;
}

/** True when the browser hands out a WebGL context at all. */
export function webglAvailable() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Render the name through the mode's own type style into a canvas suitable
 * for use as a shader texture. Returns null when there is nothing to draw
 * (no name, or no DOM available).
 */
export function makeNameTexture({ name, style, language = "en", width = 1024, height = 256 }) {
  if (!name || typeof document === "undefined") return null;
  let canvas;
  let surface;
  try {
    canvas = document.createElement("canvas");
    surface = setup2D(canvas, "rgba(0,0,0,0)");
    canvas.width = width;
    canvas.height = height;
  } catch {
    return null;
  }
  const ctx = surface.ctx;
  ctx.clearRect(0, 0, width, height);
  drawStyledName(ctx, String(name), width / 2, height / 2, {
    style,
    size: Math.min(height * 0.72, width / Math.max(1.6, String(name).length * 0.62)),
    maxWidth: width * 0.92,
    maxHeight: height * 0.8,
    minSize: 18,
    language,
    glow: 0
  });
  return canvas;
}

/** Parse "#rrggbb" into a normalised [r, g, b] triple. */
export function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  const full = value.length === 3 ? value.split("").map(part => part + part).join("") : value;
  const number = Number.parseInt(full, 16) || 0;
  return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}

/** Mix two hex colours with t in [0,1], returning "#rrggbb". */
export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const channel = index => Math.round((ca[index] + (cb[index] - ca[index]) * t) * 255);
  return `#${[channel(0), channel(1), channel(2)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}
