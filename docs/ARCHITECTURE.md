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
- **Session log** is derived from `DomainEvent`s. Events that leave the host (the log shown to players, any broadcast) first go through `projectEvents(events, stateAfter, viewer)` in `core` (T-117), once per `apply` result – never for older events against a later state, which would leak what was hidden at the time; a log keeps the projected events. An event passes only when its subject shows in `projectForViewer(stateAfter, viewer)` and with no more detail (HP exact or coarse as projected, moves without their origin); visibility changes and removed combatants never pass. The output is checked against the strict `viewerEventSchema`.
- **Visibility filtering** (`projectForViewer(state, viewer)`) is a pure function in `core`. The player window and every companion only ever receive the projected state – hidden data never leaves the desktop. It builds its output from an explicit allow-list with strict viewer schemas – never by parsing with the (loose, unknown-field-preserving) file schemas from `packages/schema` or by spreading state objects. Asset references in a projection are capabilities: a companion must never receive a reference that lets it fetch an un-fogged map or a level that has not been revealed (T-118a: only the table view gets them; companions get fog-composited images, T-118b).

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
│   ├── sessions/             # one JSON file per session: name, date, ordered scene ids (T-160)
│   ├── notes/                # campaign.md, sessions/<id>.md, scenes/<id>.md – fixed notes (T-161)
│   ├── scenes/               # one JSON file per scene
│   ├── encounters/
│   ├── snapshots/            # ZIP per session
│   └── .trash/               # 30-day trash
└── (no device settings here)
```

Device-specific settings (light devices, cameras, TV calibration, window placement, recently edited campaigns) live in the OS app-data directory, **not** in the sync folder.

Sub-scenes (T-152): a scene file may name its parent scene in an optional `parentSceneId` (DM decision, 2026-11-19): additive, so no version bump and no migration – older readers keep the field, older scenes simply have none. A sub-scene is its own scene (own map, fog and tokens), nesting to any depth. A parent that is missing (deleted, not synced yet) makes the scene a top-level scene, and so does a loop written by hand (also a scene naming itself) for the scenes in the loop, so none disappears. Deleting a scene with sub-scenes asks: keep them (preselected; they move up to the deleted scene's parent) or move them into the trash too.

Levels on the TV (T-118a): a scene file may carry an optional `table: { levelId, shownLevelIds }` (DM decision, 2026-11-19; additive like `parentSceneId`): the level the TV shows and every level shown there so far. A level once shown stays released for players; ids of levels the map no longer has are ignored, and without `table` the TV shows the map's first level. The DM switches it with the `level.show` command (undoable; showing the level already on the TV changes nothing and adds no undo step, and the level shown before stays released). In the DM window the level the DM works on and the TV's level are separate (T-118c, DM decision): a "Ebene" group in the Szene tab – only for maps with more than one level – picks the working level (fog tools, its own image or video by file type) and shows it on the TV; the browser marks the TV's level and the released ones. `projectForViewer` lists only released levels with their fog and tokens (not even an own token shows on an unreleased level, its level id would give the level away – nor, therefore, its combatant in the initiative) and gives asset references only to the host-rendered table view; companions get fog-composited images instead (T-118b).

Notes (T-161): every campaign, session and scene has a fixed Markdown note in `notes/`, created on demand with the title as a heading and never overwritten. Any other `.md` inside the campaign folder can be linked through an optional `notes` list (paths relative to the campaign folder, validated: inside the folder, `.md`, no tool folders) in `campaign.json`, a session or a scene file. The app reads notes as they are, so their front matter and links survive (ADR-0006).

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
- Note images (T-163) do not use `dmlib`: the DM window reads them with `library_read_image`, a command only its capability grants (PNG/JPEG/WebP/GIF by content, at most 20 MB, path confined like every library command) and shows them as blob URLs. The CSP's `img-src` also allows `https:`, for external images in notes that load only after the DM clicks "Bild laden" (no referrer). Tauri has one CSP for both windows, so the player window could load https images too; it renders no notes and no untrusted markup.
- Fog is an opaque layer with the revealed polygons as an inverse stencil mask (each polygon filled on its own), so nested and touching areas render correctly; the player view draws it opaque, the DM view see-through. **Soft edges (T-136a)**, on by default and switched per device in the settings: once per fog change (never per frame), the revealed polygons are rasterized into a mask of at most 1024 texels per side, shrunk by half the edge width plus one texel and box-blurred by half the edge width (`soft-mask.ts`, pure), then stretched over the map with linear filtering. The edge is 0.25 grid cells wide, from the hard edge inwards, so a revealed one-cell corridor stays open in its middle. An unchanged fog request (same polygons, options and map size) keeps the built fog. A discarded fog layer is freed completely (`disposeFog`, T-165): its graphics with their contexts, and the textures its sprites and meshes own – never the shared `Texture.WHITE`. The player view keeps the exact hard fog underneath, so the soft layer only darkens and the result never shows more than the hard polygons (fail-closed, pixel-tested); the see-through DM view uses the soft layer alone. Fog set before the map stays hard until the map's size is known. The player window reads the setting from the shared webview storage and follows the DM window's changes through the `storage` event; should a webview not deliver it across windows, the player window still picks the setting up on its next start. The see-through DM view tints only the map area (nothing else is drawn there). **Fades (T-136b):** a fog change within the same map fades over the duration set per device (0–3 s, default 0.65 s, ease-out; 0 switches at once), hiding too (DM decision). During a fade the exact hard fog covers everything fogged in all of the fade's states (its open area is the union of their revealed areas), and over the map a small shader blends the masks before and after texel by texel – linearly, so a pixel fogged before and after never shows the map (pixel-tested); two see-through layers on top of each other would let it shimmer through. **The change spreads (T-167, replacing the uniform cross-fade – DM decision):** once per change, `fog-spread.ts` (pure) gives each changed texel the moment it turns over, on a grid of at most 256 texels per side (about 5 ms; the order only sets the timing, the linear mix keeps the fog safe): connected texels changing the same way spread on their own over the whole duration – a reveal from the revealed area it touches, else from its middle outward; a hide from the fog it touches, else from its edge inward – with chamfer distances inside the change, so a spread follows corridors around corners; the map's border counts as an edge (a change of the whole map clears from its middle or hides from the border), and a change without length (one texel, a one-texel line) turns over at once. Unchanged texels next to a change carry its order, so the linearly filtered order texture does not pull the change's edge ahead of its front. The shader mixes each texel while a soft front (a fifth of the spread) passes it; `spreadMix` does the same on the CPU with nearest sampling of the order (used only to restart from what is on screen, where small differences at edges are harmless). A change during a fade starts from what is on screen so far. The exact fog that takes over at the end is built when the fade starts, so its last frame costs nothing extra. Only a fade draws every frame; the first fog, a new map (also one of the same size) and a new scene never fade, and the fade duration is not part of what counts as an unchanged fog. Without soft edges a fade blends texel-sized hard masks, so edges look slightly soft while it runs; in the DM view it tints only the map area during the fade. Fog edits run through `core` (`execute` with undo history) in a scene session in the DM window, which saves each change to the scene file and sends the TV the new projection synchronously.
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

_Decided in ADR-0011, ADR-0014 (docked zones), ADR-0015 (themes) and ADR-0016 (sizes in rem, Proposed); binding details in `.claude/skills/ui-design/SKILL.md`._

- **DM window zones (ADR-0014):** a full-width title bar; below it the data panel (catalogue) as a full-height left column that folds away with Cmd/Ctrl+B; the ribbon grouped by workflow mode right of it; the map canvas fills exactly the remaining area, so fit, zoom and centring need no insets. Floating over the map: the scene browser (top left of the map area), the navigation/display dock (bottom centre), notices, context menus and popovers. Features are placed in a zone; nothing else resizes the canvas, and the renderer follows the canvas size when the panel folds or the window resizes.
- **Player window:** unchanged – chrome-free fullscreen, no design-system UI.
- **Implementation (T-130):** `DmShell` owns the zones and exposes them as slots; components keep their state where it lives (e.g. the open scene in the data panel) and render their parts into a zone with `ShellPortal` (React portal). Outside a shell they render in place, so component tests need no shell. The title bar shows a save status (scenes save on every change), undo/redo and the open scene's tab; the ribbon modes are Szene, Nebel and Anzeige.
- **Fog ribbon and dock (T-131):** the Nebel tab holds the fog tools as ribbon groups – Werkzeug (Verschieben, Aufdecken, Verdecken), Form (Rechteck, Kreis, Polygon, Pinsel with its size) and Ganze Karte (Alles aufdecken/verdecken) – as toggle buttons with the active one highlighted; the drawing tool's instructions show above the dock while it is active. Rectangles have slightly rounded corners (a quarter grid cell, `roundedRectArea` in `core`), and the brush shows its outline at the pointer at the size it paints (T-170). The ribbon has one height in every tab and workspace (fixed tab row and panel, tools never wrap; a narrow window scrolls the panel sideways), so the map never moves. The dock (bottom centre over the map, a `dock` slot) holds the DM view's zoom out/fit/zoom in/rotate (keys −, 0, +, r; Shift+R turns back) and, with a player feed, the TV rotation and the player-view status; notices stack right above it. Popovers and menus open fixed under their anchor (kept inside the window and following it on scrolling), so the ribbon's scrolling panel never clips them; they are clamped again when they grow or shrink (`ResizeObserver`) and when the window is resized (T-166).
- **Workspaces (T-156):** a selector at the ribbon's left end ("ARBEITSBEREICH" over a `Menu`; the open menu is named "Arbeitsbereich" and marks the current workspace as a checked radio item, T-164) switches between Map Forge (maps), Asset Studio (assets), Campaign Atlas (the current campaign) and Game Mode (running a session); each has its own ribbon tabs. Game Mode has the modes above; the others show a hint until their own tasks fill them. Game Mode's ribbon panels stay mounted while another workspace is shown, so the tools in them keep their state. The workspace last used is kept per device (`dm.workspace`), Game Mode on first start.
- **Controls (T-130b):** ribbon tools sit in `RibbonGroup`s (large icon over a short label, caption below; a caption with ▾ is a `Menu` of less frequent commands). Short follow-up steps (confirm delete, map change) open in a `Popover` under their group instead of growing the ribbon. Plain buttons, fields and selects inside `.dm-ui` get their base look from `components.css` with zero specificity (`:where()`), so component classes always win.
- **Browser and data panel (T-130c):** the scene browser shows one campaign – switched or created from its header menu – as a tree of its scenes, with the open scene's content (map, levels, fog) below it; clicking a scene opens it. New scenes come from the ribbon ("Neu") or the tree's context menu (right-click, Shift+F10, context-menu key) and open in a popover; a new scene opens right away. The data panel is the library's map and asset catalogue (filled by T-124); the library folder is chosen in the settings dialog. `DmShell` has no content props: everything, including the data panel and the settings, renders into its slots.
- **Browser (T-158):** a `HudPanel` tool window over the map: a header bar (drag grip, "BROWSER", campaign switch, fold) over a transparent body whose rows sit on translucent chips (`--dm-hud-*`, readable over light and dark maps). The tree (compact variant: chevrons, no guides) starts with the campaign, then Kampagneneinstellungen, Szenen (the open scene with its content), Karten (used by its scenes), Spieler & Charaktere, Handouts & Hinweise and Notizen; empty groups say so. It is dragged by its grip or moved with the arrow keys on it, stays inside the map area, and its placement and fold state are kept per device (`dm.hud.*` in the webview's storage); "Positionen zurücksetzen" in the settings restores the defaults.
- **Details panel (T-159):** a second `HudPanel` ("Eigenschaften") on the right of the map area with a solid body; it shows the facts of what is selected in the browser (campaign and its settings, a scene, a map with the scenes using it, a player). Selecting a scene also opens it; selecting anything else leaves the open scene as it is. It folds and moves like the browser and has its own placement per device. Read-only for now.
- **Settings dialog (T-155):** the gear, Cmd/Ctrl+, and the app menu (T-130d) open one modal dialog (`Dialog` in `@dungeon-manager/ui`, layer 50) with categories as vertical tabs on the left and their settings on the right: Darstellung (theme, interface size), Nebel & Animation (soft edges, fade duration), Bibliothek (library folder) and Werkzeugfenster (reset positions). Focus stays inside it, Escape closes it and focus returns to the gear. Categories come from one list in `DmShell`, so a new one (e.g. Spieleransicht) is one entry; components outside the shell add their settings through the `settings` slot.
- **App menu (T-130d):** the app's commands outside any panel – Neue Kampagne …, Willkommen … and Einstellungen … – come from the native menu bar on macOS (built in the DM window with Tauri's menu API from translated labels; it keeps the system items: edit commands for text fields, window commands, quit) and from a "Menü" button in the title bar elsewhere (Windows, Linux, the E2E harness). Both run the same commands through a small registry (`app-commands.ts`): the part of the window that owns the state registers the handler (the shell the settings, the library panel the new campaign and the welcome dialog). The native menu bar also works while a dialog is open, so every command first closes the open dialogs (welcome, settings) and then opens its own – never two modals at once. The DM window's capability already grants the menu API (`core:default`). Context menus and popovers opened at a point are moved back inside the window before they paint.
- **Welcome dialog (T-153):** every start opens a modal welcome dialog (the same `Dialog`) before the window. Its main area lists the campaigns recently edited on this device, most recent first, each with its last scene and date; a side column holds "Neue Kampagne", "Andere Kampagne öffnen …" and the library folder. Choosing a campaign opens it with its last scene. A campaign that is gone or cannot be read stays in the list, marked, and can be removed from it. On the very first start (no library folder yet) it explains the library and asks for the folder; in a library without campaigns it asks for the first one's name. Escape closes it into the empty window. The list (`dm.recentCampaigns`, at most 8 entries, per library folder) lives in the webview's storage like the theme, not in the library.
- **Sub-scenes in the browser (T-152):** a sub-scene shows under its parent wherever the parent shows (each session, "Ohne Session"); a sub-scene listed in a session without its parent also shows at the top of that session; "Ohne Session" lists only top-level scenes. Right-clicking a scene offers "Neue Unterszene …" (the new-scene popover; the new scene opens under its parent). The rules are pure (`scene-hierarchy.ts`).
- **Sessions in the browser (T-160b):** Sessions lists each session (by date, then name) with its scenes in their order, a scene in several sessions under each, missing scenes as "(fehlt)" and scenes in no session under "Ohne Session"; the open scene shows its content under the place it was opened from. Commands come from the ribbon ("Neu": Neue Szene, Neue Session) and the tree's context menu (new scene in a session, edit/delete a session, move a scene up/down, remove it from or add it to a session), each in a small popover; reordering is keyboard-reachable through the context menu. The tree ids encode the place (`scene:<session>/<scene>`), the tree, details and session changes are pure modules (`campaign-tree.tsx`, `details.ts`, `session-ops.ts`).
- **Notes in the browser (T-161b):** Notizen lists the campaign note and the notes linked from campaign.json, then the session and scene notes (each with its own note and its links). "Notiz öffnen" on the campaign, a session or a scene starts the fixed note if needed and shows it; "Notiz verknüpfen …" links an existing `.md` of the campaign folder; a linked note can be unlinked (the file stays). The details panel shows a note's text as it is (Markdown source, front matter included) and re-reads it when the file changes, e.g. from Obsidian on another device. Links of an open scene wait until it is closed, because the open scene saves its whole state on every change.
- **Notes as Markdown (T-163):** `NoteView` renders a note with `react-markdown` + `remark-gfm` (DM-approved dependencies) and an own remark plugin for Obsidian's `[[links]]`, `![[embeds]]` and callouts; front matter shows as a properties table. Raw HTML in notes is never rendered (`skipHtml`), urls are filtered (`urlTransform`: note links, embeds, relative paths, https only), and links never navigate the window: note links open the note in the details panel, external links only show their address. Images: local ones (relative to the note, or found by name in the campaign folder) come through `library_read_image` – a DM-window-only command that returns image bytes (PNG/JPEG/WebP/GIF by content, ≤ 20 MB) – as blob URLs; `dmlib` still never serves `campaigns/`. External `https` images load only after a click (CSP `img-src … blob: https:`, no referrer).
- **Appearance setting:** follow the OS / light (parchment) / dark (workshop, the default; ADR-0015); stored per device in the webview's storage (OS app-data, not the sync folder) and applied when the window starts, before React renders.
- **Tokens:** CSS custom properties (`--dm-surface-*`, `--dm-border-*`, `--dm-text-*`, `--dm-accent-*`, `--dm-space-*`, `--dm-font-*`, `--dm-z-*`) are defined once in `packages/ui`; apps consume them and never hard-code colours, spacing, fonts or z-indices. The values are data in `packages/ui/src/tokens.ts` (tested for WCAG AA); `packages/ui/styles/tokens.css` is generated from it (`pnpm --filter @dungeon-manager/ui gen:tokens`, a test keeps both in sync). Workshop (dark) is the default; parchment applies when `data-dm-theme="parchment"` is set on the root element, or with `data-dm-theme="system"` while the OS prefers a light scheme (`prefers-color-scheme`); the DM switches it in the appearance setting. `findHardCodedValues` checks app stylesheets.
- **Layering (`--dm-z-*`):** 0 map canvas/video · 10 canvas overlays · 20 floating HUD · 30 ribbon (docked, ADR-0014; the data panel column needs no layer) · 40 context menus/popovers · 50 modals.
- **Themes (ADR-0015):** a dark "workshop" theme (slate surfaces, one gold accent; the default, for a dim room) and a reduced light "parchment" theme; WCAG AA contrast in both. Professional, restrained styling as in a CAD tool: one type family (monospace only for file names and values), small uppercase captions, thin lines instead of boxes and shadows, small radii, one accent for active/selected only, one line-icon set, no illustrative decoration. Fonts and icons are self-made, CC0 or OFL and bundled locally.
- **Density and interface size (T-162):** the DM window is compact by default. All sizes are rem of one base size (`--dm-ui-base-size`, 14px) times the DM's interface size (`--dm-ui-scale`: 90/100/110/125 %, per device, applied before React renders); hairlines and radii stay in px. The spacing grid is therefore 4/8 in quarter rems (3.5/7 px at the compact base, ADR-0016 instead of ADR-0011's literal 4/8 px), and `font-size-xs` never drops below 10px. The map canvas only measures its box, so the interface size never scales the map.
- **Performance:** HUD elements over the canvas avoid costly effects (e.g. `backdrop-filter`) unless the benchmark scene (§11) shows no regression.
- **Previews:** the player-view preview and the next-scene preview are floating HUD panels (layer 20) in the DM window. The player-view preview can additionally open as a separate window on an additional DM monitor; that window gets exactly what the TV gets (`PlayerViewMessage`, same permissions and fail-closed rules as the player window, §8) and shows no controls.
- **Screenshot tests** of the DM window (zone layout) run in the pinned Docker image like the renderer goldens (§12), because the window contains the PixiJS canvas.
- **Companion** reuses tokens and primitives with a single-column touch layout. There is no mobile app (ADR-0013), so no platform-neutral token source is needed.
