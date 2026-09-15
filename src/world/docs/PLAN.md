# TEAM MATE — the ship: completion plan

Status: **first playable vertical slice is done and verified**. This file is the
backlog for the parts that are missing, stubbed, or scripted, ordered so the
next session can pick up without re-deriving context.

Every item below was checked against the code, not remembered. File paths are
relative to `src/world/`.

- [Done] = shipped, no follow-up needed
- [Partial] = works, but knowingly shallow
- [Missing] = not started

---

## 0. What is done

The vertical slice from the master brief works end to end, verified by driving
the real game in a browser and logging a robot's coordinates each second:

```
dock (0,85) → frontend lab (-29,55) → spine → project module (-19,-13)
→ workstation (-33,-13) → spine (0,36) → lab berth (-33,55) docked
```

Also verified: mission console → project creation → module powers up and its
sign rewrites → robots assemble on launch pads → tasks complete → a review
raises a red beacon and queues rework → the beacon clears → a plaque appears in
the archive → Team Mate returns to the command deck to report.

Architecture is in place: data-driven layout, generated nav mesh, reusable prop
kit, static-geometry batching, a single `Simulation` that owns the
state → world mapping.

---

## 1. Highest value next (milestone M1)

These are the gaps a player notices first.

### W-01 [Partial] Project modules beyond five
Five slots exist (`MODULE_SLOTS` in `world/layout.ts`), and the sixth project is
refused with "All project modules are occupied". Nothing spawns a new module.
- **Do:** give `Project` a module lifecycle (`claimed`, `completed`,
  `released`) and a `ModuleRegistry` that reuses completed modules, then grows
  the deck. Two options, pick one and write the reason down in this file:
  (a) reuse slots after a project is archived (cheap, no geometry);
  (b) add a second project-deck band in `layout.ts` and build it lazily.
- **Files:** `world/layout.ts`, `game/system.ts`, `world/ship.ts`.
- **Accept:** creating ten projects in a row never fails, and the deck never
  shows two live projects in one module.
- **Decision (W-01): option (b) — a second project-deck band, built from
  `layout.ts` and grown on demand.** Chosen over (a) reusing archived slots
  because "ten projects in a row" means ten *live* projects at once: recycling
  released modules cannot satisfy it, so the deck has to be able to hold more
  than five. The band runs north of Mission Control (`DECK_B_BANDS`), where
  there was free hull space between the rotunda and the spine's north end, so
  it reuses the existing spine/room/tunnel builders instead of inventing new
  geometry. `ModuleRegistry` still prefers a released module before opening a
  new band slot, so finished projects recycle cheaply; the band only comes into
  play when nothing is free. A module's content is built lazily in the sense
  that the room stays dormant and unpowered until a project claims it.

### W-02 [Missing] Persistence
Every reload loses all state.
- **Do:** serialise `Simulation.projects` / `records` / `completed` to
  `localStorage` behind a versioned key, restore on boot, and replay it into the
  world (power the modules, re-spawn robots at their home berths, re-create
  plaques) on startup rather than animating the whole history.
- **Files:** new `game/persistence.ts`, `game/system.ts`, `main.ts`.
- **Accept:** reload mid-project restores module power, robot positions and
  progress bars; a corrupted payload falls back to a fresh ship without a
  console error.

### W-03 [Partial] Agent state is only readable as colour
The brief asks for state to read without text: docking light, posture, small
hologram, accent lighting, charging animation. Today: status ring opacity,
lens glow, head scanning.
- **Do:** in `entities/agent.ts` `animate()`, add per-state posture — head lift
  and track stance for `idle`, lowered head + forward lean for `working`,
  straight-up + fast blink for `reporting`, dimmed lens for `complete`. Make
  `ChargingStation`'s halo react when a robot is parked on its pad (needs an
  occupancy lookup, so pass the occupied anchor list into `ship.update`).
- **Files:** `entities/agent.ts`, `world/props.ts`, `world/ship.ts`.
- **Accept:** with the HUD hidden, an observer can name the state of each robot.

