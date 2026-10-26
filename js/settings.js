import { limitGraphemes } from "./text.js";

const STORAGE_KEY = "omniscreensaver-settings-v1";
const DEFAULTS = Object.freeze({
  language: "en",
  name: "",
  soundEnabled: true,
  volume: 0.4,
  speed: 1,
  showName: true,
  shuffleInterval: 0,
  keepAwake: true,
  autoStart: 0
});

function readStored() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function normalizeStored(stored) {
  const language = String(stored.language || "").toLowerCase().startsWith("bn") ? "bn" : "en";
  return {
    ...DEFAULTS,
    language,
    name: limitGraphemes(stored.name || "", 24, language),
    soundEnabled: typeof stored.soundEnabled === "boolean" ? stored.soundEnabled : DEFAULTS.soundEnabled,
    volume: clamp(Number(stored.volume ?? DEFAULTS.volume), 0, 1),
    speed: clamp(Number(stored.speed ?? DEFAULTS.speed), 0.5, 1.5),
    showName: typeof stored.showName === "boolean" ? stored.showName : DEFAULTS.showName,
    shuffleInterval: [0, 1, 3, 5, 10].includes(Number(stored.shuffleInterval)) ? Number(stored.shuffleInterval) : 0,
    keepAwake: typeof stored.keepAwake === "boolean" ? stored.keepAwake : DEFAULTS.keepAwake,
    autoStart: [0, 1, 5, 10].includes(Number(stored.autoStart)) ? Number(stored.autoStart) : 0
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function loadSettings() {
  const stored = readStored();
  const params = new URLSearchParams(globalThis.location?.search || "");
  const browserLanguage = globalThis.navigator?.language || "en";
  let settings = normalizeStored({
    ...stored,
    language: stored.language || (browserLanguage.toLowerCase().startsWith("bn") ? "bn" : "en")
  });
  if (params.has("lang")) settings.language = params.get("lang").toLowerCase().startsWith("bn") ? "bn" : "en";
  if (params.has("name")) settings.name = limitGraphemes(params.get("name"), 24, settings.language);
  else settings.name = limitGraphemes(settings.name, 24, settings.language);
  const requestedMode = params.get("mode") || "";
  return { settings, requestedMode };
}

export function saveSettings(settings) {
  const safe = normalizeStored(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Private browsing or a storage quota may prevent persistence; the page still works.
  }
}

export function makeShareUrl({ mode, name, language }) {
  const url = new URL(globalThis.location?.href || "https://TitaniaRoro.github.io/OmniScreenSaver/");
  url.search = "";
  if (mode) url.searchParams.set("mode", mode);
  if (name) url.searchParams.set("name", limitGraphemes(name, 24, language));
  url.searchParams.set("lang", language === "bn" ? "bn" : "en");
  return url.toString();
}

export { DEFAULTS as DEFAULT_SETTINGS };
