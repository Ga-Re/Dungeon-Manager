# TASKS

Single source of truth for work. The agent picks the first `todo` task whose dependencies are `done` (see CLAUDE.md).

**Statuses:** `todo` · `in-progress` · `review` (PR open) · `done` (merged) · `blocked` (reason in Notes)

**Format per task:** ID, title, status, depends on, spec/ADR references, description, acceptance criteria, notes.
New tasks discovered during work are appended to the right stage with status `todo` and a note on where they came from.

---

## Stage 0 – Foundation

### T-001 Monorepo scaffold

- **Status:** done · **Depends on:** – · **Refs:** ARCHITECTURE §3, ADR-0004
- Create pnpm workspace + Turborepo with the layout from ARCHITECTURE §3 (empty packages with `package.json`, `tsconfig`, `src/index.ts`).
- **Acceptance criteria**
  - [x] `pnpm install` and `pnpm build` succeed on a clean clone
  - [x] Shared `tsconfig` base with `strict: true` in `tooling/`
  - [x] README with setup steps (Node, pnpm, Rust versions pinned via `.nvmrc`/`rust-toolchain.toml`)
- **Notes:** Asks before adding Turborepo/pnpm only if versions deviate from current stable.

### T-002 Lint, format and boundary checks

- **Status:** done · **Depends on:** T-001 · **Refs:** ARCHITECTURE §4, ADR-0009
- ESLint (TS strict rules, no `any`), Prettier, dependency-cruiser with the boundary table from ARCHITECTURE §4; `pnpm check` script.
- **Acceptance criteria**
  - [x] `pnpm check` runs typecheck, lint, format check, dependency-cruiser
  - [x] A deliberate boundary violation (e.g. `core` importing `react`) fails `pnpm check` (proven by a test fixture or documented manual check)
- **Notes:** From T-001 review: package `exports` point at `dist/`, so typecheck of dependents needs `dependsOn: ["^build"]` in Turbo (or a source export condition). `moduleResolution: Bundler` allows extensionless imports – fine for Vite/Vitest, not for running `dist/` directly with Node.

### T-003 Test infrastructure

- **Status:** done · **Depends on:** T-002 · **Refs:** ARCHITECTURE §12, ADR-0009
- Vitest workspace with coverage thresholds (≥ 80 % for `core`, `schema`, `storage`, `protocol`), React Testing Library, Playwright config, screenshot test setup in a pinned Docker image.
- **Acceptance criteria**
  - [x] `pnpm check` includes unit/component tests with coverage gates
  - [x] `pnpm test:e2e` and `pnpm test:visual` run a sample test each
  - [x] Coverage below threshold fails the check
  - [x] `packages/test-fixtures/SOURCES.md` lists the origin and license of every fixture (self-made or CC0 only – public repo)

### T-004 CI on GitHub Actions

- **Status:** done · **Depends on:** T-003
- Workflow on every PR: install, `pnpm check`, Rust fmt/clippy/test, E2E, visual tests. Cache pnpm and cargo.
- Public repo: use `pull_request` (not `pull_request_target`) so fork PRs never get secrets; minimal `permissions:` per workflow.
- **Acceptance criteria**
  - [ ] PRs show required status checks; failing checks block merge (document the branch-protection settings the DM must enable)
- **Notes:** From T-003: `pnpm test:visual` needs Docker on the runner (ubuntu runners have it). E2E needs `pnpm exec playwright install --with-deps chromium`. DM decision: document enabling GitHub auto-merge so PRs merge once required checks pass.

### T-005 Claude Code GitHub integration

- **Status:** done · **Depends on:** T-004
- Set up the Claude GitHub app/workflow so `@claude` in PR comments triggers the agent to address review feedback.
- **Acceptance criteria**
  - [x] Workflow file committed; setup steps for the DM (installing the app, adding the API key secret) documented in README
  - [x] The workflow only runs for comments by the repository owner (check `author_association` / actor), never for other users or forks – the repo is public
  - [x] The API key secret is never available to workflows triggered from forks
- **Notes:** Verify current setup steps and the action's access-control options in the official Claude Code docs before implementing. DM decision after merge: the `@claude` workflow is not needed and was removed again (the agent merges its own PRs once CI is green instead, see CLAUDE.md).

### T-006 Desktop app skeleton with two windows

- **Status:** done · **Depends on:** T-001 · **Refs:** ADR-0002, SPEC 2.1–2.2
- Tauri 2 + React app in `apps/desktop`; DM window and a player window that can be moved fullscreen to a chosen display.
- **Acceptance criteria**
  - [x] `pnpm dev:desktop` opens the DM window; a button opens the player window on a selectable display in fullscreen
  - [x] i18next set up (`de` default, `en`), no hard-coded strings
  - [x] Tauri-driver smoke test starts the app and finds both windows
- **Notes:** From T-002: root-level `.ts` configs (e.g. `vite.config.ts`) are outside every tsconfig `include`, so type-aware ESLint rejects them – add them to a tsconfig or to `projectService.allowDefaultProject` in `tooling/eslint/config.js`. From T-003 (DM decision): add React Testing Library, jsdom and React here, with the first component; configure a jsdom Vitest environment for `*.test.tsx`. From T-004: the CI `rust` job starts running fmt/clippy/test once `apps/desktop/src-tauri/Cargo.toml` exists; on Linux it then needs the Tauri system libraries (`libwebkit2gtk-4.1-dev` etc.) installed via apt in that job. Verified manually by the DM on a MacBook Air M5 with a 4K TV: player view fullscreen on the chosen display, switching between TV and laptop, app quits with the DM window.

### T-007 Performance spike: video map + fog in the player window

- **Status:** done · **Depends on:** T-006 · **Refs:** ARCHITECTURE §8, §11
- Throwaway-quality spike (clearly marked) rendering a 4K MP4 map + a fog mask + 20 sprites in PixiJS in the player window; script that records frame times.
- **Acceptance criteria**
  - [x] Frame-time report from the DM's reference notebook (p50/p95) committed to `docs/benchmarks/`
  - [x] Written conclusion: budget met or not; if not, structured proposal (see CLAUDE.md)
