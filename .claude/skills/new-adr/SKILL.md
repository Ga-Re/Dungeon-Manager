---
name: new-adr
description: Create a new Architecture Decision Record with status Proposed in docs/adr. Use when a significant technical decision is made or when deviating from or replacing an accepted ADR.
---

Create an ADR for: $ARGUMENTS

1. Find the highest number in `docs/adr/` and use the next one (4 digits).
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-kebab-title.md`.
3. Fill in context, at least two real options (including "keep current approach" when replacing something), decision and consequences. Set **Status: Proposed** and today's date.
4. If it supersedes an accepted ADR, write "Supersedes ADR-XXXX" under the status. Accepted ADRs cannot be edited by the agent (a hook blocks it): ask the DM to change the old ADR's status to "Superseded by ADR-NNNN" when they accept the new one.
5. Update `docs/ARCHITECTURE.md` in the same PR if the decision changes it.
6. Mention the ADR in the PR under "Deviations & open questions" so the DM can accept or reject it.
