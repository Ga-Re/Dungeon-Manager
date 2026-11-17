# D&D Dungeon Master Tool – Product Specification

> **What** gets built. For **how** it is built see [ARCHITECTURE.md](ARCHITECTURE.md) and the decisions in [adr/](adr/). Working rules for the coding agent are in [/CLAUDE.md](../CLAUDE.md).

A tool for a Dungeon Master (DM) to plan campaigns and present them live at the table: maps, fog of war, spells, sound and light. Everything is controlled from a notebook; planning also works on the go from a phone.

---

## 1. Core decisions

| Area                   | Decision                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Play setting           | In person, at the table                                                                                                             |
| Player output          | Table-top TV lying flat (player view fullscreen on a second display)                                                                |
| Desktop app            | Tauri 2 + React + TypeScript + PixiJS (Windows, macOS, Linux)                                                                       |
| DM phone app           | React Native / Expo + TypeScript (Android and iOS); works on the go and offline                                                     |
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
- **Live preview of the player view** in a small window, so the DM always sees what the TV shows
- **Preview of the next scene** to prepare it before it goes live
- All control panels: fog, tokens, initiative, sound, light, scenes, camera

### 2.2 Player view (table TV)

- Fullscreen on the second display, no controls visible
- **Grid calibration:** enter the screen size so one cell is exactly 1 inch (2.54 cm) and physical minis fit
- Rotatable view (0°/90°/180°/270°) because the TV lies flat and players sit on all sides
- **Render resolution** selectable in the settings (native, e.g. 4K, or Full HD upscaled) to trade sharpness for frame rate
- Optional highlight of the active turn (glow ring around the token)
- **Blackout / panic button:** switch the player view instantly to black or a pause image

### 2.3 DM phone app (on the go)

Primarily the **DM's planning tool on the go**. The UI is leaner than the desktop: same data, fewer tools, larger controls.

1. **Planning on the go (main purpose), fully offline**
   - Text editor for session notes, NPCs, places, quests: Markdown storage with a WYSIWYG view (toolbar formatting, no Markdown knowledge needed), links via `[[Name]]`
   - Map preparation: import map, align grid, predefine fog rooms, roughly place assets, set note pins
   - Scene assembly: map + sound preset + light preset + notes
   - Encounter preparation: pick monsters, roll HP, check difficulty
   - Fine work (drawing walls, triggers, effects) stays on the desktop
   - Works with **previews** instead of originals (see ARCHITECTURE.md, storage)
2. **Remote control at the table (secondary):** sound, light, fog reveal, scene switch, show handouts – via local Wi-Fi
3. **DM screen at the table (secondary):** initiative, HP, stat blocks, dice and notes in hand while the notebook drives the TV

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
- Crossfade on map change

---

## 4. Fog of war

- **Manual reveal:** brush, rectangle, polygon, or whole predefined rooms with one click
- **Dynamic vision:** walls block line of sight; each player token sees only its surroundings; respects light sources, darkvision and torch radius
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
- **Walls, doors, light:** draw sight lines, doors (open/closed/locked/secret), windows, light sources with radius and colour
- **Draw new maps:** rooms, tiles, terrain brush (floor, water, grass)
- **Trigger zones:** areas that fire when a token enters: sound, light, text message to the DM, reveal trap, switch scene
- Grid alignment: overlay and fit the grid to the imported map's grid

### 8.2 Asset library

- **One global library** for all campaigns
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
- Master volume and "mute all" from the phone at any time

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
- **Handouts:** letters, images, NPC portraits, maps shown large on the TV and in the companion
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
2. **Snapshot & sync:** back up the campaign; the sync folder is updated so the phone has the current state on the go
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
- **Local network only:** companion and DM phone connect only on the local Wi-Fi; QR pairing with a one-time key so no stranger can control anything
- **Accessibility:** large controls on the phone, colour-blind-friendly markers
- **Legal:** 5e SRD content is CC-BY-4.0 – attribution required; bundled assets only CC0 or clearly licensed; respect Tabletop Audio's terms

---

## 16. Roadmap

### Stage 0 – Foundation

Monorepo, tooling, CI, app skeletons, performance spike (see TASKS.md).

### Stage 1 – MVP: map, fog, tokens (desktop)

- Desktop app with DM view and player view on the table TV
- Image map import, grid calibration, view rotation
- Manual fog and memory fog
- Digital tokens moved by the DM
- Initiative tracker with HP and conditions
- Basic per-element visibility
- Blackout button, autosave
- Folder structure and file format from day one

### Stage 2 – Planning on the phone & sound

- DM phone app: Markdown editor, wiki basics, map preparation, scene assembly
- Folder sync with per-OS guide, conflict detection, previews
- Sound: scene presets, layer mixer, soundboard, Tabletop Audio import
- Animated maps (MP4/WebM)
- Handouts on the TV

### Stage 3 – Networked at the table

- Wi-Fi pairing via QR: DM phone as remote and DM screen
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
- Dynamic vision with darkvision; fog behaviour per map
- UVTT import, multiple levels
- Asset placement, asset library and pack import
- Spells: areas, animations, persistent effects, light coupling
- Trigger zones

### Stage 6 – Campaign & comfort

- Session planner and scene bar with preview
- Full wiki/lore (relationships, status), session log with recap
- Monster stat blocks (SRD + homebrew), dice & log
- Calendar, generators, player aids, pause screen
- Trash, campaign export with assets
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
- **Phone sync:** walk through each OS/provider once (Android + FolderSync/Syncthing, iOS + iCloud/OneDrive) and write the in-app guide from it
- **Camera:** sticker size, camera height, reflections on the TV glass (matte screen protector?)
- **Tabletop Audio:** check terms for downloading and local use
