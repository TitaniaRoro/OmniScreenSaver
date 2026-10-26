import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { MODES } from "../js/modes/index.js";
import { TYPE_STYLES, FONTS } from "../js/modes/type-styles.js";

assert.equal(MODES.length, 22, "The gallery should contain all 22 planned modes.");
assert.equal(new Set(MODES.map(mode => mode.id)).size, MODES.length, "Mode ids should be unique.");

const modeSources = new Map();
const jsFiles = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith(".js")) jsFiles.push(path);
  }
}
await collect("js");
for (const file of jsFiles) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  const source = await readFile(file, "utf8");
  modeSources.set(file.replace(/\\/g, "/"), source);
}

// Every world has its own typography and its own way of bringing the name in.
const reveals = new Set();
for (const mode of MODES) {
  assert.ok(mode.id && mode.nameKey && mode.descriptionKey && typeof mode.create === "function", `Mode metadata is incomplete: ${mode.id}`);
  const style = TYPE_STYLES[mode.id];
  assert.ok(style, `Mode ${mode.id} has no type style.`);
  assert.ok(style.family && style.palette?.core && style.palette?.glow, `Mode ${mode.id} has an incomplete type style.`);
  assert.ok(Array.isArray(style.effects) && style.effects.length, `Mode ${mode.id} needs at least one type effect.`);
  assert.ok(style.reveal, `Mode ${mode.id} needs a name reveal choreography.`);
  reveals.add(style.reveal);
}
assert.equal(reveals.size, MODES.length, "Every mode should reveal the name in its own way.");

// At least four distinct display families across the gallery.
const familiesUsed = new Set(Object.values(TYPE_STYLES).map(style => style.family));
assert.ok(familiesUsed.size >= 4, `Expected at least four distinct typefaces, found ${familiesUsed.size}.`);

// Every named family must keep a Bengali-capable fallback in its stack.
for (const [name, stack] of Object.entries(FONTS)) {
  assert.ok(stack.includes("Hind Siliguri") || name === "text", `Font stack "${name}" needs a Bengali fallback.`);
}

// No mode may draw the name with the old shared glow helper.
for (const [file, source] of modeSources) {
  // Shared helper modules are not modes themselves and carry no type style.
  if (!file.startsWith("js/modes/") || ["js/modes/common.js", "js/modes/fire.js", "js/modes/type-styles.js", "js/modes/index.js", "js/modes/isometric.js"].includes(file)) continue;
  assert.ok(!/\bdrawName\(/.test(source), `${file} should use drawStyledName with its own type style.`);
  assert.ok(/typeStyle\(/.test(source), `${file} should pull its type style from type-styles.js.`);
  assert.ok(/from "\.\.\/motion\.js"/.test(source), `${file} should build motion on ../motion.js.`);
}

// Fonts referenced by the stylesheet must exist on disk.
const css = await readFile("css/style.css", "utf8");
const fontFiles = new Set([...css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map(match => match[1]));
for (const file of fontFiles) {
  const { size } = await import("node:fs").then(fs => fs.promises.stat(`fonts/${file}`));
  assert.ok(size > 500, `Font file ${file} looks empty or missing.`);
}

console.log(`✓ ${MODES.length} modes registered; ${jsFiles.length} JavaScript modules syntax-checked.`);
console.log(`✓ ${reveals.size} distinct name reveals, ${familiesUsed.size} typefaces, ${fontFiles.size} self-hosted font files.`);
