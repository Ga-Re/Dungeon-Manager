import type { Camera, Size } from "./camera.js";

/**
 * The CSS transform that places a map-sized element (origin top left) exactly where the canvas
 * draws the map with `camera` – the same pivot, scale and rotation as the PixiJS world.
 */
export function cssTransform(camera: Camera, view: Size): string {
  const angle = (camera.rotation * Math.PI) / 180;
  const cos = Math.cos(angle) * camera.zoom;
  const sin = Math.sin(angle) * camera.zoom;
  // screen = R·zoom·(map − centre) + view/2
  const e = view.width / 2 - (cos * camera.centerX - sin * camera.centerY);
  const f = view.height / 2 - (sin * camera.centerX + cos * camera.centerY);
  return `matrix(${String(cos)}, ${String(sin)}, ${String(-sin)}, ${String(cos)}, ${String(e)}, ${String(f)})`;
}

/**
 * Decides when the video map may be visible (ADR-0010: fail closed). The video lies under the
 * canvas, so wherever the canvas has not drawn fog, the raw map shows. It is therefore visible
 * only after a frame was drawn while the fog is known, and hidden again from a new video, a
 * resize or a lost WebGL context until the next such frame – and for good after teardown.
 */
export function createVideoGate() {
  let fogKnown = false;
  let drawnSafely = false;
  let contextLost = false;
  let destroyed = false;
  return {
    // `setFog(null)` (the DM view: no fog) also counts as known. The player view must therefore
    // always pass an array – `PlayerApp` does, starting with "everything covered".
    fogSet() {
      fogKnown = true;
    },
    newVideo() {
      drawnSafely = false;
    },
    resized() {
      drawnSafely = false;
    },
    contextLost() {
      contextLost = true;
      drawnSafely = false;
    },
    contextRestored() {
      contextLost = false;
    },
    /** A draw failed: what is on screen is unknown, so the video hides until a good frame. */
    renderFailed() {
      drawnSafely = false;
    },
    drawn() {
      drawnSafely = fogKnown && !contextLost && !destroyed;
    },
    destroyed() {
      destroyed = true;
      drawnSafely = false;
    },
    visible: () => drawnSafely,
  };
}
