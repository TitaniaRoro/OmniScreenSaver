/**
 * Typography for every world.
 *
 * A name should look like it belongs to the scene it is standing in: a
 * lantern-lit sign in the maze, warm serif lettering over a campfire, chrome
 * italics above a neon grid, blocky pixels in the retro campsite. Each mode
 * therefore picks one typeface treatment from this file and pairs it with its
 * own reveal choreography (see `reveal`).
 *
 * Every family ends in a Bengali-capable fallback, so বাংলা names keep their
 * own letterforms while Latin names get the display face.
 */

export const FONTS = {
  /** Rounded, friendly modern — the house display face. */
  display: '"Baloo Da 2", "Hind Siliguri", sans-serif',
  /** Neutral text face, also used wherever a quieter voice is needed. */
  text: '"Hind Siliguri", system-ui, sans-serif',
  /** Warm Bengali serif — firelight, night air, sand, clocks. */
  serif: '"Tiro Bangla", "Hind Siliguri", Georgia, serif',
  /** Terminal / machinery. */
  mono: '"Share Tech Mono", "Hind Siliguri", ui-monospace, "Courier New", monospace',
  /** 8-bit display. */
  pixel: '"Press Start 2P", "Hind Siliguri", monospace',
  /** Wide, engineered display — chrome, instruments, star charts. */
  tech: '"Orbitron", "Hind Siliguri", sans-serif'
};

/**
 * Every entry:
 *  family/weight/tracking/slant/scale  — the letterforms themselves
 *  palette                             — core fill, edge tint, glow colour
 *  effects                             — post-treatments layered on the glyphs
 *  reveal                              — how the name enters the scene
 */
