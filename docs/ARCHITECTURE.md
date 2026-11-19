# Architecture

> **How** the product in [SPEC.md](SPEC.md) is built. Every significant decision here is backed by an ADR in [adr/](adr/). If this document and an ADR disagree, the newer accepted ADR wins and this document must be updated in the same PR.

---

## 1. System overview

```
                         ┌──────────────────────────── Notebook ────────────────────────────┐
                         │  Desktop app (Tauri 2)                                          │
  Table TV  ◄── window ──┤   ├─ DM window       (React UI + PixiJS renderer)              │
  (player view)          │   ├─ Player window   (PixiJS renderer, no controls)            │
                         │   └─ Rust backend                                               │
                         │        ├─ Session host (authoritative state, command handling)  │
                         │        ├─ LAN server: HTTP (companion static files) + WebSocket │
                         │        ├─ Storage: library folder, file watching, previews     │
                         │        ├─ Light drivers (HA, Hue, WLED, Govee, Nanoleaf)        │
                         │        └─ Camera pipeline (OpenCV/ArUco)            [stage 7]   │
                         └──────────────┬─────────────────────────────┬────────────────────┘
                                        │ WebSocket (LAN)             │ local folder
               ┌────────────────────────┴───────┐            ┌────────┴──────────┐
               │ DM remote (browser)  [stage 3]  │            │ Cloud client      │
               │ Player companion (browser)[st.3]│            │ (Dropbox, iCloud…)│
               └─────────────────────────────────┘            └────────┬──────────┘
                                                                       │ sync
                                              Obsidian / Markdown tool (offline planning)
```

Two independent channels:

- **Live channel (LAN WebSocket):** only during a session. Desktop is the single source of truth.
- **Data channel (sync folder):** files on disk, synced by a third-party cloud client. Used for planning on the go.

---

## 2. Tech stack

| Concern                | Choice                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language               | TypeScript (strict) everywhere except the desktop backend (Rust)                                                                                                                                 |
| Monorepo               | pnpm workspaces + Turborepo                                                                                                                                                                      |
| Desktop shell          | Tauri 2                                                                                                                                                                                          |
| Desktop / companion UI | React                                                                                                                                                                                            |
| Rendering              | PixiJS (WebGL/WebGPU)                                                                                                                                                                            |
| Rich text              | WYSIWYG Markdown editor (TipTap-based) on the desktop; on the go the DM uses Obsidian or any Markdown tool (ADR-0013)                                                                            |
| Schemas & validation   | zod (shared between all apps; also generates JSON Schema for Rust-side checks if needed)                                                                                                         |
| UI strings             | i18next; `de` first, `en` second                                                                                                                                                                 |
| Backend (Rust)         | tokio, axum (HTTP + WebSocket), notify (file watching), serde, image (previews)                                                                                                                  |
| Unit / component tests | Vitest + React Testing Library; Rust: `cargo test`                                                                                                                                               |
| E2E                    | Playwright (DM window as a browser build with in-memory platform services – `apps/desktop/e2e.html`, Vite `e2e` mode; and the companion); WebdriverIO + tauri-driver smoke tests on the real app |
| Visual regression      | Playwright screenshots of renderer fixtures                                                                                                                                                      |
| Lint / format          | ESLint, Prettier, `rustfmt`, `clippy`                                                                                                                                                            |
| Architecture checks    | dependency-cruiser                                                                                                                                                                               |

New dependencies require approval (see CLAUDE.md).

---

## 3. Repository layout

