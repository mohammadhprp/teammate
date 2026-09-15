# TEAM MATE — the ship

A playable, stylized 3D world that shows the TEAM MATE vision instead of
describing it.

> The developer is the commander. Team Mate is the orchestrator.
> Projects are physical modules. Worker agents are robots that live in the ship
> and do the work where you can watch them.

This is **not** a dashboard with a 3D background. There is no sidebar, no card
grid, no table. Project state lives on holographic boards inside the rooms,
agent state lives in robot posture and status rings, and completion lives in a
plaque on a pedestal in the mission archive.

```bash
cd src/world
npm install
npm run dev        # http://localhost:5273
```

`npm run build` type-checks and emits a static `dist/`.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | fly the command pod (camera relative) |
| mouse | look (click the canvas to capture the cursor) |
| `Shift` | boost |
| `E` | talk to Team Mate — opens the mission console (when you are near it) |
| `1` `2` `3` | simulation speed ×1 / ×3 / ×8 |
| `C` | camera: follow → wide → overhead |
| `B` | bloom on/off |
| `P` | pause the simulation |
| `Esc` | release the cursor |

## The loop

```text
developer  →  Team Mate  →  project module  →  agent robots  →  work  →  report
```

1. Fly to Team Mate on the command deck (it also moves, so follow the robot).
2. Press `E`. Team Mate's mission console opens: pick a standing mission or
   type an instruction (`build the payments API, then review and test it`).
3. Watch the ship react:
   - a project module lights up, its doorway sign is rewritten to the project
     name, and its holographic board boots;
   - robots materialise on launch pads in the ROBOT DOCK;
   - each robot drives to its own lab, then to a workstation in the project
     module, and works facing the terminal;
   - if a review finds something, a red beacon starts turning over the module
     door and a rework task is queued;
   - the module's holo board fills a bar per finished task;
   - when the project completes, a plaque materialises in the mission archive
     and Team Mate returns to the command deck to report.

Set speed to ×8 if you want to see the whole arc quickly.

## The ship

One connected hull with a single spine corridor. North is `-Z`.

```text
                         MISSION CONTROL      round, holographic fleet globe
                                |
                          TEAM MATE HQ        round rotunda, dais, agent berths
                                |
   PROJECT 01 ──────────── PROJECT DECK ──────────── PROJECT 02
   PROJECT 03 ─────────────── spine ──────────────── BACKEND LAB
   FRONTEND LAB ──────────────────────────────────── REVIEW LAB
   TEST LAB ──────────────────────────────────────── WORKSHOP
   EXPANSION A ───────────────────────────────────── EXPANSION B
                                |
                          ROBOT DOCK          six launch pads, gantry
                                |
                          COMMAND DECK        round, panoramic windows, spawn
                                |
                     MISSION ARCHIVE          completed-mission plaques
```

Room heights, door positions, accents and the walkable footprint all come from
`src/world/layout.ts`.

## Architecture

```text
src/
  core/
    engine.ts      renderer, composer (subtle bloom), lighting rig, frame loop
    palette.ts     the whole visual language: warm white hull, charcoal
                   mechanics, one cyan accent, four role accents
    batch.ts       static-geometry merger — ~3900 pieces become ~40 draw calls
    textures.ts    every sign, screen, hologram, plaque and starfield is drawn
                   at runtime on a canvas, so the world ships with no art files
    events.ts      the game-state → world-state event bus
    input.ts       keyboard + pointer lock
    math.ts        damp/lerp/easing/rng
  world/
    layout.ts      the ship as data: rooms, corridors, doors, module slots
    props.ts       the reusable prop kit (SpaceshipWall, AutomaticDoor,
                   DockingStation, ChargingStation, Workbench,
                   ComputerTerminal, HolographicProjector, MissionDisplay,
                   StorageContainer, ServerCabinet, MechanicalPanel,
                   ControlPanel, CommunicationTerminal, WarningLight, …)
    interiors.ts   one furnishing pass per room kind + the anchors robots use
    nav.ts         A* waypoint mesh generated from layout + anchors, plus the
                   walkable union and obstacle test used for collision
    ship.ts        assembles the hull, the shells, the doors, room power rigs
                   and the space backdrop outside the windows
  entities/
    robot.ts       THE base robot: tracked base, cream chassis, binocular head
    developer.ts   the developer + the floating command pod
    agent.ts       locomotion, path following, work/report states
  game/
    state.ts       Project / Task / AgentRecord data model
    missions.ts    standing missions + free-text → plan
    system.ts      the simulation: every state change has a physical effect
    player.ts      player controller and camera rig
    hud.ts         the only UI: interaction prompt, comms ticker, and
                   Team Mate's mission console
  main.ts          wiring
```

### Game state → world state

| Game state | Physical representation |
| --- | --- |
| project created | module powers up, sign rewritten, holo board boots |
| agent created | robot assembles on a launch pad in the dock |
| agent assigned | robot drives dock → its lab → its workstation |
| agent working | robot parked facing the terminal, status ring pulsing |
| review | robot works at the quality-control bench in the review lab |
| error / rework | red beacon turning over the module door, extra task queued |
| task complete | another bar fills on the module's holo board |
| project complete | plaque in the mission archive, module returns to standby |
| agent idle | robot returns to its berth in its own lab |
| Team Mate orchestrating | Team Mate drives to the dais in the HQ rotunda |
| Team Mate reporting | Team Mate returns to the command deck and reports |

## Extending it

**A new room.** Add a `RoomDef` to `ROOMS` in `layout.ts` (or a corridor to
`CORRIDORS`), then either reuse an existing furnisher or add one in
`interiors.ts`. The shell, walkable area, nav nodes, doorway tunnel, automatic
door and power rig are all generated from the definition.

**A new project.** Add a `MissionTemplate` to `MISSIONS` in `missions.ts` —
tasks, owner role, duration. Nothing else needs to change: modules are claimed
from a slot pool, so projects 4 and up move into the expansion bays.

**A new agent role.** Add it to `AgentRole` in `layout.ts`, give it a room in
`ROLE_ROOM`, an accent in `ROLE_ACCENT` and an icon in `ROLE_ICON`. The robot
model is shared — only the accent and the badge change, exactly as in the
reference sheet.

## Connecting real AI

`game/system.ts` is the only place that knows how work happens. Today
`createProject()` takes a `MissionTemplate` from `missions.ts`, and
`assignNextTask()` decides what a robot does next. Replace those two with calls
to a real Team Mate session — subscribe to the same `bus` events, drive the same
`Agent` API (`goToAnchor`, `startWorking`, `startReporting`) — and the world
keeps working without a single change to the ship, the rooms or the robots.