export const TYPE_STYLES = {
  starfield: {
    family: FONTS.display,
    weight: 400,
    tracking: 0.3,
    slant: 0,
    palette: { core: "#e6f4ff", edge: "#a8c6ff", glow: "#7fb2ff", accent: "#c9a8ff" },
    effects: ["glow", "widen"],
    reveal: "gather",
    note: "Wide, weightless letterspacing that the starfield streams into."
  },
  mystify: {
    family: FONTS.display,
    weight: 700,
    tracking: 0.05,
    slant: -0.14,
    palette: { core: "#1a0b2e", edge: "#ff7ae0", glow: "#c04bff", accent: "#6cf5e6" },
    effects: ["outlineNeon", "glow"],
    reveal: "trace",
    note: "Slanted neon outline traced by the ribbons."
  },
  pipes: {
    family: FONTS.tech,
    weight: 700,
    tracking: 0.16,
    slant: 0,
    palette: { core: "#eafff9", edge: "#4fd8c6", glow: "#2fd3bd", accent: "#a99bff" },
    effects: ["chrome", "glow", "outlineThin"],
    reveal: "fill",
    note: "Chrome plumbing lettering filled by the growing pipes."
  },
  maze: {
    family: FONTS.mono,
    weight: 400,
    tracking: 0.22,
    slant: 0,
    palette: { core: "#ffe9c4", edge: "#ffae63", glow: "#ff9836", accent: "#ffd9a1" },
    effects: ["lantern", "glow"],
    reveal: "lantern",
    note: "Stencilled wall sign, lit by a swaying lamp."
  },
  bounce: {
    family: FONTS.pixel,
    weight: 400,
    tracking: 0.02,
    slant: 0,
    palette: { core: "#eafcff", edge: "#59e0ff", glow: "#3aa8ff", accent: "#b8f5ff" },
    effects: ["glow", "squash"],
    reveal: "bounce",
    note: "Arcade-block lettering in classic paddle-blue that squashes on impact."
  },
  spin: {
    family: FONTS.display,
    weight: 700,
    tracking: 0.02,
    slant: 0,
    palette: { core: "#f6fdff", edge: "#a8c8ff", glow: "#8b7bfa", accent: "#ffc6e9" },
    effects: ["extrude", "chrome", "glow"],
    reveal: "extrude",
    note: "Solid extruded chrome turning in space."
  },
  matrix: {
    family: FONTS.mono,
    weight: 400,
    tracking: 0.12,
    slant: 0,
    palette: { core: "#d9ffe6", edge: "#39ff88", glow: "#22ff6a", accent: "#a9ffcd" },
    effects: ["glow", "glitch"],
    reveal: "resolve",
    note: "Characters settle out of the rain into real letters."
  },
  terminal: {
    family: FONTS.mono,
    weight: 400,
    tracking: 0.02,
    slant: 0,
    palette: { core: "#d3ffe7", edge: "#4ce8a0", glow: "#2ee88f", accent: "#b8ffd8" },
    effects: ["glow", "caret"],
    reveal: "type",
    note: "Typed out one cluster at a time with a live caret."
  },
  life: {
    family: FONTS.pixel,
    weight: 400,
    tracking: 0.06,
    slant: 0,
    palette: { core: "#c4ffd9", edge: "#48ff9c", glow: "#2bff86", accent: "#8dffbe" },
    effects: ["glow", "cells"],
    reveal: "grow",
    note: "Cell-grown block lettering."
  },
  fireworks: {
    family: FONTS.display,
    weight: 700,
    tracking: 0.07,
    slant: 0,
    palette: { core: "#fff6dc", edge: "#ffc061", glow: "#ff9b3d", accent: "#ff8fd8" },
    effects: ["glow", "sparkle"],
    reveal: "ignite",
    note: "Sparks land and burn the letters into the night."
  },
  aurora: {
    family: FONTS.serif,
    weight: 400,
    tracking: 0.1,
    slant: 0,
    palette: { core: "#f0fff8", edge: "#77f2cd", glow: "#48e6c0", accent: "#c1a8ff" },
    effects: ["glow", "sweep"],
    reveal: "sweep",
    note: "Serif lettering revealed by the passing aurora curtain."
  },
  lava: {
    family: FONTS.serif,
    weight: 400,
    tracking: 0.03,
    slant: 0,
    palette: { core: "#ffe9c2", edge: "#ff8a3a", glow: "#ff4d1c", accent: "#ffc25e" },
    effects: ["glow", "melt"],
    reveal: "melt",
    note: "Heavy serif letterforms carved from cooling basalt, molten, slowly dripping."
  },
  flow: {
    family: FONTS.display,
    weight: 400,
    tracking: 0.26,
    slant: 0,
    palette: { core: "#eaf8ff", edge: "#6fd8ff", glow: "#49c6ff", accent: "#c7b4ff" },
    effects: ["glow", "widen"],
    reveal: "weave",
    note: "Airy lettering the glowing threads braid themselves around."
  },
  constellation: {
    family: FONTS.tech,
    weight: 400,
    tracking: 0.34,
    slant: 0,
    palette: { core: "#eef6ff", edge: "#a9c8ff", glow: "#7f9cff", accent: "#d6f2ff" },
    effects: ["stars", "glow"],
    reveal: "connect",
    note: "Star-chart lettering drawn dot to dot."
  },
  synthwave: {
    family: FONTS.tech,
    weight: 900,
    tracking: 0.04,
    slant: -0.1,
    palette: { core: "#fff8ea", edge: "#ff6fc8", glow: "#ff4fa8", accent: "#8ef4ff" },
    effects: ["chrome", "scanline", "glow"],
    reveal: "chrome",
    note: "Chrome italics with a sunset reflection and scanlines."
  },
  clock: {
    family: FONTS.serif,
    weight: 400,
    tracking: 0.06,
    slant: 0,
    palette: { core: "#f2f6ff", edge: "#b7c9ff", glow: "#8ea6ff", accent: "#ffe6b8" },
    effects: ["glow"],
    reveal: "flip",
    note: "Quiet serif greeting under the flip clock."
  },
  campfire: {
    family: FONTS.serif,
    weight: 400,
    tracking: 0.06,
    slant: 0,
    palette: { core: "#ffe9c6", edge: "#ffa855", glow: "#ff6a2a", accent: "#ffd79a" },
    effects: ["ember", "glow", "flicker"],
    reveal: "ember",
    note: "Warm serif that glows from the base like coals."
  },
  beach: {
    family: FONTS.serif,
    weight: 400,
    tracking: 0.05,
    slant: 0,
    // Daylight scene: the name is cut into bright wet sand as a soft shadowed
    // groove — warm sand tones, no neon glow (the old sunset-orange glow read
    // as unrelated to the pale sky-and-sand aesthetic).
    palette: { core: "#f7e3bd", edge: "#d9ae76", glow: "#c08a4e", accent: "#fdf2da" },
    effects: ["wetSand"],
    reveal: "wash",
    note: "Written into bright wet sand as an indented groove, then taken back by the tide."
  },
  pixel: {
    family: FONTS.pixel,
    weight: 400,
    tracking: 0.02,
    slant: 0,
    palette: { core: "#ffd88a", edge: "#ff8a3c", glow: "#ff6a20", accent: "#ffe9a8" },
    effects: ["pixel", "glow"],
    reveal: "pixelBuild",
    note: "Chunky 8-bit letters with flames licking above them."
  }
};

export const DEFAULT_TYPE_STYLE = TYPE_STYLES.starfield;

export function typeStyle(modeId) {
  return TYPE_STYLES[modeId] || DEFAULT_TYPE_STYLE;
}

/** CSS font shorthand for a style at a given pixel size. */
export function fontString(style, size) {
  return `${style.weight} ${size}px ${style.family}`;
}

/** Latin-only uppercase; Bengali and other scripts are returned untouched. */
export function applyCase(text, transform) {
  if (!transform) return text;
  if (transform === "upper") return /[\u0980-\u09FF]/.test(text) ? text : text.toUpperCase();
  if (transform === "lower") return /[\u0980-\u09FF]/.test(text) ? text : text.toLowerCase();
  return text;
}

/**
 * Make sure the browser has the glyphs for this style before anything is
 * measured or drawn. Best-effort: a missing face simply falls back.
 */
export async function loadTypeStyle(style, sampleText = "বাংলা Omni") {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const families = style.family.split(",").map(part => part.trim().replace(/^["']|["']$/g, ""));
  try {
    await Promise.all(families.map(family =>
      document.fonts.load(`${style.weight} 120px "${family}"`, sampleText).catch(() => {})
    ));
  } catch {
    // A system fallback remains available.
  }
}
