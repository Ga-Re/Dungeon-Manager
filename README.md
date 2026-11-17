# Dungeon Manager

Plan campaigns on the go, present them at the table: maps, fog of war, spells, sound and light on a table-top TV.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions: [docs/adr/](docs/adr/)
- Work queue: [TASKS.md](TASKS.md)
- Agent rules: [CLAUDE.md](CLAUDE.md)

## Development setup

Pinned versions:

| Tool    | Version       | Pinned in                          |
| ------- | ------------- | ---------------------------------- |
| Node.js | 26.13.1 (LTS) | `.nvmrc`, `package.json` `engines` |
| pnpm    | 12.21.0       | `package.json` `packageManager`    |
| Rust    | 1.100.0       | `rust-toolchain.toml`              |

1. Install Node.js 26.13.1, e.g. `nvm install && nvm use` (reads `.nvmrc`).
2. Install pnpm: `npm install -g pnpm@12.21.0`. (Node 26 no longer bundles Corepack; pnpm itself switches to the version in `packageManager`.)
3. Install Rust via [rustup](https://rustup.rs); it picks the toolchain from `rust-toolchain.toml` automatically. Rust is only needed for the desktop backend.
4. Install and build the workspace:

   ```bash
   pnpm install
   pnpm build
   ```

`engineStrict` is on: `pnpm install` refuses to run with a Node version outside `engines` in `package.json`.

Mobile toolchain (Android Studio / Xcode) setup is documented with task T-008.

## Checks

```bash
pnpm check
```

Runs typecheck, ESLint, the Prettier format check and the module-boundary rules from [ARCHITECTURE.md §4](docs/ARCHITECTURE.md) (dependency-cruiser), plus a self-test proving those rules catch deliberate violations (`tooling/dependency-cruiser/fixtures/`). `pnpm format` fixes formatting. Accepted ADRs are excluded from formatting because they are immutable (ADR-0001).

## Tests

```bash
pnpm test
```

Unit and component tests (Vitest) with coverage gates: ≥ 80 % lines and branches per package for `core`, `schema`, `storage` and `protocol`. Part of `pnpm check`. Tests live next to the code as `src/**/*.test.ts`.

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

E2E tests (Playwright) in `<package>/playwright/e2e/`. The first command downloads the browser once.

```bash
pnpm test:visual
```

Screenshot tests in `<package>/playwright/visual/`, compared pixel-exactly with the golden images in `packages/test-fixtures/golden/`. They run inside a pinned Playwright Docker image (needs Docker and a bash shell) so rendering is identical on every machine. The image always runs as `linux/amd64`; on Apple Silicon Macs enable _Use Rosetta for x86_64/amd64 emulation_ in Docker Desktop for speed. After an intended visual change, run `pnpm test:visual --update-snapshots` and review the new images in the diff. When upgrading `@playwright/test`, update the image in `tooling/playwright/run-visual.sh` to the same version.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. Each job is one status check:

| Check    | What it runs                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| `check`  | `pnpm check` (typecheck, lint, format, boundaries, unit tests with coverage)                                      |
| `e2e`    | `pnpm test:e2e`                                                                                                   |
| `visual` | `pnpm test:visual` (pinned Docker image)                                                                          |
| `rust`   | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` (passes without work until the crate exists, T-006) |

The workflow only uses official `actions/*` pinned by commit SHA, has a read-only token and no secrets. It is triggered by `pull_request` (not `pull_request_target`), so pull requests from forks never see secrets.

### Repository settings (one-time, for the DM)

1. **Protect `main`:** Settings → Rules → Rulesets → New ruleset → New branch ruleset.
   - Name `main`, Enforcement status **Active**, Target branches → Add target → **Include default branch**.
   - Enable **Restrict deletions** and **Block force pushes**.
   - Enable **Require a pull request before merging** (required approvals: 0 – the agent merges its own PRs once the checks are green).
   - Enable **Require status checks to pass** → Add checks → `check`, `e2e`, `visual`, `rust`, `desktop-smoke` (they appear in the list after the first CI run); choose **GitHub Actions** as the source of each. Also tick **Require branches to be up to date before merging** – after every merge, open PRs then need **Update branch** before they can merge (auto-merge waits for that).
   - Leave the bypass list empty so the rules apply to everyone, including admins.
2. **Allow auto-merge:** Settings → General → Pull Requests → tick **Allow auto-merge**. On a pull request, click **Enable auto-merge**; GitHub merges it as soon as all required checks pass.
3. **Fork safety:** Settings → Actions → General.
   - Fork pull request workflows from outside collaborators → choose the **strictest** option (approval for all outside collaborators / external contributors; the exact label varies).
   - Workflow permissions → **Read repository contents and packages permissions**; leave "Allow GitHub Actions to create and approve pull requests" unticked.

## Desktop app

```bash
pnpm dev:desktop
```

Builds the workspace packages the app needs, then starts the Tauri app with hot reload: the DM window opens; choose a display and click **Spieleransicht öffnen** to show the player view fullscreen on it.

Prerequisites besides Node/pnpm/Rust (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)):

- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux (Ubuntu):** `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev build-essential pkg-config`.
- **Windows:** Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 11).

**Smoke test** (real app via `tauri-driver`; Linux and Windows only – tauri-driver does not support macOS, so on a Mac it runs in CI):

```bash
pnpm --filter @dungeon-manager/desktop build:app
pnpm --filter @dungeon-manager/desktop smoke
```

It needs `cargo install tauri-driver --version 2.1.0 --locked` and, on Linux, `webkit2gtk-driver` (plus `xvfb-run` without a display).

## Performance spike (T-007, temporary)

Measures whether a 4K video map + fog + 20 tokens reaches 60 FPS in the player window (ARCHITECTURE §11). Run it on the reference notebook with the table TV connected.

**Before measuring**

- Update and install: `git pull`, then `pnpm install` (the spike adds PixiJS).
- Plug in the charger and switch off Low Power Mode (System Settings → Battery).
- TV in System Settings → Displays: 3840 × 2160 at **60 Hz**. 4K at 60 Hz needs a USB-C/HDMI adapter and cable supporting HDMI 2.0 or newer – many adapters only carry 4K at 30 Hz, and the report then says "display below 60 Hz".
- Close other heavy apps. Don't touch the windows while the spike runs.

**1. Provide the test videos (once; again after updates)** – generate a synthetic 4K video plus a 1080p version (needs `brew install ffmpeg`):

```bash
pnpm --filter @dungeon-manager/desktop spike:video
```

…or use your own animated map instead (stays local, never committed). Use the full path – easiest: type the command, a space, then drag the file into the terminal:

```bash
pnpm --filter @dungeon-manager/desktop spike:video /Users/you/Maps/animated-map.mp4
```

**2. Start the app in spike mode**, choose the TV and click **Spieleransicht öffnen**:

```bash
pnpm spike:desktop
```

**3. Wait about four minutes.** The spike first measures the display refresh rate, then runs eight 25-second scenarios (A–H) comparing ways to show the video map: as a WebGL texture (4K and 1080p video), as a WebGPU texture, and as a plain video element under a transparent PixiJS canvas – plus Full HD renders and a repeat to spot thermal throttling. The result appears on the TV and in the terminal between `===== SPIKE RESULTS` and `===== END` – copy that block. It is also saved in `apps/desktop/spike-results/`. Close the app with the DM window to run again.

While scenarios E and F run ("HTML video element"), watch the TV: does the video look smooth, or does it judder? Please mention it with the results – the spike cannot measure that part itself.

With your own map: use a video that is at least 30 s long (shorter ones restart during a measurement); a `.webm` map is compared against an H.264 1080p version, so codecs differ too.

For the 4K scenarios the TV must receive a 4K signal: in System Settings → Displays, the TV should offer 3840 × 2160 (or a "(HiDPI)" mode). If only 1920 × 1080 is offered, the cable or adapter limits the connection.

## Repository layout

See [ARCHITECTURE.md §3](docs/ARCHITECTURE.md). Workspace packages are named `@dungeon-manager/<folder>`; the shared TypeScript config lives in `tooling/tsconfig`.

## Working with the agent (for the DM)

1. Install Claude Code and the GitHub CLI (`gh auth login`).
2. Open the folder in Claude Code and run `/next-task`.
3. The agent opens a pull request per task and merges it itself once CI is green. It stops and asks you first for dependencies, deviations from the spec/ADRs and security-relevant changes. Review merged PRs whenever you like; comments are picked up in the next session.

## License

No license is granted. All rights reserved. The source is public for reference only.
