import { createMode as createStarfield } from "./starfield.js";
import { createMode as createMystify } from "./mystify.js";
import { createMode as createPipes } from "./pipes.js";
import { createMode as createMaze } from "./maze.js";
import { createMode as createBounce } from "./bouncing-name.js";
import { createMode as createSpin } from "./spinning-name.js";
import { createMode as createMatrix } from "./matrix.js";
import { createMode as createTerminal } from "./terminal.js";
import { createMode as createLife } from "./life.js";
import { createMode as createFireworks } from "./fireworks.js";
import { createMode as createAurora } from "./aurora.js";
import { createMode as createLava } from "./lava.js";
import { createMode as createFlow } from "./flow.js";
import { createMode as createConstellation } from "./constellation.js";
import { createMode as createSynthwave } from "./synthwave.js";
import { createMode as createClock } from "./clock.js";
import { createMode as createCampfire } from "./campfire.js";
import { createMode as createBeach } from "./beach.js";
import { createMode as createPixel } from "./pixel.js";
import { createMode as createLayered } from "./layered-camp.js";
import { createMode as createShatter } from "./shatter.js";
import { createMode as createCube } from "./bouncing-cube.js";
import { createMode as createTopology } from "./topology.js";
import { createMode as createNet } from "./net.js";
import { createMode as createHalo } from "./halo.js";
import { createMode as createClouds } from "./clouds.js";
import { createMode as createCells } from "./cells.js";

export const MODES = [
  { id: "starfield", nameKey: "modeStarfield", descriptionKey: "descStarfield", icon: "✧", art: "starfield", category: "cosmic", create: createStarfield },
  { id: "mystify", nameKey: "modeMystify", descriptionKey: "descMystify", icon: "〰", art: "mystify", category: "cosmic", create: createMystify },
  { id: "pipes", nameKey: "modePipes", descriptionKey: "descPipes", icon: "⟐", art: "pipes", category: "geometry", create: createPipes },
  { id: "maze", nameKey: "modeMaze", descriptionKey: "descMaze", icon: "⌗", art: "maze", category: "geometry", create: createMaze },
  { id: "bounce", nameKey: "modeBounce", descriptionKey: "descBounce", icon: "◈", art: "bounce", category: "name", create: createBounce },
  { id: "spin", nameKey: "modeSpin", descriptionKey: "descSpin", icon: "◌", art: "spin", category: "name", create: createSpin },
  { id: "matrix", nameKey: "modeMatrix", descriptionKey: "descMatrix", icon: "▦", art: "matrix", category: "digital", create: createMatrix },
  { id: "terminal", nameKey: "modeTerminal", descriptionKey: "descTerminal", icon: "⌘", art: "terminal", category: "digital", create: createTerminal },
  { id: "life", nameKey: "modeLife", descriptionKey: "descLife", icon: "⠿", art: "life", category: "digital", create: createLife },
  { id: "fireworks", nameKey: "modeFireworks", descriptionKey: "descFireworks", icon: "✷", art: "fireworks", category: "light", create: createFireworks },
  { id: "aurora", nameKey: "modeAurora", descriptionKey: "descAurora", icon: "∿", art: "aurora", category: "cosmic", create: createAurora },
  { id: "lava", nameKey: "modeLava", descriptionKey: "descLava", icon: "◉", art: "lava", category: "nature", create: createLava },
  { id: "flow", nameKey: "modeFlow", descriptionKey: "descFlow", icon: "≈", art: "flow", category: "light", create: createFlow },
  { id: "constellation", nameKey: "modeConstellation", descriptionKey: "descConstellation", icon: "✴", art: "constellation", category: "cosmic", create: createConstellation },
  { id: "synthwave", nameKey: "modeSynthwave", descriptionKey: "descSynthwave", icon: "◒", art: "synthwave", category: "digital", create: createSynthwave },
  { id: "clock", nameKey: "modeClock", descriptionKey: "descClock", icon: "◷", art: "clock", category: "calm", create: createClock },
  { id: "campfire", nameKey: "modeCampfire", descriptionKey: "descCampfire", icon: "♨", art: "campfire", category: "campfire", create: createCampfire },
  { id: "beach", nameKey: "modeBeach", descriptionKey: "descBeach", icon: "☾", art: "beach", category: "campfire", create: createBeach },
  { id: "pixel", nameKey: "modePixel", descriptionKey: "descPixel", icon: "🏕", art: "pixel", category: "campfire", create: createPixel },
  { id: "layered", nameKey: "modeLayered", descriptionKey: "descLayered", icon: "◭", art: "layered", category: "campfire", create: createLayered },
  { id: "shatter", nameKey: "modeShatter", descriptionKey: "descShatter", icon: "❈", art: "shatter", category: "geometry", create: createShatter },
  { id: "cube", nameKey: "modeCube", descriptionKey: "descCube", icon: "⬢", art: "cube", category: "geometry", create: createCube },
  { id: "topology", nameKey: "modeTopology", descriptionKey: "descTopology", icon: "◫", art: "topology", category: "geometry", create: createTopology },
  { id: "net", nameKey: "modeNet", descriptionKey: "descNet", icon: "⧉", art: "net", category: "digital", create: createNet },
  { id: "halo", nameKey: "modeHalo", descriptionKey: "descHalo", icon: "◎", art: "halo", category: "light", create: createHalo },
  { id: "clouds", nameKey: "modeClouds", descriptionKey: "descClouds", icon: "☁", art: "clouds", category: "nature", create: createClouds },
  { id: "cells", nameKey: "modeCells", descriptionKey: "descCells", icon: "◌", art: "cells", category: "nature", create: createCells }
];

export const MODES_BY_ID = new Map(MODES.map(mode => [mode.id, mode]));
export const DEFAULT_MODE_ID = "campfire";
