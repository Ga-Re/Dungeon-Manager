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
               │ DM phone app (Expo)  [stage 2+] │            │ Cloud client      │
               │ Player companion (browser)[st.3]│            │ (Dropbox, iCloud…)│
               └─────────────────────────────────┘            └────────┬──────────┘
                                                                       │ sync
                                                         DM phone app (offline planning)
```

Two independent channels:
- **Live channel (LAN WebSocket):** only during a session. Desktop is the single source of truth.
- **Data channel (sync folder):** files on disk, synced by a third-party cloud client. Used for planning on the go.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) everywhere except the desktop backend (Rust) |
| Monorepo | pnpm workspaces + Turborepo |
| Desktop shell | Tauri 2 |
| Desktop / companion UI | React |
| Rendering | PixiJS (WebGL/WebGPU) |
| Mobile | React Native via Expo (dev builds, not Expo Go, because of native modules) |
| Mobile map view | React Native Skia |
| Rich text | WYSIWYG Markdown editor (TipTap-based; on mobile inside a WebView) |
| Schemas & validation | zod (shared between all apps; also generates JSON Schema for Rust-side checks if needed) |
| UI strings | i18next; `de` first, `en` second |
| Backend (Rust) | tokio, axum (HTTP + WebSocket), notify (file watching), serde, image (previews) |
| Unit / component tests | Vitest + React Testing Library; Rust: `cargo test` |
| E2E | Playwright (web build of desktop UI with mocked Tauri IPC, and companion); WebdriverIO + tauri-driver smoke tests on the real app; Maestro for mobile |
| Visual regression | Playwright screenshots of renderer fixtures |
| Lint / format | ESLint, Prettier, `rustfmt`, `clippy` |
| Architecture checks | dependency-cruiser |

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
│   ├── mobile/                # Expo app (DM phone)
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

| Package | May depend on | Must NOT depend on |
|---|---|---|
| `core` | `schema` | React, PixiJS, Tauri, Expo, Node/Browser APIs, any I/O |
| `schema` | zod | everything else |
| `protocol` | `core`, `schema` | UI, renderer, I/O |
| `storage` | `core`, `schema` | UI, renderer; real FS (uses an injected adapter) |
| `renderer` | `core`, `schema`, PixiJS | React, Tauri, storage |
| `ui` | `core`, `schema`, `i18n`, React | Tauri, Expo, renderer internals |
| `apps/*` | any package | other apps |

Rules:
- `core` is **pure**: deterministic functions, no clocks, no randomness without an injected source, no I/O.
- Platform-specific code lives only in `apps/*` behind adapters (FS, network, clock, RNG, lights, camera).
- `apps/mobile` must not import `renderer` or `ui` (web-only); it uses `core`, `schema`, `storage`, `protocol`, `i18n`.

---

## 5. Domain model & state

### 5.1 Command → state → events
All state changes go through **commands** handled by a pure reducer in `core`:

```ts
apply(state: SessionState, command: Command, ctx: Ctx): { state: SessionState; events: DomainEvent[] }
```

- `Ctx` provides injected time and RNG (deterministic tests).
- **Permissions** are checked in `core` (`canApply(actor, command, state)`): DM, DM phone, player companion (per-player rights).
- **Undo:** the desktop keeps a command history with inverse snapshots per scene.
- **Session log** is derived from `DomainEvent`s.
- **Visibility filtering** (`projectForViewer(state, viewer)`) is a pure function in `core`. The player window and every companion only ever receive the projected state – hidden data never leaves the desktop.

### 5.2 Key entities (initial)
`Campaign`, `Scene`, `Map` (image/video, grid, levels), `Token`, `FogState` (revealed regions per level, memory fog), `InitiativeState`, `Combatant` (HP, temp HP, conditions), `VisibilityRule`, `Player`, `Handout`, `SoundPreset`, `LightPreset`, `WikiEntry`.

Coordinates: grid cells (integer `col,row`) for game logic; map pixels for rendering. Conversion lives in `core`.

---

## 6. Storage

### 6.1 Principle
All data lives in a **user-chosen folder**. If it sits inside a cloud-synced folder, the cloud client does the syncing. The app never calls cloud APIs.

### 6.2 Folder layout
```
<library root>/
├── library/                  # global asset library (all campaigns)
│   ├── maps/  tokens/  assets/  sounds/  effects/
│   └── .previews/            # generated by desktop for the phone
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
- Changing the folder layout or a file format is a **breaking change** → requires DM approval and a migration (see CLAUDE.md).

### 6.4 Notes
Markdown with YAML front matter (`type`, `status`, `tags`, …) and `[[wiki links]]`; must remain readable and editable in Obsidian.

### 6.5 Previews for the phone
Desktop generates downscaled images (and a still frame for video maps) into `library/.previews/`. The phone reads previews only; originals stay on the notebook.

### 6.6 Backups
- Snapshot ZIP per session end (campaign data only; assets are referenced, not included)
- Trash with 30-day retention
- Export: self-contained archive including used assets

---

## 7. LAN networking

- Desktop backend runs HTTP + WebSocket bound to the local network interface only.
- HTTP serves the built `apps/companion` bundle.
- **Pairing:** QR code contains `http://<lan-ip>:<port>/?t=<one-time token>`. The token is exchanged for a session credential; tokens expire and can be revoked by the DM.
- Roles: `dm` (desktop), `dm-remote` (phone), `player:<id>` (companion).
- Messages are defined and validated in `protocol` (zod). Every message has a `v` (protocol version). Clients send **commands**; the host validates permissions, applies them, and broadcasts **projected state patches** per viewer.
- Clients are disposable: on reconnect they receive a full projected snapshot.

---

## 8. Rendering (PixiJS)

Layer order (bottom → top): map (image/video) → grid → assets → light/vision → tokens → effects → fog → DM overlays (DM window only) → UI pings.

- The **same renderer** draws the DM window and the player window, with different viewer projections and overlays.
- The player window is a separate Tauri window placed fullscreen on the chosen display.
- Grid calibration: `pixelsPerInch` of the target display → cell size of 1 inch.
- Video maps: HTML video element as texture; preload next scene.
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

| Metric | Budget |
|---|---|
| Player view frame rate, 4K video map + fog + 20 tokens | ≥ 60 FPS (p95 frame time ≤ 16.7 ms) |
| Scene switch with preloading | ≤ 1 s to first frame |
| Command from phone/companion → visible on TV (LAN) | ≤ 100 ms |
| Light effect trigger → lamp reacts (HA/WLED/Hue Ent.) | ≤ 150 ms |
| Desktop cold start | ≤ 3 s |

A benchmark scene in `test-fixtures` plus a script that records frame times is part of stage 0.

---

## 12. Testing strategy

| Layer | Tool | Required for |
|---|---|---|
| Unit | Vitest / `cargo test` | all logic in `core`, `schema`, `storage`, `protocol`; Rust drivers with fakes |
| Component | Vitest + React Testing Library | every non-trivial React component |
| E2E | Playwright (desktop web build + companion), tauri-driver smoke, Maestro (mobile) | every user-facing flow in the task's acceptance criteria |
| Visual | Playwright screenshots of renderer fixtures | every renderer change |

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
- iOS: builds need a Mac and an Apple Developer account; persistent folder access needs a small native module (security-scoped bookmarks).
- Android: folder access via Storage Access Framework; most cloud apps don't keep folders in sync → in-app guide recommends a sync app.
