# D&D Dungeon Master Tool – Product Specification

> **What** gets built. For **how** it is built see [ARCHITECTURE.md](ARCHITECTURE.md) and the decisions in [adr/](adr/). Working rules for the coding agent are in [/CLAUDE.md](../CLAUDE.md).

A tool for a Dungeon Master (DM) to plan campaigns and present them live at the table: maps, fog of war, spells, sound and light. Everything is controlled from a notebook; planning also works on the go in Obsidian or any Markdown tool.

---

## 1. Core decisions

| Area                   | Decision                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Play setting           | In person, at the table                                                                                                             |
| Player output          | Table-top TV lying flat (player view fullscreen on a second display)                                                                |
| Desktop app            | Tauri 2 + React + TypeScript + PixiJS (Windows, macOS, Linux)                                                                       |
| DM on the go           | No own app: Obsidian-compatible Markdown vault in the sync folder; DM mode of the local web app at the table (ADR-0013)             |
| Players                | No phone required; paper character sheets are the norm. Optional player companion in the phone browser, local Wi-Fi, no app install |
| Data sync              | A user-chosen folder that any cloud client syncs. The tool uses **no cloud APIs**                                                   |
| Live link at the table | Local Wi-Fi; the notebook is the host; pairing via QR code                                                                          |
| Miniatures             | Physical minis on the TV; the DM mirrors them with digital tokens. Optional camera detection                                        |
| Rules depth            | Presentation plus combat aids (no full rules automation)                                                                            |
| Visibility             | Configurable per element: what players see                                                                                          |
| Language               | UI German first (i18n-ready); code and docs in English                                                                              |

---

## 2. Views & devices

### 2.1 DM view (notebook)

- Full map including hidden areas, traps, secret doors and DM notes
- **Live preview of the player view** in a small window, so the DM always sees what the TV shows; optionally also on an additional DM monitor (windowed or fullscreen) for a better overview
- **Preview of the next scene** to prepare it before it goes live
- All control panels: fog, tokens, initiative, sound, light, scenes, camera

### 2.2 Player view (table TV)

- Fullscreen on the second display, no controls visible
- **Grid calibration:** enter the screen size so one cell is exactly 1 inch (2.54 cm) and physical minis fit
- Rotatable view (0°/90°/180°/270°) because the TV lies flat and players sit on all sides
- **Render resolution** selectable in the settings (native, e.g. 4K, or Full HD upscaled) to trade sharpness for frame rate
- Optional highlight of the active turn (glow ring around the token)
- **Blackout / panic button:** switch the player view instantly to black or a pause image

### 2.3 DM on the go and at the table (no own app)

There is no DM phone app (ADR-0013). Planning on the go happens in tools the DM already uses; remote control at the table is a DM mode of the local web app.

1. **Planning on the go (main purpose), fully offline – in Obsidian or any Markdown tool**
   - The campaign's wiki and notes (sessions, NPCs, places, quests) are an Obsidian-compatible vault in the sync folder (Markdown, YAML front matter, `[[Name]]` links); Dungeon Manager shows and uses them
   - **Scene drafts from notes:** a note with scene front matter (map, sound, light, tokens) appears in Dungeon Manager as a scene draft
   - Encounters can be drafted as notes
   - Visual work (grid, rooms, walls, asset placement, triggers, effects) stays on the desktop
2. **Remote control at the table (secondary):** sound, light, fog reveal, scene switch, show handouts – a DM mode of the web app on the local Wi-Fi, paired separately from players
3. **DM screen at the table (secondary):** initiative, HP, stat blocks, dice and notes in the same DM mode

### 2.4 Players

- **No phone required.** The tool works fully with paper character sheets and physical dice.
- The DM enters only the essentials: player name, token, initiative; optionally HP and AC for display
- **Optional: player companion in the browser.** Players scan a QR code and open a web page served by the notebook on the local Wi-Fi. No app, no account, no internet.

| Feature        | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| Handouts       | View released letters, images and maps; re-read later           |
| Own status     | Own HP, conditions and the initiative order                     |
| Notes & dice   | Private notes and a digital die for those without physical dice |
| Move own token | See movement rules below                                        |

**Movement rules for player tokens**

