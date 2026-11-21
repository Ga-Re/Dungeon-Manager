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

**Next up, in this order** (DM decision, 2026-11-20: foundations first, so that data and UI are not built on the old `scene.map` model and the fixed layout and moved later): T-119, T-134, T-134c, T-134d, T-134b, T-118d, T-171, T-172a, T-172b, T-172c, T-174, T-223a, T-223b, T-114a, T-114b, T-180a, T-106a, T-106b, T-106c, T-107a, T-107b, T-233, T-111, T-112, T-113. T-105d and T-127 come before T-168. Pick from this list before the file order.

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

- **Status:** done · **Depends on:** T-102b · **Refs:** ARCHITECTURE §5.1
- `DomainEvent`s carry hidden data (exact HP in `hp.changed`, moves of hidden tokens). Add a pure `projectEvents(events, stateAfter, viewer)` in `core` so the session log shown to players and any event broadcast never leak; property tests like the state projection.
- **Acceptance criteria**
  - [x] No event reveals a token, HP number or name that `projectForViewer` hides (property-based tests)
- **Notes:** From the T-102a review; needed before events leave the host (companion, session log on the TV).

### T-118a Current and released levels

- **Status:** done · **Depends on:** T-102b · **Refs:** ARCHITECTURE §5.1, SPEC §2.4, §3.1
- The projection sends the map asset reference and every level (id, name, asset, fog), whatever has been shown; a companion could fetch the whole un-fogged map and read level names like "Geheimgang". The scene gets the level shown on the TV and the levels shown so far (optional field, no schema version bump – DM decision, 2026-11-19); a level once shown stays released for players (DM decision, 2026-11-19).
- **Acceptance criteria**
  - [x] A `level.show` command switches the TV's level and releases it; undo restores the previous level and release
  - [x] Viewer projections and projected events contain no unreleased level (name, fog, tokens); player (companion) projections contain no asset reference to map or level files (property tests)
  - [x] The table view shows the scene's current level (its fog, and its own image when it has one)
- **Notes:** Split from T-118 (DM decision, 2026-11-19): the fog-composited images companions need come with their map view in stage 3 (T-118b). There is no level switcher in the DM window yet (T-118c).

### T-118c Level switcher in the DM window

- **Status:** done · **Depends on:** T-118a · **Refs:** SPEC §3.1, ADR-0011
- DM decision (2026-11-20): the working level and the TV's level are separate; showing is its own command. With more than one level, the DM picks the level to work on (fog, tokens) and shows it on the TV (`level.show`); the browser marks the current and the released levels.
- **Acceptance criteria**
  - [x] Switching the TV's level from the DM window (component + E2E test); hidden while the map has one level
  - [x] Fog tools work on the level the DM has picked, and the DM window shows that level's own image when it has one
- **Notes:** From the T-118a review: showing the level already current still adds an undo step (make it a no-op); a level image is loaded with the map's `kind` (video vs image), so a PNG level on a video map fails to load (fail-closed) – check the file type per level.
- Done in T-118c: both review notes of T-118a (no-op `level.show`, file type per level).

### T-118d Add and rename levels

