---
name: next-task
description: Start the next task from TASKS.md following the project workflow (pick, branch, read refs, plan). Use when the DM says to start or continue work.
disable-model-invocation: true
---

Start work on a task following CLAUDE.md.

1. If `$ARGUMENTS` names a task ID, use it. Otherwise pick the first task in `TASKS.md` with status `todo` whose dependencies are all `done`. If none is available, report why (blocked/review) and stop.
2. Make sure `main` is up to date (`git checkout main && git pull`), then create `task/<ID>-<short-slug>`.
3. Set the task status to `in-progress` in `TASKS.md`.
4. Read the task, the referenced SPEC sections, ARCHITECTURE sections and ADRs, and the existing code in the affected packages. If the task involves UI components, layout, styling or UX flows, also read and apply `.claude/skills/ui-design/SKILL.md`.
5. Write the plan: approach, files to touch, tests to add (unit/component/e2e/visual), risks, open questions. For UI tasks, name the layout zone and the `@dungeon-manager/ui` tokens/primitives to use.
6. If anything triggers a "When to stop and ask" rule from CLAUDE.md, present the structured question now and wait.
7. Otherwise show the plan briefly and start implementing: tests first for logic.
