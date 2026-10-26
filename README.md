<div align="center">

# 🌌 OmniScreenSaver

### **Let your name drift through a universe of motion.**

**আপনার নাম, আলোর ভেতর ভেসে বেড়াক।**

*A creative, fullscreen screensaver-style experience for the web — made for quiet moments, vivid motion, and ambient sound.*

<p align="center">
  <a href="https://muya2026.github.io/OmniScreenSaver/">
    <img src="https://img.shields.io/badge/%E2%96%B6%20PLAY%20OMNISCREENSAVER-OPEN%20THE%20EXPERIENCE-7c3aed?style=for-the-badge" alt="▶ Play OmniScreenSaver — open the experience">
  </a>
  <br>
  <sub>Fullscreen visuals · ambient sound · your name in the animation</sub>
</p>

![Status: in development](https://img.shields.io/badge/status-in%20development-f0a44b?style=for-the-badge)
![Languages: English and Bengali](https://img.shields.io/badge/languages-English%20%2B%20বাংলা-269b8f?style=for-the-badge)
![Animated worlds: 27](https://img.shields.io/badge/animated%20worlds-27-7965d8?style=for-the-badge)
![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-3b82f6?style=for-the-badge)

</div>

> 🚧 **In development.** The full experience is playable from a local static server. GitHub Pages is not enabled yet, so the Play button and published URL will become live after deployment.

---

## ✨ A screensaver with a sense of wonder

OmniScreenSaver is a lightweight **web page—not a native app**—that transforms a display into a looping world of color, light, and motion. Choose a name, choose a scene, and watch that name become part of the animation rather than sit on top of it.

The interface is available in **English and বাংলা (Bengali)**, with a customizable name and 27 visual modes designed to run fullscreen in a modern browser.

### The experience

- **Your name belongs in the scene.** It can gather from stardust, glow in falling rain, ripple across sand, or rise from campfire embers.
- **Ambient sound in every mode.** Each scene has a gentle soundscape, with a master **sound on/off** switch and **volume control**. The audio is soft and atmospheric.
- **No still mode cards.** All 27 gallery tiles are live animated previews; only tiles in or near the viewport render, so the rest of the page stays light on battery and mobile GPUs.
- **Made to loop.** The worlds use naturalistic drift, flow fields, springs, buoyancy, drag, turbulence, and layered water motion rather than repetitive, mechanical oscillation.
- **Fire that behaves like fire.** The bonfires use hot-gas buoyancy, turbulent flame, cooling embers, drifting smoke, and firelight that flickers across logs and the surrounding scene.
- **A type style for every world.** Each animation has its own face and name choreography: ember-lit serif, pixel lettering, terminal mono, chrome tech, star-chart lettering, and more. Fonts are self-hosted, with Bengali-capable fallbacks.
- **Simple exit behavior.** Mouse movement reveals the close control without stopping the animation; a close-button click, touch, or key press exits the screensaver.
- **English + বাংলা.** The interface supports both languages, including Bengali names and text.

## 🎨 The 27 worlds

The gallery contains **27 visual modes**. Each mode has its own ambient sound profile and a visual treatment that weaves your name into the scene.

| World | What to expect |
|---|---|
| ✨ **Starfield Warp** | Stars gather into your name before you fly through the field. |
| 💫 **Mystify** | Neon ribbons fold around the outline of your name, then drift free. |
| 🪄 **3D Pipes** | Colorful pipes grow through a three-dimensional space. |
| 🧭 **3D Maze** | Wander through a self-walking maze with your name on its walls. |
| 🏓 **Bouncing Name** | Your name becomes the bouncing arcade-block centerpiece. |
| 🔷 **3D Spinning Name** | Shimmering letters turn slowly in space. |
| 🌧️ **Matrix Rain** | Falling characters gather into a glowing name, then wash away. |
| 💻 **Hacker Terminal** | A friendly terminal types a welcome and reveals your name in glowing text. |
| 🧬 **Game of Life** | Living cells begin in the shape of your name and evolve. |
| 🎆 **Fireworks** | Gentle bursts of light sketch your name across the night. |
| 🌌 **Aurora** | A flowing aurora writes your name in the sky. |
| 🫧 **Lava Lamp** | Slow-moving blobs merge into letterforms and melt apart. |
| 🌬️ **Flow Field** | Glowing threads weave around the shape of your name. |
| 🌠 **Particle Constellation** | Dots connect to form your name, then scatter like stars. |
| 🌇 **Synthwave** | Chrome lettering floats above a neon sunset and grid. |
| 🕰️ **Flip Clock** | A calm clock scene with a personal greeting. |
| 🔥 **Campfire Night** | Firelight, pine silhouettes, and sparks that gather into your name. |
| 🌊 **Beach Bonfire** | A moonlit shore where waves gently wash your name from the sand. |
| 🏕️ **Pixel Campfire** | A cozy, retro pixel-art campsite with ember-lit lettering. |
| 🗺️ **Topology Mesh** | Living contour lines rise into hills and sketch your name in the terrain. |
| 🧠 **Neural Network** | Signals cross a drifting mesh of nodes until the wiring spells your name. |
| 💡 **Halo Rings** | Glowing rings orbit the dark, then peel off particles to build your name. |
| ⛈️ **Storm Clouds** | Moonlit clouds drift and flash; your name condenses out of the vapour. |
| 🦠 **Living Cells** | A restless colony divides and glows, growing your name as living tissue. |

*Shuffle mode rotates through the worlds automatically at your chosen interval.*

## 🔊 Sound, softly done

Sound is part of the atmosphere—not a soundtrack competing for attention. Every world has a distinct, gentle ambient layer with quiet cues tied to what is on screen: a soft chime when a name bounces, a wave as the tide rolls in, or a delicate tick in the clock scene.

Use the master sound toggle and volume slider on the start page or in the mouse-revealed screensaver controls. Audio is synthesized in-browser with the Web Audio API, so there are no audio downloads. Browsers require a user gesture to start sound; an idle auto-start therefore begins silently until you enable audio.

## 🧰 Technology

The implementation is browser-native and static-site friendly:

| Layer | Technology |
|---|---|
| Page and interface | HTML5, CSS3, JavaScript ES modules |
| Visuals | Canvas 2D and WebGL |
| Ambient audio | Web Audio API |
| Fullscreen | Browser Fullscreen API, where supported |
| Keep-awake behavior | Screen Wake Lock API, where supported |
| Language and text | Browser internationalization APIs, with English and Bengali support |
| Deployment target | GitHub Pages (static root) |

There is no framework or build step, and the page has no external runtime dependencies. Bengali fonts are self-hosted under the SIL Open Font License; all scene audio is generated locally in the browser.

## 🚀 Try it

### Run locally

Serve the repository root over HTTP (ES modules do not run from `file://`):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a modern browser. No build or package installation is needed. To run the built-in checks with Node.js:

```bash
npm run check
```

### Published version

The Play button at the top points to the intended GitHub Pages address:

**https://muya2026.github.io/OmniScreenSaver/**

It will become playable there once Pages is enabled and the site is published. Fullscreen and audio depend on browser support and user permissions; on devices that restrict fullscreen, the page fills the available screen area instead.

## 🗺️ Roadmap

- [x] Build the bilingual start page, name settings, and screensaver engine
- [x] Add fullscreen entry/exit behavior, Wake Lock support, and ambient sound controls
- [x] Implement all 22 visual modes, including three campfire scenes
- [x] Add five Vanta-inspired worlds (Topology Mesh, Neural Network, Halo Rings, Storm Clouds, Living Cells)
- [x] Add shuffle, live hover previews, share links, and Bengali clock/calendar support
- [ ] Review the live preview on desktop and mobile, then polish from feedback
- [ ] Publish the static site on GitHub Pages

## 👩‍💻 Developer credit

**Project creator and developer:** [@muya2026](https://github.com/muya2026)

## 📄 License

OmniScreenSaver is licensed under the **GNU General Public License v3.0**. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

**A little motion. A softer sound. A space that feels like yours.**

*একটু আলো, একটু সুর—আপনার নিজের মতো একটি পর্দা।*

</div>