- **Status:** done · **Depends on:** T-118c, T-134d · **Refs:** SPEC §3.1, ADR-0012
- DM decision (2026-11-20): the DM adds a level (name, optionally its own image or video of the map's size) and renames levels from the "Ebene" group; deleting waits for the sidecar files (T-134), as fog, tokens and released levels refer to level ids. Moved after T-134 (DM, 2026-11-20): levels are added to the map's sidecar, not to `scene.map`.
- **Acceptance criteria**
  - [x] Add a level with or without its own file; a file of another size is refused with an actionable message (component + E2E test)
  - [x] Rename a level; the new name reaches the TV's projection only for released levels
- **Notes:** From T-134b: the open scene's map data is held while it changes on disk; this task's own sidecar writes update the shown data first (`useMapData`), so their watcher echo asks nothing (test). Done: `addLevel`/`renameLevel` in core, `updateMapData` in storage, `editMap` in the session; the "Ebene" group shows for one-level maps too, with add and rename in its menu; the DM works on a new level at once while the TV stays.

### T-119 Case-insensitive id collisions in file names

- **Status:** done · **Depends on:** T-103a · **Refs:** ARCHITECTURE §6, ADR-0005
- Ids allow mixed case (`idSchema`), and scenes are stored as `<id>.json`. On the default macOS/Windows file systems `Scene-1` and `scene-1` are the same file, so saving one overwrites the other.
- **Acceptance criteria**
  - [x] Two entities whose ids differ only in case can never overwrite each other's files (e.g. lowercase ids, or collision check on save)
- **Notes:** From the T-103a review. DM decision (2026-11-20): lowercase ids only. Campaign, scene and session files are version 2; the migration lowercases ids and references and refuses ids that differ only in case. Version 1 names with capitals are found ignoring case and moved to the lowercase name (ARCHITECTURE §6.3).

### T-234 Leftovers of version 1 ids with capitals

- **Status:** todo · **Depends on:** T-119 · **Refs:** ARCHITECTURE §6.3
- From the T-119 review; all only concern hand-edited version 1 files. (1) A document refused with `idCollision` shows the generic "invalid" message: name the two ids so the DM can fix the file. (2) On a case-sensitive file system, `Turm.json` next to `turm.json` lists only the lowercase one; report the other like a conflict copy instead of hiding it. (3) Own notes (`notes/scenes/<id>.md`) of a renamed scene are not found ignoring case on Linux.
- **Acceptance criteria**
  - [ ] Each of the three cases is shown to the DM with an actionable, translated message or handled (storage + component tests)

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
  - [ ] The catalog ignores sidecars (`*.dm.json`) and maps sidecar conflict copies back to their original (`listSidecarConflicts`; from T-134b)
- **Notes:** DM request (2026-11-17). Previews go to `library/.previews/` as ARCHITECTURE §6.5 already plans (shared with the web app and handouts); maps picked but not used (e.g. a cancelled map change) simply stay in the catalog.

### T-125 Asset metadata: scale, name, origin

- **Status:** todo · **Depends on:** T-124, T-106a, T-134b · **Refs:** SPEC 8.2, 3.1, ADR-0012
- Metadata per catalog item so it always fits the map scale: for maps the grid calibration (pixels per cell, offset; filled from T-176/T-177 and reused by every scene with that map), for assets and tokens their footprint in grid cells. Plus display name and origin/license (SPEC 8.2).
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
- The DM window sends the player window the projected scene (`projectForViewer`) via a Tauri event; the player window's only permission is listening to events, and it validates every message with the strict viewer schema. Scale: without a calibration the map is fitted to the TV; on a calibrated TV (T-106a) one grid cell has the size the DM set, centred until the DM pans the TV view (T-106c); the DM rotates the TV view. Fog: opaque except revealed areas (first map level until levels can be switched).
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

### T-106a TV calibration: true cell size on the table

- **Status:** done · **Depends on:** T-105b, T-134b · **Refs:** SPEC 2.2
- Display calibration per display in device settings: the DM enters the diagonal in inches (resolution from the system), checks a 2-inch square on the TV and corrects in percent ("TV kalibrieren …" in the display ribbon group). The cell size on the TV is set in the settings (category "Spieleransicht"), in inches or centimetres, 1 inch by default. A calibrated TV shows one grid cell at that size, centred on the map; without a calibration the whole map fits.
- **Acceptance criteria**
  - [x] On a calibrated display one cell has the set size (unit tests for the math; component tests; manual check: measure the check square and a cell on the TV)
  - [x] Rotation 0/90/180/270 in the player window (already there; the calibrated camera keeps it)
- **Notes:** Split from T-106 (2026-11-20). DM decisions (2026-11-20): diagonal in inches plus check square and fine correction; the DM moves the TV's view (T-106c); grid lines in the DM window always available, on the TV switchable, default off (T-106b); the cell size in inches or cm in the settings. Device storage: `dm.displayCalibration` (per display by name and resolution), `dm.tvCellSize`. The player-view message gets an optional strict `scale: { inchPx, cellInches, checkSquare }`. Workspace interview: the map's grid calibration lives in the Map Forge (T-176/T-177).

### T-106d Calibrate the TV by measuring a check square

- **Status:** done · **Depends on:** T-106a · **Refs:** SPEC 2.2
- DM request (2026-11-20): instead of entering the diagonal, the TV shows a check square (a third of its shorter side) while "TV kalibrieren …" is open; the DM measures one side with a ruler and enters it in cm or inches, and the TV's scale follows at once.
- **Acceptance criteria**
  - [x] The measured side gives the TV's pixels per inch; a length that cannot be right is refused and never sent (unit + component tests)
  - [x] The check square shows only while calibrating, at its exact physical size (component test; manual check on the TV)
- **Notes:** Replaces T-106a's diagonal and fine correction. `dm.displayCalibration` version 2 keeps `{ inchPx }` per display; version 1 entries are converted on reading. The player-view message: `scale: { inchPx, cellInches }` and `checkSquarePx`.

### T-106b Grid lines

- **Status:** done · **Depends on:** T-106a · **Refs:** SPEC 2.2, ADR-0012
- Grid lines from the map's sidecar grid: in the DM window on and off per view; on the TV switchable in the display ribbon, off by default (DM decision, 2026-11-20).
- **Acceptance criteria**
  - [x] Grid lines line up with the map's cells in both views and all rotations (renderer screenshot test)
- **Notes:** The renderer draws the lines (`setGrid`, one device pixel wide at any zoom) between the map and the fog, so hidden areas stay black, lines included. DM window: the dock's grid button, on by default (per view, not stored). TV: "Raster auf dem TV" in the display ribbon group, off by default; the player-view message carries `showGrid: true`. From T-134b: the open scene's map data is held while it changes on disk; this task's own sidecar writes update the shown data first (`useMapData`), so their watcher echo asks nothing (test).

### T-239 No webview context menu in the app's windows

- **Status:** todo · **Depends on:** – · **Refs:** ARCHITECTURE §15
- A right click outside the app's own context menus opens the webview's menu ("Reload", in development also "Inspect Element"), also on the TV where the players see it. Suppress it in the DM and player windows; text fields keep their copy/paste menu; own context menus (tree) stay; in development the inspector stays reachable (e.g. with ⌥ held).
- **Acceptance criteria**
  - [ ] No webview menu on a right click in the DM window outside text fields and on the TV (component/E2E test)
- **Notes:** From the DM (2026-11-20): noticed the "reload"/"inspect element" menu; taken into the list only.

### T-106c Move the TV's view

- **Status:** done · **Depends on:** T-106a · **Refs:** SPEC 2.2
- At true size the map is usually larger than the TV: the DM window shows the TV's view as a frame on the map; the DM drags it where play happens (DM decision, 2026-11-20). The zoom stays at the calibrated size.
- **Acceptance criteria**
  - [x] Dragging the frame moves the TV's view; rotation and calibration are kept (component + E2E test)
- **Notes:** The frame shows on the map of the scene on the TV while a calibrated player view runs (`TvViewContext` from the DM app: the TV's size, pixels per cell, rotation; `viewArea`). It moves by dragging its border (the inside still pans the DM's own view) or by one cell per arrow key, with the pan tool only (fog tools draw there); its centre stays on the map and starts in the middle again for a new map or another scene on the TV. The player-view message carries `viewCenter` in map pixels; the TV centres on the map until the DM moves the view. The centre is per open scene and not stored.

### T-116 Player view render resolution setting

- **Status:** todo · **Depends on:** T-105b · **Refs:** SPEC 2.2, ARCHITECTURE §11
- Device setting for the player view's render resolution: native (e.g. 4K) or Full HD, upscaled to the display. Stored in device settings (OS app-data), not in the library.
- **Acceptance criteria**
  - [ ] Setting in the DM window, applied to the player view without restart
  - [ ] Screenshot test of the player view in both modes
- **Notes:** DM requirement from T-007 (4K Samsung The Frame, should also run in Full HD). The T-007 spike measures both modes.

### T-107a Tokens: create and draw

- **Status:** done · **Depends on:** T-102b, T-106a, T-172a, T-174, T-180a · **Refs:** SPEC 5
- "Token anlegen …" (scene ribbon, group "Token"): name and D&D size; the token appears on the free cell nearest the map's middle, on the level the DM works on, as one undoable step. Drawn in the DM view and on the TV between the grid and the fog.
- **Acceptance criteria**
  - [x] Core `token.add`/`token.remove` with their checks; `nearestFreeCell` (unit tests)
  - [x] Created tokens are drawn, saved and undone; the TV draws the projected ones of its level (component tests; renderer screenshots)
- **Notes:** Split from T-107 (2026-11-21). DM decisions (2026-11-21): until the creature library (T-180) a token is a placeholder – a disc in a colour from its id with its initials and a ring (round tokens). Tiny tokens take the middle half of their cell. Tokens and `token.added`/`token.removed` never reach the players' log.

### T-107b Tokens: select, move, delete, hide

- **Status:** done · **Depends on:** T-107a · **Refs:** SPEC 5
- Select tokens on the map; move them by drag, tap-token-tap-cell, keyboard shortcuts and as a group; snap to cells; delete; invisible in the player view.
- From the T-107a review: the renderer rebuilds every token on any change (fine for creating, too slow while dragging – update tokens in place by id), and the initials are drawn at a fixed resolution (blurry at high zoom in the DM view – follow the zoom or use a bitmap/MSDF font).
- **Acceptance criteria**
  - [x] All move modes covered by component/E2E tests
  - [x] Invisible-in-player-view tokens supported

### T-233 Free movement outside combat, grid in combat

- **Status:** todo · **Depends on:** T-107b · **Refs:** SPEC §2.4, §5
- Each scene has a grid mode: "always on the grid", "free, on the grid in combat" or "always free"; new scenes take the campaign's default. It applies to all tokens (player characters and creatures); holding Alt places a token freely at any time.
- A combat switch in the play ribbon (the Game-Orchestrator once T-171 builds it), independent of the initiative tracker, starts and ends combat. On start, every token on the level snaps (animated) to the nearest free cell in one undoable command: one token per cell (up to four Tiny tokens may share one), a larger token claims its whole footprint, and walls are respected once they exist. During combat, a token dropped on an occupied cell goes to the nearest free one. Ending combat leaves the tokens where they are.
- **Acceptance criteria**
  - [ ] Core: snap-on-combat-start assigns each token a free cell, nearest first, no two tokens share a cell except up to four Tiny ones, large footprints included; one undo restores all positions (unit + property tests)
  - [ ] Free moves outside combat and snapped moves in combat, per grid mode, with Alt override (component tests)
  - [ ] Combat on/off and the snap reach the TV (E2E)
- **Notes:** DM request (2026-11-20). The grid mode belongs to the scene's start state (Atlas), the combat switch to its game state (ADR-0017). Both are new scene fields and a campaign default: schema change reviewed with the DM. DM decision (2026-11-20): up to four Tiny tokens may share a cell, as in 5e. Free positions affect camera tracking (SPEC §5.1): outside combat the detected position is used as is.

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

- **Status:** todo · **Depends on:** T-108b, T-134b · **Refs:** SPEC 4, ADR-0012
- Rooms and areas drawn once per map level (polygons, may overlap) in the map's sidecar, so every scene using the map has them; revealed with one click on the room or from the room list in the scene browser. Rooms can be marked secret.
- **Acceptance criteria**
  - [ ] DM defines rooms on a map; a second scene with the same map shows the same rooms
  - [ ] Hovering a room in fog mode highlights it; a click reveals/hides it as one undo step
  - [ ] Room list with per-room reveal toggle
  - [ ] Room reveals and "reveal all" subtract hidden secret rooms: afterwards `revealed ∩ hiddenSecretRoom = ∅` and no token centred in it is projected (property test, incl. overlapping rooms)
- **Notes:** Format per ADR-0012 (accepted by the DM, 2026-11-18). Open for the DM (from the T-134 review): the agreed room format `{ id, name, area }` has no level, but rooms are drawn per level – an optional `levelId` is additive (no version bump); ask before implementing. Suggesting rooms from walls comes with T-141; reveal by trigger with the trigger zones (stage 5).

### T-109 Memory fog

- **Status:** todo · **Depends on:** T-108a
- Previously revealed areas render dimmed; tokens inside are hidden for players.
- **Acceptance criteria**
  - [ ] Screenshot tests for revealed / remembered / unrevealed

### T-110 Per-element visibility with type defaults

- **Status:** todo · **Depends on:** T-102b, T-107b · **Refs:** SPEC 6
- Visible / hidden / approximate per element; defaults per element type in campaign settings.
- **Acceptance criteria**
  - [ ] Approximate HP rendering ("unhurt / wounded / badly wounded")
  - [ ] Projection tests extended

### T-111 Initiative tracker

- **Status:** todo · **Depends on:** T-102b, T-172a · **Refs:** SPEC 11
- Order, rounds, active turn (highlight on TV), delay/ready, quick entry.
- **Acceptance criteria**
  - [ ] Reducer tests for all initiative commands
  - [ ] Active token highlighted in player window (screenshot)
- **Notes:** From T-102a: removing all combatants resets the tracker (round 0); an explicit "end combat" command, delay/ready and manual reordering belong here (adding a combatant inserts without re-sorting, so manual order is kept).
- Workspace interview (2026-11-20): group rolls and next-turn focus follow in T-213.

### T-112 HP and conditions

- **Status:** todo · **Depends on:** T-111
- HP, temp HP, conditions with round duration; icons and HP bar on tokens respecting visibility.
- **Acceptance criteria**
  - [ ] Conditions expire automatically at the right turn (tests)

### T-113 Blackout button and DM preview of the player view

- **Status:** todo · **Depends on:** T-105b, T-172a
- Instant black/pause image in the player window; small live preview of the player view in the DM window as a panel (T-172a, ARCHITECTURE §15).
- **Acceptance criteria**
  - [ ] Blackout reachable by button and keyboard shortcut; E2E test
  - [ ] The preview shows exactly the projected player view (incl. blackout), never DM-only data; component/E2E test
- **Notes:** Preview placement decided by the DM (2026-11-18, PR #27).
- Workspace interview (2026-11-20): the pause/title screen and its setting are T-175.

### T-133 Player-view preview on an additional DM monitor

- **Status:** todo · **Depends on:** T-113 · **Refs:** SPEC 2.1, ARCHITECTURE §8, §15
- Open the player-view preview as its own window on a chosen display (windowed or fullscreen), for a better overview on an additional DM monitor.
- **Acceptance criteria**
  - [ ] DM chooses the display and opens/closes the window; the choice is remembered
  - [ ] The window receives only `PlayerViewMessage` output, has the player window's permissions and fails closed; E2E test
  - [ ] Benchmark scene (ARCHITECTURE §11) with TV + DM monitor + DM window open stays within budget, measured on the reference notebook
- **Notes:** Requested by the DM (2026-11-18). A third renderer decoding the same 4K video costs GPU time; if the budget is missed, render the monitor window at reduced resolution or frame rate. Open: should it follow the TV's rotation or stay upright for the DM?

### T-114a Restore the scene tabs; the TV stays dark after a crash

- **Status:** done · **Depends on:** T-103b, T-102b, T-174, T-223a
- Scenes already save every change at once and atomically. The next start opens the campaign's scene tabs again (order, shown tab); after a clean end the TV's scene goes back on the TV, after a crash or kill the TV stays dark until the DM sends a scene (DM decision, 2026-11-20).
- **Acceptance criteria**
  - [x] Killing the app mid-session brings back the open tabs, with the TV dark (E2E test with a forced kill: the device storage as at the kill, nothing run on the way out)
- **Notes:** Split from T-114 (2026-11-20). The tabs are kept per campaign with the recent campaigns (device storage, additive fields). A marker in device storage (`dm.sessionRunning`) is set at start and removed on `pagehide`/`beforeunload`; still set at the next start means the session was killed. If a platform does not fire those events on closing, every start counts as after a crash – the TV then just stays dark, the safe side.

### T-238 Tell a clean end from a crash in the Tauri app

- **Status:** done · **Depends on:** T-114a · **Refs:** T-114a
- The DM confirmed (2026-11-21): in the Tauri app every start counted as after a crash (the webview fires no `pagehide`/`beforeunload` on closing), so the TV stayed dark until "Szene auf den TV". DM decision (2026-11-21): the desktop backend keeps the marker.
- **Acceptance criteria**
  - [x] The backend creates a marker file in the OS app-data directory at start and removes it on exit (closing the DM window, Cmd+Q); the DM window asks `session_previous_crashed` (Rust unit tests, adapter test)
  - [ ] Manual check by the DM: close the app, start it again – the TV's scene comes back on the TV; after a forced quit it stays dark
- **Notes:** A new command for the DM window only (`allow-session-previous-crashed` in `capabilities/dm.json`), carrying no library data. If the backend cannot answer, the start counts as after a crash (TV dark). The E2E harness, without a backend, keeps T-114a's marker in device storage.

### T-114b Rescue copy when a save fails

- **Status:** done · **Depends on:** T-114a · **Refs:** ARCHITECTURE §5
- A change whose save fails (e.g. the cloud folder is unreachable) is kept as a rescue copy outside the library – in the app's data folder, never synced – and offered on the next start (DM decision, 2026-11-20).
- **Acceptance criteria**
  - [x] A scene whose save failed is offered for recovery after a forced kill; taking it writes it to the library, discarding drops the copy (component + E2E test)
- **Notes:** Split from T-114 (2026-11-20). Kept in the webview's storage (`dm.rescueCopies`, versioned; the app's data folder, never synced, no new Tauri permission), described in ARCHITECTURE §6. The offer shows in the map's notices when the campaign opens. A later successful save drops only a copy kept in the same session; one from an earlier session stays until the DM restores or discards it, or deletes the scene. Copies are migrated like scene files, so an update keeps them. With document tabs every kind of document uses it (T-176, T-180).

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
- ADR-0017 (Proposed): the browser becomes the open document's object tree and the campaign tree moves into the Campaign Atlas (T-173).

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
- Nebel & Animation joined with T-136a; Spieleransicht has no settings yet and joins with the player-view settings.

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

- **Status:** done · **Depends on:** T-156 · **Refs:** ADR-0011, `packages/ui/src/Menu.tsx`
- From the T-156 review: the workspace menu is announced with the button's text ("Game Mode") instead of "Arbeitsbereich", and the current workspace is not marked in it.
- **Acceptance criteria**
  - [x] `Menu` takes a separate accessible name for the open menu and checkable items (`menuitemradio` with `aria-checked`, a visible check)
  - [x] The workspace selector uses both; component tests

### T-136a Soft fog edges

- **Status:** done · **Depends on:** T-108b, T-155 · **Refs:** SPEC 4, ARCHITECTURE §8, §11
- Split from T-136 (DM decision, 2026-11-19): soft edges first, fades in T-136b.
- The fog has soft edges (DM request, 2026-11-19: no hard edges, no hard pop). A **soft edges** switch in the settings dialog (T-155) under "Nebel & Animation", stored **per device** like the theme (no file format change); on by default.
- **Acceptance criteria**
  - [x] Soft edges never reveal more than the hard polygon (fail-closed: the softening lies inside the revealed area; pixel test and screenshot)
  - [x] Switch off = current hard behaviour; the setting applies in the DM and the player window at once
  - [x] The soft mask is computed once per fog change, not per frame (ARCHITECTURE §11; the benchmark on the reference notebook is run by the DM)
- **Implementation hint:** if a real-time blur misses the budget, use a precomputed soft mask.
- **Notes:** From the DM planning interview (2026-11-18).

### T-165 Free the fog's GPU geometry on rebuild

- **Status:** done · **Depends on:** T-136a · **Refs:** ARCHITECTURE §8, §11
- From the T-136a review: `Graphics.destroy(options)` with an options object does not destroy the owned `GraphicsContext`, so the hard fog's geometry probably stays in PixiJS's context system after each rebuild (pre-existing; fog now rebuilds also on map changes). `context: true` together with `texture: true` would destroy `Texture.WHITE`, so it needs care.
- **Acceptance criteria**
  - [x] Rebuilding the fog many times does not grow GPU/context memory (test against PixiJS's context system or a long-run measurement) – every discarded fog layer frees its graphics contexts (test with real PixiJS objects)
  - [x] Shared textures (`Texture.WHITE`) survive

### T-136b Soft fog fades

- **Status:** done · **Depends on:** T-136a · **Refs:** SPEC 4, ARCHITECTURE §8, §11
- Fog changes fade in/out instead of popping. A **transition duration** slider 0–3 s (0 = off, default ~0.65 s ease-out) in "Nebel & Animation", per device. Moved ahead of T-109; memory fog gets its fade when it arrives.
- DM decision (2026-11-19): hiding fades too (the area stays visible on the TV for the fade's duration, fading out); the first fog of a scene and a new map never fade (fail-closed).
- **Acceptance criteria**
  - [x] Fades for manual reveals/hides and room reveals; duration 0 = current hard behaviour
  - [x] A pixel that is fogged before and after a change never shows the map during the fade
  - [ ] With the effect on, the benchmark scene stays within ARCHITECTURE §11 (≤ 1 % missed refreshes at 60 Hz), measured by the DM on the reference notebook
- **Notes:** The benchmark criterion stays open until the DM has measured it on the reference notebook (it needs the TV; CI has no usable GPU).

### T-170 Rounded fog rectangles and a brush outline

- **Status:** done · **Depends on:** T-131 · **Refs:** SPEC §4, ADR-0011
- The rectangle tool marks a rectangle with slightly rounded corners (a quarter grid cell, like the soft fog edge; at most half its shorter side), in the preview too. The brush shows its outline at the pointer – while hovering over the map and while painting – at the size it paints (DM request, 2026-11-19).
- **Acceptance criteria**
  - [x] The rectangle's area and preview have rounded corners; the area also with the view turned (unit + component tests; the preview is drawn in screen space)
  - [x] The brush outline follows the pointer at the brush's size and goes when the pointer leaves the map (component test)

### T-169 Flaky focus check in the welcome dialog test

- **Status:** done · **Depends on:** T-153 · **Refs:** ARCHITECTURE §12
- `WelcomeDialog.test.tsx` checks the first focus synchronously (`document.activeElement` right after the dialog shows) and failed once in a full `pnpm check` run (T-118a review); wait for the focus as the T-164 fix did elsewhere.
- **Acceptance criteria**
  - [x] The focus assertions wait for the focus; the file passes 20 runs in a row
- **Notes:** It failed main's CI after #81 (run #214, 2026-11-20), so it was pulled forward.

### T-167 Fog spreads from the revealed edge

- **Status:** done · **Depends on:** T-136b · **Refs:** SPEC §4, ARCHITECTURE §8, §11
- Replaces the cross-fade of T-136b (DM decision, 2026-11-19). A reveal that touches already revealed area spreads from that edge across the new area; one that touches none clears from its centre outward. Hiding spreads from the fog side back over the area. The duration setting of T-136b sets the speed.
- **Acceptance criteria**
  - [x] Spread direction for the three cases (adjacent reveal, isolated reveal, hide) covered by unit tests of a pure distance-field function and by renderer screenshot tests
  - [x] Fail-closed as in T-136b: a pixel fogged before and after a change never shows the map; the first fog of a scene and a new map never animate
  - [ ] With the effect on, the benchmark scene stays within ARCHITECTURE §11
- **Notes:** From the DM (2026-11-19).
- The benchmark criterion stays open until the DM has measured it on the reference notebook (as for T-136b). The spread order costs about 5 ms per change on a 256² grid (Node), once per change; a change during a running spread also mixes the current state at mask size (up to 1024²) once. From the T-167 review: a pixel test for a change during a running spread would pin down that path (it is safe by construction: the hard fog over every revealed state stays underneath).

### T-130d App menu: macOS menu bar, Windows menu button

- **Status:** done · **Depends on:** T-130c · **Refs:** ARCHITECTURE §15, ADR-0011
- **New campaign** (and later more app commands such as the welcome dialog of T-153) on macOS from the native menu bar (Tauri menu, e.g. "Ablage → Neue Kampagne"); on Windows from a menu button in the title bar (DM decision, 2026-11-19).
- **Acceptance criteria**
  - [x] Native macOS menu command reaches the DM window – DM-approved deviation (2026-11-19): a test against a mocked Tauri menu module plus a manual check on macOS, as the menu is built in the DM window (translated labels) and the smoke test cannot run on macOS
  - [x] Windows menu button covered by a component test; menu labels translated
- **Notes:** From the T-130c review: context menus and popovers opened at a point are not yet kept inside the viewport (a low tree item with Shift+F10 can push the new-scene form off-screen) – clamp them when the menus are built here.
- Done in T-130d: context menus and popovers opened at a point are clamped to the viewport. Menu commands close open dialogs first (the native menu bar works while a modal is open).

### T-166 Keep popovers inside the window when they grow

- **Status:** done · **Depends on:** T-130d · **Refs:** ADR-0011, `packages/ui/src/viewport.ts`
- From the T-130d review: the viewport clamp runs once per opening point. A popover that grows while open (e.g. a form's error message near the bottom) or a window resized while it is open can still leave the window.
- **Acceptance criteria**
  - [x] Re-clamp on content size changes (`ResizeObserver`, where available) and on window resize; component tests

### T-152 Sub-scenes

- **Status:** done · **Depends on:** T-130c · **Refs:** SPEC 2.1, ARCHITECTURE §6
- A scene can have sub-scenes (e.g. "Krypta › Geheimkammer"), created by right-clicking a scene in the scene browser and shown nested under it.
- **Acceptance criteria**
  - [x] Scene schema gains an optional parent scene reference, with a migration and schema tests – DM decision: additive optional `parentSceneId`, no version bump, so no migration is needed (like the `notes` list of T-161a)
  - [x] Browser shows sub-scenes nested; deleting a scene with sub-scenes asks what happens to them
- **Notes:** DM request (2026-11-19). File format change: propose the schema field, migration and delete behaviour to the DM before implementing.
- DM decisions (2026-11-19): optional `parentSceneId` in the scene file, no version bump; a sub-scene is its own scene (own map, fog, tokens); any depth (a missing parent or a loop makes it top-level); deleting asks – keep (preselected, one level up) or delete too (into the trash).
- Not in this task: moving an existing scene under another one (only new sub-scenes); a later task if needed.

### T-131 Fog tools in the ribbon and navigation dock

- **Status:** done · **Depends on:** T-130c · **Refs:** ARCHITECTURE §15, ADR-0011
- Move `FogToolbar` into the ribbon's fog mode (tool groups with captions, active tool highlighted); bottom-centre dock with zoom and fit-to-screen for the DM view, the player-view rotation (SPEC 2.2) and player-feed status.
- **Acceptance criteria**
  - [x] All fog tools reachable from the ribbon, with keyboard shortcuts as before
  - [x] Zoom/fit change the DM view transform, rotation turns the player view; component and E2E tests
  - [x] No regression on the benchmark scene (ARCHITECTURE §11) – the renderer is unchanged; only DOM controls moved
- **Notes:** From ADR-0011. Left over from T-130 review: at 1280 px the open data panel covers the left end of today's map dock, and `.dm-notices` sits at a fixed offset above it – lay both out with the new dock; display status (`role="status"`) moves out of the hidden Anzeige tab into the dock. Found in T-156: the ribbon's height differs per tab and workspace (about 65–142 px at 1280 px; Nebel wraps the most), so the map below moves when switching – give the ribbon one height as in Fusion 360 when the fog tools become ribbon groups.
- Done in T-131: the fog tools are ribbon groups (Werkzeug, Form, Ganze Karte); the dock holds zoom, fit and rotation of the DM view, the TV rotation and the player-view status; notices stack above it; the ribbon has one height (tabs row and panel fixed, tools never wrap). The TV rotation and player-feed status appear only with a player feed (not in the E2E harness).

### T-134 Sidecar schema and resolved map in core

- **Status:** done · **Depends on:** T-103b · **Refs:** ADR-0012, ARCHITECTURE §5.2, §6, §8
- Versioned zod schema for `<file>.dm.json` (metadata, scale, levels, rooms; walls/doors/lights/blockers/variants reserved for stage 5, all with stable ids) and scene overrides by element id; pure `resolveMap` in `core` with orphan detection; `SessionState` carries the resolved map. The scene file format does not change yet: the DM window resolves the map the scene still embeds.
- **Acceptance criteria**
  - [x] Sidecar schema (version 1) with grid, levels (archivable), rooms and unique element ids; overrides schema (schema tests)
  - [x] `resolveMap` applies overrides and reports orphaned ones; a missing sidecar yields defaults (unit tests ≥ 80 %)
  - [x] A level still used by scenes cannot be deleted, only archived; fog, tokens and released levels stay resolvable (`removeLevel`, unit tests)
  - [x] `SessionState` carries the resolved map, `projectForViewer` takes it as input, and the existing projection property tests still pass
- **Notes:** From the DM planning interview (2026-11-18). ADR-0012 accepted by the DM (2026-11-18), incl. "global edits reach the live scene only after confirmation". Format agreed with the DM (2026-11-20). Split 2026-11-20 into T-134 (core), T-134c (storage and migration), T-134d (DM window) and T-134b (live-scene confirmation and catalog). Tasks that depend on "T-134" need all four parts.

### T-134c Sidecar storage

- **Status:** done · **Depends on:** T-134 · **Refs:** ADR-0012, ARCHITECTURE §6
- Storage reads and writes sidecars atomically, incl. placeholders and conflict copies; the watcher reports sidecars apart from the files they describe; the rule for moving a version 2 scene's grid and levels into its map's sidecar (`adoptLegacyMap`).
- **Acceptance criteria**
  - [x] A missing sidecar is reported as missing (the caller uses defaults); a placeholder or broken one is reported, never thrown; an invalid one is never written (storage tests)
  - [x] Conflict copies of sidecars are found next to them; the watcher classifies sidecars (`sidecarFile`)
  - [x] The first scene of a map seeds its sidecar; later scenes fit or differ (unit tests)
  - [x] Sidecars are never served to companions or the player window: `dmlib` keeps refusing `*.dm.json` (Rust regression test)
- **Notes:** Split from T-134 (2026-11-20). The scene format change moved to T-134d, so it lands together with the DM window that reads it.

### T-134d Scene schema v3; the DM window plays the resolved map

- **Status:** done · **Depends on:** T-134c · **Refs:** ADR-0012, ARCHITECTURE §6, §8
- Scene schema v3: the scene's map becomes `{ kind, asset, overrides }`; grid and levels move to the map's sidecar. The DM window loads the sidecar with the scene and works on `resolveMap`'s result (levels, grid, rendering, TV); `embeddedMap` is gone; new maps and map changes write the sidecar; a sidecar that is not available, a scene playing its own copy (`legacyMap`) and orphaned overrides show a hint to the DM.
- **Acceptance criteria**
  - [x] Scene schema v3: migration `map → { kind, asset, overrides, legacyMap }`; opening a scene seeds a missing sidecar from `legacyMap` (`settleLegacyMap`); differing grids/levels of several scenes keep `legacyMap` with a DM hint (tests with real v2 fixtures; schema, storage and component tests)
  - [x] A missing sidecar yields defaults (one level with the fixed id `level-1`); the first write creates it – today a new scene's map and a map change (`ensureMapData`), later the map edits of T-176/T-118d
  - [x] Only a missing sidecar is seeded; a placeholder or broken one is never overwritten, and its map is not shown (tests)
  - [x] Opening, playing and the TV use the resolved map (component + E2E tests)
- **Notes:** Split from T-134 (2026-11-20). Undo restores scenes only and plays them on the current map data (`useSceneSession`). From the review: a missing sidecar counts as not available (not as defaults) while the scene refers to levels other than `level-1`, as it has most likely not synced yet. The details panel shows grid and levels for the open scene only (they belong to the map). ADR-0012 still names scene version 2 and `map → { asset, overrides }`: it is version 3 (T-119 took version 2) and keeps `kind` – a dated note for the DM to add, as accepted ADRs are not edited by the agent. Adopting or discarding a differing `legacyMap` follows in T-235. "Reset grid" in the map change now applies to a new map without data of its own; a map's calibration is never reset by a scene (ADR-0012) – T-121 revisits the map change.

### T-235 Adopt or discard a scene's own map copy

- **Status:** todo · **Depends on:** T-134d · **Refs:** ADR-0012
- A version 2 scene whose grid or levels differ from its map's sidecar keeps them as `legacyMap` and shows a hint (T-134d). The DM adopts them (they become the map's data for every scene, after confirming) or discards them (the scene uses the map's data).
- **Acceptance criteria**
  - [ ] Both choices from the hint, with a confirmation before a global change; the scene then has no `legacyMap` (component test)
- **Notes:** From T-134d (2026-11-20). Only for libraries with several scenes of the same map from before scene version 3.

### T-134b Sidecars: live-scene confirmation

- **Status:** done · **Depends on:** T-134d · **Refs:** ADR-0012
- A global edit (e.g. a recalibration on another device) reaches the scene live on the TV only after the DM confirms.
- **Acceptance criteria**
  - [x] A global edit to the map of the scene live on the TV is applied there only after DM confirmation (hint in the DM window); other scenes pick it up on open (component test)
- **Notes:** Split from T-134 (2026-11-20). The open scene is the one on the TV, so a change of its map's sidecar on disk waits for "Änderung übernehmen"; unchanged reloads (our own writes coming back from the watcher) ask nothing. The DM's own map edits in the open scene (T-118d, T-176) must update the shown data before writing the sidecar (e.g. an `applyOwnEdit` on `useMapData`), or their watcher echo would be held – noted there. A sidecar that cannot be read for a moment keeps what is shown. The catalog part moved to T-124, which builds the catalog.

### T-168 Animated fog effects per map

- **Status:** todo · **Depends on:** T-134b, T-136a, T-160a, T-105d, T-127 · **Refs:** SPEC §4, ARCHITECTURE §8, §11
- The fog of a map can carry an animated effect: drifting mist, snow flurry, smoke and ash, darkness (first set – DM decision, 2026-11-19). Set on the map (sidecar, T-134) and adjustable during a session (session override); shown on the TV, previewed in the DM window. GPU shaders, no per-frame CPU work.
- **Acceptance criteria**
  - [ ] Effect and strength stored in the map sidecar and overridable per session (schema + storage tests)
  - [ ] The effect animates only over fogged area and never makes fog transparent (screenshot tests)
  - [ ] The benchmark scene with each effect stays within ARCHITECTURE §11
- **Notes:** From the DM (2026-11-19).

### T-135 Selectable scene transitions

- **Status:** todo · **Depends on:** T-105b · **Refs:** SPEC 3.2, ARCHITECTURE §8, ADR-0010
- When switching the TV to another scene, the DM chooses crossfade (default), through black or instant; duration in the settings.
- **Acceptance criteria**
  - [ ] All three transitions work for image and video maps
  - [ ] Fail-closed for both scenes: each is drawn only with its own fog set (screenshot/E2E test mid-transition)
  - [ ] Benchmark incl. a video-to-video crossfade stays within ARCHITECTURE §11 (≤ 1 % missed refreshes); a crossfade between two videos needs a second `<video>` element under the canvas (extends ADR-0010's single slot)
- **Notes:** From the DM planning interview (2026-11-18). Themed transitions are T-147.

### T-171 Five workspaces: names and Tokens & Kreaturen

- **Status:** done · **Depends on:** T-156 · **Refs:** ADR-0017, SPEC §2.5
- Rename Asset Studio → Asset Vault and Game Mode → Game-Orchestrator, add Tokens & Kreaturen; order: Map Forge, Asset Vault, Tokens & Kreaturen, Campaign Atlas, Game-Orchestrator.
- **Acceptance criteria**
  - [x] The selector lists the five workspaces with translated names; a remembered workspace of the old ids still opens (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-172a Panel frame: dockable panels in the DM window

- **Status:** done · **Depends on:** T-171 · **Refs:** ADR-0017, ADR-0014, ARCHITECTURE §15
- The fixed zones below the ribbon become dockview panels: Daten (data panel), Karte (the map), Browser and Eigenschaften. They can be resized, moved and docked to the edges or each other with the mouse, and shown or hidden from the View menu (macOS menu bar; "Menü" button elsewhere; Cmd/Ctrl+B for Daten). Default layout (DM decision, 2026-11-20): Daten left, the map in the middle, Browser over Eigenschaften in a column on the right. The layout is stored per device and restored on start; "Layout zurücksetzen" restores the default. Panel contents keep their state while hidden or moved (the slots are stable elements the panels adopt).
- **Acceptance criteria**
  - [x] Resize, move, dock and hide panels with the mouse and from the View menu; the layout survives a restart; a broken stored layout falls back to the default (component + E2E tests)
  - [x] "Layout zurücksetzen" restores the default
  - [x] Hiding and showing a panel keeps its content's state (e.g. the map stays loaded)
  - [x] DM-window screenshots of the default layout
- **Notes:** Split of T-172 (DM, 2026-11-20). Dependency `dockview` (MIT, free edition) approved by the DM (2026-11-20). Keyboard docking and auto-hide are dockview-enterprise modules; the DM chose own commands instead (T-172b). React bindings come from `dockview-react` (same project, MIT, depends only on `dockview`). The floating tool windows (`HudPanel`, T-158/T-159) are gone: Browser and Eigenschaften are panels.

### T-172b Panels by keyboard and folding

- **Status:** done · **Depends on:** T-172a · **Refs:** ADR-0017
- Every panel has a menu and keyboard commands: dock left/right/bottom, float, fold to its title, hide (DM decision, 2026-11-20: own commands on the free dockview API, no enterprise modules).
- **Acceptance criteria**
  - [x] Move, dock, fold and hide panels with the keyboard only (E2E test); the commands are announced to screen readers
- **Notes:** The menu sits in each group's header ("Panel Karte"); docking goes to the window's edge, folding only where a neighbour above or below takes the room. The tab's ✕ hides like the View menu (the map gets the room); own tab markup, as dockview's React tab names its ✕ in English. Announcements go through one German status line; dockview's open/close messages are held back while a command rebuilds a panel. From the review: a folded panel stays folded after a restart (read from the stored grid: a group in a column lower than dockview's minimum) and when the window grows; it unfolds once alone in its column. Menus and popovers inside a floating panel (a transformed container) open at their button. Follow-ups in T-236.

### T-236 Panel details left from T-172b

- **Status:** todo · **Depends on:** T-172b · **Refs:** ADR-0017, ADR-0014
- Small gaps the T-172b review found that do not block keyboard docking.
- **Acceptance criteria**
  - [ ] Docking the map to an edge gives it the room the side panels leave, not an equal share (dockview hands freed room to the neighbour, so the side widths must be set in order) (unit test)
  - [ ] Delete/Backspace on a focused tab and a middle click on a tab hide the panel the way its ✕ does (width kept, focus to the title bar), or are switched off (E2E test)
- **Notes:** From the T-172b review (2026-11-20). dockview's tab list closes a panel on Delete/Backspace itself; our own tab dropped its middle click.

### T-172c Named layouts

- **Status:** done · **Depends on:** T-172a · **Refs:** ADR-0017
- The DM saves the current layout under a name ("Kampf", "Erkundung"), per workspace and device, and switches between them from the View menu.
- **Acceptance criteria**
  - [x] Save, switch, rename and delete named layouts per workspace; they survive a restart (component + E2E tests)
- **Notes:** The View menu lists the workspace's layouts ("Layout „Kampf“") and "Layout speichern …" (a dialog); settings › Panels saves, applies, renames and deletes them. Saving under a taken name (ignoring case) replaces that layout; renaming onto one is refused. Stored in `dm.layouts` (device storage, not a campaign file). Until T-172d every workspace shows the same panels, so a layout saved in one workspace fits all of them; they are still kept apart.

### T-172d Default layouts of the other workspaces

- **Status:** todo · **Depends on:** T-172a, T-176 · **Refs:** ADR-0017, SPEC §2.5
- Each workspace gets its own default layout and stored layout once it has its own panels (e.g. the Atlas's five zones with T-181, Map Forge with T-176).
- **Acceptance criteria**
  - [ ] A DM-window screenshot per workspace's default layout

### T-173 Browser as the open document's object tree; campaign explorer in the Atlas

- **Status:** todo · **Depends on:** T-172a · **Refs:** ADR-0017, T-158
- The browser lists the objects of the open document (map, levels, fog; later masks, rooms, props, tokens), like layers. Today's campaign tree (sessions, scenes, notes, sub-scenes, context menus) moves into the Campaign Atlas data panel as the campaign explorer.
- **Acceptance criteria**
  - [ ] Browser shows the open scene's objects and only where a document is open
  - [ ] The campaign explorer keeps every function of today's tree (E2E tests moved, screenshots regenerated)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-174 Undo per document; tools reset when leaving the Orchestrator

- **Status:** done · **Depends on:** T-172a · **Refs:** ADR-0017, ARCHITECTURE §5.1
- Each open document (map, asset, creature, scene) has its own undo history; Cmd/Ctrl+Z acts on the active workspace's document. Leaving the Orchestrator drops the fog tool back to panning (from the T-156 review).
- **Acceptance criteria**
  - [x] Undo in one workspace never changes another workspace's document (component test)
  - [x] Leaving the Orchestrator with an active fog tool leaves panning active
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017). DM decision (2026-11-20): snapshots per document (today's scene history, made generic as `History<T>` with `record`), kept until the document closes or the app quits, never stored. The shell provides the active workspace (`useActiveWorkspace`); the scene – the only document so far – answers undo keys and title bar buttons only in the Game-Orchestrator. Maps, assets and creatures use the same history when they become documents (T-176, T-180).

### T-175 Pause and title screen for the TV, with a setting

- **Status:** todo · **Depends on:** T-105b, T-155, T-172a · **Refs:** SPEC §2.2, §2.5, ADR-0017
- A pause/title image (self-made default) on the TV from a button in the Orchestrator. Setting "TV outside the Orchestrator": pause only on the button, always pause, or pause only in the editing workspaces (Map Forge, Asset Vault, Tokens & Kreaturen).
- **Acceptance criteria**
  - [ ] The pause screen hides the scene completely and fail-closed (screenshot + E2E test)
  - [ ] The setting changes what a workspace switch does to the TV (E2E test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017). The DM left the default open; the agent assumes "only on the button" until the DM decides. Belongs together with the blackout of T-113.

### T-182 Game-Orchestrator: scene bar and group overview

- **Status:** todo · **Depends on:** T-172a, T-174, T-175, T-111, T-112 · **Refs:** SPEC §2.5, §13.2
- A scene bar with the session's scenes; the next scene can be prepared quickly (fog) without touching the TV and then switched live. A group overview shows all player characters with HP, conditions and concentration. Default layout: the map large, initiative, group, dice and the inspector as small panels the DM shows or hides from the View menu and docks where they like (T-172); the dock holds zoom, TV preview, pause and blackout.
- **Acceptance criteria**
  - [ ] Preparing the next scene never changes the TV (E2E test)
  - [ ] The group overview follows HP and condition changes (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017). DM decision: the first workspace to fill after the shared frame (T-171–T-175).

### T-223a Scene tabs; the TV only on command

- **Status:** done · **Depends on:** T-172a, T-174 · **Refs:** ADR-0017, ADR-0011
- Several scenes open at once as tabs in the title bar; each keeps its edits and undo history (T-174). Switching tabs never changes the TV: "Szene auf den TV" (ribbon, Szene) puts the shown scene there, and its tab carries a TV mark.
- **Acceptance criteria**
  - [x] Open, switch and close scene tabs by mouse and keyboard (component + E2E test)
  - [x] Switching tabs leaves the TV on its scene; closing the TV's scene leaves the TV dark (component test)
- **Notes:** Split from T-223 (2026-11-20). DM decisions (2026-11-20): the TV changes only on command, never by switching tabs; only scenes are tabs for now – the tab bar takes other documents with T-176, T-180 and T-181. Opening a scene while none is on the TV puts it there, as before tabs (the last scene reopens on start). Open scenes stay mounted with their session; only the shown one renders its map, ribbon and title bar part and answers the keys. Notes cannot be linked to any open scene (its saves would overwrite the link).

### T-223b Unsaved-changes dot and closing a tab

- **Status:** done · **Depends on:** T-223a · **Refs:** ADR-0017
- Each tab shows a dot while its document has a save pending or failed (DM decision, 2026-11-20: documents keep saving every change).
- **Acceptance criteria**
  - [x] The dot shows while a save is pending or failed, on every tab (component test)
  - [x] Closing a tab whose last save failed asks first; nothing else asks (component + E2E test)
- **Notes:** Split from T-223 (2026-11-20). Each open scene reports its save state to the tab bar; the dot is spoken as "(speichert)" or "(nicht gespeichert)". The question ("Offen lassen" / "Trotzdem schließen") belongs to the tab bar; focus returns to the ✕. The E2E harness fails scene saves with `?failSaves`.

### T-237 Closing a tab while its save is still running

- **Status:** todo · **Depends on:** T-223b · **Refs:** ADR-0017
- A tab closed while its save is pending closes at once (DM decision for T-223b: only a failed save asks). If that write fails after the tab closed, the changes are lost with only a log entry.
- **Acceptance criteria**
  - [ ] Closing waits for a pending save and asks only if it fails; nothing is lost silently (component + E2E test)
- **Notes:** From the T-223b review (2026-11-20). Proposal for the DM before building: wait for the write (usually milliseconds) instead of closing at once – this keeps "asks only after a failed save".

### T-176 Map Forge: open and edit library maps

- **Status:** todo · **Depends on:** T-124, T-134b, T-172a · **Refs:** SPEC §2.5, §8, ADR-0012, ADR-0017
- The Map Forge opens a map from the library (data panel) as its document, without a scene. Ribbon tabs for the map's data; the browser lists levels, rooms, masks and props. First content: map metadata (name, cell size, ambient sound, transition, fog effect) in the sidecar.
- **Acceptance criteria**
  - [ ] The map library is organised in folders (an imported pack keeps its structure) and tags, with search
  - [ ] Open a library map and edit its metadata; saved in its sidecar (component + E2E test)
  - [ ] An edit reaches a scene live on the TV only after the DM confirms (ADR-0012)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).
- Deepening (DM interview, 2026-11-20): the first stage of the Map Forge is import and management (folders + tags), metadata, the 3×3 calibration (T-177), adding levels (T-118d), crop and image adjustment (T-192) and rooms for the fog (T-108c); walls and vision follow in stage 5.

### T-177 Two-click grid calibration with a 3×3 box

- **Status:** todo · **Depends on:** T-176, T-106a · **Refs:** SPEC §2.2, §2.5
- In the Map Forge the DM drags a box over 3×3 cells of the map's printed grid; cell size and offset follow, so every map shows the same cell size on the TV.
- **Acceptance criteria**
  - [ ] Cell size and offset from a dragged 3×3 box, also on a turned view (unit tests for the math)
  - [ ] Without a printed grid, an overlay grid can be laid over the map
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-192 Crop, rotation and image adjustment of maps

- **Status:** todo · **Depends on:** T-176 · **Refs:** SPEC §2.5
- Non-destructive crop, rotation and brightness/contrast/hue per map, so dark or glaring maps read well on the TV.
- **Acceptance criteria**
  - [ ] The original file stays untouched; settings live in the sidecar
  - [ ] Same look on the TV and in the DM window (screenshot test)
- **Notes:** Moved to stage 1 by the DM (2026-11-20, first stage of the Map Forge). From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-178 Asset Vault: library, metadata and search

- **Status:** todo · **Depends on:** T-124, T-125, T-126, T-172a · **Refs:** SPEC §2.5, §8.2, ADR-0017
- The Asset Vault opens assets from the library: props, map pieces (tiles, terrain textures), handout images and sounds. Metadata combines fixed fields (type, environment/theme, origin/licence), free tags and fields the DM defines (T-232); search, collections, favourites and recently used. Each asset's size is set in grid cells (e.g. 2×1); a preview on a 5-ft grid shows it.
- **Acceptance criteria**
  - [ ] Find assets by theme, type and tags; collections and favourites persist (component + E2E test)
  - [ ] The grid preview shows an asset at its calibrated size
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-179 Duplicate detection on import

- **Status:** todo · **Depends on:** T-124 · **Refs:** SPEC §8.2
- Importing a file the library already has (same hash) keeps one file and tells the DM where it is.
- **Acceptance criteria**
  - [ ] A second import of the same file adds no copy (storage test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-231 Asset pack import with folder choice

- **Status:** todo · **Depends on:** T-124, T-178 · **Refs:** SPEC §2.5, §8.2
- Import a large pack (e.g. thousands of files): choose its subfolders; only those are copied into the library, keeping their folder structure as categories. Licensed packs stay in the DM's library, never in the repository.
- **Acceptance criteria**
  - [ ] Only the chosen subfolders are copied; the structure becomes folders/categories (storage test)
  - [ ] A large import shows progress and can be cancelled without leaving half-copied files
- **Notes:** From the workspace deepening with the DM (2026-11-20).

### T-180a Creature schema and token reference

- **Status:** done · **Depends on:** T-134 · **Refs:** SPEC §5, §2.5
- The zod schema for global creatures (5e core, own fields, size with grid footprint and pivot, senses, look) and how a token refers to its creature, so that T-107 builds tokens on it and no token data has to be migrated later. Per-session state (HP, conditions) stays in the scene.
- **Acceptance criteria**
  - [x] Creature schema with storage round trip and migration hook (schema + storage tests ≥ 80 %)
  - [x] Tokens refer to a creature by id; a missing creature shows a placeholder token (resolved by `resolveTokenCreature`; T-107 draws it)
  - [x] The grid footprint covers T-233's rule: one token per cell, up to four Tiny ones share a cell
- **Notes:** Review follow-ups for later tasks: T-180 keeps ids unique when saving (an id from another folder is refused; moving = write the new file, then delete the old one) and reports `skippedFolders` (names that do not work on every OS) to the DM; T-107 passes a creature's own footprint into the projection's fog check (it uses the size's today) and decides whether a token's size becomes an optional override. Split from T-180 (DM, 2026-11-20). Format agreed with the DM in an interview (2026-11-20), recorded in ADR-0018: `library/creatures/<folders>/<id>.json`, player characters in `campaigns/<slug>/characters/`; lean 5e core, Markdown stat block in the file, own fields as a name/value list; tokens keep `creature`/`shape` references and their own values only. The file watcher does not react to creature files yet (T-180).

### T-180 Creature library: player characters and creatures

- **Status:** todo · **Depends on:** T-107a, T-172a, T-180a · **Refs:** SPEC §2.5, §5, §11
- Global creatures (DM decision: player characters too, campaigns refer to them). Values follow a D&D 5e core that the DM can extend with own fields: HP with dice formula, AC, initiative modifier, speeds, size with grid footprint and pivot, senses (sight, darkvision) for vision; actions, spells and tactics go into a Markdown note. The DM maintains the player characters' values (players keep paper sheets). Look per creature: a round token with ring or a cut-out top-down figure; token picture and portrait. Per-session state (HP, conditions) stays in the scene/session state.
- **Acceptance criteria**
  - [ ] Create and edit a creature; a token placed from it carries its values (component + E2E test)
  - [ ] A campaign refers to its player characters without copying them
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017). A new file format: design the schema with the DM before implementing (CLAUDE.md).

### T-181 Campaign Atlas: explorer and scene editor

- **Status:** todo · **Depends on:** T-173 · **Refs:** SPEC §2.5, §12, ADR-0017
- The Atlas shows the campaign explorer (sessions as folders of scenes, notes) in its data panel and opens a selected scene in its scene editor, with its own ribbon.
- **Acceptance criteria**
  - [ ] Open, create, move and delete scenes from the explorer (E2E test)
  - [ ] Editing the scene that is live in the Orchestrator changes its start state only; the live game state takes it on "reset scene" or after the DM confirms (core + component tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017). DM decisions: an opened scene is a document tab in the Atlas with its own ribbon tabs (Tokens & Encounter, Trigger & Fallen, Notizen), not a sixth workspace; the Atlas edits a scene's start state, the Orchestrator its game state. Layout as in the DM's Atlas specification (explorer left, document centre with an optional split drawer for the flow, inspector right, session timeline at the bottom); look per ADR-0015.

### T-115 MVP end-to-end flow

- **Status:** todo · **Depends on:** T-107 … T-114b, T-134b, T-135, T-136a, T-136b
- E2E: choose library → import map → create scene → place tokens → reveal fog → run two initiative rounds → blackout → restart → state restored.
- **Acceptance criteria**
  - [ ] Flow passes in CI; benchmark run on reference notebook documented in `docs/benchmarks/`

---

## Stage 2 – Planning on the go & sound

### T-150 Obsidian vault and scene drafts from notes

- **Status:** todo · **Depends on:** T-103b, T-134b · **Refs:** ADR-0013, ADR-0006, ARCHITECTURE §6.7, SPEC 2.3
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

### T-183 Map pins with room descriptions and read-aloud text

- **Status:** todo · **Depends on:** T-181, T-161a, T-108c · **Refs:** SPEC §2.5, §12
- DM-only pins on rooms in the scene editor that open the room's description, read-aloud text and linked creatures; in the Orchestrator they show in the inspector.
- **Acceptance criteria**
  - [ ] Pins never reach the TV or companions (projection test)
  - [ ] A pin opens its note in the inspector (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-184 Session checklist

- **Status:** todo · **Depends on:** T-181, T-160a · **Refs:** SPEC §2.5, §12
- Per session: the scenes, handouts, creatures and music it needs, each with a "prepared" state.
- **Acceptance criteria**
  - [ ] Checklist items are saved with the session and show what is still missing (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-185 Wiki and lore in the Campaign Atlas

- **Status:** todo · **Depends on:** T-181, T-150 · **Refs:** SPEC §12
- NPCs, places, factions, quests and items as linked notes in the Atlas, with status (alive/dead, quest open/done) and links to scenes and pins.
- **Acceptance criteria**
  - [ ] Create and link wiki entries; links resolve in both directions (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-186 Quick notes into the session log

- **Status:** todo · **Depends on:** T-182 · **Refs:** SPEC §12, §13.2
- A shortcut in the Orchestrator opens a one-line note that goes into the session log with the time.
- **Acceptance criteria**
  - [ ] A quick note lands in the session log without leaving the map (E2E test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-187 Sound in the Asset Vault and the Orchestrator

- **Status:** todo · **Depends on:** T-178, T-182 · **Refs:** SPEC §9, §2.5
- Music playlists with crossfade, ambience layers, a sound board for one-shot effects and a volume mixer (music, ambience, effects).
- **Acceptance criteria**
  - [ ] Plan the sound area with the DM (formats, output device, licences) before implementing
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017). Sound has no tasks yet; this is the umbrella to split after planning.

### T-188 Random generators

- **Status:** todo · **Depends on:** T-182 · **Refs:** SPEC §2.5
- NPC (name, quirk, motivation), tavern rumours, random encounters and loot tables in one click; tables editable by the DM.
- **Acceptance criteria**
  - [ ] Generated results use the DM's tables; bundled tables are self-made or CC0 (SOURCES noted)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-224 Campaign search

- **Status:** todo · **Depends on:** T-181 · **Refs:** SPEC §2.5
- One search over the campaign – scenes, notes, wiki, pins, creatures – from Cmd/Ctrl+K.
- **Acceptance criteria**
  - [ ] Results open the found item in its workspace (E2E test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-225 World map with scene pins and travel routes

- **Status:** todo · **Depends on:** T-181, T-176 · **Refs:** SPEC §2.5
- A campaign world map (from the library) with scene pins and routes with travel times; double-clicking a pin opens the scene. The Atlas can show it above the flow graph (split drawer).
- **Acceptance criteria**
  - [ ] Pins and routes are saved with the campaign; a pin opens its scene (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-232 Custom metadata fields for assets

- **Status:** todo · **Depends on:** T-178 · **Refs:** SPEC §2.5
- The DM defines own metadata fields (e.g. "Epoche", "Fraktion") with a type (text, choice, number) and filters by them.
- **Acceptance criteria**
  - [ ] Custom fields are saved with the library, validated with zod and usable as filters (storage + component tests)
- **Notes:** From the workspace deepening with the DM (2026-11-20). A new file format in the library: schema reviewed with the DM.

## Stage 3 – Networked at the table

### T-118b Fog-composited maps for companions

- **Status:** todo · **Depends on:** T-118a · **Refs:** ARCHITECTURE §5.1, SPEC §2.4
- Companions never get map files: the host renders the released levels with their fog (or tiles of them) and serves those images instead.
- **Acceptance criteria**
  - [ ] A companion can show the released levels; no request path reaches an un-fogged map file (tests)
- **Notes:** Split from T-118 (DM decision, 2026-11-19); needed when companions show maps.

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

- **Status:** todo · **Depends on:** T-134b · **Refs:** SPEC 8.1, 3.1, ADR-0012
- Draw walls, windows and doors (open/closed/locked/secret) in the map's sidecar; import them from `.uvtt`/`.dd2vtt`; the DM opens/closes a door with one click; secret doors look like walls to players and become normal doors once discovered (per scene).
- **Acceptance criteria**
  - [ ] Wall/door editor with undo; VTT import fixture (self-made) round-trips walls, doors and lights
  - [ ] An undiscovered secret door is projected as a plain wall or not at all; walls and doors reach the player view only as far as needed for drawing (vision runs on the host) – projection test
- Deepening (DM interview, 2026-11-20): masks are vector lines on the grid (walls, cliffs), cover as circles or polygons – not painted raster masks.

### T-141 Automatic walls and room suggestions

- **Status:** todo · **Depends on:** T-140, T-108c · **Refs:** SPEC 8.1
- Generate walls from drawn rooms (outer edges = walls, shared edges = openings); suggest rooms from closed wall regions; suggest walls from image analysis (edges/colours), always reviewed by the DM before they apply. All local.
- **Acceptance criteria**
  - [ ] Two adjacent rooms produce an opening on the shared edge (unit tests in `core`)
  - [ ] Image-analysis suggestions are shown as a preview and applied only after confirmation
- **Notes:** From the DM planning interview (2026-11-18). An image-analysis library (e.g. OpenCV in Rust, already planned for the camera) is a dependency decision; a local AI model was deferred ("later").
- Deepening (DM interview, 2026-11-20): automatic masks are suggestions from local image analysis that the DM confirms or corrects; nothing unreviewed reaches the TV.

### T-142 Dynamic vision with raycasting

- **Status:** todo · **Depends on:** T-140, T-109, T-107b · **Refs:** SPEC 4, ARCHITECTURE §8
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
- Workspace interview (2026-11-20): ambient light presets per map (day 100 %, dusk, full-moon night, dark dungeon 0 %) set in the Map Forge.
- Deepening (DM interview, 2026-11-20): light sources (radius, colour, flicker) belong to the map globally; whether they burn and the ambient light are set per scene and in the Orchestrator.

### T-144 Asset placement and asset blockers

- **Status:** todo · **Depends on:** T-134b, T-125, T-142 · **Refs:** SPEC 8.1, 8.2, ADR-0012
- Place assets from the catalog on a scene (scale from metadata, rotate, mirror, z-order); per asset a blocker generated from its alpha channel (simplified polygon), editable, with type: blocks sight and light / one-way / partial (dimmed).
- **Acceptance criteria**
  - [ ] Generated blocker follows the opaque outline within a set tolerance (unit test on a self-made fixture)
  - [ ] Vision treats the three blocker types correctly (unit tests)

### T-145 Scene overrides of global map data

- **Status:** todo · **Depends on:** T-134b, T-140 · **Refs:** ADR-0012
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

### T-189 Room labels on maps

- **Status:** todo · **Depends on:** T-176, T-108c · **Refs:** SPEC §2.5, §8.1
- DM-only room numbers and names on the map in the Map Forge, shown in every scene with the map.
- **Acceptance criteria**
  - [ ] Labels never reach the TV (projection test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-190 Compose a map from tiles

- **Status:** todo · **Depends on:** T-176 · **Refs:** SPEC §2.5, §8.1
- Build one map from several images (dungeon tiles, map sections), aligned on the grid.
- **Acceptance criteria**
  - [ ] Composed maps render within the texture limits (T-127) and the benchmark budget
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-191 Map variants

- **Status:** todo · **Depends on:** T-176, T-134b · **Refs:** SPEC §2.5, §8.1
- Variants per level (day/night, destroyed, flooded): masks and rooms belong to the level and apply to all its variants; a scene picks a variant per level (DM decision, 2026-11-20).
- **Acceptance criteria**
  - [ ] Switching variants keeps fog, masks and rooms (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-193 Cliff and cover masks

- **Status:** todo · **Depends on:** T-140, T-142 · **Refs:** SPEC §2.5, §8.1
- Besides walls: cliffs and galleries (one way – those above see down, those below cannot see up) and cover (trees, pillars, statues cast radial shadows behind them while staying lit).
- **Acceptance criteria**
  - [ ] Vision tests for one-way and cover masks (unit tests in core)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-194 Vision test and mask check in the Map Forge

- **Status:** todo · **Depends on:** T-142, T-176 · **Refs:** SPEC §2.5
- A test figure on the map shows live what a token would see; open wall ends, overlapping doors and rooms without walls are flagged.
- **Acceptance criteria**
  - [ ] Leaks in a fixture map are found (unit tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-195 Parametric rooms, towers and corridors

- **Status:** todo · **Depends on:** T-140, T-176 · **Refs:** SPEC §2.5, §8.1
- Drag rectangular rooms, round towers and corridors on the 5-ft grid; outer walls follow automatically, shared edges become openings.
- **Acceptance criteria**
  - [ ] Walls follow the drawn shapes (core unit tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-196 Terrain and floor layers with movement cost

- **Status:** todo · **Depends on:** T-176 · **Refs:** SPEC §2.5, §8.1
- Paint or fill floors (cobblestones, forest floor, water, lava, difficult terrain); difficult terrain doubles movement cost for movement ranges.
- **Acceptance criteria**
  - [ ] Movement range respects terrain cost (core unit tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-197 Level heights and stairs

- **Status:** todo · **Depends on:** T-118d, T-107, T-176 · **Refs:** SPEC §2.5, §3.1
- Levels get a height (e.g. −10 ft, 0 ft, +15 ft); stair zones move a token to the next level.
- **Acceptance criteria**
  - [ ] A token entering a stair zone moves to the linked level (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-198 UVTT import in the Map Forge

- **Status:** todo · **Depends on:** T-140, T-143, T-176 · **Refs:** SPEC §3.1
- Import `.uvtt`/`.dd2vtt` with image, grid, walls, doors and lights into a new library map.
- **Acceptance criteria**
  - [ ] Import of a self-made fixture keeps walls, doors and lights (storage test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-199 Batch editing in the Asset Vault

- **Status:** todo · **Depends on:** T-178 · **Refs:** SPEC §2.5
- Tag, scale or file many assets at once.
- **Acceptance criteria**
  - [ ] One edit applies to every selected asset and can be undone as one step
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-200 Tinted asset variants

- **Status:** todo · **Depends on:** T-178, T-144 · **Refs:** SPEC §2.5
- Colour variants of an asset by tint (red/blue carpet) without a new file.
- **Acceptance criteria**
  - [ ] Tints render the same on the TV and in the DM window (screenshot test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-201 Animated assets

- **Status:** todo · **Depends on:** T-144, T-128 · **Refs:** SPEC §2.5
- Short video assets (campfire, waterfall) as props, in sync between DM window and TV.
- **Acceptance criteria**
  - [ ] Animated props stay within the benchmark budget
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-202 Smart prefabs: masks and lights on assets

- **Status:** todo · **Depends on:** T-140, T-143, T-144 · **Refs:** SPEC §2.5, §8.1
- An asset carries its own mask or light: a door its switchable wall mask, a lantern its light, a tree its cover; house interiors come with T-146.
- **Acceptance criteria**
  - [ ] Placing a prefab brings its mask/light into the scene (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).
- Deepening (DM interview, 2026-11-20): prefabs are made in an asset editor in the Vault – open the asset and draw its mask, light and anchor on its picture; they apply wherever it is placed.

### T-203 Token from portrait

- **Status:** todo · **Depends on:** T-180 · **Refs:** SPEC §2.5
- Cut a round token picture from the portrait with frame and movable crop.
- **Acceptance criteria**
  - [ ] Crop and frame are stored; the original picture stays untouched
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017). Background removal by click needs a local model or library: a dependency decision for the DM.

### T-204 Clones with generated names

- **Status:** todo · **Depends on:** T-180 · **Refs:** SPEC §2.5
- Create Goblin #1…#n from one creature, with generated names, slight colour changes and individual HP rolls.
- **Acceptance criteria**
  - [ ] Clones get distinct names and rolled HP (unit tests with injected RNG)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).
- Deepening (DM interview, 2026-11-20): placed creatures and clones are instances in the scene that refer to the library creature, with their own name, HP and conditions; the library stays clean.

### T-205 Encounter pods

- **Status:** todo · **Depends on:** T-180 · **Refs:** SPEC §2.5
- Groups of creatures (e.g. a vampire and three spawn) placed as one package.
- **Acceptance criteria**
  - [ ] Placing a pod places all its creatures (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-206 Stat-block import and creature exchange

- **Status:** todo · **Depends on:** T-180 · **Refs:** SPEC §2.5
- Import creatures from the SRD 5.1 (CC-BY) or JSON; export and import creatures.
- **Acceptance criteria**
  - [ ] Import validates with zod; attribution for SRD content is shown (licence check with the DM)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-207 Creature shapes

- **Status:** todo · **Depends on:** T-180, T-107 · **Refs:** SPEC §2.5
- Several pictures and values per creature (beast form, werewolf, disguise), switched in play.
- **Acceptance criteria**
  - [ ] Switching a shape keeps the token's position and HP state (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-208 Faction rings and previews

- **Status:** todo · **Depends on:** T-180, T-112, T-142 · **Refs:** SPEC §2.5
- Token rings in faction colours (players, allies, enemies, neutral) with a shape as well as a colour; previews of conditions, auras and sight radius.
- **Acceptance criteria**
  - [ ] Colour is never the only signal (ADR-0011); screenshot tests
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).
- Deepening (DM interview, 2026-11-20): rings are optional per creature (round tokens); cut-out figures show faction and conditions as subtle markers.

### T-209 Scene editor: tokens, props and start states

- **Status:** todo · **Depends on:** T-181, T-107, T-144, T-145 · **Refs:** SPEC §2.5, §8
- Place creatures and props (on top of the map's own, ADR-0012) and set start states: closed doors, lights on, fog.
- **Acceptance criteria**
  - [ ] "Reset scene" restores the start state (core tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-210 Traps, triggers and secrets

- **Status:** todo · **Depends on:** T-209 · **Refs:** SPEC §8.1
- Trigger zones (sound, light, message to the DM, reveal trap, switch scene), chest contents and secrets in the scene editor.
- **Acceptance criteria**
  - [ ] Triggers fire when a token enters; hidden from the TV until fired (core + projection tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-211 Area templates and rolls for many targets

- **Status:** todo · **Depends on:** T-107, T-222 · **Refs:** SPEC §7, §2.5
- Fireball circles, cones and lines on the grid mark every token hit; saves and attacks are rolled for all targets at once.
- **Acceptance criteria**
  - [ ] Hit detection on the grid (core unit tests); one roll action for all marked targets
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-212 Centre the players' view and ambience presets

- **Status:** todo · **Depends on:** T-143, T-182 · **Refs:** SPEC §2.5
- Lead the TV's camera to an event or room by button; switch light and weather mood (sunny day, blood moon, torchlight, thunderstorm with lightning).
- **Acceptance criteria**
  - [ ] Centring never reveals more than the fog allows
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-213 Initiative: group rolls and next-turn focus

- **Status:** todo · **Depends on:** T-111, T-180 · **Refs:** SPEC §11
- Roll initiative for all monsters (grouped by kind); "next turn" (space) centres the active creature and shows its movement range (walk/dash).
- **Acceptance criteria**
  - [ ] Rolls use the creatures' modifiers (unit tests with injected RNG)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-226 Animated creature tokens

- **Status:** todo · **Depends on:** T-180, T-107, T-128 · **Refs:** SPEC §2.5, §5
- Creatures can be animated, so tokens move on the TV: sprite sheets and animated WebP everywhere, videos with transparency where the platform plays them (WebKit on macOS is limited), else a still picture as fallback (DM decision, 2026-11-20); in sync between DM window and TV.
- **Acceptance criteria**
  - [ ] Animated tokens stay within the benchmark budget (ARCHITECTURE §11)
  - [ ] Hidden animated tokens never reach the TV (projection test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-227 Scene phases

- **Status:** todo · **Depends on:** T-209 · **Refs:** SPEC §2.5
- Dramatic phases inside a scene (start setup → ambush → reinforcements), each with its own state of tokens, doors and light; the Atlas shows them as the scene's timeline and the Orchestrator switches phase by button.
- **Acceptance criteria**
  - [ ] Switching a phase applies its state as one undoable step (core tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

## Stage 6 – Campaign & comfort

### T-147 Themed scene transitions

- **Status:** todo · **Depends on:** T-135 (and the sound and effects tasks once they exist) · **Refs:** SPEC 3.2
- Transitions with sound and particles, e.g. door sound and fade when leaving a house, snowflakes blending over from a snowstorm into a cave; chosen per scene change or stored on the scene link.
- **Acceptance criteria**
  - [ ] At least two themed transitions; fail-closed like T-135

### T-148 Share maps and assets as `.dmmap`

- **Status:** todo · **Depends on:** T-134b · **Refs:** ADR-0012, ARCHITECTURE §6.6
- Export a map or asset with its sidecar and variant files as one `.dmmap` bundle; import it into another library (hash check, no overwrite).
- **Acceptance criteria**
  - [ ] Export → import round-trip keeps metadata, walls, rooms and variants
  - [ ] Import validates the sidecar with zod and rejects unsafe paths inside the bundle (zip-slip test)
- **Notes:** A ZIP library is a dependency decision for the DM (Rust `zip` crate vs. alternatives).
- Workspace interview (2026-11-20): an import sorts all files of the bundle into the library's folder structure.

### T-214 Items and loot cards

- **Status:** todo · **Depends on:** T-178, T-180 · **Refs:** SPEC §2.5, §12
- Potions, scrolls and artefacts with rarity and description; show a card on the TV or send it to a player.
- **Acceptance criteria**
  - [ ] Item cards reach the TV only when shown (projection test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).
- Postponed by the DM (DM interview, 2026-11-20): whether items are global or per campaign is decided later.

### T-215 Sounds bound to traps and spells

- **Status:** todo · **Depends on:** T-187, T-210 · **Refs:** SPEC §2.5, §9
- Short effects (sword clash, fireball, thunder) on trap or spell assets, played when they fire.
- **Acceptance criteria**
  - [ ] A firing trap plays its sound once
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-216 Scene flow graph

- **Status:** todo · **Depends on:** T-181 · **Refs:** SPEC §2.5, §12
- Scenes connected as a graph (door A leads to scene B, "when quest X is done") to plan branching adventures.
- **Acceptance criteria**
  - [ ] The flow is saved with the campaign and opens scenes on click
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-217 What the players know

- **Status:** todo · **Depends on:** T-185 · **Refs:** SPEC §2.5, §12
- Mark which wiki entries and facts the players know; the recap and handouts can build on it.
- **Acceptance criteria**
  - [ ] Player knowledge is per campaign and never shows unknown entries to players
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-218 Campaign timeline

- **Status:** todo · **Depends on:** T-185 · **Refs:** SPEC §2.5, §12
- An in-game calendar with events, sessions and deadlines.
- **Acceptance criteria**
  - [ ] Events appear on the timeline in in-game order
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-219 Loot and rewards overview

- **Status:** todo · **Depends on:** T-214 · **Refs:** SPEC §2.5, §12
- Items, gold and milestones handed out per session and character.
- **Acceptance criteria**
  - [ ] The overview sums per character and session
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-220 Encounter balance

- **Status:** todo · **Depends on:** T-180, T-205 · **Refs:** SPEC §2.5, §11
- Difficulty of an encounter from the 5e XP budget against the group.
- **Acceptance criteria**
  - [ ] Budget math matches the SRD tables (unit tests)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-221 In-game time and weather

- **Status:** todo · **Depends on:** T-143, T-187 · **Refs:** SPEC §2.5
- In-game clock, calendar and weather that adjust light and ambience.
- **Acceptance criteria**
  - [ ] Advancing time changes the scene's light preset (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-222 Hidden dice

- **Status:** todo · **Depends on:** T-182 · **Refs:** SPEC §11, §2.5
- DM dice with formulas (2d6+3), hidden or shown on the TV, recorded in the session log.
- **Acceptance criteria**
  - [ ] Formula parser and rolls tested with injected RNG
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-228 Scene dependencies

- **Status:** todo · **Depends on:** T-216 · **Refs:** SPEC §2.5, §12
- Requirements and unlocks between scenes in the flow graph (scene 03A only after quest X); the inspector lists "requires" and "unlocks".
- **Acceptance criteria**
  - [ ] The flow shows locked and unlocked scenes from the campaign's state (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-229 Scene and session templates

- **Status:** todo · **Depends on:** T-181 · **Refs:** SPEC §2.5
- Templates ("Taverne", "Dungeon-Etage", "Standard-Session") to create scenes and sessions quickly.
- **Acceptance criteria**
  - [ ] A new scene from a template copies its setup, not its fog or game state
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).

### T-230 Relationship network

- **Status:** todo · **Depends on:** T-185 · **Refs:** SPEC §2.5, §12
- A graph of relationships between NPCs and factions (allied, hostile, owes money), linked to the wiki.
- **Acceptance criteria**
  - [ ] Relationships are saved with the wiki entries and shown as a graph (component test)
- **Notes:** From the workspace interview with the DM (2026-11-20, ADR-0017).
