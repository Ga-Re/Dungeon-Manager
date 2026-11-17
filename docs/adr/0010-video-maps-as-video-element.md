# ADR-0010: Video maps as an HTML video element underneath the PixiJS canvas

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** DM (product owner), agent

## Context
ADR-0002 chose Tauri 2 + React + PixiJS; ARCHITECTURE §8 planned to show animated maps (MP4/WebM, SPEC 3.1) as a video texture inside PixiJS. The T-007 spike measured that on the reference notebook (MacBook Air M5, 4K TV at 60 Hz): every scenario that uploads 4K video frames into a texture missed the 60 FPS budget (44–48 FPS, 36–57 % missed refreshes) – with WebGL and WebGPU and at native or Full HD render resolution alike. A plain HTML video element underneath a transparent PixiJS canvas reached 59.8 FPS, p95 19 ms, 1 dropped video frame in 20 s with the full worst-case scene. See `docs/benchmarks/2026-11-17-t007-run2-run3.md`.

## Options considered
1. **Keep the video texture (current approach)** – one canvas, everything in PixiJS, effects can sample the map. Misses the budget clearly with 4K videos.
2. **Video texture, but only 1080p videos** (refuse or downscale 4K on import) – 59.9 FPS / 1.7 % missed in the spike; keeps one canvas. No 4K animated maps; downscaling on import costs time and disk space.
3. **HTML video element underneath a transparent PixiJS canvas** – the OS decodes and composites the video without a copy; 4K stays possible; measured ~60 FPS. A second layer must stay in sync with the PixiJS camera.
4. **Native video playback in Rust/OS layers** – potentially fastest, but platform-specific and much more work.

## Decision
Option 3. The map is the bottom layer anyway (ARCHITECTURE §8), so only that layer moves out of the canvas; grid, assets, light/vision, tokens, effects, fog and overlays stay in PixiJS. Static image maps remain PixiJS textures.

## Consequences
- The renderer owns a map layer that is either a PixiJS sprite (image) or a positioned `<video>` element (video) and applies the same camera transform (zoom, pan, rotation 0/90/180/270) to both, in the same frame.
- Crossfades and scene preloading use two video elements (CSS opacity) for video maps.
- Effects that need the map's pixels (distortion, map-colour blending) are not available on video maps. Ambilight samples the video element separately at low resolution and rate.
- Screenshot tests must capture the page (video element plus canvas), not only the canvas.
- The renderer benchmark (T-105) must show ≤ 1 % missed refreshes with realistic fog and investigate the remaining hitches seen in the spike (1.25 % with fog rebuilt every frame).
- ADR-0002 stays valid; this ADR refines how it renders video maps.