```
/
├── CLAUDE.md                  # agent working rules
├── TASKS.md                   # task list (single source of truth for work)
├── docs/
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   └── adr/
├── apps/
│   ├── desktop/
│   │   ├── src/               # React UI (DM window, player window entry points)
│   │   └── src-tauri/         # Rust backend
│   └── companion/             # React web app served by desktop over LAN
├── packages/
│   ├── core/                  # pure domain logic, no I/O
│   ├── schema/                # zod schemas for files + migrations
│   ├── protocol/              # LAN message types + validation
│   ├── storage/               # file layout, read/write via injected FS adapter, conflict detection
│   ├── renderer/              # PixiJS scene graph: map, grid, fog, tokens, effects
│   ├── ui/                    # shared React (web) components for desktop + companion
│   ├── i18n/                  # translation resources
│   └── test-fixtures/         # sample campaigns, maps, golden screenshots
└── tooling/                   # shared eslint/tsconfig/dependency-cruiser configs
```

---

## 4. Module boundaries (enforced by dependency-cruiser)

| Package    | May depend on                                                         | Must NOT depend on                                     |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| `core`     | `schema`, `polyclip-ts` (pure polygon boolean ops for fog)            | React, PixiJS, Tauri, Expo, Node/Browser APIs, any I/O |
| `schema`   | zod                                                                   | everything else                                        |
| `protocol` | `core`, `schema`, `zod` (message validation)                          | UI, renderer, I/O                                      |
| `storage`  | `core`, `schema`                                                      | UI, renderer; real FS (uses an injected adapter)       |
| `renderer` | `core`, `schema`, PixiJS                                              | React, Tauri, storage                                  |
| `ui`       | `core`, `schema`, `i18n`, React, `renderer` (public entry point only) | Tauri, Expo, renderer internals                        |
| `apps/*`   | any package                                                           | other apps                                             |

Rules:

- `core` is **pure**: deterministic functions, no clocks, no randomness without an injected source, no I/O.
- Platform-specific code lives only in `apps/*` behind adapters (FS, network, clock, RNG, lights, camera).

---

## 5. Domain model & state

### 5.1 Command → state → events

All state changes go through **commands** handled by a pure reducer in `core`:

```ts
apply(state: SessionState, command: Command, ctx: Ctx): { state: SessionState; events: DomainEvent[] }
```

- `Ctx` provides injected time and RNG (deterministic tests).
- **Permissions** are checked in `core` (`canApply(actor, command, state)`): DM, DM remote (web app), player companion (per-player rights).
- **Undo:** the desktop keeps a command history with inverse snapshots per scene.
- **Session log** is derived from `DomainEvent`s.
- **Visibility filtering** (`projectForViewer(state, viewer)`) is a pure function in `core`. The player window and every companion only ever receive the projected state – hidden data never leaves the desktop. It builds its output from an explicit allow-list with strict viewer schemas – never by parsing with the (loose, unknown-field-preserving) file schemas from `packages/schema` or by spreading state objects. Asset references in a projection are capabilities: a companion must never receive a reference that lets it fetch an un-fogged map or a level that has not been revealed (companions get fog-composited images, T-118).

### 5.2 Key entities (initial)

`Campaign`, `Scene`, `MapData` / `AssetData` (sidecar: metadata, scale, levels, walls, doors, lights, rooms; for assets mask, blocker type, variants – ADR-0012), `SceneOverrides` (per element id), `PlacedAsset`, `Token`, `FogState` (revealed regions per level, memory fog), `InitiativeState`, `Combatant` (HP, temp HP, conditions), `VisibilityRule`, `Player`, `Handout`, `SoundPreset`, `LightPreset`, `WikiEntry`.

Coordinates: grid cells (integer `col,row`) for game logic; map pixels for rendering. Conversion lives in `core`.

The entities are zod schemas in `packages/schema`. Only the files carry `schemaVersion` – `campaign.json`, one file per scene (version 1 since T-101) and one sidecar per library file (ADR-0012); the other entities are embedded in them.

A scene references its map (ADR-0012) and keeps overrides by element id; `core` resolves the effective map with a pure `resolveMap(sidecar, overrides)` that renderer, vision and `projectForViewer` all use. Overrides whose target id no longer exists stay stored, are inactive and are reported as orphaned. Grid and scale are never overridden per scene. A global edit reaches a scene that is live on the TV only after the DM confirms it. Unknown fields are kept on round-trip, documents from a newer app version are refused instead of downgraded, and older ones are migrated step by step (`migrateDocument`).

