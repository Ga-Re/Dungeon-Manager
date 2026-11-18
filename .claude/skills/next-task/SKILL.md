---
name: next-task
description: Start the next task from TASKS.md following the project workflow (pick, branch, read refs, plan). Use when the DM says to start or continue work.
disable-model-invocation: true
---

Start work on a task following CLAUDE.md.

1. If `$ARGUMENTS` names a task ID, use it. Otherwise pick the first task in `TASKS.md` with status `todo` whose dependencies are all `done`. If none is available, report why (blocked/review) and stop.
2. Make sure `main` is up to date (`git checkout main && git pull`), then create `task/<ID>-<short-slug>`.
3. Set the task status to `in-progress` in `TASKS.md`.
4. Read the task, the referenced SPEC sections, ARCHITECTURE sections and ADRs, and the existing code in the affected packages.
5. Write the plan: approach, files to touch, tests to add (unit/component/e2e/visual), risks, open questions.
6. If anything triggers a "When to stop and ask" rule from CLAUDE.md, present the structured question now and wait.
7. Otherwise show the plan briefly and start implementing: tests first for logic.
8. Read `docs/SPEC.md` and `docs/ARCHITECTURE.md` sections referenced by the task, plus any ADRs it touches. If the task involves UI components, layout, styling, or UX flows, also read and apply `.claude/skills/ui-design/SKILL.md`.
9. Propose a short implementation plan (files to create/modify, tests to write, and—for UI tasks—which Fusion 360 layout zone and `@dungeon-manager/ui` tokens/primitives will be used) and confirm with the user before writing code if the scope is non-trivial.
