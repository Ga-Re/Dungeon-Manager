# ADR-0005: Storage in a user-chosen folder, one file per entity, no cloud APIs

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
The DM wants to choose any folder that any cloud client syncs, without the app integrating cloud APIs.

## Options considered
1. **User folder + file per entity** – provider-agnostic, no accounts. Con: conflicts surface as provider-specific conflict copies; on-demand placeholders; Android cloud apps rarely sync folders.
2. **Built-in provider APIs** – reliable sync. Con: per-provider work, OAuth, review processes.
3. **Single SQLite file in the folder** – simple querying. Con: corrupted by file-level sync.

## Decision
Option 1. JSON with `schemaVersion` for structured data, Markdown for notes, atomic writes, conflict-copy detection, graceful handling of placeholders. Device settings stay outside the folder.

## Consequences
An in-app guide per OS/provider is required. Any change to layout or format needs a migration and DM approval.