---

## 6. Storage

### 6.1 Principle

All data lives in a **user-chosen folder**. If it sits inside a cloud-synced folder, the cloud client does the syncing. The app never calls cloud APIs.

### 6.2 Folder layout

```
<library root>/
├── library/                  # global asset library (all campaigns)
│   ├── maps/  tokens/  assets/  sounds/  effects/
│   │   └── castle.webp + castle.webp.dm.json   # sidecar per file (ADR-0012)
│   └── .previews/            # generated by desktop for the web app and handouts
├── campaigns/<campaign-slug>/
│   ├── campaign.json
│   ├── wiki/                 # Obsidian-compatible Markdown + YAML front matter
│   ├── sessions/             # session notes & logs (Markdown)
│   ├── scenes/               # one JSON file per scene
│   ├── encounters/
│   ├── snapshots/            # ZIP per session
│   └── .trash/               # 30-day trash
└── (no device settings here)
```

Device-specific settings (light devices, cameras, TV calibration, window placement) live in the OS app-data directory, **not** in the sync folder.

### 6.3 File rules

- **One file per entity.** Never a single database file in the sync folder.
- Every JSON file has `schemaVersion`. Reading runs migrations in `schema`; writing always uses the latest version.
- Asset references are **relative paths from the library root** plus a content hash, so moved/renamed files can be re-linked.
- Writes are atomic: write to `*.tmp`, then rename.
- **Conflict detection:** recognise conflict copies of common providers (e.g. `name (conflicted copy …)`, `name (1)`, `name-DESKTOP-XXXX`) and offer a diff/merge UI. Never silently delete either version.
- **Placeholders:** files not yet downloaded (on-demand sync) must yield a "not available yet" state, never a crash.
- **Desktop file access:** the webview only passes library-relative `/` paths to the Rust backend, which confines them to the chosen root (no `..`, drive colons, backslashes, Windows device names or symlinks below the root; temporary files are created exclusively, never through a symlink). Known gap: the symlink check runs just before each operation, so a sync peer swapping a folder for a symlink in between is not caught – accepted, because the webview cannot create symlinks. Imported assets are copied once into a staging file (hashed on the way) and placed with a hard link, which never replaces an existing file; on volumes without hard links a rename after an existence check is used, with the same kind of small race. The root is only set through the native folder picker (or the saved device setting), never by the webview. Only the DM window's capability grants the `library_*` commands; changes on disk are reported to the DM window by a `notify` watcher.
- Changing the folder layout or a file format is a **breaking change** → requires DM approval and a migration (see CLAUDE.md).

### 6.4 Notes

Markdown with YAML front matter (`type`, `status`, `tags`, …) and `[[wiki links]]`; must remain readable and editable in Obsidian.

### 6.5 Previews

Desktop generates downscaled images (and a still frame for video maps) into `library/.previews/` for the catalog, the web app and handouts; originals stay on the notebook.

### 6.7 Obsidian vault and scene drafts

The DM plans on the go in Obsidian or any Markdown tool (ADR-0013). Storage ignores tool folders such as `.obsidian/`; the desktop watches notes and picks up external changes. Notes with scene front matter (`type: scene`, map, sound, light, tokens) are validated with zod and offered as scene drafts; invalid ones show an actionable hint, never a crash.

### 6.6 Backups

- Snapshot ZIP per session end (campaign data only; assets are referenced, not included)
- Trash with 30-day retention: deleting moves a file to `campaigns/<slug>/.trash/<UTC timestamp>[-n]/<path inside the campaign>`, so it can be restored to where it was (never removed, never overwritten); purging after 30 days is still to be built
- Export: self-contained archive including used assets
- Sharing a single map or asset: `.dmmap` bundle (ZIP of original, sidecar and variant files; ADR-0012)

---

## 7. LAN networking

