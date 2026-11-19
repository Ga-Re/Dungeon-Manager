# ADR-0014: Docked data panel and ribbon; the map fills the remaining area

- **Status:** Proposed
- **Date:** 2026-11-19
- **Deciders:** DM (product owner), agent
- **Supersedes:** the "Zones" rule of ADR-0011 ("the map viewport fills the whole window"); everything else in ADR-0011 stays in force.

## Context
ADR-0011 made the map fill the whole DM window, with title bar, ribbon, data panel and scene browser floating over it. T-130 to T-130c built that layout. Using it, the DM found two problems (2026-11-19):

- **"Einpassen" fits the map under the ribbon.** The fit works on the whole window, but the top ~190 px are covered by the ribbon and the left 400 px by the open data panel. A fitted map is partly hidden, and the DM has to pan after every fit. The same applies to zoom-to-cursor and to centring.
- **The data panel competes with the map.** At 1280 px it covers the left end of the map dock and parts of the map. The DM wants it to take the full height as its own column and not lie over the map. Their reference mock-up shows the same: a full-height data panel on the left, the ribbon to the right of it, the map below the ribbon.

ADR-0011's goal stays: the map is the primary workspace and must be as large as possible during play (SPEC 2.1). The data panel can be folded away (Cmd/Ctrl+B) for that.

## Options considered
1. **Keep the full-window map** and make fit/centre aware of the covered areas (a "safe area" inset for ribbon and panel). Pros: no layout change, and the map can still show through behind the floating chrome. Cons: the map stays partly covered, which the DM explicitly does not want for the data panel. Every camera feature (fit, centre, ping, follow token) has to know the insets. The renderer and the zones get coupled.
2. **Dock the data panel only.** It becomes a full-height column and the map shrinks next to it, but the ribbon keeps floating over the map. Pros: smaller change. Cons: fit is still wrong under the ribbon, so it would still need insets.
3. **Dock the data panel and the ribbon (chosen).** The title bar spans the window. Below it, the data panel is a full-height column on the left (folds away with Cmd/Ctrl+B). The ribbon starts right of it, and the map fills the area below the ribbon and right of the panel. Only the scene browser, the navigation dock, notices, menus and popovers float over the map. Pros: fit, centre and zoom are correct without any inset logic, because the canvas *is* the visible area. Nothing permanent covers the map. Matches the DM's mock-up and Fusion 360. Cons: the map loses the ribbon's height and, while the panel is open, its width. The renderer must follow canvas resizes when the panel folds (it already observes its container's size).
4. **Dock everything, including the scene browser and a right-hand inspector**, like the full mock-up. Pros: nothing floats at all. Cons: the map gets narrow on a 13" notebook. The DM chose to keep the browser floating (T-130c decision).

## Decision
Option 3. Docking the two permanent zones removes the cause of the fit problem instead of patching every camera feature, and it is what the DM asked for. The scene browser, dock, notices, context menus and popovers keep floating, so the map is still as large as possible, and the data panel can be folded away during play.

## Consequences
- **Zones:** title bar on top (full width); data panel as a left column of the full remaining height; ribbon to its right; map canvas in the remaining area. Floating over the map: scene browser (top left of the map area), navigation dock (bottom centre of the map area), notices. The layering contract of ADR-0011 is unchanged. The ribbon keeps layer 30, so its popovers and menus (layer 40) open over the map area; the data panel column needs no layer of its own, since its popovers carry layer 40 themselves.
- **Camera:** "Einpassen", zoom and centring use the canvas size as before, which is now exactly the visible map area. No inset logic.
- **Renderer:** the canvas resizes when the data panel folds or the window changes size; `MapView` already observes its box and resizes the renderer, so no renderer change is needed. Whether the view should keep its centre on a fold (today it keeps its offset) is a refinement for later. No regression in the benchmark scene is expected (ARCHITECTURE §11).
- **Player window:** unaffected.
- **Tests:** the E2E check "the canvas fills the window" becomes "the canvas fills the area right of the data panel and below the ribbon, and grows when the panel folds". The DM-window screenshot is regenerated.
- **Docs:** ARCHITECTURE §15 and the `ui-design` skill describe the docked zones. The DM marks ADR-0011's zone rule as superseded when accepting this ADR, since agents cannot edit accepted ADRs.
- **Follow-up:** T-154 implements it. The workspace selector (T-156) sits at the left end of the docked ribbon.
