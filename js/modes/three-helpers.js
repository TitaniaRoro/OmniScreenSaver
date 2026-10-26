/**
 * Small glue shared by the five WebGL Vanta-style worlds (topology, net, halo,
 * clouds, cells).
 *
 * Each world exports a `createMode` that starts its Canvas-2D renderer right
 * away — so gallery tiles and headless environments always paint something —
 * then upgrades to a real three.js scene once the module resolves and a WebGL
 * context can be created. This helper owns that dance in one place:
 *
 *   - it never lets two renderers fight over the same canvas,
 *   - it replays the latest resize/frame onto whichever renderer is active,
 *   - and it silently stays on Canvas 2D if three.js or GL is unavailable.
 */

/**
 * @param {object} options        Mode options forwarded to both renderers.
 * @param {Function} makeCanvas   () => fallback renderer (created eagerly).
 * @param {Function} makeThree    (THREE) => 3D renderer (created on upgrade).
 */
export function withThreeUpgrade(options, makeCanvas, makeThree) {
  const fallback = makeCanvas();
  let active = fallback;
  let lastResize = null;
  let booted = false;

  import("./three-world.js").then(({ loadThree, webglAvailable }) => {
    if (booted || !webglAvailable()) return;
    return loadThree().then(THREE => {
      if (!THREE || booted || active !== fallback) return;
      let upgraded = null;
      try {
        upgraded = makeThree(THREE);
        if (lastResize) upgraded.resize(...lastResize);
        else upgraded.resize(window.innerWidth || 640, window.innerHeight || 480, window.devicePixelRatio || 1);
      } catch {
        upgraded?.destroy?.();
        return; // keep painting with the canvas renderer
      }
      booted = true;
      active = upgraded;
      fallback.destroy?.();
    });
  }).catch(() => {});

  return {
    get three() { return active !== fallback; },
    resize(width, height, ratio) {
      lastResize = [width, height, ratio];
      active.resize(width, height, ratio);
    },
    frame(dt, time) { active.frame(dt, time); },
    destroy() {
      active.destroy?.();
      if (active !== fallback) fallback.destroy?.();
    }
  };
}
