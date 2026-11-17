# ADR-0010: Video maps as an HTML video element underneath the PixiJS canvas

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** DM (product owner), agent

## Context
ADR-0002 chose Tauri 2 + React + PixiJS; ARCHITECTURE §8 planned to show animated maps (MP4/WebM, SPEC 3.1) as a video texture inside PixiJS. The T-007 spike measured that on the reference notebook (MacBook Air M5, 4K TV at 60 Hz): every scenario that uploads 4K video frames into a texture missed the 60 FPS budget (43.6–59.1 FPS average, 36–57 % missed refreshes; the WebGPU variant reaches 59 FPS on average but with uneven pacing) – with WebGL and WebGPU and at native or Full HD render resolution alike. A plain HTML video element underneath a transparent PixiJS canvas reached 59.8 FPS, p95 19 ms and 1.25 % missed refreshes with the full worst-case scene. See `docs/benchmarks/2026-11-17-t007-run2-run3.md`.

## Options considered
1. **Keep the video texture (current approach)** – one canvas, everything in PixiJS, effects can sample the map. Misses the budget clearly with 4K videos.
2. **Video texture, but only 1080p videos** (refuse or downscale 4K on import) – 59.9 FPS / 1.7 % missed in the spike; keeps one canvas. No 4K animated maps; downscaling on import costs time and disk space.
3. **HTML video element underneath a transparent PixiJS canvas** – the OS decodes and composites the video without a copy; 4K stays possible; measured ~60 FPS. A second layer must stay in sync with the PixiJS camera.
4. **Native video playback in Rust/OS layers** – potentially fastest, but platform-specific and much more work.

## Decision
Option 3. The map is the bottom layer anyway (ARCHITECTURE §8), so only that layer moves out of the canvas; grid, assets, light/vision, tokens, effects, fog and overlays stay in PixiJS. Static image maps remain PixiJS textures.

## Consequences
- **Hidden data must fail closed.** Under a transparent canvas the raw map is visible wherever the canvas has not drawn opaque fog. The video element therefore stays hidden until the canvas has presented the fog for the current scene, and is hidden again on resize, WebGL context loss, renderer errors and teardown; crossfades must never show a map without its fog.
- **Ambilight samples what the players see** (the video masked by fog and the player projection), never the raw video element, so LED colours cannot reveal unrevealed areas.
- The renderer owns a map layer that is either a PixiJS sprite (image) or a positioned `<video>` element (video) and applies the same camera transform (zoom, pan, rotation 0/90/180/270) to both. WebKit does not guarantee that a CSS transform and a canvas frame are composited together, so a misalignment during camera movement is a risk that T-105 measures.
- Crossfades and scene preloading use two video elements (CSS opacity) for video-to-video; video-to-image transitions cross the DOM/canvas boundary and need their own handling.
- The DM window uses the same renderer, so with both windows open the same video is decoded twice and the playback positions should stay in sync.
- Effects that need the map's pixels (distortion, map-colour blending) are not available on video maps.
- Screenshot tests must capture the page (video element plus canvas), not only the canvas, and use video fixtures the test browser can decode deterministically (e.g. WebM or a paused frame).
- The renderer benchmark (T-105) must show ≤ 1 % missed refreshes at 4K/60 Hz with realistic fog, the DM window open and an animated camera, judge the video's own smoothness separately, and investigate the remaining hitches seen in the spike (1.25 % with fog rebuilt every frame).
- ADR-0002 stays valid; this ADR refines how it renders video maps.
