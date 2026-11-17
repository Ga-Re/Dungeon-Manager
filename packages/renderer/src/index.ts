// PixiJS scene renderer (ARCHITECTURE §8). The CSP of the desktop app forbids `eval`; this
// import makes PixiJS use precompiled shaders instead.
import "pixi.js/unsafe-eval";

export * from "./camera.js";
export * from "./renderer.js";
