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

- **Status:** review · **Depends on:** T-001 · **Refs:** ARCHITECTURE §4, ADR-0009
- ESLint (TS strict rules, no `any`), Prettier, dependency-cruiser with the boundary table from ARCHITECTURE §4; `pnpm check` script.
- **Acceptance criteria**
  - [x] `pnpm check` runs typecheck, lint, format check, dependency-cruiser
  - [x] A deliberate boundary violation (e.g. `core` importing `react`) fails `pnpm check` (proven by a test fixture or documented manual check)
- **Notes:** From T-001 review: package `exports` point at `dist/`, so typecheck of dependents needs `dependsOn: ["^build"]` in Turbo (or a source export condition). `moduleResolution: Bundler` allows extensionless imports – fine for Vite/Vitest/Metro, not for running `dist/` directly with Node.

### T-003 Test infrastructure

- **Status:** todo · **Depends on:** T-002 · **Refs:** ARCHITECTURE §12, ADR-0009
- Vitest workspace with coverage thresholds (≥ 80 % for `core`, `schema`, `storage`, `protocol`), React Testing Library, Playwright config, screenshot test setup in a pinned Docker image.
- **Acceptance criteria**
  - [ ] `pnpm check` includes unit/component tests with coverage gates
  - [ ] `pnpm test:e2e` and `pnpm test:visual` run a sample test each
  - [ ] Coverage below threshold fails the check
  - [ ] `packages/test-fixtures/SOURCES.md` lists the origin and license of every fixture (self-made or CC0 only – public repo)

### T-004 CI on GitHub Actions

- **Status:** todo · **Depends on:** T-003
- Workflow on every PR: install, `pnpm check`, Rust fmt/clippy/test, E2E, visual tests. Cache pnpm and cargo.
- Public repo: use `pull_request` (not `pull_request_target`) so fork PRs never get secrets; minimal `permissions:` per workflow.
- **Acceptance criteria**
  - [ ] PRs show required status checks; failing checks block merge (document the branch-protection settings the DM must enable)

### T-005 Claude Code GitHub integration

- **Status:** todo · **Depends on:** T-004
- Set up the Claude GitHub app/workflow so `@claude` in PR comments triggers the agent to address review feedback.
- **Acceptance criteria**
  - [ ] Workflow file committed; setup steps for the DM (installing the app, adding the API key secret) documented in README
  - [ ] The workflow only runs for comments by the repository owner (check `author_association` / actor), never for other users or forks – the repo is public
  - [ ] The API key secret is never available to workflows triggered from forks
- **Notes:** Verify current setup steps and the action's access-control options in the official Claude Code docs before implementing.

### T-006 Desktop app skeleton with two windows

- **Status:** todo · **Depends on:** T-001 · **Refs:** ADR-0002, SPEC 2.1–2.2
- Tauri 2 + React app in `apps/desktop`; DM window and a player window that can be moved fullscreen to a chosen display.
- **Acceptance criteria**
  - [ ] `pnpm dev:desktop` opens the DM window; a button opens the player window on a selectable display in fullscreen
  - [ ] i18next set up (`de` default, `en`), no hard-coded strings
  - [ ] Tauri-driver smoke test starts the app and finds both windows
- **Notes:** From T-002: root-level `.ts` configs (e.g. `vite.config.ts`) are outside every tsconfig `include`, so type-aware ESLint rejects them – add them to a tsconfig or to `projectService.allowDefaultProject` in `tooling/eslint/config.js`.

### T-007 Performance spike: video map + fog in the player window

- **Status:** todo · **Depends on:** T-006 · **Refs:** ARCHITECTURE §8, §11
- Throwaway-quality spike (clearly marked) rendering a 4K MP4 map + a fog mask + 20 sprites in PixiJS in the player window; script that records frame times.
- **Acceptance criteria**
  - [ ] Frame-time report from the DM's reference notebook (p50/p95) committed to `docs/benchmarks/`
  - [ ] Written conclusion: budget met or not; if not, structured proposal (see CLAUDE.md)
- **Notes:** This validates ADR-0002. Results may trigger a new ADR.

### T-008 Mobile app skeleton

- **Status:** todo · **Depends on:** T-001 · **Refs:** ADR-0003
- Expo app (dev build) in `apps/mobile` importing `core` and `i18n`; one screen.
- **Acceptance criteria**
  - [ ] Runs on an Android emulator/device; iOS build steps documented
  - [ ] Imports a function from `packages/core` (proves workspace sharing works with Metro)

### T-009 Companion skeleton

- **Status:** todo · **Depends on:** T-001 · **Refs:** ADR-0007
- React web app in `apps/companion`, built as static files.
- **Acceptance criteria**
  - [ ] `pnpm dev:companion` serves a placeholder page; production build outputs static files consumable by the desktop backend later
- **Notes:** From T-002: root-level `.ts` configs (e.g. `vite.config.ts`) are outside every tsconfig `include`, so type-aware ESLint rejects them – add them to a tsconfig or to `projectService.allowDefaultProject` in `tooling/eslint/config.js`.

### T-010 Upgrade to TypeScript 7

- **Status:** todo · **Depends on:** T-002
- T-001 pinned TypeScript 6.0.3 because typescript-eslint did not support TypeScript 7 yet (peer range `<6.1.0` as of 2026-11-16). Upgrade once typescript-eslint supports TS 7.
- **Acceptance criteria**
  - [ ] `typescript` bumped to the current 7.x; `pnpm check` green
