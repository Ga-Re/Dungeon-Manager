---
name: finish-task
description: Finish the current task - run all checks, self-review, run the reviewer subagent, update TASKS.md and open the pull request. Use when implementation of a task is complete.
disable-model-invocation: true
---

Finish the current task following CLAUDE.md. Do not skip steps.

1. Determine the task ID from the current branch name.
2. Re-read the task's acceptance criteria; confirm each one is met and covered by a test. If not, go back and finish it.
3. Run `pnpm check`. If Rust changed: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`. Run relevant `pnpm test:e2e` / `pnpm test:visual`. Fix failures – never weaken tests or gates.
4. Self-review `git diff main...HEAD`: scope, naming, dead code, i18n, hidden-data safety, docs.
5. Update docs if behaviour or structure changed (SPEC, ARCHITECTURE, new ADR via `/new-adr`).
6. Use the `reviewer` subagent on the branch. Fix blocking findings; for any finding you do not fix, write the reason in the PR.
7. Commit with Conventional Commits, push the branch.
8. Set the task status to `done` in `TASKS.md` (commit included in the PR; it becomes true with the merge).
9. Open the PR with `gh pr create` using the PR template from CLAUDE.md, including the reviewer summary and any deviations/open questions.
10. Wait for CI. When all required checks are green and no open question for the DM remains, merge the PR (merge commit). If CI fails, fix the root cause and push again – never weaken tests or gates.
11. Report the PR link and the merge result.
