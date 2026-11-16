# Dungeon Manager

Plan campaigns on the go, present them at the table: maps, fog of war, spells, sound and light on a table-top TV.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions: [docs/adr/](docs/adr/)
- Work queue: [TASKS.md](TASKS.md)
- Agent rules: [CLAUDE.md](CLAUDE.md)

## Development setup

Pinned versions:

| Tool | Version | Pinned in |
|---|---|---|
| Node.js | 26.13.1 (LTS) | `.nvmrc`, `package.json` `engines` |
| pnpm | 12.21.0 | `package.json` `packageManager` |
| Rust | 1.100.0 | `rust-toolchain.toml` |

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

## Repository layout

See [ARCHITECTURE.md §3](docs/ARCHITECTURE.md). Workspace packages are named `@dungeon-manager/<folder>`; the shared TypeScript config lives in `tooling/tsconfig`.

## Working with the agent (for the DM)

1. Install Claude Code and the GitHub CLI (`gh auth login`).
2. Open the folder in Claude Code and run `/next-task`.
3. Review each pull request; comment with `@claude` once T-005 is done, merge when satisfied, then run `/next-task` again.

## License

No license is granted. All rights reserved. The source is public for reference only.