- Movement **snaps to the grid**
- **Free, DM can lock:** moves apply immediately; the DM locks individual players or everyone with one button
- **Measurement rule configurable per campaign:**
  - 5e standard: diagonal = 1 cell (5 ft)
  - Alternating diagonals: 5/10/5 ft
  - Snap only, no range check
- Optional highlight of reachable cells by movement speed; walls block (once drawn)
- **Fog:** the DM decides per map whether players may move into fog and whether movement auto-reveals with dynamic vision
- Every permission is per player and can be revoked at any time

### 2.5 Workspaces (DM window)

The DM window has five workspaces, each with its own ribbon tabs and documents (ADR-0017, DM interview 2026-11-20). Every workspace is made of dockable panels, the map included: panels can be moved, resized, docked to the edges, folded and shown or hidden from the View menu. Each workspace has a default layout, and the DM can save their own named layouts per device. Open documents (the Atlas, scenes, maps, assets, creatures) are tabs in the title bar. In all workspaces, the data panel holds the source the DM drags from. The browser lists the objects of the open document, like layers in Photoshop or the browser in Fusion 360, and only shows where there is such a document. Each document has its own undo history.

- **Map Forge – global maps** (sidecar data, ADR-0012):
  - **Files:** import and manage map files; 2-click grid calibration by dragging over a 3×3 cell box, so every map has the same cell size on the TV.
  - **Map data:** metadata (cell size, ambient sound, transitions, fog effects); rooms and areas with DM-only labels; levels with heights and stairs that move tokens to the next level.
  - **Masks:** three sight masks – walls (block sight and movement both ways), cliffs and galleries (one way: those above see down, those below cannot see up), and cover (trees, pillars, statues: radial shadows behind them while the object itself stays lit). Masks can be made automatically and are checked for leaks; a test figure shows what a token would see.
  - **Building:** parametric rooms, towers and corridors with automatic outer walls; terrain and floor layers with movement costs; light sources with radius, colour and flicker; ambient light presets (day, dusk, full-moon night, dark dungeon).
  - **Props:** props that belong to the map in every scene, dragged from the Asset Vault; they snap to the grid, rotate in 15° steps and scale.
  - **Image:** variants of a map (day/night, destroyed) sharing masks and rooms; composing a map from tiles; non-destructive crop, rotation and image adjustment (brightness, contrast, hue) for the TV.
  - **Exchange:** UVTT import, and export/import with all files sorted into the library.
- **Asset Vault – everything that is not a map:** props, map pieces, handouts, items and sound.
  - **Organising:** metadata and tags for search (theme, type, tags), collections, favourites and recently used; duplicates are detected on import.
  - **Editing:** batch editing; tinted colour variants; animated (video) assets; grid-based scale with a preview on a 5-ft grid.
  - **Smart prefabs:** a tree brings its cover mask, a door its switchable wall mask, a lantern its light, a house its interior.
  - **Items and loot:** cards with rarity and description; sound effects bound to traps and spells.