### W-04 [Missing] Robot inspection
"C" only cycles three camera presets. There is no way to look at a robot.
- **Do:** nearest-robot focus. On `F`, lock the camera to an agent: orbit
  around it, show its name, role, task and project on a diegetic strip (or a
  small holo panel above it), release with `F`/`Esc`. Reuse `Player`'s camera
  code by adding a `focusTarget` mode rather than a second camera.
- **Files:** `game/player.ts`, `game/hud.ts`, `main.ts`.
- **Accept:** every robot on the ship can be inspected, and the camera never
  clips through the floor or walls while focused.

### W-05 [Partial] Live ship displays
`MissionDisplay` screens are one static canvas texture for the whole build
(`core/textures.ts` draws them once at construction).
- **Do:** add `group.userData.setScreen(kind, data)` mirrors in
  `world/props.ts` for `MissionDisplay` and `ComputerTerminal`, then drive
  Mission Control (`screen:mission:*`), the lab main screens
  (`screen:<room>:main`), the workshop screen and the project task boards
  (`screen:<module>:tasks`) from `Simulation.updateBoards()`.
- **Accept:** Mission Control visibly shows active projects with progress;
  a lab screen identifies the robot that lives there and what it is doing.

---

## 2. World completeness (M2)

### W-06 [Missing] Ship exterior
There is no hull from the outside. Windows show a space backdrop only
(`buildSpace()` in `world/ship.ts`), so the ship cannot be seen flying.
- **Do:** build a simple exterior silhouette around the existing interior
  volumes — hull plating, engine block, antenna masts, running lights — sized
  from `ROOMS`/`SPINE_SEGMENTS`. Add one "observation" scene or an establishing
  camera so the shape is actually visible.
- **Accept:** from outside, the ship reads as a coherent vessel whose windows
  line up with the interior rooms.

### W-07 [Partial] Space environment variety
One Earth, one moon, one asteroid field. The brief lists deep space, alien
planet, nebula, space station.
- **Do:** make the backdrop a small data-driven set (`world/space.ts`) with an
  environment per deck: nebula for the command deck, alien planet for mission
  control, station for the dock, asteroid field for the workshop. Cross-fade on
  a long timer or expose it as a debug command.
- **Accept:** three visually distinct vistas are reachable without a reload.

### W-08 [Partial] Deck layout is one straight spine
Every room hangs off a single 320-unit corridor, so the ship is long and flat.
- **Do:** add a second deck and a lift/ramp. `Player` collision assumes a single
  walkable plane in `world/nav.ts` (`insideWalkable`); add a `deck` field to
  rects/circles and a `deck` to the player, then a lift volume that moves
  between them. Do this before adding more rooms, or the ship only gets longer.
- **Accept:** the player can ride a lift, and nav paths stay on one deck.

### W-09 [Missing] Team Mate HQ choreography
The rotunda is furnished, but Team Mate just stands on the dais; the four
`berth` anchors are never used, and the five HQ holo boards only show project
names and percentages.
- **Do:** have Team Mate walk the dais ring while orchestrating, place a
  floating marker per running project, and draw an animated connection line
  from the dais to the module's direction on the deck.
- **Accept:** standing in the HQ, the running project set is legible at a glance
  (which projects, how far, how many robots).

### W-10 [Missing] Foreman representation
The product vision has a foreman worker for large task groups; the ship has no
way to show it.
- **Do:** once the simulation supports a foreman role, give it a distinct crest
  on the shared robot base and a supervisory route (dais → each worker), so the
  hierarchy is visible rather than narrated.
- **Depends on:** W-05 and the AI wiring in W-20.

---

## 3. Character and prop fidelity (M3)

### W-11 [Partial] Developer avatar
Reads well in third person. Still missing from the reference sheet: the seated
leg pose is approximated, and there is no idle typing/looking-up animation.
- **Do:** add a small procedural idle (typing hands, occasional head turn,
  screen glow reflecting on the face) and a "stand up / walk" variant only if
  the player ever leaves the pod. Do not redesign the model.
