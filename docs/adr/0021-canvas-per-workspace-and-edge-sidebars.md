# ADR-0021: A fixed canvas per workspace; panels dock around it and fold into edge sidebars

- **Status:** Proposed
- **Date:** 2026-11-22
- **Deciders:** DM (product owner), agent
- **Amends:** ADR-0017 ("every workspace consists of panels, including the map") and ADR-0020 (command panels float "over the map panel"). Everything else in both stays in force.

## Context

ADR-0017 made every part of a workspace a dockable panel, the map included. In use (DM feedback 2026-11-22, with a screenshot of a sidebar of vertical tabs) this feels wrong outside play:
- In the Map Forge the map is one panel among others; in Fusion 360 the document *is* the canvas, and the browser and other panels lie around or over it.
- Command panels (ADR-0020) live inside the map panel, so a tool such as "Raum anlegen" is cut off by the panel's edges and cannot sit over the browser.
- Panels can only be docked, floated or closed. The DM wants a panel to fold into a **sidebar of vertical tabs** at the window edge that slides the panel out on a click, with a smooth animation, and back when the DM works elsewhere.

The DM decided per workspace what the canvas is (2026-11-22):
- **Map Forge:** the map.
- **Asset Vault:** the preview of the selected asset.
- **Tokens & Kreaturen:** the preview of the selected token or creature.
- **Campaign Atlas:** the campaign overview.
- **Game-Orchestrator:** no fixed canvas; everything stays dockable, the map included, so each DM builds the play interface to taste.

The docking library is dockview 8.9.1 (MIT, T-172). Checked on 2026-11-22:
- **Edge groups** (`api.addEdgeGroup`, the `EdgeGroup` module) are in the free package: a group docked to a window edge that collapses to a strip and expands again.
- **Auto-hide** – the collapsed strip showing the panels as clickable tabs that slide the panel out over the layout ("peek", animated) and pin it back – is the `AutoHideEdgeGroup` module. It ships only in the commercial `dockview-enterprise` package, as do `PinnedTabs`, `LayoutHistory` and `KeyboardDocking`. The free package logs a "missing module" warning and ignores `autoHideEdgeGroups`.

## Options considered

1. **Keep ADR-0017: the map is a panel everywhere.**
   - Pros: no work; one rule for all workspaces.
   - Cons: the Map Forge never feels like a CAD canvas; command panels stay clipped to the map panel.
2. **A canvas everywhere, the Orchestrator included.**
   - Pros: one model.
   - Cons: contradicts the DM's wish that the Orchestrator be fully free.
3. **A fixed canvas per editing workspace, a free Orchestrator (chosen).** The workspace's document fills the area under the ribbon; dockview lies over it with its panels docked at the edges, floating, or folded into edge sidebars. The Orchestrator keeps today's free layout.
   - Pros: matches Fusion and the DM's decision; the canvas never shrinks to a small panel by accident.
   - Cons: two layout modes to test; saved Map Forge layouts (device storage) holding a map panel are dropped once, falling back to the new default.

For the sliding sidebars:

a. **Buy `dockview-enterprise`.** A commercial licence for a public, all-rights-reserved repository; a paid dependency with its own release cycle. Needs the DM's decision on cost and licence terms.
b. **Free edge groups only.** A collapsed edge shows an empty strip; the DM expands it with a button. No tabs, no slide-out.
c. **Own edge sidebars in `@dungeon-manager/ui` (recommended).** A strip of vertical tabs per edge; a click slides that panel out over the canvas (CSS transform with a new motion token, no animation under reduced motion); a pin docks it into dockview, "Automatisch ausblenden" in the panel menu folds it back. Panels keep their React state while folded (portals, as today). Roughly one task of work, no new dependency.

## Decision

Option 3 with sidebars as in **c**, unless the DM prefers to buy **a**. The canvas of an editing workspace is a slot under the ribbon; the dockview layout is placed over it, its centre left empty and click-through. Command panels move to a window-wide layer above all panels (between `--dm-z-overlay` and `--dm-z-popover`), still starting top right of the canvas.

## Consequences

- **Shell:** `DmShell` gets a per-workspace canvas slot; the Map Forge's map moves from a panel into it; Asset Vault, Tokens & Kreaturen and Campaign Atlas get their canvas when their workspace is filled. ADR-0014's fit, centre and zoom rules apply to the canvas.
- **Layouts:** default layouts of the editing workspaces change; a saved layout that no longer fits falls back to the default once (device storage, no campaign data). E2E selectors and the DM-window screenshots change.
- **Command panels:** one host for the whole window; dragging is bounded by the window, not the map.
- **Tests:** component tests for the sidebar (click, keyboard, pin, reduced motion); E2E for the canvas in the Map Forge and an unchanged Orchestrator; screenshot of the Map Forge.
- **Docs:** ARCHITECTURE §15 (panel system) and SPEC §2.5 describe canvas and sidebars once built. When the DM accepts this ADR, they mark ADR-0017's "including the map" rule and ADR-0020's "over the map panel" as amended.
- **Tasks:** T-257 (command panels above everything), T-258 (canvas in the Map Forge), T-259 (edge sidebars); other workspaces take their canvas with their own tasks.
