# ADR-0013: Obsidian and Markdown tools instead of a DM phone app; DM remote in the web app

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** DM (product owner), agent
- Supersedes ADR-0003

## Context
ADR-0003 planned a React Native/Expo phone app for the DM (SPEC 2.3): offline planning (notes, wiki, map preparation, scene assembly, encounters) as the main purpose, plus remote control and a DM screen at the table. T-008 (app skeleton) was deferred because most players and the DM use iPhones; iOS builds need a Mac, an Apple Developer account and a native module for folder access (ARCHITECTURE §14).

The DM wants to drop the idea of an own app: planning on the go should happen in Obsidian or a similar second-brain tool, and the results should be available in Dungeon Manager. The local QR web app (companion, ADR-0007) stays optional for players.

Notes are already Obsidian-compatible Markdown with YAML front matter and `[[wiki links]]` (ADR-0006), stored in the synced library folder (ADR-0005). Cloud provider APIs are not allowed (ADR-0005), so the integration must work through files.

## Options considered
1. **Keep the current approach** (own Expo app, ADR-0003) – best mobile UX for DM-specific tasks (map preparation, encounter builder), shares `core`/`schema`. Con: a whole second app to build and maintain; iOS distribution cost and effort; rebuilds a Markdown editor and wiki that Obsidian already does well.
2. **Obsidian + plain Markdown folder as the mobile planning tool; DM remote as a mode of the web app** – the campaign's wiki/notes are an Obsidian vault in the sync folder; scenes can be drafted as notes with front matter (map, sound, light, tokens) that the desktop turns into scene drafts. Remote control at the table becomes a DM mode of the served web app (`dm-remote` role, ADR-0007), no install. Pros: no mobile app, works with Obsidian, Logseq, iA Writer etc., offline via the user's sync. Cons: no map preparation on the phone (grid, rooms, asset placement stay on the desktop); scene drafts in front matter are less guided than a custom UI; the DM remote is only available on the LAN during a session.
3. **Option 2 plus an own Obsidian plugin** – pickers for library maps, sounds and tokens inside Obsidian. More comfort, but another product with its own release cycle and API surface; can be added later without changing option 2's file format.
4. **Cloud integrations (Notion & co.)** – conflicts with ADR-0005 (no cloud APIs) and offline-first. Rejected.

## Decision
Option 2. It removes the most expensive part of the roadmap (an iOS/Android app) while keeping the main value – planning on the go – in tools the DM already uses, and it builds on files and formats we already have (ADR-0005, ADR-0006). The DM's remote control at the table moves into the web app that the desktop already serves for players (ADR-0007), as a separately paired DM role.

## Consequences
- **Removed:** `apps/mobile`, the Expo/React Native Skia/Maestro parts of the stack, T-008 and the mobile design-token task (T-132). The folder layout change (removing `apps/mobile`) is done in T-149.
- **Obsidian vault:** the campaign folder (or the library root – decided in T-150) works as a vault. Storage ignores tool folders such as `.obsidian/`. The desktop watches notes and picks up changes made on the phone; conflict copies are handled as in ARCHITECTURE §6.3. The Markdown round-trip rule of ADR-0006 stays.
- **Scene drafts from notes:** a documented front-matter format (e.g. `type: scene`, `map`, `sound`, `light`, `tokens`) is validated with zod; the desktop offers such notes as scene drafts. This is a new file format (T-150).
- **DM remote (web app):** a `dm-remote` role in the companion with its own pairing (QR on the desktop, stronger than player pairing, revocable), rights checked in `core` like every other command (ADR-0007). It gets DM-level projections, so pairing and session handling are security-relevant and need DM review (T-151).
- **Previews** (ARCHITECTURE §6.5) are no longer for a phone app; they stay useful for the web app and handouts.
- **Lost on the go:** map preparation (grid, rooms, asset placement) and the encounter builder on the phone. Encounters can be drafted as notes; everything visual stays on the desktop.
- **Reversible:** option 3 (Obsidian plugin) or a native app can be added later on top of the same files.