- **Notes:** Discovered during T-001.

---

## Stage 1 – MVP: map, fog, tokens (desktop)

### T-101 Schema v1 and migrations framework

- **Status:** todo · **Depends on:** T-003 · **Refs:** ARCHITECTURE §5–6, ADR-0005
- zod schemas with `schemaVersion` for `Campaign`, `Scene`, `Map`, `Token`, `FogState`, `InitiativeState`, `Combatant`, `VisibilityRule`, `Player`; migration runner.
- **Acceptance criteria**
  - [ ] Round-trip tests (parse → serialize → parse) for every entity
  - [ ] Migration runner tested with a fake v0 → v1 migration
  - [ ] Unknown fields are preserved on round-trip

### T-102 Core reducer: commands, events, permissions, projection

- **Status:** todo · **Depends on:** T-101 · **Refs:** ARCHITECTURE §5
- `apply`, `canApply`, `projectForViewer` with injected time/RNG; undo via inverse snapshots.
- **Acceptance criteria**
  - [ ] Commands for token move, fog reveal/hide, visibility change, initiative and HP changes
  - [ ] Projection never leaks hidden tokens, hidden HP numbers or unrevealed fog (property-based tests)
  - [ ] Undo/redo tested

### T-103 Storage: library folder, read/write, watching, conflicts

- **Status:** todo · **Depends on:** T-101 · **Refs:** ARCHITECTURE §6
- `packages/storage` with injected FS adapter; Rust FS adapter + file watching in desktop; atomic writes; conflict-copy detection (detection only, merge UI later).
- **Acceptance criteria**
  - [ ] DM chooses a library folder; layout is created if empty
  - [ ] External file changes are picked up while the app runs
  - [ ] Conflict copies of Dropbox/OneDrive/Google Drive/iCloud naming patterns are detected (fixtures)
  - [ ] Missing/placeholder files produce a "not available" state, no crash
  - [ ] Device settings stored in OS app-data, not in the library

### T-104 Map import and scene creation

- **Status:** todo · **Depends on:** T-103 · **Refs:** SPEC 3.1
- Import PNG/JPG/WebP into the library; create a scene referencing it.
- **Acceptance criteria**
  - [ ] Imported file lands in `library/maps/`, referenced by relative path + hash
  - [ ] Scene list in DM window; open/close scene

### T-105 Renderer: map layer and camera

- **Status:** todo · **Depends on:** T-104, T-007 · **Refs:** ARCHITECTURE §8
- `packages/renderer` drawing the map; zoom/pan in DM window; locked scale in player window.
- **Acceptance criteria**
  - [ ] Screenshot tests for a fixture map in both views
  - [ ] Benchmark scene added to `test-fixtures`

### T-106 Grid overlay and 1-inch calibration

- **Status:** todo · **Depends on:** T-105 · **Refs:** SPEC 2.2
- Grid overlay; align grid to the map; display calibration (screen diagonal / resolution → pixels per inch) per display in device settings.
- **Acceptance criteria**
  - [ ] On a calibrated display one cell measures 1 inch (manual check documented; unit tests for the math)
  - [ ] Rotation 0/90/180/270 in the player window

### T-107 Tokens: create, place, move

- **Status:** todo · **Depends on:** T-102, T-106 · **Refs:** SPEC 5
- Tokens with D&D size categories; tap-token-tap-cell, drag, keyboard shortcuts, group move; snapping.
- **Acceptance criteria**
  - [ ] All move modes covered by component/E2E tests
  - [ ] Invisible-in-player-view tokens supported

### T-108 Manual fog with undo

- **Status:** todo · **Depends on:** T-102, T-105 · **Refs:** SPEC 4
- Brush, rectangle, polygon; predefined rooms (polygons) revealable with one click; undo.
- **Acceptance criteria**
  - [ ] Player window shows only revealed areas (screenshot tests)
  - [ ] Undo restores the previous fog state

### T-109 Memory fog

- **Status:** todo · **Depends on:** T-108
- Previously revealed areas render dimmed; tokens inside are hidden for players.
- **Acceptance criteria**
  - [ ] Screenshot tests for revealed / remembered / unrevealed

### T-110 Per-element visibility with type defaults

- **Status:** todo · **Depends on:** T-102, T-107 · **Refs:** SPEC 6
- Visible / hidden / approximate per element; defaults per element type in campaign settings.
- **Acceptance criteria**
  - [ ] Approximate HP rendering ("unhurt / wounded / badly wounded")
  - [ ] Projection tests extended

### T-111 Initiative tracker

- **Status:** todo · **Depends on:** T-102 · **Refs:** SPEC 11
- Order, rounds, active turn (highlight on TV), delay/ready, quick entry.
- **Acceptance criteria**
  - [ ] Reducer tests for all initiative commands
  - [ ] Active token highlighted in player window (screenshot)

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

- **Status:** todo · **Depends on:** T-103, T-102
- Periodic and on-change save of scene state; recovery on next start.
- **Acceptance criteria**
  - [ ] Killing the app mid-session loses at most the last few seconds (E2E test with forced kill)

### T-115 MVP end-to-end flow

- **Status:** todo · **Depends on:** T-107 … T-114
- E2E: choose library → import map → create scene → place tokens → reveal fog → run two initiative rounds → blackout → restart → state restored.
- **Acceptance criteria**
  - [ ] Flow passes in CI; benchmark run on reference notebook documented in `docs/benchmarks/`
