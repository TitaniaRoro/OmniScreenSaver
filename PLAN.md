# OmniScreenSaver — Project Plan

## Goal

Build OmniScreenSaver as a static, browser-based screensaver-style web page for GitHub Pages (not a native app). A visitor can choose a visual mode, enter a name, and run a fullscreen animation that loops until they exit. The name should be woven into each scene rather than placed as a separate overlay. The interface supports English and Bengali.

## Requirements

- At least 13 visual modes; the current set contains 22, including three campfire scenes and two premium 3D effects.
- Every gallery tile is a live animation, not a still thumbnail. Only visible/near-visible previews render, and offscreen previews are torn down to protect battery and GPU time.
- Endless animation loop, responsive canvas rendering, and best-effort fullscreen support.
- Each mode has its own name typeface, color/effect treatment, and reveal choreography; new fonts are self-hosted with Bengali-capable fallbacks.
- Use smooth, continuous motion models (springs, noise/curl fields, buoyancy, drag, turbulence, and layered wave motion) rather than repetitive mechanical loops; use particle-based combustion for all fire scenes.
- Mouse movement reveals the controls without closing the animation. Clicking elsewhere does not close it.
- The close button, a touch, or any key press exits the screensaver and returns to the start page. Esc is also covered when the browser exits fullscreen directly.
- Every mode has a gentle, ambient soundscape. A master sound toggle and volume control are available on the start page and in the mouse-revealed screensaver toolbar.
- User name is configurable, retained locally, handled safely as text, and can be hidden. Bengali grapheme clusters must not be split incorrectly.
- English and Bengali UI; language can be selected or detected from the browser. Bengali clock/date includes the Bangladesh revised Bangla calendar.
- Local settings include animation speed, shuffle interval, keep-awake preference, and optional idle auto-start. Auto-start cannot force browser fullscreen or bypass the browser's audio gesture policy.
- Respect hidden-tab state, cap canvas pixel ratio for performance, and allow modes to reset their own state during long sessions.
- Build as a no-framework static site with no build step or CDN dependency. Keep Pages settings unchanged until explicitly approved.

## Technology

- HTML5, CSS3, JavaScript ES modules.
- Canvas 2D for mode rendering; raw WebGL for Aurora, with graceful behavior if WebGL is unavailable.
- Web Audio API for synthesized, low-level ambience and soft visual cues.
- Fullscreen and Screen Wake Lock APIs where supported.
- Self-hosted OFL font files for Bengali UI and display names.
- GitHub Pages from the repository root is the intended deployment target.

## Planned modes

1. Starfield Warp
2. Mystify
3. 3D Pipes
4. 3D Maze
5. Bouncing Name
6. 3D Spinning Name
7. Matrix Rain
8. Hacker Terminal
9. Game of Life
10. Fireworks
11. Aurora
12. Lava Lamp
13. Flow Field
14. Particle Constellation
15. Synthwave
16. Flip Clock
17. Campfire Night
18. Beach Bonfire
19. Pixel Campfire
20. Shattering Name
21. Layered Camp 3D
22. Isometric Cube

A Shuffle option rotates through modes at the selected interval.

## Experience and safety details

- Canvas drawing uses `fillText` and sampled glyph masks; user-controlled strings are never inserted with `innerHTML`.
- Bengali display strings use grapheme segmentation (`Intl.Segmenter` where available) and a fallback that keeps hasanta-linked clusters together.
- Audio starts only from a user gesture, fades in/out and across Shuffle transitions, has a master limiter, and stays subdued. Settings persist locally.
- On close: stop animation, destroy the active mode, release Wake Lock, fade/stop audio, exit fullscreen if active, and restore the start page. Swallow the close key/tap so it cannot activate a control underneath.
- The Gallery offers one active canvas hover/focus preview at a time; touch users can choose modes directly.
- URL parameters can prefill the name and language and select a mode (for example `?mode=matrix&name=Muya&lang=bn`).

## Milestones

1. **Foundation:** start page, bilingual UI, settings, responsive animation engine, fullscreen/exit behavior, local Bengali fonts, name-shape helper, audio system, and the first modes.
2. **Full gallery:** implement all 22 modes, ambient sound profiles, Shuffle, Gallery previews, and clock/calendar details.
3. **Polish:** accessibility and performance pass, README, favicon, tests, and GitHub Pages deployment after explicit approval.

## Status

The complete 22-mode static site is implemented on the Arena working branch. All gallery previews are animated and viewport-budgeted; each world has its own type treatment and reveal, and the three fire scenes share a combustion particle model. JavaScript syntax/mode checks, Bengali grapheme/calendar tests, translation-key checks, font-file checks, and Canvas rendering smoke tests pass. A live static preview is available in the workspace. GitHub Pages remains disabled; the README Play link becomes live after deployment and explicit approval.
