# ADR-0009: Testing strategy and quality gates

- **Status:** Accepted
- **Date:** 2026-11-16

## Decision
Mandatory: unit tests for logic, component tests for React, E2E tests for user flows, screenshot tests for rendering (details in ARCHITECTURE.md §12). Coverage ≥ 80 % for `core`, `schema`, `storage`, `protocol`. TypeScript strict without `any`; ESLint, Prettier, clippy, rustfmt clean. Performance budgets (ARCHITECTURE.md §11) are measured on real hardware before each release.

## Consequences
CI blocks merges on any failed gate. Rendering tests run in a pinned Docker image.