- Desktop backend runs HTTP + WebSocket bound to the local network interface only.
- HTTP serves the built `apps/companion` bundle.
- **Pairing:** QR code contains `http://<lan-ip>:<port>/?t=<one-time token>`. The token is exchanged for a session credential; tokens expire and can be revoked by the DM.
- Roles: `dm` (desktop), `dm-remote` (DM mode of the web app, own pairing), `player:<id>` (companion).
- Messages are defined and validated in `protocol` (zod). Every message has a `v` (protocol version). Clients send **commands**; the host validates permissions, applies them, and broadcasts **projected state patches** per viewer.
- Clients are disposable: on reconnect they receive a full projected snapshot.

---

## 8. Rendering (PixiJS)

Layer order (bottom → top): map (image/video) → grid → assets → light/vision → tokens → effects → fog → DM overlays (DM window only) → UI pings.

- The **same renderer** draws the DM window and the player window, with different viewer projections and overlays.
- The player window is a separate Tauri window placed fullscreen on the chosen display. Its only permission is listening for events – which Tauri cannot limit to certain events, so the player window can hear every global event of the app. Hence the rule: **no global event may carry library or campaign data**; data meant for the DM window only (e.g. file changes) goes through IPC channels, and drag & drop is disabled. With that permission: the DM window sends it a versioned `PlayerViewMessage` (`protocol`) with the scene as `projectForViewer` leaves it for the table, and the player window validates every message with the strict schema. When the player window (re)loads, the backend tells the DM window, which sends the current state again. The player view fails closed: opaque fog covers everything not revealed, it is set before the map, and without a valid scene the screen stays black.
- Grid calibration: `pixelsPerInch` of the target display → cell size of 1 inch.
- Library images reach the webviews through the read-only `dmlib` URI scheme (Rust, `protocol.rs`): it serves only files under `library/` with the usual path confinement, only to the DM and player windows, and never `campaigns/` (scenes, notes, hidden data). It replaces any file permission for displaying maps. Image maps are uploaded as WebGL textures, so responses are CORS-clean. Video maps (MP4/WebM) are served in byte ranges of at most 4 MiB (HTTP Range), never read whole into memory; the CSP allows `dmlib` for images and media only.
- Fog is an opaque layer with the revealed polygons as an inverse stencil mask (each polygon filled on its own), so nested and touching areas render correctly; the player view draws it opaque, the DM view see-through. Fog edits run through `core` (`execute` with undo history) in a scene session in the DM window, which saves each change to the scene file and sends the TV the new projection synchronously.
- The renderer draws on demand (once per change), not every frame, so an idle DM window costs no GPU time; animation (video, effects) will run a frame loop only while needed.
- Video maps (implemented in T-105c): the caller puts the `<video>` directly under the canvas; the renderer sizes it, applies the camera as a CSS `matrix()` and keeps it `visibility: hidden` until a frame was drawn with the fog known – again after a new video, a resize or a lost WebGL context, and for good after teardown. For video maps the canvas is cleared to transparent black (premultiplied alpha). Image maps keep an opaque canvas background.
- Video maps: a positioned HTML `<video>` element underneath a transparent PixiJS canvas, sharing the camera transform; not a texture (ADR-0010, measured in T-007). Image maps are PixiJS textures. Preload the next scene.
- **Vision (stage 5):** visibility polygons per light source and viewer are computed in `core` (pure, 2D raycasting against the resolved walls, closed doors and asset blockers). The TV shows the union of all player tokens' vision; memory fog keeps visited areas dimmed. Blocker types: blocks sight and light, one-way, partial (dimmed instead of hidden).
- **Transitions:** scene changes (crossfade, through black, instant) and soft fog fades stay fail-closed – the incoming scene becomes visible only after its fog is set. Soft fog edges and fades can be switched off in the settings and must meet §11 when on.
- Renderer fixtures in `test-fixtures` are used for screenshot tests.

---

## 9. Lighting