- **Tokens & Kreaturen – player characters and creatures, global for all campaigns:**
  - **Pictures:** token picture and portrait; a token made from the portrait.
  - **Combat values:** HP with dice formula, AC, initiative modifier, speeds, size and grid footprint with pivot, and senses (sight, darkvision), which vision uses automatically.
  - **Variants:** clones with generated names; shapes (e.g. a druid's beast form) to switch in play; encounter pods (groups of creatures).
  - **Display:** faction rings; previews of conditions, auras and sight.
  - **Exchange:** stat-block import (SRD 5.1) and creature import/export.
  - **Animation:** creatures can use animated sprites or video files, so their tokens move on the TV.
- **Campaign Atlas – building campaigns:**
  - **Layout (default):** explorer left, the open document centre (with an optional split drawer for the flow graph), inspector right, session timeline at the bottom.
  - **Structure:** the campaign explorer (sessions as folders of scenes, notes, wiki and lore); a world map with scene pins and travel routes; a scene flow graph with requirements and unlocks; a checklist per session; a search over the whole campaign; scene and session templates.
  - **Scene editor:** an opened scene is a document of the Atlas (not a separate workspace) with tokens and creatures, props on top of the map's own, traps, triggers and secrets, map pins with room descriptions and read-aloud text, start states (doors, lights, fog), phases (start setup → ambush → reinforcements), and overrides of map settings. The Atlas edits a scene's start state; for the scene live in the Orchestrator, a change takes effect on "reset scene" or after the DM confirms.
  - **Planning aids:** what the players already know, a campaign timeline, loot and rewards, encounter balance, and a relationship network of NPCs and factions.
- **Game-Orchestrator – running the session** (filled first, after the shared frame):
  - **Layout (default):** the map large; initiative, group, dice and inspector as small panels to show, hide and dock as needed.
  - **TV:** a live preview of the player view; centring the players' view; pause, title and blackout screens.
  - **Scenes:** a scene bar with quick preparation of the next scene without touching the TV.
  - **On the map:** asset actions (e.g. roof off), doors and traps, ambience presets, area-of-effect templates.
  - **Combat:** a group overview of all characters; hidden dice, one roll for many targets; initiative that rolls for groups of monsters and focuses the next turn with its movement range.
  - **Media:** handouts; music playlists, ambience layers, a sound board and a volume mixer.
  - **Notes:** room notes in the inspector; quick notes into the session log; random generators (NPCs, rumours, loot); in-game time and weather.
- **TV outside the Orchestrator:** set in the settings – pause only on a button, always pause, or pause only in the editing workspaces.

---

## 3. Maps

### 3.1 Formats

- Static images: PNG, JPG, WebP
- Animated maps: MP4, WebM
- **Universal VTT import** (`.dd2vtt`, `.uvtt`) from Dungeondraft or Dungeon Alchemist, including walls, doors and light sources
- **Multiple levels:** floors, cellar, roof, switchable per level

### 3.2 Presentation

- Zoom and pan in the DM view; locked scale in the player view
- Preload the next scene so large video maps switch without stutter
- **Scene transitions** selectable per change: crossfade (default), through black, instant; duration in the settings. Later: themed transitions (e.g. door sound and fade when leaving a house, snowflakes blending over when moving from a snowstorm into a cave)

---

## 4. Fog of war

- **Manual reveal:** brush, rectangle, polygon, circle, or whole predefined rooms – by clicking the room on the map, from the room list in the scene browser, or by a trigger zone
- **Three tiers:** unexplored (black for players, tinted see-through for the DM), explored memory (dimmed, no current movement), active vision (fully lit, with the light's colour)
- **Soft fades and soft edges** for fog changes; can be switched off in the settings (performance). A reveal spreads from the revealed area it touches (or from its centre when it touches none); hiding spreads from the fog side (T-167)
- **Animated fog effects per map:** drifting mist, snow flurry, smoke and ash, darkness – set on the map, adjustable during a session (T-168)
- **Dynamic vision:** walls, closed doors and asset blockers stop line of sight and light (2D raycasting); the TV shows the union of what all player tokens see; respects light sources, darkvision and torch radius
- **Light model:** brightness per scene (day / dusk / dark), bright and dim radius per light (5e), darkvision in greyscale, coloured and flickering light
- **Secret rooms** stay hidden on "reveal all" and when neighbouring or overlapping rooms are revealed (the reveal skips the secret area), until the DM reveals them explicitly or paints into them with a manual tool; their contents are never sent to the TV or companions before that
- **Memory fog:** visited areas stay dimly visible, but current movement inside them is hidden
- Fog per level
- Per map: how player movement behaves in fog
- Undo for accidental reveals

> Dynamic vision is only as good as the digital token positions (manual, by players, or by camera).

---

## 5. Tokens & miniatures

- Digital tokens mirror physical minis
- Tokens can be invisible in the player view (only for vision and distance) or visible (for monsters without a mini)
- Token sizes by D&D category (Tiny to Gargantuan)
- Condition icons and HP bar on the token (visibility configurable)
- **Default: the DM moves tokens digitally.** Fast input: tap token, tap target cell; keyboard shortcuts on desktop; move the whole party at once
- Players may optionally move their own token via the companion (see 2.4)

### 5.1 Optional: camera detection of players and enemies

**Hardware & markers**

- **1 to 4 USB webcams** on the notebook, on arms above the table; the first version uses one camera straight from above
- **ArUco stickers on top** of the base or on a clip; one unique code per figure, mapped to a token in the tool
- The tool generates a printable marker sheet

**Calibration**

- The tool shows reference markers on the TV; each camera is calibrated individually (camera image → grid cell)
- **Height compensation:** the sticker sits a few centimetres above the TV. For angled cameras the known height is factored out; grid snapping absorbs the rest
- Recalibrate with one button if a camera moves

**Multiple cameras**

- Detections from all cameras are merged; the most confident wins
- Helps against hands over the table and reflections that differ per angle
- Note USB bandwidth: several Full HD cameras on one controller saturate it; spread cameras across ports or lower resolution

**Interplay with manual moves: the camera suggests**

- Confident detections are applied; uncertain ones are flagged in the DM view
- Manually moved tokens stay locked until the camera sees them unambiguously again
- Occluded minis keep their last known position
- Detection can be paused at any time

**Configurable display**

- Per output (TV, DM view, companion): nothing, subtle rings around detected minis, warnings for uncertain detections

---

## 6. Player visibility (per element)

| State       | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| Visible     | Players see it fully                                                             |
| Hidden      | Only the DM sees it                                                              |
| Approximate | Filtered info, e.g. HP as "unhurt / wounded / badly wounded" instead of a number |

Applies to: tokens, names, HP bars, conditions, assets, traps, doors, light sources, spell areas and initiative entries – on the TV and in the companion.
A default per element type avoids configuring every single element.

---

## 7. Spell presentation

- **Areas of effect:** cone, sphere, line, cube at correct size on the grid; affected tokens are highlighted automatically
- **Animated effects:** e.g. fireball explosion, lightning, fog cloud, healing, with matching sound
- **Persistent effects:** stay visible; concentration spells attach to the caster and expire after rounds (linked to the initiative tracker)
- **Light coupling:** spells trigger short light effects (fireball = orange flash, lightning bolt = white flicker)
- Effect library, extensible with custom animations

---

## 8. Map editor & assets

### 8.1 Editor

- **Place assets:** furniture, chests, traps, decor via drag & drop; scale, rotate, mirror, z-order
- **Walls, doors, light:** draw sight lines, doors (open/closed/locked/secret), windows, light sources with radius and colour. The DM opens and closes a door with one click. Secret doors look like walls to players and are marked for the DM; once discovered they become normal doors in that scene
- **Automatic walls:** from VTT import, from drawn rooms (outer edges become walls, shared edges become openings) and as a suggestion from image analysis (edges/colours, always reviewed by the DM); everything runs locally
- **Rooms and areas:** suggested from closed wall regions and drawn or adjusted freely; may overlap (a clearing inside a forest); secret rooms
- **Asset blockers:** an asset's sight blocker is generated from its alpha channel and editable (e.g. only the trunk of a tree). Blocker types: blocks sight and light, one-way (cliff, gallery), partial sight (bushes: dimmed instead of hidden)
- **Interiors:** an asset (e.g. a house) can have variants such as exterior (roof) and interior on the same footprint, with their own walls, doors and rooms; switching crossfades. Trigger per asset: DM click, a token entering, a token coming within a set distance – each optionally with DM confirmation. While an interior is active, the TV shows it to everyone
- **Draw new maps:** rooms, tiles, terrain brush (floor, water, grass)
- **Trigger zones:** areas that fire when a token enters: sound, light, text message to the DM, reveal trap, switch scene
- Grid alignment: overlay and fit the grid to the imported map's grid

### 8.2 Asset library

- **One global library** for all campaigns
- **Defined once, used everywhere:** scale (grid calibration, asset footprint), name, tags, origin/license, levels, walls, doors, lights, rooms, blockers and variants belong to the map or asset and apply in every campaign. A scene adds placed assets (e.g. trees, rocks and houses on a street map), door states and fog, and may override single walls, doors, rooms or lights. Later improvements to the global data apply everywhere – a scene that is live on the TV takes them only after the DM confirms; overrides whose target is gone are flagged for the DM
- Share single maps or assets as a `.dmmap` bundle (export/import)
- Import own files, tag and search them
- Bundled base pack of free assets (CC0)
- Import whole asset packs as folders (e.g. Forgotten Adventures) with automatic categorisation by folder structure
- Favourites and recently used
- License field per asset (origin and usage rights)

---

## 9. Ambient sound

- **Scene presets:** tavern, forest, dungeon, combat… music and sounds in one click with crossfade
- **Layer mixer:** several tracks (music, rain, wind, crowd) individually adjustable; loops with random variation
- **Soundboard / one-shots:** hotkeys for door creak, roar, sword hit, spells
- **Sources:** own files plus **Tabletop Audio** tracks downloaded once into the library and used like own files – everything works offline at the table. No Spotify, no Syrinscape.
- Optional automatic switch to combat music when initiative starts
- Master volume and "mute all" from the DM remote (web app) at any time

---

## 10. Lighting / Ambilight

### 10.1 Hardware

- **Home Assistant** as the central bridge (almost any lamp)
- **Philips Hue** incl. Entertainment API for fast effects
- **WLED / ESP32 LED strips** (e.g. behind or under the table TV)
- **Govee / Nanoleaf** via their local APIs

### 10.2 Zones with roles

Lamps are assigned to zones; scenes and effects address roles, not individual lamps. Adding a lamp only changes its zone.

| Role    | Example                    | Purpose                           |
| ------- | -------------------------- | --------------------------------- |
| TV edge | LED strip on the table TV  | Ambilight from the map            |
| Room    | Ceiling light, floor lamps | Base mood of the scene            |
| Accent  | Shelf, spot                | Short effects (spells, lightning) |

### 10.3 Behaviour

- **Scene light** changes with the scene
- **Ambilight:** colours from the map edge are sent live to the LEDs
- **Events:** flash on spells, red pulse at low HP, flicker for torches or fire
- **Time of day / weather:** in-game time drives dusk, night, thunderstorm
- **Priority:** effect > ambilight > scene. Short effects overlay, then the previous state returns
- **Failure or latency:** play continues silently; the DM sees a warning icon on the affected device
- **Safety:** photosensitivity mode limiting rapid flashing, and a global brightness cap

---

## 11. Combat aids

- **Initiative tracker:** order, rounds, active turn highlighted on the TV; delay and ready; quick entry of player initiatives
- **HP & conditions:** HP, temporary HP, conditions (poisoned, prone, restrained…) with round duration
- **Monster stat blocks:** 5e SRD monsters plus homebrew; encounter difficulty calculator
- **Dice & log:** digital rolls for the DM, hidden or shown on the TV, with history
- **Visibility:** per element (see 6)
- Concentration reminder when the caster takes damage

---

## 12. Campaign planning

- **Session planner:** scenes bundle map, sound, light, fog state and notes; available in the scene bar during play
- **Wiki / lore:** NPCs, places, factions, quests, items; linked, with relationships and status (e.g. "alive / dead", "quest open / done")
- **Handouts:** letters, images, NPC portraits, items and maps shown large on the TV and in the companion. Images live in the global library; the handout (title, text, released or not) belongs to the campaign
  - **Presentation:** shown and hidden with an animation (unfolding with a paper rustle), on a single side or mirrored for several table sides, and rotatable by the DM; items and portraits in a frame
  - **Generator:** text on paper templates (note, letter, wanted poster, parchment), map fragments cut from a library map with torn edges, ageing and details (stains, burnt edges, folds, seal, signature), puzzles of several fragments found one by one and assembled on the TV. Stored as a recipe and rendered when shown, so it stays editable
- **Session log:** events and combat log captured automatically, plus DM notes; produces a recap for the next session

---

## 13. Flow of a game night

### 13.1 Start

1. **Session start assistant** (DM view only)
   - Checks table TV, light devices, sound output and cameras: green/yellow/red per device
   - **Attendance:** who is here today? Absent characters are hidden (token, initiative, companion)
   - **Last session state:** choose "continue where we left off" (fog, token positions, HP) or "reset scene" to the planned initial state
   - Preloads the first scene
2. **Intro screen on the TV**
   - Campaign title card
   - "Previously on…" from the last session log
   - QR code for the optional companion
   - Mood music and matching light

### 13.2 During the session

- **Scene bar with preview:** planned scenes as a bar; prepare the next scene in the DM window (fog, tokens, notes), then switch live with a crossfade. Map, sound and light change together
- Start combat: initiative tracker opens; optional combat music and light
- Handouts, pause screen and blackout always available
- Continuous autosave

### 13.3 End

1. **Close the session log:** review the automatic log, add DM notes; basis for the next recap
2. **Snapshot & sync:** back up the campaign; the sync folder is updated so notes are current in Obsidian on the go
3. **Reset light & sound:** lamps to normal, fade out music
4. Game state (fog, token positions, HP) is saved and offered at the next start

---

## 14. Extras

- **Calendar & time:** in-game date, time of day, short and long rests, spell durations, travel time; coupled to light and sound
- **Generators:** NPC names, loot, weather, random encounters (extensible with own tables)
- **Player aids on the TV:** ruler/distance, movement range of a token, ping/marker by the DM
- **Pause screen:** pause image with music

---

## 15. Cross-cutting requirements

- **Offline-first:** everything works at the table without internet; folder sync runs in the background when connected
- **Autosave:** scene and fog state saved regularly; a crash mid-session loses nothing
- **Performance:** video maps and effects run smoothly on the TV (see budgets in ARCHITECTURE.md)
- **Local network only:** companion and DM remote connect only on the local Wi-Fi; QR pairing with a one-time key so no stranger can control anything
- **Accessibility:** large controls in the web app on phones, colour-blind-friendly markers
- **Legal:** 5e SRD content is CC-BY-4.0 – attribution required; bundled assets only CC0 or clearly licensed; respect Tabletop Audio's terms

---

## 16. Roadmap

### Stage 0 – Foundation

Monorepo, tooling, CI, app skeletons, performance spike (see TASKS.md).

### Stage 1 – MVP: map, fog, tokens (desktop)

- Desktop app with DM view and player view on the table TV
- Image map import, grid calibration, view rotation
- Manual fog and memory fog, predefined rooms
- Global map data: scale, metadata, levels and rooms defined once per map (sidecar files)
- Selectable scene transitions
- Digital tokens moved by the DM
- Initiative tracker with HP and conditions
- Basic per-element visibility
- Blackout button, autosave
- Folder structure and file format from day one

### Stage 2 – Planning on the go & sound

- Obsidian vault for wiki and notes, scene drafts from notes
- Folder sync with per-OS guide, conflict detection, previews
- Sound: scene presets, layer mixer, soundboard, Tabletop Audio import
- Animated maps (MP4/WebM)
- Handouts on the TV, handout generator

### Stage 3 – Networked at the table

- Wi-Fi pairing via QR: DM remote and DM screen as a DM mode of the web app
- Player companion in the browser: handouts, own status, notes & dice, move own token
- Movement rules (configurable), DM lock
- Session start assistant, intro screen, session end with snapshot

### Stage 4 – Light

- Home Assistant first, then WLED, Hue (Entertainment), Govee/Nanoleaf
- Zones with roles, priorities, failure indicator
- Scene light, event light, ambilight from the map
- Photosensitivity mode

### Stage 5 – Editor, vision & spells

- Draw walls, doors, light sources
- Dynamic vision (raycasting) with light model and darkvision; fog behaviour per map
- Automatic walls (rooms, image analysis), asset blockers, scene overrides, interiors
- UVTT import, multiple levels
- Asset placement, asset library and pack import
- Spells: areas, animations, persistent effects, light coupling
- Trigger zones

### Stage 6 – Campaign & comfort

- Session planner and scene bar with preview
- Full wiki/lore (relationships, status), session log with recap
- Monster stat blocks (SRD + homebrew), dice & log
- Calendar, generators, player aids, pause screen
- Trash, campaign export with assets, `.dmmap` export/import
- Themed scene transitions
- Draw own maps (terrain brush, tiles)

### Stage 7 – Camera detection (optional)

- One overhead webcam, ArUco markers, calibration with height compensation
- "Camera suggests" logic, configurable display
- Then up to 4 cameras with fusion

### Later

- Touch overlay as an alternative to the camera
- Projector support with keystone correction
- Remote players (hybrid mode)

---

## 17. Open product questions

- **Token mirroring:** test whether manual mirroring slows combat down
- **Sync for Obsidian on the phone:** walk through each OS/provider once (iOS + iCloud/Obsidian Sync/OneDrive, Android + Syncthing/FolderSync) and write the in-app guide from it
- **Camera:** sticker size, camera height, reflections on the TV glass (matte screen protector?)
- **Tabletop Audio:** check terms for downloading and local use
