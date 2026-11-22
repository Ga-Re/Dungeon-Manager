# ADR-0019: Animated fog engine (Nebelweber look, spread by speed, biomes)

- **Status:** Proposed
- **Date:** 2026-11-22
- **Deciders:** DM (product owner), agent

## Context
The DM built a stand-alone fog prototype ("Nebelweber") and wants its look, tools and controls to replace today's fog engine: fog that drifts and wobbles at its edges, a reveal or hide that creeps from the fog edge in ragged tongues, eight biomes (e.g. a snow storm, heat shimmer in the desert) and controls for speed, transition, edge wobble and movement. The prototype stores fog as a screen-space grid, renders everything in one shader and lets the edge wobble outwards as well.

Today's engine (SPEC §4, ARCHITECTURE §8, T-136a, T-136b, T-167) stores fog as polygons in map pixels per level (ADR-0012), which rooms, secret rooms, levels and `projectForViewer` build on. The player view is fail-closed: the exact hard fog lies underneath, soft edges and fades only ever darken. A change spreads from the edge over a fixed duration (0–3 s) per device. Animated effects per map are planned as T-168 (sidecar setting, session override, GPU only). Video maps are a `<video>` element under the canvas (ADR-0010). The player view must keep ≥ 60 FPS with a 4K video map, fog and 20 tokens (ARCHITECTURE §11).

The DM settled the details in an interview on 2026-11-22.

## Options considered
1. **Keep the current engine.** Add only T-168's four effects as planned.
   - Pros: no change to proven, fail-closed code.
   - Cons: not what the DM asked for: no ragged spread, no edge wobble, no lasso or ellipse, no speed control.
2. **Port the prototype as it is:** grid mask as the stored fog, edge wobble in both directions, heat shimmer that distorts the map.
   - Pros: looks exactly like the prototype.
   - Cons: a file format change with a migration for every campaign; rooms, secret rooms and the projection would need rebuilding on a grid; an outward wobble shows hidden map pixels to players; distorting a video map breaks ADR-0010 and risks the 4K budget.
3. **Bring the prototype's look, spread, biomes, tools and controls into the current engine (chosen).** Fog stays polygons in map pixels; the renderer gains the animated look on top of the fail-closed hard fog.
   - Pros: no stored fog format change; rooms, levels and projection stay as they are; hidden data stays hidden; works for image and video maps.
   - Cons: the edge wobbles only towards the revealed side, so it looks a little calmer than the prototype; more shader work to keep within the budget.

## Decision
Option 3, with the DM's choices:

- **Fog data:** stays polygons in map pixels (ADR-0012 unchanged). New tools produce polygons: a **lasso** (freehand, closed) and an **ellipse** that replaces the circle (Shift draws a circle).
- **Look:** the fog is drawn by a shader with drifting, domain-warped noise in the biome's colours. Its edge wobbles with a faster, small-scale turbulence – **only towards the revealed side**. The player view keeps the exact hard fog underneath, so no pixel outside the revealed polygons ever shows the map, whatever the animation does.
- **Spread:** a change spreads at a **speed in grid cells per second** (instead of a fixed duration), so a large area takes longer than a small one; the front is ragged (a noise cost field, seeded per map so it is deterministic); each spot turns over in a **transition** time. The three directions of T-167 (from the revealed edge, from the middle, from the fog side) stay. "Sofort" switches at once.
- **Biomes:** eight – Bodennebel, Schneesturm, Hitzeflimmern, Glutasche, Sumpfmiasma, Seenebel, Arkaner Dunst, Finsternis – with colours, wind streaks, particles (snow, embers, motes, sand) and underglow. Heat shimmer moves only the fog and its edge, never the map (so video maps need no change to ADR-0010). Particles may drift over the revealed side next to the edge, like the wobble; they never make fog transparent.
- **Where settings live:**
  - per map in the sidecar: biome and strength (the default for every scene of that map);
  - per scene: a live change of biome or strength during play, as an optional field; "reset scene" takes the map's setting again;
  - per device (like today's fade duration): speed, transition, edge wobble, movement and an effect **quality** (Hoch / Mittel / Aus; Aus is today's still fog).
- **Controls:** the Nebel ribbon holds the tools, biome, strength, speed and "Nebel ausblenden"; the settings dialog's "Nebel & Animation" holds transition, edge wobble, movement and quality (ADR-0011: no floating panels).
- **"Nebel ausblenden"** (key N) fades the fog out in the **DM window only**; the TV never changes through it.
- **Performance:** the effect renders at reduced resolution; the quality setting lowers it further or switches it off. The DM measures each step with `pnpm bench` on the reference notebook.

## Consequences
- Sidecar and scene files gain optional fields (biome, strength), additive like `parentSceneId` (no version bump, no migration); the exact format is shown to the DM in T-168 before it is built.
- SPEC §4 changes (spread by speed, tools, biomes, hiding fog in the DM window); ARCHITECTURE §8 and §15 are updated by each task as it lands.
- T-168's criterion "animates only over fogged area" becomes "never makes fog transparent; may drift over the revealed side next to the edge".
- The fade duration setting of T-136b turns into the transition setting; the stored device value is read as a transition, not migrated in any file.
- Follow-up tasks (DM decision: before the rest of the "Next up" list): T-245 animated fog look, T-246 spread by speed, T-247 lasso and ellipse, T-168 biomes, T-248 hide fog in the DM window.
- The benchmark criterion stays open in each task until the DM has measured it on the reference notebook.