- Drivers behind one interface in Rust: `LightDriver { discover, set_state, play_effect }`.
- Zone/role mapping and priority resolution (effect > ambilight > scene) are **pure logic in `core`**; drivers only execute.
- A failing driver reports status; it never blocks the session.
- Photosensitivity limits are enforced centrally before sending to drivers.

---

## 10. Camera (stage 7)

- Rust pipeline: capture → ArUco detection → homography per camera (calibrated from on-screen markers) → height compensation → grid snap → confidence.
- Fusion of multiple cameras in `core` (pure, testable with recorded detections).
- Output is **suggestions**; `core` decides what is applied (manual locks, confidence threshold).

---

## 11. Performance budgets

Measured on the reference notebook before each release (not in CI – CI runners have no usable GPU):

| Metric                                                 | Budget                                            |
| ------------------------------------------------------ | ------------------------------------------------- |
| Player view frame rate, 4K video map + fog + 20 tokens | ≥ 60 FPS: ≤ 1 % of frames miss a display refresh¹ |
| Scene switch with preloading                           | ≤ 1 s to first frame                              |
| Command from DM remote/companion → visible on TV (LAN) | ≤ 100 ms                                          |
| Light effect trigger → lamp reacts (HA/WLED/Hue Ent.)  | ≤ 150 ms                                          |
| Desktop cold start                                     | ≤ 3 s                                             |

¹ Measured at 60 Hz output as frame intervals longer than 1.5 × the measured refresh interval (≈ 25.5 ms at 60 Hz). A literal p95 ≤ 16.7 ms is unreachable even at a perfect 60 Hz (interval jitter, timers rounded to 1 ms in WebKit); see `docs/benchmarks/2026-11-17-t007-run2-run3.md`.

A benchmark scene in `test-fixtures` plus a script that records frame times is part of stage 0.

---

## 12. Testing strategy

| Layer     | Tool                                                           | Required for                                                                  |
| --------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Unit      | Vitest / `cargo test`                                          | all logic in `core`, `schema`, `storage`, `protocol`; Rust drivers with fakes |
| Component | Vitest + React Testing Library                                 | every non-trivial React component                                             |
| E2E       | Playwright (desktop web build + companion), tauri-driver smoke | every user-facing flow in the task's acceptance criteria                      |
| Visual    | Playwright screenshots of renderer fixtures                    | every renderer change                                                         |

- Coverage gate: **≥ 80 % lines/branches for `core`, `schema`, `storage`, `protocol`**. No fixed gate for UI.
- Screenshot tests run in a pinned Docker image for deterministic rendering.
- Tests must be deterministic: inject time and RNG; no real network in unit tests.

---

## 13. Security & privacy

- LAN server only; no port forwarding, no cloud relay.
- One-time pairing tokens; DM can kick/revoke any client.
- Companions only receive projected state – never hidden data.
- No telemetry without explicit opt-in.
- The repository is public: test fixtures are self-made or CC0 only (sources in `packages/test-fixtures/SOURCES.md`); no personal or device data in the repo.
- Secrets (e.g. Hue/HA tokens) stored in the OS keychain, never in the sync folder or repo.

---

## 14. Platform notes

