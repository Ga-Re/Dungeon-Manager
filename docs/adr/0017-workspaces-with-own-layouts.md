# ADR-0017: Five workspaces with their own layouts; the browser lists the open document's objects

- **Status:** Proposed
- **Date:** 2026-11-20
- **Deciders:** DM (product owner), agent
- **Amends:** the zone rule of ADR-0011 as refined by ADR-0014 (one layout for the whole DM window) and the scene browser of T-158 (a campaign tree). Everything else in ADR-0011, ADR-0012, ADR-0014 and ADR-0015 stays in force.

## Context
T-156 added a workspace selector with four workspaces. Only Game Mode has content; the others show a placeholder. The planning interview with the DM (2026-11-20) settled what each workspace is for, and this changes two rules from earlier ADRs:

- ADR-0011/0014 give the DM window one zone layout: docked data panel and ribbon, the map below, a floating browser, a dock, and the properties panel on the right. The DM wants each workspace laid out for its purpose instead. Examples: the Campaign Atlas centres on its explorer and the scene flow; the Game-Orchestrator works like a cockpit with initiative and sound at hand.
- T-158 made the browser a campaign tree (sessions, scenes, notes). The DM wants the browser to list the objects of the document that is open, like the layers in Photoshop or the browser in Fusion 360: levels, masks, rooms, props and tokens of a map or scene. It is shown only where such a document exists. The campaign tree moves into the Campaign Atlas.

The constraints do not change:
- The map stays the primary surface during play (SPEC 2.1).
- Hidden data never leaves the host.
- Global map and asset data live in sidecar files (ADR-0012).

## Options considered
1. **Keep one layout for every workspace (ADR-0011/0014).** Only the ribbon tabs and the zone contents change.
   - Pros: one layout to learn and test, no layout code per workspace.
   - Cons: pages without a map, such as the scene flow, a wiki page or a creature sheet, get squeezed into a map layout. The Orchestrator cannot keep combat and sound tools permanently at hand. The DM chose against it.
2. **One frame with exceptions.** The same zones everywhere, but documents without a map replace the canvas.
   - Pros: little layout code.
   - Cons: it still forces one arrangement on the Orchestrator and the Atlas.
3. **Each workspace has its own layout (chosen).** All layouts are built from the same zone primitives: docked column, ribbon, canvas, floating HUD panel, dock, properties panel. Each workspace declares which zones it uses and what fills them. The title bar, ribbon height, layering contract, tokens and primitives stay shared.
   - Pros: each workspace fits its job.
   - Cons: every layout needs its own E2E and screenshot coverage, and consistency has to come from the shared primitives and the `ui-design` skill.

## Decision
Option 3, as the DM decided on 2026-11-20. The workspaces are:

- **Map Forge:** creates and edits global maps (ADR-0012).
- **Asset Vault:** props, handouts, items and sounds.
- **Tokens & Kreaturen:** player characters and creatures.
- **Campaign Atlas:** builds campaigns: sessions, scenes, wiki and planning.
- **Game-Orchestrator:** runs the session; replaces "Game Mode".

Each one opens its own document (a map, an asset, a creature, a scene, a page) with its own undo history.

The browser becomes the object tree of the open document. The data panel always holds the source the DM drags from: the map library, the asset library, the creature library, or the campaign explorer.

Further decisions from the same interview:
- **Props are layered.** A map keeps the props that belong to it in every scene (Map Forge), and a scene adds its own (Campaign Atlas). This is what ADR-0012 already describes.
- **Creatures are global, including player characters.** Campaigns refer to them, and per-session state (HP, conditions) stays in the scene or session state.
- **The TV while the DM is outside the Orchestrator** is set in the settings: pause only on a button, always pause, or pause only in the editing workspaces. Until the DM picks a default, the agent assumes "only on a button".
- **Preparing the next scene during play:** the Orchestrator's scene bar allows quick preparation without touching the TV, and the full scene editor lives in the Atlas.

## Consequences
- **Layout code:** a small layout layer in the desktop app maps each workspace to its zones. The shell's slots become per-workspace. Game-Orchestrator panels stay mounted while another workspace shows, as today.
- **Browser:** its current campaign tree (T-158, T-160b, T-161b) moves into the Atlas data panel as the campaign explorer. The browser itself shows the open document's objects and, later, a visibility eye per object. Existing E2E selectors and the DM-window screenshot change in that task.
- **Undo:** one history per open document. Cmd/Ctrl+Z acts on the active workspace's document, so undo in the Map Forge never takes back a fog step in play.
- **Tool state:** leaving the Orchestrator drops the fog tool back to panning (from the T-156 review).
- **TV:** a pause and title screen becomes part of the Orchestrator, together with the blackout of T-113.
- **Tests:** each workspace layout gets component, E2E and DM-window screenshot tests.
- **Docs:** SPEC §2.5 lists the workspaces and their tools. ARCHITECTURE §15 describes the layout layer once T-172 builds it. When the DM accepts this ADR, they mark the zone rule of ADR-0011/0014 as amended, because agents cannot edit accepted ADRs.
- **Follow-up tasks:** T-171 to T-222 in TASKS.md.
