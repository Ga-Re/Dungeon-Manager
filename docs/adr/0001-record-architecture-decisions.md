# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
The project is built mainly by a coding agent across many sessions. Without a record of why decisions were made, they get re-litigated or silently reversed.

## Decision
Significant technical decisions are recorded as short ADRs in `docs/adr/` using `0000-template.md`. Accepted ADRs are not edited; they are superseded by a new ADR.

## Consequences
The agent must read relevant ADRs before work and propose a new ADR (status *Proposed*) whenever it wants to deviate. The DM accepts or rejects it in the PR.