- Linux: Tauri uses WebKitGTK; video playback depends on GStreamer codecs – document requirements.
- Phones: no own app (ADR-0013). The web app runs in the phone browser; for Obsidian on the go the DM needs a sync that keeps the vault folder in sync (on Android most cloud apps don't → in-app guide recommends a sync app).

---

## 15. UI shell & design system

_Decided in ADR-0011 and ADR-0014 (docked zones); binding details in `.claude/skills/ui-design/SKILL.md`._

- **DM window zones (ADR-0014):** a full-width title bar; below it the data panel (catalogue) as a full-height left column that folds away with Cmd/Ctrl+B; the ribbon grouped by workflow mode right of it; the map canvas fills exactly the remaining area, so fit, zoom and centring need no insets. Floating over the map: the scene browser (top left of the map area), the navigation/display dock (bottom centre), notices, context menus and popovers. Features are placed in a zone; nothing else resizes the canvas, and the renderer follows the canvas size when the panel folds or the window resizes.
- **Player window:** unchanged – chrome-free fullscreen, no design-system UI.
- **Implementation (T-130):** `DmShell` owns the zones and exposes them as slots; components keep their state where it lives (e.g. the open scene in the data panel) and render their parts into a zone with `ShellPortal` (React portal). Outside a shell they render in place, so component tests need no shell. The title bar shows a save status (scenes save on every change), undo/redo and the open scene's tab; the ribbon modes are Szene, Nebel and Anzeige.
- **Controls (T-130b):** ribbon tools sit in `RibbonGroup`s (large icon over a short label, caption below; a caption with ▾ is a `Menu` of less frequent commands). Short follow-up steps (confirm delete, map change) open in a `Popover` under their group instead of growing the ribbon. Plain buttons, fields and selects inside `.dm-ui` get their base look from `components.css` with zero specificity (`:where()`), so component classes always win.
- **Browser and data panel (T-130c):** the scene browser shows one campaign – switched or created from its header menu – as a tree of its scenes, with the open scene's content (map, levels, fog) below it; clicking a scene opens it. New scenes come from the ribbon ("Neu") or the tree's context menu (right-click, Shift+F10, context-menu key) and open in a popover; a new scene opens right away. The data panel is the library's map and asset catalogue (filled by T-124); the library folder is chosen in the settings popover. `DmShell` has no content props: everything, including the data panel and the settings, renders into its slots.
- **Appearance setting:** gear icon in the title bar → follow the OS / light (parchment) / dark (night); stored per device in the webview's storage (OS app-data, not the sync folder) and applied when the window starts, before React renders.
- **Tokens:** CSS custom properties (`--dm-surface-*`, `--dm-border-*`, `--dm-text-*`, `--dm-accent-*`, `--dm-space-*`, `--dm-font-*`, `--dm-z-*`) are defined once in `packages/ui`; apps consume them and never hard-code colours, spacing, fonts or z-indices. The values are data in `packages/ui/src/tokens.ts` (tested for WCAG AA); `packages/ui/styles/tokens.css` is generated from it (`pnpm --filter @dungeon-manager/ui gen:tokens`, a test keeps both in sync). Parchment is the default; night applies when `data-dm-theme="night"` is set on the root element, or with `data-dm-theme="system"` while the OS prefers a dark scheme (`prefers-color-scheme`); the DM switches it in the appearance setting. `findHardCodedValues` checks app stylesheets.
- **Layering (`--dm-z-*`):** 0 map canvas/video · 10 canvas overlays · 20 floating HUD · 30 ribbon (docked, ADR-0014; the data panel column needs no layer) · 40 context menus/popovers · 50 modals.
- **Theme:** light parchment panels with dark ink, dark slate window chrome, one amber accent for active/selected states, plus a dimmed "night" variant for dark rooms; WCAG AA contrast minimum in both. Restrained styling: one line-icon set, no illustrative decoration (see ADR-0011 "Design references"). Textures, fonts and icons are self-made, CC0 or OFL and bundled locally.
- **Performance:** HUD elements over the canvas avoid costly effects (e.g. `backdrop-filter`) unless the benchmark scene (§11) shows no regression.
- **Previews:** the player-view preview and the next-scene preview are floating HUD panels (layer 20) in the DM window. The player-view preview can additionally open as a separate window on an additional DM monitor; that window gets exactly what the TV gets (`PlayerViewMessage`, same permissions and fail-closed rules as the player window, §8) and shows no controls.
- **Screenshot tests** of the DM window (zone layout) run in the pinned Docker image like the renderer goldens (§12), because the window contains the PixiJS canvas.
- **Companion** reuses tokens and primitives with a single-column touch layout. There is no mobile app (ADR-0013), so no platform-neutral token source is needed.
