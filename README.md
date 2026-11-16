# Dungeon Manager

Plan campaigns on the go, present them at the table: maps, fog of war, spells, sound and light on a table-top TV.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions: [docs/adr/](docs/adr/)
- Work queue: [TASKS.md](TASKS.md)
- Agent rules: [CLAUDE.md](CLAUDE.md)

## Getting started (for the DM)

1. Create a **private** GitHub repository and push this folder as the initial commit on `main`.
2. Enable branch protection on `main`: require a pull request and passing status checks (checks appear after task T-004).
3. Install Claude Code and the GitHub CLI (`gh auth login`).
4. Open the folder in Claude Code and run `/next-task`.
5. Review each pull request; comment with `@claude` once T-005 is done, merge when satisfied, then run `/next-task` again.

Setup instructions for Node, pnpm, Rust and the mobile toolchain are added by task T-001.