- **Notes:** This validates ADR-0002. Results may trigger a new ADR. Result (DM's MacBook Air M5, 4K TV at 60 Hz): 4K video as a texture misses the budget; an HTML video element under a transparent PixiJS canvas reaches 59.8 FPS (1.25 % missed refreshes in the worst-case scene) → ADR-0010, ARCHITECTURE §8/§11 updated. Reports in `docs/benchmarks/`.

### T-009 Companion skeleton

- **Status:** done · **Depends on:** T-001 · **Refs:** ADR-0007
- React web app in `apps/companion`, built as static files.
- **Acceptance criteria**
  - [x] `pnpm dev:companion` serves a placeholder page; production build outputs static files consumable by the desktop backend later
- **Notes:** From T-002: root-level `.ts` configs (e.g. `vite.config.ts`) are outside every tsconfig `include`, so type-aware ESLint rejects them – add them to a tsconfig or to `projectService.allowDefaultProject` in `tooling/eslint/config.js`. For the backend task that serves the companion: the build uses relative asset URLs (`base: "./"`), so mount it at a path with a trailing slash (redirect `/companion` → `/companion/`) or at the root; a future client-side router with deep links needs the same care.

### T-010 Upgrade to TypeScript 7

- **Status:** blocked · **Depends on:** T-002
- T-001 pinned TypeScript 6.0.3 because typescript-eslint did not support TypeScript 7 yet (peer range `<6.1.0` as of 2026-11-16). Upgrade once typescript-eslint supports TS 7.
- **Acceptance criteria**
  - [ ] `typescript` bumped to the current 7.x; `pnpm check` green
- **Notes:** Discovered during T-001. Still blocked on 2026-11-18: typescript-eslint 8.73.0 supports `typescript >=4.8.4 <6.1.0`, while TypeScript 7.0.2 is current.

### T-011 Shared i18n setup for web apps

- **Status:** done · **Depends on:** T-009
- `createI18n` exists twice (`apps/desktop/src/i18n.ts`, `apps/companion/src/i18n.ts`). Move it to a shared place (e.g. `packages/ui` once it has its first component) and use it from both apps.
- **Acceptance criteria**
  - [x] One implementation, used by desktop and companion; tests unchanged and green
- **Notes:** Discovered during T-009; kept duplicated there to avoid a drive-by refactor.

### T-149 Remove the mobile app placeholder

- **Status:** done · **Depends on:** – · **Refs:** ADR-0013, ARCHITECTURE §3
- Delete `apps/mobile` and every reference to it (workspace, Turbo, dependency-cruiser, CI, scripts); remove the obsolete tasks T-008 and T-132.
- **Acceptance criteria**
  - [x] `pnpm install`, `pnpm check` and CI pass without `apps/mobile`
  - [x] No remaining references to Expo/React Native in configs or docs except ADR history
- **Notes:** From the DM decision (2026-11-18). Folder layout change approved with ADR-0013 (DM, 2026-11-18). Expo stays in the dependency-cruiser deny lists for `core` and `ui` (and in ARCHITECTURE §4): removing it would loosen a boundary rule; only the mobile-specific rule and its fixtures were removed.

---

## Stage 1 – MVP: map, fog, tokens (desktop)

### T-101 Schema v1 and migrations framework

- **Status:** done · **Depends on:** T-003 · **Refs:** ARCHITECTURE §5–6, ADR-0005
- zod schemas with `schemaVersion` for `Campaign`, `Scene`, `Map`, `Token`, `FogState`, `InitiativeState`, `Combatant`, `VisibilityRule`, `Player`; migration runner.
- **Acceptance criteria**
  - [x] Round-trip tests (parse → serialize → parse) for every entity
  - [x] Migration runner tested with a fake v0 → v1 migration
  - [x] Unknown fields are preserved on round-trip
- **Notes:** From T-003 review: workspace packages export `dist/`, so a test importing another package runs against its last build (fine inside `pnpm check`, which builds first; stale in a standalone `pnpm test`). Consider a Vitest alias/source condition pointing workspace imports at `src/`.

### T-102a Core: session state, commands, undo/redo

- **Status:** done · **Depends on:** T-101 · **Refs:** ARCHITECTURE §5
- `apply(state, command, ctx)` with injected time/RNG; commands for token move, fog reveal/hide (polygon boolean ops via `polyclip-ts`), visibility change, initiative and HP; undo/redo via snapshots.
- **Acceptance criteria**
  - [x] Commands for token move, fog reveal/hide, visibility change, initiative and HP changes
  - [x] Undo/redo tested
- **Notes:** Split from T-102 (DM decision, 2026-11-17). DM approved `polyclip-ts` (core) and `fast-check` (tests).

### T-102b Core: permissions and viewer projection

- **Status:** done · **Depends on:** T-102a · **Refs:** ARCHITECTURE §5
- `canApply(actor, command, state)` for DM, DM phone and player companions; `projectForViewer(state, viewer)` built from an explicit allow-list with strict viewer schemas.
- **Acceptance criteria**
  - [x] Projection never leaks hidden tokens, hidden HP numbers or unrevealed fog (property-based tests with `fast-check`)
  - [x] Permission checks tested for every command and actor
- **Notes:** Split from T-102 (DM decision, 2026-11-17). From T-102a review: (1) `DomainEvent`s carry hidden data (`hp.changed` exact HP, `token.moved` of hidden tokens) – the session log and any broadcast must be projected too, not just the state. (2) Tokens have no owning player yet; "players move their own token" (SPEC §2.4/§5) needs a schema addition (e.g. `ownerPlayerId`, schema v1 is unreleased) – ask the DM first. (3) Undo restores whole-state snapshots: before remote commands (companion, DM phone) go through `execute`, decide whether only local DM commands are recorded or whether to switch to per-command inverse patches, so undoing a DM action never reverts a later remote one. DM approved `ownerPlayerId` on tokens (2026-11-17). Not yet covered (stage 3, companion): DM locks per player and movement rules (range, fog) for player moves. DM decisions (2026-11-17): combatants without a token are hidden from the initiative until released, and combatants get optional per-element `visibility` overrides (combatant > token > campaign default); companion map/level leakage deferred to T-118.

### T-117 Project domain events for viewers

- **Status:** todo · **Depends on:** T-102b · **Refs:** ARCHITECTURE §5.1
- `DomainEvent`s carry hidden data (exact HP in `hp.changed`, moves of hidden tokens). Add a pure `projectEvents(events, stateAfter, viewer)` in `core` so the session log shown to players and any event broadcast never leak; property tests like the state projection.
- **Acceptance criteria**
  - [ ] No event reveals a token, HP number or name that `projectForViewer` hides (property-based tests)
- **Notes:** From the T-102a review; needed before events leave the host (companion, session log on the TV).

### T-118 Companion-safe map delivery and released levels

- **Status:** todo · **Depends on:** T-102b · **Refs:** ARCHITECTURE §5.1, SPEC §2.4, §3.1
- The projection currently sends the map asset reference and every level (id, name, asset), whatever has been revealed. Fine for the host-rendered TV; a companion could fetch the whole un-fogged map and read level names like "Geheimgang". Add a "current/released levels" concept to the scene and send companions only fog-composited (or tiled) images of released levels.
- **Acceptance criteria**
  - [ ] Companion projections contain no asset reference to un-fogged map files and no unreleased level
  - [ ] The table view shows the scene's current level
- **Notes:** From the T-102b review; must be done before companions show maps (stage 3).

### T-119 Case-insensitive id collisions in file names

- **Status:** todo · **Depends on:** T-103a · **Refs:** ARCHITECTURE §6, ADR-0005
- Ids allow mixed case (`idSchema`), and scenes are stored as `<id>.json`. On the default macOS/Windows file systems `Scene-1` and `scene-1` are the same file, so saving one overwrites the other.
- **Acceptance criteria**
  - [ ] Two entities whose ids differ only in case can never overwrite each other's files (e.g. lowercase ids, or collision check on save)
- **Notes:** From the T-103a review. Touches the id scheme in `schema` (v1 unreleased) – ask the DM which option before implementing.

### T-103a Storage package: layout, documents, conflict copies

- **Status:** done · **Depends on:** T-101 · **Refs:** ARCHITECTURE §6, ADR-0005
- `packages/storage` with an injected file-system adapter: library layout, reading/writing `campaign.json` and scene files (migrations + validation), conflict-copy detection, "not available" state for placeholders, classification of changed paths for the watcher.
- **Acceptance criteria**
  - [x] Layout is created if empty
  - [x] Conflict copies of Dropbox/OneDrive/Google Drive/iCloud naming patterns are detected (fixtures)
  - [x] Missing/placeholder files produce a "not available" state, no crash
- **Notes:** Split from T-103 (agent, 2026-11-17) to keep PRs reviewable; no new dependencies.

### T-103b Desktop file system adapter, watching, folder choice

- **Status:** done · **Depends on:** T-103a · **Refs:** ARCHITECTURE §6, ADR-0005
- Rust FS adapter in `apps/desktop/src-tauri` (paths confined to the library root, atomic writes via temp file + rename, placeholder detection), file watching with `notify`, folder picker, device settings in the OS app-data directory.
- **Acceptance criteria**
  - [x] DM chooses a library folder; layout is created if empty
  - [x] External file changes are picked up while the app runs
  - [x] Device settings stored in OS app-data, not in the library
- **Notes:** Split from T-103. DM approved the needed dependencies (`notify`, folder-picker plugin) on 2026-11-17. Security-relevant (file access from the webview): the DM confirms the Tauri capabilities before merge.

### T-104a Campaigns and scenes in the DM window

- **Status:** done · **Depends on:** T-103b · **Refs:** SPEC 12, 13.2
- Create a campaign (name → folder slug), select it, list its scenes, create an empty scene, open and close a scene.
- **Acceptance criteria**
  - [x] DM creates a campaign by name; its folder and `campaign.json` are created
  - [x] Scene list in DM window; create, open and close a scene
- **Notes:** Split from T-104 (agent, 2026-11-17). Campaign creation added to T-104 by DM decision (2026-11-17).

### T-104b Map import

- **Status:** done · **Depends on:** T-104a · **Refs:** SPEC 3.1, ARCHITECTURE §6.3
- Import PNG/JPG/WebP into the library (native file picker, copy in Rust, SHA-256 hash); create a scene referencing it.
- **Acceptance criteria**
  - [x] Imported file lands in `library/maps/`, referenced by relative path + hash
  - [x] A scene can be created with the imported map
- **Notes:** DM approved `sha2` (already a transitive dependency) for hashing, 2026-11-17.

### T-120 Change a scene's map, delete scenes to the trash

- **Status:** done · **Depends on:** T-104b · **Refs:** ARCHITECTURE §6.6
- The open scene can get a different map (levels, grid, fog and tokens are kept) and can be deleted after a confirmation; deleted files move to `campaigns/<slug>/.trash/`, never removed.
- **Acceptance criteria**
  - [x] DM changes the map of an existing scene and chooses what to reset (fog, grid, tokens)
  - [x] DM deletes a scene after confirming; the file lands in the campaign's `.trash/`
- **Notes:** Requested by the DM after testing T-104 (2026-11-17). DM decisions (2026-11-17): deleted things go to the trash first and can be restored (T-122); when a map changes, the DM is asked whether to reset fog, grid and tokens (nothing is reset by default). Maps stay in the global library when a scene is deleted. Security-relevant (new file operation for the DM window): DM confirms before merge.

### T-121 Map change: compare image sizes

- **Status:** todo · **Depends on:** T-120, T-105a · **Refs:** SPEC 3.1, 4
- When a scene's map is changed (T-120 asks what to reset), compare the old and new image dimensions. If they differ, say so in the question and pre-tick "reset fog" and "reset grid", since fog and token positions are stored in map pixels.
- **Acceptance criteria**
  - [ ] Changing to an image of different dimensions shows the difference and pre-ticks fog and grid reset
- **Notes:** From the T-120 review; needs image dimensions, available once the renderer loads maps. Pre-ticking is an exception to the DM's "nothing is reset by default" decision – DM confirms before implementing.

### T-122 Restore from the trash

- **Status:** todo · **Depends on:** T-120 · **Refs:** ARCHITECTURE §6.6
- Show a campaign's trash (what, when deleted) and restore an item to its original path. If that path is taken again, restore under a new name and say so – never overwrite.
- **Acceptance criteria**
  - [ ] DM sees deleted scenes of a campaign with their deletion time
  - [ ] DM restores a scene; it is back in the scene list
  - [ ] Restoring never overwrites an existing file
- **Notes:** DM decision (2026-11-17): things land in the trash first and can be restored. Needs a new file operation (security-relevant: DM confirms the capability).

### T-123 Purge the trash after 30 days

- **Status:** todo · **Depends on:** T-122 · **Refs:** ARCHITECTURE §6.6
- Remove trash entries older than 30 days (on app start, once a day), with an option to empty the trash by hand after confirming.
- **Acceptance criteria**
  - [ ] Entries older than 30 days are removed; newer ones stay
  - [ ] DM can empty a campaign's trash after confirming
- **Notes:** First operation that really deletes files – security-relevant, DM confirms before merge.

### T-124 Global map and asset catalog

- **Status:** todo · **Depends on:** T-104b · **Refs:** SPEC 8.2, ARCHITECTURE §6.2
- One catalog of everything in `library/` (maps now; tokens, assets, sounds later), shared by all campaigns. When creating a scene or changing its map, the DM picks from the catalog (with previews) or imports a new file into it. Deleting a scene never removes anything from the catalog.
- **Acceptance criteria**
  - [ ] Catalog lists all maps in the library with a preview, across campaigns
  - [ ] DM picks a map from the catalog for a new scene and when changing a scene's map
  - [ ] Deleting a scene leaves its map in the catalog
- **Notes:** DM request (2026-11-17). Previews go to `library/.previews/` as ARCHITECTURE §6.5 already plans (shared with the web app and handouts); maps picked but not used (e.g. a cancelled map change) simply stay in the catalog.

### T-125 Asset metadata: scale, name, origin

- **Status:** todo · **Depends on:** T-124, T-106, T-134 · **Refs:** SPEC 8.2, 3.1, ADR-0012
- Metadata per catalog item so it always fits the map scale: for maps the grid calibration (pixels per cell, offset; filled from T-106 and reused by every scene with that map), for assets and tokens their footprint in grid cells. Plus display name and origin/license (SPEC 8.2).
- **Acceptance criteria**
  - [ ] A map's calibration is stored once and pre-fills the grid of every new scene using it
  - [ ] Assets and tokens are placed at the size given by their metadata, matching the map scale
  - [ ] Name and origin/license can be edited per item
- **Notes:** DM request (2026-11-17). Stored in the item's sidecar `<file>.dm.json` (ADR-0012, T-134); grid calibration is not overridable per scene. Tokens keep their D&D size category (`token.size`) as the source of truth; the footprint in cells applies to assets only.

### T-126 Tags and search in the catalog

- **Status:** todo · **Depends on:** T-125 · **Refs:** SPEC 8.2
- Tags per catalog item (free text, suggestions from existing tags) and a search over name and tags, with type filters (map, token, asset).
- **Acceptance criteria**
  - [ ] DM adds and removes tags on a catalog item
  - [ ] Searching by text or tag finds matching items quickly (budget to be set in the task, e.g. < 100 ms for 10 000 items)
- **Notes:** DM request (2026-11-17). Stored with the T-125 metadata in the sidecar (ADR-0012). The search reads sidecars once and keeps an in-memory index; no central index file (ADR-0012 option 3). The < 100 ms budget is for queries on that index; set a separate budget for building it cold and show placeholders (not yet downloaded) as "pending".

### T-105a Renderer: image map and camera in the DM window

- **Status:** done · **Depends on:** T-104b, T-007 · **Refs:** ARCHITECTURE §8
- `packages/renderer` (PixiJS) draws an image map with a camera (zoom, pan, rotation 0/90/180/270); the DM window shows the open scene's map with zoom/pan. Map files reach the webview through a read-only `dmlib` protocol that serves only `library/…`.
- **Acceptance criteria**
  - [x] Screenshot tests for a fixture map in the DM view (fit, zoomed, rotated)
  - [x] DM zooms (wheel, keys), pans (drag, arrow keys), rotates and fits the map
  - [x] Only `library/…` files are served, only to the DM and player windows
- **Notes:** Split from T-105 (DM decision, 2026-11-17): own read-only protocol for library files, player window receives events only. From T-003 review: `pnpm test:visual` mounts the host `node_modules` into the Linux container. Once visual tests need a Vite dev server, native binaries (esbuild/rollup) from a macOS/Windows host will not run there – install dependencies inside the container (separate volume) instead. From T-007: remove the spike (`apps/desktop/spike.html`, `src/spike/`, `spike/`, the `VITE_SPIKE` switch and the `playerPage` parameter) once the renderer and its benchmark exist; move `pixi.js` (with `pixi.js/unsafe-eval`, required by our CSP) to `packages/renderer`. From T-007/ADR-0010: video maps are a `<video>` element under a transparent PixiJS canvas with a shared camera transform (zoom/pan/rotation); the benchmark scene must show ≤ 1 % missed refreshes at 4K/60 Hz with realistic fog, the DM window open and an animated camera, judge video smoothness separately and investigate the hitches seen in the spike. The video element must fail closed: hidden until the fog for the scene is drawn and on resize/context loss/teardown.

### T-105b Player window shows the open scene

- **Status:** done · **Depends on:** T-105a · **Refs:** ARCHITECTURE §5.1, §8
- The DM window sends the player window the projected scene (`projectForViewer`) via a Tauri event; the player window's only permission is listening to events, and it validates every message with the strict viewer schema. Locked scale: the map is fitted to the TV until T-106 brings 1-inch calibration (then the DM window also pans the TV view); the DM rotates the TV view. Fog: opaque except revealed areas (first map level until levels can be switched).
- **Acceptance criteria**
  - [x] Opening a scene in the DM window shows its map on the TV; closing it clears the TV
  - [x] Screenshot test for the player view
  - [x] The player window rejects messages that fail the viewer schema
- **Notes:** Security-relevant (player window capability): DM confirmed the approach 2026-11-17; confirms the capability before merge.

### T-105c Video maps

- **Status:** done · **Depends on:** T-105b · **Refs:** ARCHITECTURE §8, ADR-0010
- Import MP4/WebM maps; the `dmlib` scheme streams them (HTTP Range). A `<video>` element under the transparent canvas follows the camera (CSS transform) in the DM and player views; fail closed.
- **Acceptance criteria**
  - [x] Video map follows the camera; hidden until fog is drawn and on resize/context loss/teardown
  - [x] MP4/WebM import detects the format by content; videos are served in ranges, never whole into memory
- **Notes:** Split from T-105c (agent, 2026-11-17). From the T-105a review: the `dmlib` scheme reads whole files into memory per request; videos need streaming with HTTP Range support (and a `media-src` CSP entry).

### T-105d Renderer benchmark and spike removal

- **Status:** todo · **Depends on:** T-105c, T-108a · **Refs:** ARCHITECTURE §11, ADR-0010
- Benchmark scene in `test-fixtures` (4K video map, realistic fog, 20 tokens once T-107 exists, DM window open, animated camera) with the frame statistics from the spike; remove the T-007 spike.
- **Acceptance criteria**
  - [ ] Benchmark scene added to `test-fixtures`; ≤ 1 % missed refreshes at 4K/60 Hz on the reference notebook (DM measures)
  - [ ] Spike code removed; `pixi.js` only in `packages/renderer`
- **Notes:** Judge video smoothness separately and investigate the hitches seen in the spike (ADR-0010).

### T-127 Maps larger than the GPU texture limit

- **Status:** todo · **Depends on:** T-105a · **Refs:** ARCHITECTURE §8, §11
- Battle maps often exceed `MAX_TEXTURE_SIZE` (8192 px on many integrated GPUs). Detect it and either split the map into tiles or show a clear error instead of a black map.
- **Acceptance criteria**
  - [ ] A map larger than the texture limit is shown correctly (tiled) or with an actionable message
- **Notes:** From the T-105a review.

### T-128 Keep video maps in sync between DM window and TV

- **Status:** todo · **Depends on:** T-105c · **Refs:** ADR-0010
- The DM window and the TV each play the video map; their positions drift apart. Sync the player view's playback position to the DM window (or the other way round) within a tolerance.
- **Acceptance criteria**
  - [ ] Both views show the same moment of a video map within ~100 ms
- **Notes:** From the T-105c review (ADR-0010 consequence).

### T-106 Grid overlay and 1-inch calibration

- **Status:** todo · **Depends on:** T-105b, T-134 · **Refs:** SPEC 2.2, ADR-0012
- Grid overlay (calibration stored in the map's sidecar, T-134); align grid to the map; display calibration (screen diagonal / resolution → pixels per inch) per display in device settings.
- **Acceptance criteria**
  - [ ] On a calibrated display one cell measures 1 inch (manual check documented; unit tests for the math)
  - [ ] Rotation 0/90/180/270 in the player window

### T-116 Player view render resolution setting

- **Status:** todo · **Depends on:** T-105b · **Refs:** SPEC 2.2, ARCHITECTURE §11
- Device setting for the player view's render resolution: native (e.g. 4K) or Full HD, upscaled to the display. Stored in device settings (OS app-data), not in the library.
- **Acceptance criteria**
  - [ ] Setting in the DM window, applied to the player view without restart
  - [ ] Screenshot test of the player view in both modes
- **Notes:** DM requirement from T-007 (4K Samsung The Frame, should also run in Full HD). The T-007 spike measures both modes.

### T-107 Tokens: create, place, move

- **Status:** todo · **Depends on:** T-102b, T-106 · **Refs:** SPEC 5
- Tokens with D&D size categories; tap-token-tap-cell, drag, keyboard shortcuts, group move; snapping.
- **Acceptance criteria**
  - [ ] All move modes covered by component/E2E tests
  - [ ] Invisible-in-player-view tokens supported

### T-108a Fog: rectangle reveal/hide, undo, live on the TV

- **Status:** done · **Depends on:** T-102b, T-105b · **Refs:** SPEC 4
- Rectangle tool to reveal and hide, "reveal all" / "cover all", undo/redo (buttons and Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z). The DM sees fog semi-transparent, the TV opaque. Every change is saved to the scene file and reaches the TV without blanking it. Robust fog rendering (inverse stencil mask instead of earcut holes).
- **Acceptance criteria**
  - [x] Player window shows only revealed areas (screenshot tests, incl. an island inside a hidden hole and touching areas)
  - [x] Undo restores the previous fog state
  - [x] Fog changes are saved and shown on the TV without a black flash
- **Notes:** Split from T-108 (agent, 2026-11-17). From T-102a review: fog ops use exact arithmetic (polyclip-ts/BigNumber) – measured ~9 ms average, ~20 ms worst per reveal after 300 brush dabs, 34 ms for hiding a 64-gon. Combine a brush stroke into one polygon per stroke (one command), not one command per pointer move. From the T-105b review: the renderer's fog (`drawFog`, earcut holes) does not handle a revealed island inside a hidden hole, and degenerate or vertex-touching polygons could leave gaps (fail-open) – add goldens for these and switch to an even-odd/stencil approach if needed. Fog edits must not blank the TV: load the campaign once per scene and project synchronously (today `usePlayerView` sends `null` before every update).

### T-108b Fog: brush, polygon and circle tools

- **Status:** done · **Depends on:** T-108a · **Refs:** SPEC 4
- Shapes for revealing and hiding besides the rectangle: brush (one area per stroke, one command), polygon (clicked points) and circle (dragged from its centre). Brush size in grid cells.
- **Acceptance criteria**
  - [x] A brush stroke reveals/hides along the stroke as one undo step
  - [x] A clicked polygon reveals/hides its area
  - [x] A circle dragged from its centre reveals/hides its area
- **Notes:** Circle tool added by the DM (2026-11-18).

### T-108c Fog: predefined rooms

- **Status:** todo · **Depends on:** T-108b, T-134 · **Refs:** SPEC 4, ADR-0012
- Rooms and areas drawn once per map level (polygons, may overlap) in the map's sidecar, so every scene using the map has them; revealed with one click on the room or from the room list in the scene browser. Rooms can be marked secret.
- **Acceptance criteria**
  - [ ] DM defines rooms on a map; a second scene with the same map shows the same rooms
  - [ ] Hovering a room in fog mode highlights it; a click reveals/hides it as one undo step
  - [ ] Room list with per-room reveal toggle
  - [ ] Room reveals and "reveal all" subtract hidden secret rooms: afterwards `revealed ∩ hiddenSecretRoom = ∅` and no token centred in it is projected (property test, incl. overlapping rooms)
- **Notes:** Format per ADR-0012 (accepted by the DM, 2026-11-18). Suggesting rooms from walls comes with T-141; reveal by trigger with the trigger zones (stage 5).

### T-109 Memory fog

- **Status:** todo · **Depends on:** T-108a
- Previously revealed areas render dimmed; tokens inside are hidden for players.
- **Acceptance criteria**
  - [ ] Screenshot tests for revealed / remembered / unrevealed

### T-110 Per-element visibility with type defaults

- **Status:** todo · **Depends on:** T-102b, T-107 · **Refs:** SPEC 6
- Visible / hidden / approximate per element; defaults per element type in campaign settings.
- **Acceptance criteria**
  - [ ] Approximate HP rendering ("unhurt / wounded / badly wounded")
  - [ ] Projection tests extended

### T-111 Initiative tracker

- **Status:** todo · **Depends on:** T-102b · **Refs:** SPEC 11
- Order, rounds, active turn (highlight on TV), delay/ready, quick entry.
- **Acceptance criteria**
  - [ ] Reducer tests for all initiative commands
  - [ ] Active token highlighted in player window (screenshot)
- **Notes:** From T-102a: removing all combatants resets the tracker (round 0); an explicit "end combat" command, delay/ready and manual reordering belong here (adding a combatant inserts without re-sorting, so manual order is kept).

### T-112 HP and conditions

- **Status:** todo · **Depends on:** T-111
- HP, temp HP, conditions with round duration; icons and HP bar on tokens respecting visibility.
- **Acceptance criteria**
  - [ ] Conditions expire automatically at the right turn (tests)

### T-113 Blackout button and DM preview of the player view

- **Status:** todo · **Depends on:** T-105b
- Instant black/pause image in the player window; small live preview of the player view in the DM window as a floating HUD panel (ARCHITECTURE §15).
- **Acceptance criteria**
  - [ ] Blackout reachable by button and keyboard shortcut; E2E test
  - [ ] The preview shows exactly the projected player view (incl. blackout), never DM-only data; component/E2E test
- **Notes:** Preview placement decided by the DM (2026-11-18, PR #27).

### T-133 Player-view preview on an additional DM monitor

- **Status:** todo · **Depends on:** T-113 · **Refs:** SPEC 2.1, ARCHITECTURE §8, §15
- Open the player-view preview as its own window on a chosen display (windowed or fullscreen), for a better overview on an additional DM monitor.
- **Acceptance criteria**
  - [ ] DM chooses the display and opens/closes the window; the choice is remembered
  - [ ] The window receives only `PlayerViewMessage` output, has the player window's permissions and fails closed; E2E test
  - [ ] Benchmark scene (ARCHITECTURE §11) with TV + DM monitor + DM window open stays within budget, measured on the reference notebook
- **Notes:** Requested by the DM (2026-11-18). A third renderer decoding the same 4K video costs GPU time; if the budget is missed, render the monitor window at reduced resolution or frame rate. Open: should it follow the TV's rotation or stay upright for the DM?

### T-114 Autosave and crash recovery

- **Status:** todo · **Depends on:** T-103b, T-102b
- Periodic and on-change save of scene state; recovery on next start.
- **Acceptance criteria**
  - [ ] Killing the app mid-session loses at most the last few seconds (E2E test with forced kill)

### T-129 UI design tokens and base primitives

- **Status:** done · **Depends on:** – · **Refs:** ARCHITECTURE §15, ADR-0011
- Token sheet in `packages/ui` (`--dm-surface-*`, `--dm-border-*`, `--dm-text-*`, `--dm-accent-*`, `--dm-space-*`, `--dm-font-*`, `--dm-z-*`) with a parchment and a dimmed "night" variant; base primitives `FloatingPanel`, `IconButton`, `TreeList` (connector lines, node markers, trailing actions, badges); `apps/desktop/src/styles.css` consumes the tokens instead of hard-coded values.
- **Acceptance criteria**
  - [x] No hard-coded colours, spacing, fonts or z-indices left in the DM-window styles of `apps/desktop` (checked by a small self-written test that scans the stylesheet; the player window's black background is excluded)
  - [x] Text/surface pairs of both variants meet WCAG AA (checked by a unit test over the token values)
  - [x] Primitives have component tests incl. keyboard navigation for `TreeList`; labels via i18n
- **Notes:** From ADR-0011 (2026-11-18). Define the token values in a TS object and derive the CSS custom properties from it, so the WCAG contrast test can check the values directly. `packages/ui` needs `react` (already a workspace dependency, not a new one) and a component-test setup. Choosing fonts and an icon set is a dependency decision – propose candidates (OFL/CC0, bundled locally) to the DM first. DM decisions (2026-11-18): system fonts for now (tokens only); Lucide (`lucide-react`, ISC) as the icon set – added with the first component that uses it (T-130); palette and tree look approved via a preview page. The player window keeps its own `player.css` outside the design system; the companion's styles move to tokens with its first real screen.

### T-130a DM window E2E harness

- **Status:** done · **Depends on:** – · **Refs:** ARCHITECTURE §2, §12, ADR-0009
- A web build of the DM window for Playwright: `apps/desktop/e2e.html` renders `DmApp` with in-memory platform services (library on `createMemoryFileSystem`, fake displays, a self-drawn map image) instead of Tauri. Built only in Vite's `e2e` mode, never part of the app build. First E2E flow: open the library, a campaign and a scene, and see the map canvas.
- **Acceptance criteria**
  - [x] `pnpm test:e2e` builds and serves the harness and runs the DM-window flow (locally and in CI)
  - [x] The app build (`vite build`) contains no harness page or fake services
- **Notes:** Split from T-130 (DM, 2026-11-18): T-130's E2E/screenshot criteria need it. Fakes sit at the platform-service level (`LibraryService`, `DisplayService`, `MapViewService`), not at the Tauri IPC level as ARCHITECTURE §2 describes; the Tauri adapters stay covered by their unit tests and the tauri-driver smoke test.

### T-130 DM window zone layout

- **Status:** done · **Depends on:** T-129, T-130a · **Refs:** ARCHITECTURE §15, ADR-0011, SPEC 2.1
- Map viewport fills the DM window; collapsible left data panel holds `LibraryPanel` and `CampaignPanel`; dark title bar (save status, undo, redo, scene tab, settings) and parchment ribbon with mode tabs; floating scene browser top left. Player window unchanged.
- DM decisions (2026-11-18):
  - Title bar shows a **save status** ("Gespeichert" / "Speichert …" / "Nicht gespeichert – erneut versuchen") instead of a save button (scenes already save on every change).
  - Ribbon modes with content: **Szene** (change map, delete/close scene), **Nebel** (today's fog tools, reworked in T-131), **Anzeige** (choose display, open player view, rotate TV).
  - **Scene browser** shows the open scene as a `TreeList` (map file and levels, fog areas); grows with tokens, rooms and notes later.
  - **Settings** behind a gear icon in the title bar (popover): theme **follow the OS / light (parchment) / dark (night)**, stored per device (not in the sync folder, ARCHITECTURE §6.2).
  - Data panel toggles with a button and **Cmd/Ctrl+B**.
  - Icons from Lucide (`lucide-react`, approved by the DM).
- **Acceptance criteria**
  - [x] The canvas stays full-window (100vw × 100vh) whether the data panel is open or closed; the panel overlays it (asserted in E2E via the canvas bounding box)
  - [x] Data panel toggles by button and Cmd/Ctrl+B
  - [x] Theme setting (OS / light / dark) applies immediately and survives a restart
  - [x] Existing E2E flows pass with updated selectors; DM-window screenshot test added
- **Notes:** From ADR-0011.

### T-130b Fusion-style look of the DM window

- **Status:** done · **Depends on:** T-130 · **Refs:** ARCHITECTURE §15, ADR-0011, `.claude/skills/ui-design/SKILL.md`
- Make the zones from T-130 look like the Fusion 360 reference the DM gave (2026-11-19); layout zones and panel contents stay as they are (contents move in T-130c).
- DM decisions (2026-11-19):
  - **Ribbon:** tool groups with large icons over a short label and a group caption below; a caption with ▾ opens a dropdown for less frequent tools. Replaces the plain text buttons and native selects in the ribbon.
  - **Form controls** (buttons, text fields, selects) styled from tokens in `@dungeon-manager/ui`.
  - **Scene browser:** compact header; visibility (eye) toggles come with T-110, not here.
  - New `@dungeon-manager/ui` primitives **Popover** and **Menu** (menu button / dropdown), reused by T-130c.
- **Acceptance criteria**
  - [x] The Szene and Anzeige modes use icon tool groups with captions; keyboard reachable (Menu follows the WAI-ARIA menu button pattern), labels translated. Nebel gets its tool groups with the fog rework in T-131.
  - [x] No native-looking buttons, fields or selects left in the DM window; tokens only (`findHardCodedValues`)
  - [x] Component tests for Popover, Menu and the ribbon group; smoke test and E2E selectors updated; screenshot golden updated

### T-130c Campaign and scenes in the scene browser, catalogue data panel

- **Status:** done · **Depends on:** T-130b · **Refs:** ARCHITECTURE §15, ADR-0011, SPEC 2.1
- DM decisions (2026-11-19):
  - **Scene browser** shows one campaign: its header is the campaign name with ▾ to switch or create a campaign; the tree lists its scenes, the open scene expands into its content (map, levels, fog). Clicking a scene opens it.
  - **New scene:** from the ribbon (Szene mode) or by right-clicking the campaign or a scene in the browser; both open a small Fusion-style popover (name, optional map). Right-clicking a scene will also offer a sub-scene once T-152 exists.
  - **Data panel** becomes the map and asset catalogue scaffold: header "Katalog" with "Karte importieren", groups Karten / Token / Assets with empty hints; T-124 fills it. Folds in and out as before.
  - **Library folder** is chosen in the settings popover (gear).
- **Acceptance criteria**
  - [x] Campaign switch and new campaign from the browser header, new scene from the context menu and the ribbon (component + E2E tests); the context menu is keyboard reachable (Shift+F10 / context-menu key)
  - [x] Data panel shows the catalogue scaffold; the library folder can be changed in the settings
  - [x] Smoke test, E2E and screenshot updated
- **Notes:** Split (DM, 2026-11-19): native menus moved to T-130d. The T-130b review note (a group menu opened over its group's popover) is fixed here: the menu closes the popover when it opens.

### T-154 Docked data panel and ribbon

- **Status:** done · **Depends on:** T-130c · **Refs:** ADR-0014, ADR-0011, ARCHITECTURE §15
- DM request (2026-11-19): the data panel takes the full height as its own column instead of lying over the map, and "Einpassen" must not fit the map under the ribbon. DM decision: dock the data panel and the ribbon; the map fills the remaining area; scene browser, dock and notices keep floating over the map (ADR-0014).
- **Acceptance criteria**
  - [x] Title bar full width; data panel a full-height left column (Cmd/Ctrl+B folds it); ribbon right of it; the canvas fills exactly the rest (E2E via bounding boxes, panel open and folded)
  - [x] "Einpassen" fits the map into the visible map area; the view follows canvas resizes (panel fold, window resize)
  - [x] Screenshot golden updated; ARCHITECTURE §15 and the ui-design skill describe the docked zones
- **Notes:** "Einpassen" needed no code change: it fits to the canvas size, which now is the visible map area (E2E checks the canvas against panel and ribbon; the fit itself is covered by the camera unit tests). Whether a fold should keep the view's centre is left for later.

### T-157 Workshop theme (dark default) and reduced parchment

- **Status:** done · **Depends on:** T-154 · **Refs:** ADR-0015, ADR-0011, ARCHITECTURE §15
- DM feedback (2026-11-19): the look is "too playful and simple"; Fusion feels tidier. DM decision after the style mock-up: **both directions as themes** – dark "workshop" (default) and reduced light "parchment"; the old night variant goes.
- **Acceptance criteria**
  - [x] Token themes `workshop` (default) and `parchment`, both WCAG AA (pair tests); setting "OS / Hell / Dunkel" maps light → parchment, dark → workshop; first start is dark
  - [x] Flatter base: sans-serif headings, small uppercase captions, smaller radii and shadows; components only through tokens
  - [x] Screenshot golden in the default theme; ARCHITECTURE §15 and the ui-design skill updated

### T-158 Scene browser: campaign tree, transparent, collapsible, movable

- **Status:** done · **Depends on:** T-157 · **Refs:** ADR-0011, ADR-0014, ADR-0015, ARCHITECTURE §15
- DM request (2026-11-19, Fusion browser as reference): the tree starts with the current campaign, below it the campaign settings, then scenes, notes and later more groups. The browser has no panel background (transparent over the map, only a small header bar), can be collapsed, and can be dragged freely over the map area; position and collapsed state are remembered per device (DM decision), with a reset in the settings.
- **Acceptance criteria**
  - [x] Tree: campaign → Kampagneneinstellungen, Szenen (open scene with its content), Notizen, …; keyboard and screen-reader accessible as today
  - [x] Transparent body readable over any map (text shadow or scrim; WCAG AA checked on light and dark maps)
  - [x] Collapse/expand, drag by the header grip within the map area, keyboard alternative; position per device; component + E2E tests
- **Notes:** DM decision (2026-11-19): groups Kampagneneinstellungen, Szenen, Karten (maps used by the campaign's scenes), Spieler & Charaktere (character pictures come with tokens, T-107), Handouts & Hinweise (filled by T-137) and Notizen (filled by T-150); folded, only the header bar stays. Campaign settings open in the details panel (T-159).

### T-159 Details panel (properties) on the right

- **Status:** done · **Depends on:** T-158 · **Refs:** ADR-0011, ADR-0014, ADR-0015, ARCHITECTURE §15
- DM request (2026-11-19): clicking an entry (map, scene, asset, …) in the browser opens a details area (catalogue entries follow with T-124) on the right of the map area, like Fusion's properties panel. Collapsible and movable like the browser (same mechanics, position per device).
- **Acceptance criteria**
  - [x] Details for a scene and a map (read-only facts first; editing moves in as features need it)
  - [x] Collapse, drag, keyboard; component + E2E tests, screenshot

### T-160a Session files: schema and storage

- **Status:** done · **Depends on:** T-159 · **Refs:** ARCHITECTURE §6.2, ADR-0006
- Schema approved by the DM (2026-11-19): `campaigns/<slug>/sessions/<id>.json` with `schemaVersion`, `id`, `name`, optional `date` (YYYY-MM-DD), ordered `sceneIds` (a scene at most once per session, in any number of sessions); unknown fields survive. Scene and campaign files unchanged, no migration. Deleting a session trashes only its file; deleting a scene takes it out of every session that lists it.
- **Acceptance criteria**
  - [x] Session schema (zod) with tests; storage load/save/list (conflict copies as for scenes), create, delete to the trash
  - [x] Deleting a scene updates the sessions that list it, and only those

### T-160b Sessions in the browser

- **Status:** done · **Depends on:** T-160a · **Refs:** SPEC 13, ARCHITECTURE §6, ADR-0006
- DM request (2026-11-19): a campaign is planned in several sessions, each with several scenes; the browser shows Kampagne › Sessions › Szenen, with handouts, puzzles etc. on campaign level.
- DM decisions (2026-11-19): each session is its own file `campaigns/<slug>/sessions/<id>.json` (name, date, ordered scene list); a scene may appear in several sessions (e.g. not finished last time); scenes in no session are listed under "Ohne Session"; scene files stay unchanged. Handouts & puzzles hang on the campaign (a scene may reference them later, T-137/T-139).
- **Acceptance criteria**
  - [x] Browser: Sessions group with sessions and their scenes in order, "Ohne Session"; create/rename/delete a session, add/remove/reorder scenes (context menu + keyboard)
  - [x] Component + E2E tests, screenshot
- **Notes:** Missing scenes in a session show as "(fehlt)"; an invalid session file (e.g. a duplicate scene after a hand edit) shows an actionable "kann nicht gelesen werden" entry; new sessions get fresh ids (`createSession` overwrites like `createScene`). Sub-scenes (T-152) hang under their scene, not under the session (DM-approved proposal, 2026-11-19).

### T-163 Notes rendered as Markdown, with images

- **Status:** done · **Depends on:** T-161b · **Refs:** ADR-0006, ADR-0013, ARCHITECTURE §6, §15
- DM decisions (2026-11-19):
  - **Library:** `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 (MIT, remark/unified; about 50 kB gzip, ~100 small transitive packages; `remark-frontmatter` turned out unnecessary – the app splits off front matter itself) – Markdown becomes React elements, no `innerHTML`, no raw HTML from notes.
  - **Images:** local images from the library folder load directly through a new Rust command `library_read_image` for the DM window only (image types, ≤ 20 MB; dmlib stays limited to `library/`); external `https://` images load only after a click on "Bild laden" (CSP `img-src` gains `https:`).
  - **Obsidian:** `![[bild.png]]` embeds, `[[Notiz]]` links that open the note in the details panel, front matter as a properties table, callouts (`> [!note]`).
- **Acceptance criteria**
  - [x] Notes render as Markdown (GFM) with no raw HTML; links never navigate the window
  - [x] Local images (relative to the note, or `![[name]]` found in the campaign folder) show; external ones only on click; the player window cannot read images (Rust test, capability)
  - [x] `[[Notiz]]` opens the note; front matter and callouts render; component tests, E2E, screenshot

### T-162 Compact interface and interface size setting

- **Status:** done · **Depends on:** T-160b · **Refs:** ADR-0015, ARCHITECTURE §15
- DM feedback (2026-11-19): the design is too massive – the title bar and the ribbon are too tall, the type too large. DM decision: compact by default, plus an interface size setting 90 / 100 / 110 / 125 % per device (in the gear popover until T-155 moves it into the settings dialog). The map has its own zoom and is not affected.
- **Acceptance criteria**
  - [x] Sizes in rem from one base size (`--dm-ui-base-size` 14px × `--dm-ui-scale`); hairlines and radii stay in px; title bar and ribbon visibly lower
  - [x] Interface size setting applies at once, survives a restart, never scales the map canvas (unit, component and E2E tests)
  - [x] Screenshot golden updated

### T-161a Note files and links: schema and storage

- **Status:** done · **Depends on:** T-160b · **Refs:** ADR-0006, ADR-0013, ARCHITECTURE §6.2
- DM-approved format (2026-11-19): fixed notes `campaigns/<slug>/notes/campaign.md`, `notes/sessions/<id>.md`, `notes/scenes/<id>.md`; an optional `notes: ["<path relative to the campaign folder>", …]` list in campaign.json, session and scene files for any other `.md`.
- **Acceptance criteria**
  - [x] Note path schema (inside the campaign folder, `.md`, no tool folders) and the optional `notes` list on campaign, session and scene; tests
  - [x] Storage: fixed note paths, read, create on demand without overwriting, link/unlink, list who has a note; tests

### T-161b Notes in the browser and details panel

- **Status:** done · **Depends on:** T-161a · **Refs:** ADR-0013, ADR-0006, ADR-0005, T-150
- DM request (2026-11-19): campaign notes, session notes and scene notes, linked to `.md` files so they can be filled remotely (Obsidian or similar; Notion only via files in the synced folder – no cloud APIs, ADR-0005/0013).
- DM decisions (2026-11-19): fixed places plus free links – `campaigns/<slug>/notes/campaign.md`, `notes/sessions/<id>.md`, `notes/scenes/<id>.md` inside the campaign folder (created by the app on demand); any other `.md` is linked through an optional `notes: ["<path relative to the campaign folder>", …]` list in campaign.json, a session or a scene file (unknown to older readers, kept by them).
- **Acceptance criteria**
  - [x] Notes open from the browser/details panel (read view first); edits made elsewhere show up without restart
  - [x] Linking an existing `.md`; unknown front matter survives a round trip (ADR-0006)
  - [x] Component + E2E tests for opening, creating, linking and missing notes
- **Notes:** Format approved by the DM (2026-11-19). T-150 decides whether Obsidian opens the campaign folder or the library root as its vault; both work with these paths. Known gaps (T-161b review): a link written to a closed scene while the DM opens it from the tree in the same instant, or right after closing it while fog saves are still queued, can be overwritten by the scene's next save – a scene-operation guard or flushing on close would close this.

### T-155 Settings dialog

- **Status:** done · **Depends on:** T-157 (after T-158/T-159 by DM priority, 2026-11-19) · **Refs:** ADR-0011 (layer 50), ARCHITECTURE §6.2, §15
- DM request (2026-11-19): a full settings window for all global settings. DM decision: a large dialog inside the DM window with categories on the left (Darstellung, Bibliothek, Nebel & Animation, Spieleransicht, …) and their settings on the right; opened from the gear, Cmd/Ctrl+, and later the app menu (T-130d). The gear popover's theme and library folder move into it.
- **Acceptance criteria**
  - [x] Modal dialog with focus trap, Escape closes, categories keyboard navigable; translated
  - [x] Theme and library folder work from the dialog; a settings registry makes adding a category a small change (component tests)
  - [x] E2E and screenshot
- Nebel & Animation and Spieleransicht have no settings yet; they join with T-136 and the player-view settings.

### T-153 Welcome dialog with recent campaigns

- **Status:** done · **Depends on:** T-155 · **Refs:** ARCHITECTURE §6.2, §15, ADR-0011
- On every start the DM window shows a welcome dialog, similar to Inkscape/Illustrator (DM request, 2026-11-19). Comes after T-155 (DM order, 2026-11-19), whose modal dialog it reuses.
- DM decisions (2026-11-19):
  - **List + actions:** recently edited campaigns with name, last opened scene and date; buttons "Neue Kampagne", "Andere Kampagne öffnen …" and the library folder. Previews/tiles come once T-124 produces previews.
  - Choosing a campaign opens it **with its last open scene**; the dialog appears on every start and can be opened again from the app menu (T-130d).
  - "Recently edited" is stored **per device** (webview storage in OS app data, like the theme; not in the sync folder, no file format change).
- DM addition (2026-11-19): the very first start (no library folder, no campaign yet) is covered too – the dialog explains the library and asks for the folder, then for the first campaign's name.
- Reopening it from the app menu comes with T-130d.
- **Acceptance criteria**
  - [x] Dialog lists recent campaigns, most recent first; missing or unreadable campaigns are shown as such and can be removed from the list
  - [x] Choosing one opens the campaign and its last scene; new campaign and other campaign work from the dialog
  - [x] Keyboard and screen-reader accessible modal (focus trap, Escape closes into the empty window); component + E2E tests, screenshot

### T-156 Workspaces

- **Status:** done · **Depends on:** T-153 · **Refs:** ADR-0011, ADR-0014, ARCHITECTURE §15
- DM request (2026-11-19, with their mock-up): a workspace selector at the left end of the ribbon ("ARBEITSBEREICH / MAP FORGE ▾"); each workspace has its own ribbon tabs.
- DM decisions (2026-11-19): four workspaces – **Map Forge** (edit maps), **Asset Studio** (edit assets), **Campaign Atlas** (edit the current campaign), **Game Mode** (run the session). Game Mode gets today's tabs (Szene, Nebel, Anzeige); the others show a "coming" hint until their own tasks fill them. The app starts in the last used workspace (per device), Game Mode on first start.
- **Acceptance criteria**
  - [x] Selector keyboard accessible (Menu), workspace switch changes the tabs; last workspace remembered per device
  - [x] Component + E2E tests, screenshot
- **Notes:** What each workspace contains (tabs, tools, data panel content) is planned with the DM per workspace before its content task.
- **Notes from the T-156 review, for the first workspace content task:**
  - The active fog tool stays active in other workspaces, while its toolbar is hidden. Dragging on the map in Map Forge would still reveal fog on the TV, as switching from the Nebel tab to Anzeige does today. Decide whether leaving Game Mode drops back to panning.
  - Cmd/Ctrl+Z undoes the scene's (fog) history in every workspace; Map Forge and Asset Studio will need their own undo scope.

### T-164 Menu: name of the open menu and the current choice

- **Status:** todo · **Depends on:** T-156 · **Refs:** ADR-0011, `packages/ui/src/Menu.tsx`
- From the T-156 review: the workspace menu is announced with the button's text ("Game Mode") instead of "Arbeitsbereich", and the current workspace is not marked in it.
- **Acceptance criteria**
  - [ ] `Menu` takes a separate accessible name for the open menu and checkable items (`menuitemradio` with `aria-checked`, a visible check)
  - [ ] The workspace selector uses both; component tests

### T-136 Soft fog fades and edges

- **Status:** todo · **Depends on:** T-108b, T-155 · **Refs:** SPEC 4, ARCHITECTURE §8, §11
- Fog changes fade in/out instead of popping, and the fog has soft edges (DM request, 2026-11-19: no hard edges, no hard pop).
- DM decisions (2026-11-19): a **transition duration** slider 0–3 s (0 = off, default ~0.65 s ease-out) and a **soft edges** switch in the settings dialog (T-155) under "Nebel"; stored **per device** like the theme (no file format change). Moved ahead of T-109; memory fog gets its fade when it arrives.
- **Acceptance criteria**
  - [ ] Fades for manual reveals/hides and room reveals; setting off = current hard behaviour
  - [ ] Soft edges never reveal more than the hard polygon (fail-closed: the blur falls inside the hidden side; screenshot test)
  - [ ] With the effect on, the benchmark scene stays within ARCHITECTURE §11 (≤ 1 % missed refreshes at 60 Hz)
- **Implementation hint:** if a real-time blur misses the budget, use a precomputed soft mask.
- **Notes:** From the DM planning interview (2026-11-18).

### T-130d App menu: macOS menu bar, Windows menu button

- **Status:** todo · **Depends on:** T-130c · **Refs:** ARCHITECTURE §15, ADR-0011
- **New campaign** (and later more app commands such as the welcome dialog of T-153) on macOS from the native menu bar (Tauri menu, e.g. "Ablage → Neue Kampagne"); on Windows from a menu button in the title bar (DM decision, 2026-11-19).
- **Acceptance criteria**
  - [ ] Native macOS menu command reaches the DM window (Rust test or smoke test)
  - [ ] Windows menu button covered by a component test; menu labels translated
- **Notes:** From the T-130c review: context menus and popovers opened at a point are not yet kept inside the viewport (a low tree item with Shift+F10 can push the new-scene form off-screen) – clamp them when the menus are built here.

### T-152 Sub-scenes

- **Status:** todo · **Depends on:** T-130c · **Refs:** SPEC 2.1, ARCHITECTURE §6
- A scene can have sub-scenes (e.g. "Krypta › Geheimkammer"), created by right-clicking a scene in the scene browser and shown nested under it.
- **Acceptance criteria**
  - [ ] Scene schema gains an optional parent scene reference, with a migration and schema tests
  - [ ] Browser shows sub-scenes nested; deleting a scene with sub-scenes asks what happens to them
- **Notes:** DM request (2026-11-19). File format change: propose the schema field, migration and delete behaviour to the DM before implementing.

### T-131 Fog tools in the ribbon and navigation dock

- **Status:** todo · **Depends on:** T-130c · **Refs:** ARCHITECTURE §15, ADR-0011
- Move `FogToolbar` into the ribbon's fog mode (tool groups with captions, active tool highlighted); bottom-centre dock with zoom and fit-to-screen for the DM view, the player-view rotation (SPEC 2.2) and player-feed status.
- **Acceptance criteria**
  - [ ] All fog tools reachable from the ribbon, with keyboard shortcuts as before
  - [ ] Zoom/fit change the DM view transform, rotation turns the player view; component and E2E tests
  - [ ] No regression on the benchmark scene (ARCHITECTURE §11)
- **Notes:** From ADR-0011. Left over from T-130 review: at 1280 px the open data panel covers the left end of today's map dock, and `.dm-notices` sits at a fixed offset above it – lay both out with the new dock; display status (`role="status"`) moves out of the hidden Anzeige tab into the dock. Found in T-156: the ribbon's height differs per tab and workspace (about 65–142 px at 1280 px; Nebel wraps the most), so the map below moves when switching – give the ribbon one height as in Fusion 360 when the fog tools become ribbon groups.

### T-134 Sidecar files for map and asset data

- **Status:** todo · **Depends on:** T-103b · **Refs:** ADR-0012, ARCHITECTURE §5.2, §6, §8
- Versioned zod schema for `<file>.dm.json` (metadata, scale, levels, rooms; walls/doors/lights/blockers/variants reserved for stage 5, all with stable ids); storage reads, watches and writes sidecars atomically, incl. conflict copies and placeholders; scenes reference the map and keep overrides by element id; pure `resolveMap(sidecar, overrides)` in `core` with orphan detection.
- **Acceptance criteria**
  - [ ] A missing sidecar yields defaults; the first edit creates it
  - [ ] Scene schema v2: migration `map → { asset, overrides, legacyMap }`, storage seeds missing sidecars from `legacyMap`; differing grids/levels of several scenes keep `legacyMap` with a DM hint (tests with real v1 fixtures)
  - [ ] `resolveMap` applies overrides and reports orphaned ones (unit tests ≥ 80 %)
  - [ ] A level still used by scenes cannot be deleted, only archived; fog, tokens and released levels stay resolvable
  - [ ] A global edit to the map of the scene live on the TV is applied there only after DM confirmation (hint in the DM window); other scenes pick it up on open
  - [ ] `SessionState` carries the resolved map, `projectForViewer` takes it as input, and the existing projection property tests still pass
  - [ ] Sidecars are never served to companions or the player window: `dmlib` keeps refusing `*.dm.json` (regression test); the catalog ignores sidecars and maps sidecar conflict copies back to their original
- **Notes:** From the DM planning interview (2026-11-18). ADR-0012 accepted by the DM (2026-11-18), incl. "global edits reach the live scene only after confirmation".

### T-135 Selectable scene transitions

- **Status:** todo · **Depends on:** T-105b · **Refs:** SPEC 3.2, ARCHITECTURE §8, ADR-0010
- When switching the TV to another scene, the DM chooses crossfade (default), through black or instant; duration in the settings.
- **Acceptance criteria**
  - [ ] All three transitions work for image and video maps
  - [ ] Fail-closed for both scenes: each is drawn only with its own fog set (screenshot/E2E test mid-transition)
  - [ ] Benchmark incl. a video-to-video crossfade stays within ARCHITECTURE §11 (≤ 1 % missed refreshes); a crossfade between two videos needs a second `<video>` element under the canvas (extends ADR-0010's single slot)
- **Notes:** From the DM planning interview (2026-11-18). Themed transitions are T-147.

### T-115 MVP end-to-end flow

- **Status:** todo · **Depends on:** T-107 … T-114, T-134 … T-136
- E2E: choose library → import map → create scene → place tokens → reveal fog → run two initiative rounds → blackout → restart → state restored.
- **Acceptance criteria**
  - [ ] Flow passes in CI; benchmark run on reference notebook documented in `docs/benchmarks/`

---

## Stage 2 – Planning on the go & sound

### T-150 Obsidian vault and scene drafts from notes

- **Status:** todo · **Depends on:** T-103b, T-134 · **Refs:** ADR-0013, ADR-0006, ARCHITECTURE §6.7, SPEC 2.3
- Decide and document where the vault lives (campaign folder or library root); storage ignores `.obsidian/` and similar tool folders and picks up note changes made elsewhere; a documented front-matter format for scene drafts (`type: scene`, map, sound, light, tokens) is validated with zod and offered as scene drafts in the DM window.
- **Acceptance criteria**
  - [ ] A note edited outside the app shows up in Dungeon Manager without restart
  - [ ] A valid scene note becomes a scene draft; an invalid one shows an actionable hint (no crash)
  - [ ] Front matter keys the app does not know survive a round trip (ADR-0006)
  - [ ] Setup guide for Obsidian on iOS/Android incl. sync (SPEC 17)
- **Notes:** From the DM planning interview (2026-11-18). New file format (scene front matter): DM approves the format before implementing.

### T-137 Handouts on the TV

- **Status:** todo · **Depends on:** T-105b, T-102b · **Refs:** SPEC 12, 2.2
- Handouts per campaign (title, text, image from the global library, released or not); the DM shows and hides one on the TV as a full-screen overlay with an unfold animation; single or mirrored for several table sides; the DM can rotate it; items and portraits in a frame.
- **Acceptance criteria**
  - [ ] Show/hide with animation; blackout still wins over a handout
  - [ ] Single and mirrored (2×/4×) layouts and DM rotation; screenshot tests
  - [ ] Only released handouts reach the player view (projection test)
- **Notes:** From the DM planning interview (2026-11-18). The paper-rustle sound needs the sound system; add it when sound exists. Companion view of handouts comes in stage 3. Handouts are new campaign files (e.g. `campaigns/<slug>/handouts/`): folder layout and format need DM approval first.

### T-138 Handout generator: paper, text, ageing, frames

- **Status:** todo · **Depends on:** T-137 · **Refs:** SPEC 12
- Create handouts from templates (note, letter, wanted poster, parchment) with text, ageing and details (stains, burnt edges, folds, seal, signature), and frames for items and portraits. Stored as a recipe (JSON) and rendered when shown (cached).
- **Acceptance criteria**
  - [ ] Recipe schema validated with zod; editing a recipe updates the shown handout
  - [ ] Rendering is deterministic (seeded RNG for stains/tears) – screenshot tests
- **Notes:** From the DM planning interview (2026-11-18). Paper textures, fonts and seals must be self-made, CC0 or OFL (public repo); fonts/texture packs are a dependency decision for the DM.

### T-139 Map fragments and puzzles

- **Status:** todo · **Depends on:** T-138 · **Refs:** SPEC 12
- Cut a region of a library map into a "treasure map fragment" with torn edges; group several fragments into a puzzle that the DM releases one by one and that assembles on the TV.
- **Acceptance criteria**
  - [ ] DM selects a region of a map and gets a fragment handout
  - [ ] Released fragments of a puzzle appear in their place; unreleased ones are never sent
  - [ ] The projection contains no reference to the full source map, only the rendered fragment (ARCHITECTURE §5.1: asset refs are capabilities)
- **Notes:** From the DM planning interview (2026-11-18).

---

## Stage 3 – Networked at the table

### T-151 DM remote as a mode of the web app

- **Status:** todo · **Depends on:** T-102b · **Refs:** ADR-0013, ADR-0007, ARCHITECTURE §7, §13, SPEC 2.3
- A `dm-remote` role in the companion web app: separate QR pairing on the desktop, revocable, with sound, light, fog reveal, scene switch and handouts; DM screen (initiative, HP, notes) in the same mode.
- **Acceptance criteria**
  - [ ] A player pairing can never obtain `dm-remote` rights (protocol/permission tests)
  - [ ] The DM revokes a remote session from the desktop; it is disconnected immediately
  - [ ] Every remote command goes through `canApply` and undo like local ones
- **Notes:** From the DM decision (2026-11-18). Security-relevant (LAN pairing, DM-level data on a phone): propose the pairing and session design to the DM before implementing.

---

## Stage 5 – Editor, vision & spells

### T-140 Walls, doors and secret doors

- **Status:** todo · **Depends on:** T-134 · **Refs:** SPEC 8.1, 3.1, ADR-0012
- Draw walls, windows and doors (open/closed/locked/secret) in the map's sidecar; import them from `.uvtt`/`.dd2vtt`; the DM opens/closes a door with one click; secret doors look like walls to players and become normal doors once discovered (per scene).
- **Acceptance criteria**
  - [ ] Wall/door editor with undo; VTT import fixture (self-made) round-trips walls, doors and lights
  - [ ] An undiscovered secret door is projected as a plain wall or not at all; walls and doors reach the player view only as far as needed for drawing (vision runs on the host) – projection test

### T-141 Automatic walls and room suggestions

- **Status:** todo · **Depends on:** T-140, T-108c · **Refs:** SPEC 8.1
- Generate walls from drawn rooms (outer edges = walls, shared edges = openings); suggest rooms from closed wall regions; suggest walls from image analysis (edges/colours), always reviewed by the DM before they apply. All local.
- **Acceptance criteria**
  - [ ] Two adjacent rooms produce an opening on the shared edge (unit tests in `core`)
  - [ ] Image-analysis suggestions are shown as a preview and applied only after confirmation
- **Notes:** From the DM planning interview (2026-11-18). An image-analysis library (e.g. OpenCV in Rust, already planned for the camera) is a dependency decision; a local AI model was deferred ("later").

### T-142 Dynamic vision with raycasting

- **Status:** todo · **Depends on:** T-140, T-109, T-107 · **Refs:** SPEC 4, ARCHITECTURE §8
- Pure visibility polygon per viewer token against resolved walls and closed doors (asset blockers join in T-144); the TV shows the union of all player tokens' vision; memory fog for visited areas; per-map setting whether movement auto-reveals.
- **Acceptance criteria**
  - [ ] `computeVisibilityPolygon` unit tests incl. pillars, doors opening, collinear and touching walls (≥ 80 %)
  - [ ] Opening a door lets vision through immediately on the TV
  - [ ] Benchmark scene with 20 tokens and vision stays within budget

### T-143 Light model

- **Status:** todo · **Depends on:** T-142 · **Refs:** SPEC 4
- Scene brightness (day / dusk / dark); bright and dim radius per light source (tokens and map); darkvision in greyscale; coloured and flickering light; light stops at walls like vision.
- **Acceptance criteria**
  - [ ] Screenshot tests for each brightness level, dim vs bright, darkvision and a coloured light
  - [ ] Flicker is seeded (deterministic in tests) and stays within the photosensitivity limits (SPEC 10.3, ARCHITECTURE §9), which this task also applies to on-screen light

### T-144 Asset placement and asset blockers

- **Status:** todo · **Depends on:** T-134, T-125, T-142 · **Refs:** SPEC 8.1, 8.2, ADR-0012
- Place assets from the catalog on a scene (scale from metadata, rotate, mirror, z-order); per asset a blocker generated from its alpha channel (simplified polygon), editable, with type: blocks sight and light / one-way / partial (dimmed).
- **Acceptance criteria**
  - [ ] Generated blocker follows the opaque outline within a set tolerance (unit test on a self-made fixture)
  - [ ] Vision treats the three blocker types correctly (unit tests)

### T-145 Scene overrides of global map data

- **Status:** todo · **Depends on:** T-134, T-140 · **Refs:** ADR-0012
- In a scene, hide/show single walls and doors, adjust rooms and switch map lights without changing the global map; orphaned overrides show a hint with a clean-up action.
- **Acceptance criteria**
  - [ ] Override UI per element with "reset to global"
  - [ ] Deleting a wall globally flags the scene's override as orphaned (E2E)

### T-146 Interiors as asset variants

- **Status:** todo · **Depends on:** T-144, T-142 · **Refs:** SPEC 8.1
- Assets with variants (exterior/roof, interior) on the same footprint, each with its own walls, doors and rooms; crossfade between them. Trigger per asset: DM click, token enters, token within a distance – each optionally with DM confirmation. While active, the TV shows the interior to everyone.
- **Acceptance criteria**
  - [ ] Each trigger mode works, with and without confirmation (component/E2E tests)
  - [ ] Interior contents are not sent to the player view before the interior is shown (projection test)

---

## Stage 6 – Campaign & comfort

### T-147 Themed scene transitions

- **Status:** todo · **Depends on:** T-135 (and the sound and effects tasks once they exist) · **Refs:** SPEC 3.2
- Transitions with sound and particles, e.g. door sound and fade when leaving a house, snowflakes blending over from a snowstorm into a cave; chosen per scene change or stored on the scene link.
- **Acceptance criteria**
  - [ ] At least two themed transitions; fail-closed like T-135

### T-148 Share maps and assets as `.dmmap`

- **Status:** todo · **Depends on:** T-134 · **Refs:** ADR-0012, ARCHITECTURE §6.6
- Export a map or asset with its sidecar and variant files as one `.dmmap` bundle; import it into another library (hash check, no overwrite).
- **Acceptance criteria**
  - [ ] Export → import round-trip keeps metadata, walls, rooms and variants
  - [ ] Import validates the sidecar with zod and rejects unsafe paths inside the bundle (zip-slip test)
- **Notes:** A ZIP library is a dependency decision for the DM (Rust `zip` crate vs. alternatives).
