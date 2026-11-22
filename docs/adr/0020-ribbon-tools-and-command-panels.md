# ADR-0020: Ribbon tools with command panels; settings and edits from the browser

- **Status:** Accepted (DM, 2026-11-22)
- **Date:** 2026-11-22
- **Deciders:** DM (product owner), agent

## Context

The first Map Forge tasks (T-176a, T-177, T-108c1) put their tools – grid calibration, drawing rooms – as forms into the Eigenschaften panel. The DM wants it the way Fusion 360 works (DM interview, 2026-11-22, with a Fusion screenshot): **all tools live in the ribbon**, grouped, a few as quick-access icons and the rest in the group's drop-down menu; a tool opens a small **command panel** for its options, the DM works on the map and confirms with OK. Settings and edits of an object start from the **browser** (double-click or right-click). SPEC §2.5 and the `ui-design` skill describe the ribbon as grouped by workflow with dropdown sub-menus, but nothing yet decides how a tool's options and confirmation work, where an object's settings open, or how this applies at the table.

## Options considered

1. **Keep tools as forms in the Eigenschaften panel** – what T-176a/T-177/T-108c1 did. Simple, but the panel mixes values and tools, grows long, and does not match the DM's expectation or the Fusion model the UI follows (ADR-0011, ADR-0017).
2. **Tools in the ribbon acting at once, no panel** – fast, but tools with options (shape, cell count, mode) need somewhere to set them, and there is no clear "done/undo this command" step.
3. **Ribbon tools with a floating command panel; object settings from the browser** – as in Fusion. The DM's choice.

## Decision

Option 3, for every workspace (DM decision: "überall gleich"):

- **Ribbon.** Every tool is in the ribbon of its workspace, in tabs by subject (Map Forge: **KARTE · RÄUME · NEBEL**, later EBENEN, WÄNDE …). Each group shows its most used tools as icons (quick access) and lists all its commands in the caption's drop-down ("RÄUME ▾"). Pinning commands to the toolbar or to shortcuts and own keyboard shortcuts come later (T-256).
- **Command panel.** A tool opens a small floating panel over the map – top right of the map panel, movable, **not modal** (the DM keeps working on the map), one at a time. It holds the tool's options and shows what will happen; **OK** (Enter) applies, **Abbrechen** (Escape) discards. Example: "Raum anlegen" offers rectangle, polygon, ellipse and lasso; the DM draws, adjusts and confirms; the room appears in the browser.
- **Object settings and edits from the browser.** The open document's objects are in the browser; a double-click or the context menu (right-click, Shift+F10) opens their settings or edit command. Each map shows, under its entry at the top of the browser, **"Karteneinstellungen ⚙"**, which opens a dialog with its global settings: name, origin, license, tags, theme, grid as numbers, default fog biome. Grid calibration is a ribbon tool with its own command panel.
- **New map.** A ribbon tool asks whether to import an image or video file or to draw an own map (drawing comes with stage 6 and is offered but not yet available); the name is set right away; the map enters the catalog and opens as the document.
- **At the table (Game-Orchestrator).** The same principle; what is prepared is used from the browser's quick access – e.g. showing or hiding a room or area with its context menu – and spontaneous changes use the ribbon's tools. A fog tool's panel stays open while the DM reveals or hides several areas one after another; each area applies at once (DM decision 2026-11-22: table speed), and OK or Escape ends the tool.
- **Eigenschaften panel.** It keeps showing the selected object's facts; edits start from the browser or the ribbon.

## Consequences

- A shared `CommandPanel` primitive in `@dungeon-manager/ui` (floating, movable, non-modal, OK/Cancel with Enter/Escape, focus handling, one at a time) and ribbon tabs per workspace in the shell (today only the Game-Orchestrator has tabs).
- The Map Forge's calibration and room tools move from the Eigenschaften panel into ribbon tools with command panels; map settings into the "Karteneinstellungen" dialog (T-252 to T-255). Tags and theme in that dialog need T-126.
- The Orchestrator's fog tools and scene commands follow later (T-255); room quick access from the browser comes with T-108c2.
- Tools become discoverable in one place, and drawing a shape gets a clear confirm/cancel step; editors get slightly more clicks (open the tool, confirm), which the browser's quick access offsets for prepared content.
