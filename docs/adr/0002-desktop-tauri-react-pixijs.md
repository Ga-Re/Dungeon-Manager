# ADR-0002: Desktop app with Tauri 2, React and PixiJS

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
The desktop app renders large (also animated MP4/WebM) maps with fog, light and effects on a second display, and also hosts UI-heavy features (wiki, editor, trackers).

## Options considered
1. **Tauri 2 + React + PixiJS** – web engine plays MP4/WebM natively; PixiJS is proven for VTTs (Foundry VTT); small binaries; Rust backend for LAN, lights, camera. Con: Linux video depends on GStreamer; Rust needed.
2. **Godot 4** – strong 2D lighting/particles. Con: core supports only Ogg Theora video; weak for text-heavy UI.
3. **Electron** – mature. Con: large binaries, Node backend less suited for UDP/camera performance.
4. **Flutter** – good UI. Con: fog/vision/light rendering largely self-built.

## Decision
Option 1.

## Consequences
Renderer is a separate package (`packages/renderer`). Early performance spike (stage 0) validates the choice on the reference notebook.
