# ADR-0007: Desktop as authoritative LAN host; companion as a served web app

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
Players must be able to join without installing anything; the DM phone acts as remote. Hidden information must never reach players.

## Decision
The desktop Rust backend hosts HTTP (serving `apps/companion`) and WebSocket on the LAN. Clients send commands; the host checks permissions via `core`, applies them and broadcasts per-viewer projected state. Pairing via one-time QR tokens.

## Consequences
No peer-to-peer logic; clients are thin and reconnect with full snapshots. Protocol is versioned in `packages/protocol`.
