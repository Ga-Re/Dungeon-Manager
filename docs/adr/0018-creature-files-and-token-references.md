# ADR-0018: Creature files in the library; tokens refer to their creature

- **Status:** Accepted (DM, 2026-11-20)
- **Date:** 2026-11-20
- **Deciders:** DM (product owner), agent

## Context
SPEC §2.5 says that player characters and creatures are global for all campaigns. Each has a D&D 5e core the DM can extend, a look (picture, round token or cut-out figure), a size with a grid footprint and pivot, and senses that vision uses. Tokens in a scene are instances with their own name, HP and conditions. Until T-180a a token is self-contained: name, size, position, level and an optional picture. Tokens (T-107), vision (T-111/T-112), the combat grid rule (T-233) and the creature library (T-180) all build on how a token gets its creature's data. Changing that later would mean migrating every scene, so the file format is fixed first (T-180a). The DM settled the details in an interview on 2026-11-20.

## Options considered
1. **Keep self-contained tokens.** Every token carries all its values.
   - Pros: no new file, no lookups.
   - Cons: a correction to a creature never reaches its tokens. Every scene repeats the same data. SPEC's global library has no home.
2. **Tokens copy their creature when placed.** The reference only records where the token came from.
   - Pros: scenes are independent of later changes.
   - Cons: corrections never reach old scenes, and the data is duplicated in every token.
3. **Creature files, and tokens refer to them (chosen).**
   - Pros: one place for a creature's data, edited once for every scene. Tokens stay small.
   - Cons: a reference can point to nothing (deleted, not synced yet), so it needs a placeholder. Creatures are looked up on the host.
4. **Storage variants considered by the DM:**
   - **A file per pack:** fewer files, but one sync conflict hits many creatures.
   - **A sidecar next to the token picture:** fits picture packs, but not a creature without a picture or with several pictures.
   - **A separate `.md` stat block next to the JSON:** editable in Obsidian, but two files per creature.

## Decision
Creatures are files, and tokens refer to them (option 3).

**Where the files live**
- **Global creatures:** `library/creatures/<folders the DM makes>/<id>.json`, one file per creature. Ids are unique in the library; an id found in a second folder is reported, not used.
- **Player characters:** the same format in `campaigns/<slug>/characters/<id>.json`, linked to the campaign's player by `playerId`. They belong to one table; monsters are global.

**What a creature file holds (version 1, loose schema so a newer app's fields are kept)**
- **Identity:** `id`, `name`, `type`, `challenge` ("1/4").
- **Size:** `size` as the 5e category, which gives the default footprint (Tiny shares a cell with up to three others, Small and Medium 1×1, Large 2×2, Huge 3×3, Gargantuan 4×4). An optional `footprint` in whole cells (`cols`, `rows`, e.g. 2×4 for a wagon) and an optional `pivot`.
- **Lean 5e core:**
  - `hp` (value and/or dice formula), `ac`, `initiativeModifier`;
  - `speeds` (walk, fly, swim, climb, burrow) in feet;
  - `senses` (darkvision, blindsight, tremorsense, truesight) in feet.
- **Look:** `token` and `portrait` pictures as asset references, `style` ("round" or "cutout"), the faction ring colour, `scale` and `offset`.
- **The DM's own fields:** a list of name and value (text or number).
- **Stat block:** actions, spells and tactics as Markdown in the file (`statBlock`), so a creature is one file.

**How a token refers to its creature**
- **The reference:** `creature: { source: "library" | "campaign", id }`, plus an optional `shape` reference for a form the creature has taken (used by T-180).
- **What the token keeps:** only its own values: name, position, level, a different size or picture, and later HP and conditions. Everything else comes from the creature, or from the active shape, when the scene is used. A correction therefore reaches every scene – except the size: a token always carries its own size (the creature's when placed), so a token's footprint and a shape's size follow the token until T-107/T-180 decide whether the token's size becomes an optional override.
- **Old tokens:** the fields are optional and additive, so existing tokens stay valid and no scene is migrated.

**A missing creature**
- The token keeps all its data.
- The host marks it for a placeholder picture.
- Once the creature is back, everything is as before.

**Visibility**
- Creatures are read on the host only.
- `projectForViewer` builds tokens from an allow-list, so neither the reference nor any creature value reaches the TV or a companion.

**Shared core functions**
- `gridFootprint`, `occupiedCells` and `canOccupy` hold the T-233 rule: one token per cell, up to four Tiny ones share a cell, and a larger token claims every cell of its footprint.
- `resolveTokenCreature` turns a token into its creature, picture and footprint.

## Consequences
- T-107 draws tokens through `resolveTokenCreature`, including the placeholder. T-180 builds the library on the storage functions:
  - **Library creatures:** `listCreatures`, `loadCreature`, `saveCreature`;
  - **Player characters:** `listCharacters`, `loadCharacter`, `saveCharacter`.
- **Live reloading:** the file watcher does not react to creature files yet. T-180 adds that, together with the editor and the import.
- **Stat block:** because it lives inside the JSON, it cannot be edited directly in Obsidian. That is the price of one file per creature (DM decision).
- **Placeholders:** a library opened on another device before its creatures have synced shows placeholders until they arrive.
- **Moving a creature to another folder** keeps its id, so tokens keep working.