- **Accept:** a 10-second idle loop at the desk reads as a living character.

### W-12 [Partial] Robot articulation
Tracks spin and the head scans; the chassis is rigid.
- **Do:** add a suspension bob on move start/stop, a head *tilt* on terrain
  changes, and a slow power-up boot sequence (head lifts, lens iris opens) when
  a robot spawns. Keep it to the shared base model so every variant inherits it.
- **Accept:** spawning, working and docking each have a distinct silent read.

### W-13 [Partial] Prop kit depth
The kit is broad (see `world/props.ts`) but several rooms reuse the same shapes.
- **Do:** add `ServerRackDoor`, `CableTray`, `ToolCart`, `CraneRail`,
  `HoloPedestal`, `FumeHood` for the workshop/labs, and give the review lab an
  inspection rig instead of a generic bench.
- **Accept:** the four labs are distinguishable by silhouette, not just accent.

### W-14 [Partial] Dead prop exports
Defined and never called, so they render nowhere and mislead the next reader:
`SpaceshipWall`, `SpaceshipFloor`, `SpaceshipCeiling`, `Corridor`, `Archway`,
`DeveloperChairPod`, `WarningLight`, `ProjectSign`, `rolePlateTexture`.
`adaptiveQuality` in `core/engine.ts` is also unused.
- **Do:** either wire them in where they were meant to go (a corridor-built
  room shell, a warning beacon at the module door, an adaptive pixel-ratio
  callback in the frame loop) or delete them. The brief asks for a reusable
  module library, so prefer wiring over deleting — but pick one and finish it.
- **Accept:** `grep` for any exported prop name finds a call site, or the export
  is gone.

---

## 4. Systems robustness (M4)

### W-15 [Missing] Failure and blocked states
Only a successful review creates an error. Agents cannot fail, stall or need
help, and `AgentState` already has `blocked` unused.
- **Do:** add a failure roll per task type, a `blocked` animation plus the amber
  beacon, and a Team Mate recovery beat (Team Mate travels to the module, the
  task is retried or the project is escalated to the developer). Emit
  `agent:error` / `ship:warning` as today.
- **Accept:** a mission can fail, be recovered, and the ship reports it without
  the HUD.

### W-16 [Partial] Anchor allocation
`freeAnchor()` scans a `Map` in insertion order and falls back to a same-kind
anchor anywhere in the ship when the preferred room is full. Robots can be sent
to a workshop bench instead of their project module.
- **Do:** make the fallback explicit and room-scoped, reserve anchors at
  assignment time (already partly done via `busy`), and release them on
  cancel/complete. Add a debug overlay listing busy anchors.
- **Accept:** with every workstation occupied, two agents never share a
  terminal and no agent is sent to an unrelated room.

### W-17 [Partial] Camera in tight spaces
The pull-in uses rectangle/circle sampling with an area heuristic
(`blocksCamera` in `game/player.ts`).
- **Do:** replace with a proper short raycast from the focus to the desired
  camera position against the ship's merged static meshes (cheap: a handful of
  meshes), and drop the heuristic.
- **Accept:** the camera never ends up inside geometry in the corridors, the
  HQ door frames, or between two workbenches.

### W-18 [Missing] Performance guard rails
Measured: 294 draw calls, 643k triangles, ~30 point lights, no LOD, pixel ratio
capped at 2. `adaptiveQuality` exists but is not called.
- **Do:** wire adaptive pixel ratio from a rolling frame-time average, cull room
  lights by player room + visibility, and consider merging per-room hull batches
  so frustum culling can drop rooms behind you.
- **Accept:** 60 fps on an integrated GPU at 1440p; a documented measurement in
  this file.

### W-19 [Missing] Tests
No automated tests. The nav mesh, projection, and simulation are all pure enough
to test in Node.
- **Do:** add `vitest` with a headless suite over `NavGraph.path`, `canStand` /
  `insideWalkable`, `buildNav` connectivity (every room reachable from the dock),
  `projectProgress`, and `Simulation` transitions with a stubbed `Ship`.
