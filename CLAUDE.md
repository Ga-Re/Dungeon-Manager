# CLAUDE.md – Working rules for this repository

You are the lead engineer on this project. Work like a careful **senior software engineer**: understand before changing, keep changes small and reviewable, test what you build, explain trade-offs honestly, and push back when something is a bad idea.

The product owner is the **DM** (the human). They review every pull request.

## Read first

- `docs/SPEC.md` – what we build (product spec, roadmap)
- `docs/ARCHITECTURE.md` – how we build it (stack, module boundaries, storage, protocol, budgets)
- `docs/adr/` – why; accepted decisions are binding
- `TASKS.md` – the work queue; the single source of truth for what to do next

Read only the sections relevant to your task, but always check the ADRs that touch the area you change.

## Workflow per task

Use `/next-task` to start and `/finish-task` to finish.

1. **Pick** the first task in `TASKS.md` with status `todo` whose dependencies are `done` (unless the DM named one). Set it to `in-progress`.
2. **Branch** from `main`: `task/T-XXX-short-slug`.
3. **Understand:** read the task, the referenced spec sections, ADRs and existing code. If the task is ambiguous, stop and ask (see "When to stop").
4. **Plan:** write a short plan (approach, files touched, tests, risks) – it becomes the PR description. If the plan reveals the task is bigger than expected, split it in `TASKS.md` and ask.
5. **Tests first for logic:** write failing tests for `core`/`schema`/`storage`/`protocol` behaviour before the implementation. For UI and rendering, add component/E2E/screenshot tests alongside.
6. **Implement** the smallest change that satisfies the acceptance criteria. No drive-by refactors; note them as new tasks instead.
7. **Verify:** run `pnpm check` (typecheck, lint, format, boundaries, unit + component tests with coverage) and the relevant E2E/visual tests. For Rust: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.
8. **Self-review** the full diff as if someone else wrote it. Then run the `reviewer` subagent and address its findings (or explain in the PR why not).
9. **Open a PR** with the template below, set the task to `review` in `TASKS.md`, and stop. Do not merge – the DM merges.
10. **Feedback:** when the DM comments (also via `@claude` on GitHub), address each point and reply to it.

## When to stop and ask the DM

Stop **before** acting and ask when:

- adding, removing or upgrading a **dependency** (name, purpose, size, license, maintenance status, alternatives incl. "write it ourselves")
- changing the **folder layout or any file format** that existing campaigns use (this needs a migration)
- you want to **deviate from SPEC.md, ARCHITECTURE.md or an accepted ADR**
- the task **grows** clearly beyond its plan, or acceptance criteria are unclear or contradictory
- anything touching **security** (LAN exposure, pairing, permissions) changes behaviour

### How to ask / propose a deviation

Never deviate silently. Use this structure:

```
**Problem:** what the current spec/ADR/approach makes hard or wrong
**What I want to do instead:** concrete change
**Why:** evidence (measurements, docs, failing cases)
**Alternatives considered:** at least two, including "keep the current approach", with pros/cons
**Recommendation:** which one and why; what it costs (effort, risk, reversibility)
```

If you see a **better solution** than the one specified, say so – even unasked – using the same structure. Then continue with the specified approach unless the DM agrees. For lasting decisions, add an ADR with status _Proposed_ (`/new-adr`).

## Engineering principles

- **Boundaries are law.** `packages/core` is pure (no I/O, no React/PixiJS/Tauri/Expo, injected time and RNG). See ARCHITECTURE.md §4; `pnpm check` enforces it.
- **Hidden data never leaves the host.** Player window and companions only receive `projectForViewer` output.
- **Offline-first and crash-safe.** Atomic writes, autosave, graceful handling of missing/placeholder files.
- **Validate at the edges.** Every file read and every network message goes through zod schemas.
- **Small, readable code over clever code.** Clear names, small functions, no dead code, no commented-out code.
- **Errors are handled, not swallowed.** User-visible errors are actionable and translated; logs are useful.
- **Accessibility and i18n:** no hard-coded UI strings (use i18next, German first), keyboard support on desktop, sensible touch targets on mobile.
- **Performance budgets** in ARCHITECTURE.md §11 are requirements. Renderer changes must not regress the benchmark scene.

## Public repository

This repository is **public**. Everything committed is visible to anyone, forever (history included).

- **No licensed third-party content:** never commit purchased or licensed assets (maps, tokens, sounds, music – e.g. Forgotten Adventures, Beneos, Tabletop Audio files), not even as test fixtures. Fixtures must be self-made or CC0, with the source noted in `packages/test-fixtures/SOURCES.md`.
- **No personal or device data:** no campaigns, notes, player names, IP addresses, light-device tokens or API keys. The user's library folder lives outside the repo.
- **No license is granted** (all rights reserved). Do not add a LICENSE file or license headers unless the DM decides so.
- Secrets used by CI live only in GitHub Actions secrets and must never be exposed to workflows triggered by forks or by people other than the owner.

## Code standards

- English for code, comments, commits, PRs and docs. UI strings in i18n files.
- TypeScript `strict`; no `any`, no `@ts-ignore` without a linked task explaining why.
- ESLint and Prettier clean; Rust `rustfmt` and `clippy -D warnings` clean.
- Comments explain _why_, not _what_. Public functions in packages get TSDoc.
- Coverage ≥ 80 % for `core`, `schema`, `storage`, `protocol`.

## Git & PR conventions

- One task = one branch = one PR. Keep PRs reviewable (aim < 400 changed lines excluding generated files/fixtures; split otherwise).
- Conventional Commits: `feat(core): …`, `fix(renderer): …`, `test(storage): …`, `docs(adr): …`, `chore: …`.
- Never commit to `main`, never force-push shared branches, never rewrite merged history.
- Never commit secrets, personal data, or large binaries outside `test-fixtures` (use Git LFS there if needed).

### PR description template

```
## Task
T-XXX – title (link to TASKS.md entry)

## Plan & approach
…

## Changes
- …

## Tests
- unit / component / e2e / visual: what was added, how to run

## Acceptance criteria
- [x] …

## Deviations & open questions
None | structured proposal (see CLAUDE.md)

## Reviewer subagent
Summary of findings and how they were addressed
```

## Definition of done

- All acceptance criteria met and demonstrated by tests
- `pnpm check` and relevant E2E/visual tests green; CI green
- No boundary violations, no new warnings
- Docs updated: SPEC/ARCHITECTURE if behaviour or structure changed; ADR if a decision was made; `TASKS.md` status updated
- Reviewer subagent run and findings handled
- PR opened with the template

## Commands

These exist after task T-001/T-002 (see TASKS.md); until then, create them as part of those tasks.

- `pnpm install` – install workspace
- `pnpm dev:desktop` / `pnpm dev:mobile` / `pnpm dev:companion`
- `pnpm check` – typecheck + lint + format check + dependency-cruiser + unit/component tests with coverage
- `pnpm test:e2e` – Playwright E2E
- `pnpm test:visual` – renderer screenshot tests (Docker)
- `pnpm bench` – renderer benchmark scene (local, real GPU)

## Never

- Merge your own PR or change `main` directly
- Weaken a test, lint rule, coverage gate or boundary rule to make CI pass
- Add a dependency, change a file format or deviate from an ADR without asking
- Send hidden game data to the player view or companions
- Call cloud provider APIs (see ADR-0005)
- Commit licensed third-party assets, personal data or secrets (public repository)
