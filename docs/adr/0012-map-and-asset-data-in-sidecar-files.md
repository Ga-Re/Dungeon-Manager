# ADR-0012: Map and asset data in sidecar files, scene overrides on top

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** DM (product owner), agent

## Context
Maps and assets live in the global library (ADR-0005, ARCHITECTURE §6.2) and are shared by all campaigns (SPEC 8.2, T-124). The DM wants everything that describes a map or asset to be defined **once, globally**, and used by every campaign:

- grid calibration / scale (so minis and the grid always fit on the TV, T-106, T-125),
- name, tags, origin/license (T-125, T-126),
- levels, walls, doors (incl. secret doors), windows, light sources,
- rooms and areas (incl. secret rooms) that the DM reveals with one click (T-108c),
- for assets: footprint, occlusion mask (from the alpha channel, editable) with a blocker type (blocks sight and light / one-way / partial sight), and variants such as a house's exterior and interior.

Scenes must still be able to deviate: a wall has collapsed, a door is bricked up, a room has a different shape, a lamp is off. When the DM later improves the global data, all scenes pick it up immediately. Today a scene embeds its whole `map` (asset ref, grid, levels) in `scenes/<id>.json`, so each scene has its own copy and nothing is shared. Schema v1 is not released yet (T-101), so this is the moment to change it.

Constraints: the library sits in a cloud-synced folder (ADR-0005) – small files sync fast and conflict rarely; video maps are streamed in byte ranges from the original file (ADR-0010); imported asset packs (thousands of files in folders) must stay usable as they are; every file read is validated with zod (CLAUDE.md); hidden data (secret doors and rooms) never leaves the host (ARCHITECTURE §5).

## Options considered
1. **Keep the current approach** (map data embedded per scene) – no new file. Con: nothing is shared; every scene re-calibrates; improving walls means editing every scene; contradicts the DM's requirement.
2. **One container file per map (`.map`, e.g. a ZIP with image + JSON)** – one self-contained file, easy to pass around. Con: every small edit (one wall) rewrites the whole container – a 300 MB video map is re-uploaded by the sync client each time; byte-range streaming of a video inside a ZIP is awkward; asset packs must be converted on import.
3. **One central library index** (all metadata in one JSON) – fast search. Con: one large, hot file that every edit touches – the worst case for sync conflicts; a conflict copy loses edits to unrelated maps.
4. **Sidecar file per library file plus an export bundle** – `castle.webp` gets `castle.webp.dm.json` next to it. Small, per-item files sync fast and conflict per item only; originals stay untouched and streamable; packs work in place (a missing sidecar means "defaults"). For sharing, a map or asset is exported/imported as a `.dmmap` bundle (ZIP of original + sidecar). Con: two files per item – moving a file outside the app can separate them (mitigated: the sidecar stores the original's hash, ARCHITECTURE §6.3 re-linking).

## Decision
Option 4.

- **Sidecar:** `<file>.dm.json` next to each library file, versioned (`schemaVersion`) and validated by a zod schema in `packages/schema`. It holds the item's metadata (name, tags, origin/license, hash of the original), scale (map: grid calibration; asset/token: footprint in cells), levels, walls, doors, windows, lights, rooms/areas, and for assets the occlusion mask, blocker type and variants. Every element has a **stable id**. A missing sidecar means defaults; the desktop creates it on first edit.
- **Scenes reference, not copy:** a scene stores the map's asset ref plus **overrides keyed by element id** (hide/show a wall or door, change a room's shape or name, switch a light) and its own additions (placed assets, door states, fog, tokens). Scale and grid are not overridable per scene, so minis always fit.
- **Global edits apply everywhere immediately.** An override whose target id no longer exists is kept but inactive and flagged as **orphaned**; the scene shows the DM a hint to clean it up. Fog stays in map pixels and is unaffected; room-based actions refer to room ids.
- **Secret elements** (secret doors, secret rooms and their contents) are ordinary sidecar/scene data on the host; only `projectForViewer` output reaches the player window and companions, so they are never sent until discovered. Sidecars are never served to companions.
- **Export/import:** `.dmmap` bundle = original + sidecar (+ variant files of an asset), for sharing between libraries.

## Consequences
- **Easier:** calibrate a map once; improve walls/rooms once for every campaign; asset packs work in place; small sync uploads.
- **Harder:** scene state is now "global data + overrides" – `core` needs a pure merge step (`resolveMap(sidecar, overrides)`) used by the renderer, vision and projection, with tests for orphaned overrides. Storage must watch sidecars like scenes and handle their conflict copies (ARCHITECTURE §6.3).
- **File format change:** `sceneSchema.map` becomes a reference plus overrides; grid and levels move to the sidecar. Schema v1 is unreleased, so this is changed in place; the migration framework (T-101) covers any existing test campaigns.
- **Renames outside the app** can orphan a sidecar; re-linking by hash (ARCHITECTURE §6.3) re-attaches it.
- **Follow-up tasks:** T-134 (sidecar schema, storage and resolve step), then T-125/T-126 and T-108c build on it; stage 5 tasks add walls, vision, light, masks, overrides and interiors; T-148 adds `.dmmap` export/import.