- **Accept:** `npm test` fails if a room becomes unreachable or a task can never
  complete. Add a CI job.

---

## 5. AI integration (M5)

### W-20 [Missing] Real Team Mate behind the world
The world is driven by `game/missions.ts` (keyword planning) and
`game/system.ts` (scripted assignment). This is the point of the whole project.
- **Do:** define a narrow `Orchestrator` interface in `game/orchestrator.ts`:
  `plan(instruction) → MissionPlan`, `onTaskComplete(task) → next action`,
  `onBlocked(agent) → decision`. Ship two implementations: the current
  `ScriptedOrchestrator` and a `TeamMateOrchestrator` that talks to a real Team
  Mate session (the `tm` CLI / Herdr, or an agent API) and maps its worker
  lifecycle onto `Agent` calls (`goToAnchor`, `startWorking`, `startReporting`).
- **Constraints to preserve:** the ship, rooms, robots and nav code must not
  change. The interface boundary is the acceptance criterion.
- **Accept:** swapping one line in `main.ts` runs the same world against a live
  orchestrator, and a worker's real progress drives its robot's behaviour.

### W-21 [Missing] Report surface
Team Mate's output currently ends in a HUD ticker line.
- **Do:** once W-05 lands, route reports to the mission console screen and to
  the HQ boards so the developer can read a report from inside the world, plus a
  scrollback reachable at the console for the last N reports.
- **Accept:** a full mission report can be read without the HUD.

---

## 6. Presentation (M6)

### W-22 [Missing] Audio
No sound anywhere.
- **Do:** a small ambience layer (room hum, distant hull creak, dock machinery),
  robot locomotion, door servos, console key clicks, and a soft confirmation
  when a task completes. Keep it low and optional, muted by default only if it
  cannot be tuned well.
- **Accept:** muting is one key, and the ship does not feel dead.

### W-23 [Partial] Onboarding
The boot screen lists keys; there is no in-world teaching.
- **Do:** make the first mission a guided one: Team Mate asks, the camera
  nudges toward the dais, the first robot's launch pad is highlighted, and the
  developer is told to follow it once. Never repeat after the first run.
- **Accept:** a new player completes the loop once without reading the README.

### W-24 [Missing] Accessibility
State is largely colour-coded; there is no key remapping, no UI scale, no
reduced-motion option for the bloom and holo flicker.
- **Do:** add a second visual channel per state (already partly W-03), a
  reduced-motion flag that damps hologram animation, remappable keys, and a
  larger prompt/text scale.
- **Accept:** the loop is playable with colour discrimination removed and with
  motion reduced.

---

## 7. Suggested order

| Milestone | Items | Theme |
| --- | --- | --- |
| M1 | W-01, W-02, W-03, W-04, W-05 | make the existing loop deep enough to watch |
| M2 | W-06, W-07, W-09, W-08 | make the ship feel like a ship |
| M3 | W-11, W-12, W-13, W-14 | make it look premium, remove dead weight |
| M4 | W-15, W-16, W-17, W-18, W-19 | make it not break |
| M5 | W-20, W-21 | make it real |
| M6 | W-22, W-23, W-24 | make it finishable |

Do W-19 (tests) early if anyone other than the original author will touch
`nav.ts` or `system.ts`; it is cheap insurance on code with a lot of implicit
invariants.

---

## 8. Verification commands

```bash
cd src/world
npm run typecheck        # tsc --noEmit
npm run build            # tsc + vite build → dist/
npm run dev              # http://localhost:5273
```

Manual pass after any world change:

1. Board the ship; fly the spine from the command deck to the robot dock and
   back — check for camera clipping and unlit rooms.
2. Talk to Team Mate, dispatch a mission, set ×8, and watch one robot from
   spawn to dock.
3. Confirm the module sign, the module holo board, the archive plaque and Team
   Mate's return all happen without a console error.
4. `console` must be clean of errors and of three.js deprecation warnings.
