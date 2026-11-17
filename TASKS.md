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
- **Notes:** From T-001 review: package `exports` point at `dist/`, so typecheck of dependents needs `dependsOn: ["^build"]` in Turbo (or a source export condition). `moduleResolution: Bundler` allows extensionless imports – fine for Vite/Vitest/Metro, not for running `dist/` directly with Node.

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

### T-008 Mobile app skeleton

- **Status:** blocked · **Depends on:** T-001 · **Refs:** ADR-0003
- Expo app (dev build) in `apps/mobile` importing `core` and `i18n`; one screen.
- **Acceptance criteria**
  - [ ] Runs on an Android emulator/device; iOS build steps documented
  - [ ] Imports a function from `packages/core` (proves workspace sharing works with Metro)
- **Notes:** Deferred by the DM (2026-11-17): most players and the DM use iPhones; revisit when the phone app is due (stage 2).

### T-009 Companion skeleton

- **Status:** done · **Depends on:** T-001 · **Refs:** ADR-0007
- React web app in `apps/companion`, built as static files.
- **Acceptance criteria**
  - [x] `pnpm dev:companion` serves a placeholder page; production build outputs static files consumable by the desktop backend later
- **Notes:** From T-002: root-level `.ts` configs (e.g. `vite.config.ts`) are outside every tsconfig `include`, so type-aware ESLint rejects them – add them to a tsconfig or to `projectService.allowDefaultProject` in `tooling/eslint/config.js`. For the backend task that serves the companion: the build uses relative asset URLs (`base: "./"`), so mount it at a path with a trailing slash (redirect `/companion` → `/companion/`) or at the root; a future client-side router with deep links needs the same care.

### T-010 Upgrade to TypeScript 7

- **Status:** todo · **Depends on:** T-002
- T-001 pinned TypeScript 6.0.3 because typescript-eslint did not support TypeScript 7 yet (peer range `<6.1.0` as of 2026-11-16). Upgrade once typescript-eslint supports TS 7.
- **Acceptance criteria**
  - [ ] `typescript` bumped to the current 7.x; `pnpm check` green
- **Notes:** Discovered during T-001.

### T-011 Shared i18n setup for web apps

- **Status:** todo · **Depends on:** T-009
- `createI18n` exists twice (`apps/desktop/src/i18n.ts`, `apps/companion/src/i18n.ts`). Move it to a shared place (e.g. `packages/ui` once it has its first component) and use it from both apps.
- **Acceptance criteria**
  - [ ] One implementation, used by desktop and companion; tests unchanged and green
- **Notes:** Discovered during T-009; kept duplicated there to avoid a drive-by refactor.

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

- **Status:** todo · **Depends on:** T-104a · **Refs:** SPEC 3.1, ARCHITECTURE §6.3
- Import PNG/JPG/WebP into the library (native file picker, copy in Rust, SHA-256 hash); create a scene referencing it.
- **Acceptance criteria**
  - [ ] Imported file lands in `library/maps/`, referenced by relative path + hash
  - [ ] A scene can be created with the imported map
- **Notes:** DM approved `sha2` (already a transitive dependency) for hashing, 2026-11-17.

### T-105 Renderer: map layer and camera

- **Status:** todo · **Depends on:** T-104b, T-007 · **Refs:** ARCHITECTURE §8
- `packages/renderer` drawing the map; zoom/pan in DM window; locked scale in player window.
- **Acceptance criteria**
  - [ ] Screenshot tests for a fixture map in both views
  - [ ] Benchmark scene added to `test-fixtures`
- **Notes:** From T-003 review: `pnpm test:visual` mounts the host `node_modules` into the Linux container. Once visual tests need a Vite dev server, native binaries (esbuild/rollup) from a macOS/Windows host will not run there – install dependencies inside the container (separate volume) instead. From T-007: remove the spike (`apps/desktop/spike.html`, `src/spike/`, `spike/`, the `VITE_SPIKE` switch and the `playerPage` parameter) once the renderer and its benchmark exist; move `pixi.js` (with `pixi.js/unsafe-eval`, required by our CSP) to `packages/renderer`. From T-007/ADR-0010: video maps are a `<video>` element under a transparent PixiJS canvas with a shared camera transform (zoom/pan/rotation); the benchmark scene must show ≤ 1 % missed refreshes at 4K/60 Hz with realistic fog, the DM window open and an animated camera, judge video smoothness separately and investigate the hitches seen in the spike. The video element must fail closed: hidden until the fog for the scene is drawn and on resize/context loss/teardown.

### T-106 Grid overlay and 1-inch calibration

- **Status:** todo · **Depends on:** T-105 · **Refs:** SPEC 2.2
- Grid overlay; align grid to the map; display calibration (screen diagonal / resolution → pixels per inch) per display in device settings.
- **Acceptance criteria**
  - [ ] On a calibrated display one cell measures 1 inch (manual check documented; unit tests for the math)
  - [ ] Rotation 0/90/180/270 in the player window

### T-116 Player view render resolution setting

- **Status:** todo · **Depends on:** T-105 · **Refs:** SPEC 2.2, ARCHITECTURE §11
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

### T-108 Manual fog with undo

- **Status:** todo · **Depends on:** T-102b, T-105 · **Refs:** SPEC 4
- Brush, rectangle, polygon; predefined rooms (polygons) revealable with one click; undo.
- **Acceptance criteria**
  - [ ] Player window shows only revealed areas (screenshot tests)
  - [ ] Undo restores the previous fog state
- **Notes:** From T-102a review: fog ops use exact arithmetic (polyclip-ts/BigNumber) – measured ~9 ms average, ~20 ms worst per reveal after 300 brush dabs, 34 ms for hiding a 64-gon. Combine a brush stroke into one polygon per stroke (one command), not one command per pointer move.

### T-109 Memory fog

- **Status:** todo · **Depends on:** T-108
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

- **Status:** todo · **Depends on:** T-105
- Instant black/pause image in the player window; small live preview of the player view in the DM window.
- **Acceptance criteria**
  - [ ] Blackout reachable by button and keyboard shortcut; E2E test

### T-114 Autosave and crash recovery

- **Status:** todo · **Depends on:** T-103b, T-102b
- Periodic and on-change save of scene state; recovery on next start.
- **Acceptance criteria**
  - [ ] Killing the app mid-session loses at most the last few seconds (E2E test with forced kill)

### T-115 MVP end-to-end flow

- **Status:** todo · **Depends on:** T-107 … T-114
- E2E: choose library → import map → create scene → place tokens → reveal fog → run two initiative rounds → blackout → restart → state restored.
- **Acceptance criteria**
  - [ ] Flow passes in CI; benchmark run on reference notebook documented in `docs/benchmarks/`
