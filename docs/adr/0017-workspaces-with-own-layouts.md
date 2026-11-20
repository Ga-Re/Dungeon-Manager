# ADR-0017: Five workspaces of dockable panels; the browser lists the open document's objects

- **Status:** Proposed
- **Date:** 2026-11-20
- **Deciders:** DM (product owner), agent
- **Amends:** the zone rule of ADR-0011 as refined by ADR-0014 (one fixed layout for the whole DM window) and the scene browser of T-158 (a campaign tree). Everything else in ADR-0011, ADR-0012, ADR-0014 and ADR-0015 stays in force, including the workshop look of ADR-0015.

## Context
T-156 added a workspace selector with four workspaces. Only Game Mode has content; the others show a placeholder. The planning interview with the DM (2026-11-20) settled what each workspace is for, and this changes two rules from earlier ADRs.

**Layout.** ADR-0011/0014 give the DM window one fixed zone layout: docked data panel and ribbon, the map below, a floating browser, a dock, and properties on the right. The DM wants something different:
- The DM builds their own layout from small panels: initiative, dice, group, inspector, and the map itself.
- Panels can be moved, resized, snapped to the edges and shown or hidden from the View menu.
- Each workspace has its own sensible starting arrangement. For the Campaign Atlas, the DM supplied a specification of five zones: explorer, document, inspector, ribbon, and a timeline.

**Browser.** T-158 made the browser a campaign tree (sessions, scenes, notes). The DM wants the browser to list the objects of the document that is open, like the layers in Photoshop or the browser in Fusion 360. It is shown only where such a document exists. The campaign tree moves into the Campaign Atlas.

The constraints do not change:
- The map stays the primary surface during play (SPEC 2.1).
- Hidden data never leaves the host.
- Global map and asset data live in sidecar files (ADR-0012).

## Options considered
1. **Keep one fixed layout for every workspace (ADR-0011/0014)** and change only the ribbon tabs and zone contents.
   - Pros: one layout to learn and test.
   - Cons: no layout of the DM's own. Pages without a map (scene flow, wiki, creature sheet) get squeezed into a map layout.
2. **A fixed layout per workspace.** The Atlas gets its five zones, the Orchestrator a cockpit.
   - Pros: each workspace fits its job.
   - Cons: still no rearranging; the DM wants to hide, move and resize panels during play.
3. **Fixed layouts everywhere except a free Orchestrator.**
   - Pros: less work outside play.
   - Cons: two layout systems to build and learn.
4. **One dockable panel system for all workspaces, each with a default layout (chosen).**
   - Pros: one mechanism; the DM tailors every workspace and can always reset to its default.
   - Cons: a docking system is a substantial piece of UI. Building it or using a library is a dependency decision. Every default layout needs E2E and screenshot coverage.

## Decision
Option 4, as the DM decided on 2026-11-20.

**Workspaces.** There are five:
- **Map Forge:** creates and edits global maps (ADR-0012).
- **Asset Vault:** props, handouts, items and sounds.
- **Tokens & Kreaturen:** player characters and creatures.
- **Campaign Atlas:** builds campaigns: sessions, scenes, wiki and planning.
- **Game-Orchestrator:** runs the session; replaces "Game Mode".

**Panels and layouts.**
- Every workspace consists of panels, including the map. Panels can be moved, resized, docked to edges or to each other, folded, and shown or hidden from the View menu.
- Each workspace has a default layout. The DM can save their own named layouts per workspace; they are stored per device, because screens differ. "Layout zurücksetzen" restores the default.
- The default layouts are:
  - **Campaign Atlas:** the DM's specification – explorer left, document centre with an optional split drawer for the flow graph, inspector right, session timeline at the bottom.
  - **Game-Orchestrator:** the map large, with small panels for initiative, group, dice and inspector, and a dock for zoom, TV preview, pause and blackout.
- The look stays that of ADR-0015, and the product name stays "Dungeon Manager".

**Documents and undo.**
- Each workspace opens documents: a map, an asset, a creature, a scene, a page.
- Open documents show as tabs in the title bar, each with its own undo history.
- An opened scene is a document of the Campaign Atlas, with its own ribbon tabs. It is not a sixth workspace.

**Browser and data panel.**
- The browser is the object tree of the open document.
- The data panel is the source the DM drags from: the map, asset or creature library, or the campaign explorer.

Further decisions from the same interview:
- **Props are layered.** A map's own props are edited in the Map Forge, a scene's extra props in the Atlas. This is what ADR-0012 already describes.
- **Creatures are global, including player characters.** Campaigns refer to them, and per-session state (HP, conditions) stays in the scene or session state.
- **Start state and game state.** The Atlas edits a scene's start state, and the Orchestrator its game state. A change to the start state of the live scene takes effect on "reset scene" or after the DM confirms.
- **The TV outside the Orchestrator** is set in the settings: pause only on a button, always pause, or pause only in the editing workspaces. Until the DM picks a default, the agent assumes "only on a button".
- **Preparing the next scene during play:** the Orchestrator's scene bar allows quick preparation without touching the TV, and the full scene editor lives in the Atlas.
- **Order:** after the shared frame (panel system, browser, undo, pause), the Game-Orchestrator is filled first.

## Consequences
- **Panel system:** the shell's fixed zones become docked panels, with a layout model per workspace saved in device storage. Game-Orchestrator panels stay mounted while another workspace shows, as today. The fit, centre and zoom rules of ADR-0014 now apply to the size of the map panel.
- **Browser:** its current campaign tree (T-158, T-160b, T-161b) moves into the Atlas data panel as the campaign explorer. Existing E2E selectors and the DM-window screenshot change in that task.
- **Undo and tools:** one history per document. Cmd/Ctrl+Z acts on the active document, so undo in the Map Forge never takes back a fog step in play. Leaving the Orchestrator drops the fog tool back to panning (from the T-156 review).
- **TV:** a pause and title screen becomes part of the Orchestrator, together with the blackout of T-113.
- **Tests:** each default layout gets component, E2E and DM-window screenshot tests. Rearranging panels is tested with mouse and keyboard.
- **Docs:** SPEC §2.5 lists the workspaces and their tools. ARCHITECTURE §15 describes the panel system once T-172 builds it. When the DM accepts this ADR, they mark the zone rule of ADR-0011/0014 as amended, because agents cannot edit accepted ADRs.
- **Follow-up tasks:** T-171 to T-230 in TASKS.md. The docking library question comes with T-172.
