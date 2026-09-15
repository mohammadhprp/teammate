# world — the TEAM MATE ship

A playable, stylized 3D spaceship that shows the TEAM MATE vision instead of
describing it. Self-contained Vite + TypeScript + three.js app; no art files —
every sign, screen and hologram is drawn on a canvas at runtime.

This file is the contributor/worker contract for this directory. Read it before
editing, then read `README.md` (architecture) and `docs/PLAN.md` (the backlog).

## If you are a delegated worker agent

You are a **worker**, not the primary. A parent-directory role file (for example
`../AGENTS.md`) may describe the Team Mate coordinator role; that role does not
apply to work in this directory. Do **not** coordinate, delegate, or spawn
subagents. Implement the brief yourself, inside `src/world/`, and report when
done.

## Commands

```bash
cd src/world
npm install          # first run only
npm run typecheck    # tsc --noEmit
npm run build        # tsc --noEmit && vite build -> dist/
npm run dev          # http://localhost:5273
```

## Architecture (short)

- `src/world/layout.ts` — the ship as data: rooms, corridors, doors, module slots.
- `src/world/nav.ts` — A* waypoint mesh, walkable union, collision test.
- `src/world/ship.ts` — assembles hull, shells, doors, room power rigs.
- `src/world/props.ts` / `interiors.ts` — the reusable prop kit and room furnishing.
- `src/entities/*` — robot base model, developer avatar, agent locomotion/states.
- `src/game/*` — simulation (state → world), missions, player/camera, HUD.
- `src/core/*` — engine, palette, batching, canvas textures, events, input, math.
- `src/main.ts` — wiring.

`Simulation` (`src/game/system.ts`) is the only place that turns game state into
physical effects. The ship, rooms, robots and nav must keep working when the
simulation changes.

## Conventions

- Match the existing style: small pure helpers, data-driven layout, cached
  materials/geometries, no new runtime dependencies without justification.
- Keep the console clean: no errors and no three.js deprecation warnings.
- State must read without text — posture, light and hologram, not labels.

## Definition of done

1. `npm run typecheck` passes.
2. `npm run build` passes.
3. A browser smoke test of the changed behaviour shows no console errors.
4. The change is surgical: no unrelated rewrites or formatting churn.

## Rules for a delegated worker

- Work only inside `src/world/`; do not read or write outside it.
- Do not commit, merge, push, publish, deploy, or delete.
- Implement exactly the brief's scope; raise a blocker instead of guessing.
