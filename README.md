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
   - Enable **Require a pull request before merging** (required approvals: 0 – you merge, nobody else reviews).
   - Enable **Require status checks to pass** → Add checks → `check`, `e2e`, `visual`, `rust` (they appear in the list after the first CI run); choose **GitHub Actions** as the source of each. Also tick **Require branches to be up to date before merging** – after every merge, open PRs then need **Update branch** before they can merge (auto-merge waits for that).
   - Leave the bypass list empty so the rules apply to everyone, including admins.
2. **Allow auto-merge:** Settings → General → Pull Requests → tick **Allow auto-merge**. On a pull request, click **Enable auto-merge**; GitHub merges it as soon as all required checks pass.
3. **Fork safety:** Settings → Actions → General.
   - Fork pull request workflows from outside collaborators → choose the **strictest** option (approval for all outside collaborators / external contributors; the exact label varies).
   - Workflow permissions → **Read repository contents and packages permissions**; leave "Allow GitHub Actions to create and approve pull requests" unticked.

## Claude on pull requests (`@claude`)

Mention `@claude` in a pull request comment, review comment or review, e.g. `@claude please address the review comments`. `.github/workflows/claude.yml` then runs Claude Code, which pushes commits to the PR branch and replies on the PR. CI runs again on those commits.

Locked down because the repository is public:

- Only comments by the **repository owner** trigger it; everyone else is ignored (no runner even starts).
- Only pull requests from branches **in this repository**: a separate job without secrets rejects fork PRs, so the API key never runs next to fork code.
- Claude only reads the owner's comments, so text from other people cannot smuggle in instructions.
- Issues are not handled, only pull requests.
- One Claude run per pull request at a time; a new `@claude` request waits for the running one. Put `@claude` in one place per review (summary or one inline comment), otherwise several runs queue up.

### Setup (one-time, for the DM)

Use the manual setup below, not `/install-github-app`: the quick setup pushes its own, unrestricted workflow file.

1. **Install the Claude GitHub App:** open <https://github.com/apps/claude> → Install → choose **Only select repositories** → `Dungeon-Manager`. (The app requests a broad permission set shared by all Claude GitHub features; the workflow uses Contents, Issues and Pull requests.)
2. **Add the secret:** Settings → Secrets and variables → Actions → New repository secret, name `ANTHROPIC_API_KEY`, value: an API key from <https://platform.claude.com>. Consider a dedicated key with a spending limit.
   - Alternative with a Claude subscription: run `claude setup-token` locally, store the token as `CLAUDE_CODE_OAUTH_TOKEN`, and in `claude.yml` replace the `anthropic_api_key` line with `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`.
3. **Test:** comment `@claude say hello` on an open pull request. The Actions tab shows a `Claude` run; a comment from Claude follows.

To switch it off, delete the secret or disable the `Claude` workflow (Actions → Claude → ⋯ → Disable workflow).

## Repository layout

See [ARCHITECTURE.md §3](docs/ARCHITECTURE.md). Workspace packages are named `@dungeon-manager/<folder>`; the shared TypeScript config lives in `tooling/tsconfig`.

## Working with the agent (for the DM)

1. Install Claude Code and the GitHub CLI (`gh auth login`).
2. Open the folder in Claude Code and run `/next-task`.
3. Review each pull request; comment with `@claude` once T-005 is done, merge when satisfied, then run `/next-task` again.

## License

No license is granted. All rights reserved. The source is public for reference only.
