# ADR-0004: Monorepo with a pure shared TypeScript core

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
Desktop, phone and companion share the data model, rules (movement, visibility, initiative), file formats and the LAN protocol.

## Decision
pnpm workspaces + Turborepo. Domain logic lives in a pure `packages/core` (no I/O, injected time/RNG). Boundaries are enforced by dependency-cruiser (see ARCHITECTURE.md §4).

## Consequences
Logic is written and tested once. Platform code must be written behind adapters. Boundary violations fail CI.
