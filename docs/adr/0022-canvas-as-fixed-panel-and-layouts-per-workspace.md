# ADR-0022: The canvas is a fixed central panel; each workspace keeps its own layout

- **Status:** Accepted (DM, 2026-11-23)
- **Date:** 2026-11-23
- **Deciders:** DM (product owner), agent
- **Amends:** ADR-0021 (how the canvas is built). Everything else in ADR-0021 stays in force.

## Context

ADR-0021 describes an editing workspace's canvas as "a slot under the ribbon; the dockview layout is placed over it, its centre left empty and click-through". Dockview (8.9.1, free edition) cannot leave its centre empty. T-258 built the Map Forge's canvas instead as the map panel fixed in the middle: docked, alone in its group, without a tab bar and locked, so it can be neither closed nor moved, and the other panels dock around it.

The DM window still has one panel layout for all workspaces (`dm.layout`), although ADR-0017 planned one per workspace. So the Map Forge's canvas changes the shared layout, and some of it stays after leaving the Forge:
- a map hidden in the Game-Orchestrator is shown again;
- panels the DM had tabbed with the map move beside it;
- a floating map is docked again.

Edge sidebars (T-259) are global for the same reason.

## Options considered

1. **Keep one layout and accept the side effects.**
   - Pros: no work.
   - Cons: the Game-Orchestrator's layout can change after a Forge visit, against ADR-0021 ("the Orchestrator keeps today's free layout").
2. **Restore the Orchestrator's map state when leaving the Forge.**
   - Pros: small.
   - Cons: brittle, as the DM may rearrange in between; it is still one layout for all.
3. **The slot under the panels, as ADR-0021 wrote.**
   - Pros: none for the DM: it looks and works the same in the Forge.
   - Cons: dockview needs a hidden placeholder panel and click-through workarounds.
4. **The fixed central panel, plus one layout and one set of sidebars per workspace (chosen).** As ADR-0017 planned.

## Decision

Option 4 (DM, 2026-11-23, on PR #143):
- **Canvas:** an editing workspace's canvas is its document's panel fixed in the middle of the layout – no tab bar, locked, always shown – rather than a slot under the layout.
- **Layouts per workspace:** each workspace keeps its own panel layout and its own edge sidebars in device storage. The layout today becomes the Game-Orchestrator's; the other workspaces start from their default layout. Switching workspaces switches the layout. Named layouts are already per workspace.

## Consequences

- **T-263 (new):** per-workspace layouts and sidebars (`dm.layout.<workspace>`, `dm.edgePanels.<workspace>`), with the existing layout moved to the Game-Orchestrator once. Device storage only, no campaign data.
- **Until T-263:** a Forge visit can change the Orchestrator's map panel as described above.
- **ADR-0021:** when the DM marks it as amended by this ADR, its sentence "the dockview layout is placed over it, its centre left empty and click-through" no longer applies.
- **Edge sidebars:** they live in `apps/desktop` (shell), not in `@dungeon-manager/ui` as ADR-0021 suggested, because they need dockview's layout. They move to `ui` only if another app needs them.
