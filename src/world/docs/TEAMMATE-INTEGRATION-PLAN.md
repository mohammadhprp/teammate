# Wiring the live Team Mate runtime into the world

Status: **plan, not implemented.** This document is the executable design for
`docs/PLAN.md` items **W-20 (Real Team Mate behind the world)** and **W-21
(Report surface)**. It is written against the code as it is on disk today, not
against the backlog text.

Author's note: another worker is editing `src/world/src` right now. Everything
here was read, not run; `npm run build` / `npm run dev` were deliberately not
executed. Before implementing, re-read `game/system.ts` and `game/state.ts` and
rebase the method names below onto whatever that worker left behind.

---

## 0. Ground truth found in the current code

These matter because they change what has to be built.

| Fact | Evidence | Consequence for this plan |
| --- | --- | --- |
| Persistence already exists | `src/game/persistence.ts` (`SAVE_KEY`, `SAVE_VERSION`, `load`/`save`), called from `main.ts` | The mirror must be **excluded from the world save**, or a reload replays ghost projects. |
| The second project deck already exists | `DECK_B_BANDS`, `deckBModules()`, `MODULE_SLOTS` (11 ids) in `world/layout.ts` | Up to 11 live mirrored projects can be shown; overflow needs an explicit queue rule. |
| Live wall screens are already wired | `props.ts` `liveScreenTexture` / `userData.setScreen` / `setTitle` / `setProgress`; `system.ts` `updateScreens()` | **No room/props code needs to change** to show mirrored state or reports. |
| `Agent.state` is a public field | `entities/agent.ts` line 90; `POSTURE.blocked` already defined | A live worker can be put into `blocked` posture from `game/` without touching `entities/`. |
| Screen repaint is already throttled | `Simulation.update()` repaints every 0.5 s | Polling the bridge at ~1 Hz cannot starve the frame loop. |
| `GameEvent` is the world's only internal seam | `core/events.ts` | It is the right place to announce bridge link/blocked lifecycle; it is **not** the transport. |
| `Simulation` is the only state→physical adapter | `AGENTS.md`, `system.ts` header | `RuntimeMirror` must call `Simulation`/`Agent` APIs; the bridge must never touch three.js. |

---

## 1. Acceptance criterion 1 — where the boundary sits

The live runtime is two systems that never share a process:

```
Herdr runtime + tm CLI + ~/.teammate ledger     (Node, same machine)
        │  herdr api snapshot / tm task list / files
        ▼
  bridge/  (Node: adapter + fixed command surface)         ← untrusted I/O boundary
        │  plain JSON over localhost (SSE + GET/POST)
        ▼
  game/bridgeClient.ts  (browser: fetch + EventSource, reconnect, fallback)
        │  MirrorFrame objects
        ▼
  game/orchestrator.ts  (Orchestrator interface + TeamMateOrchestrator)
        │
        ▼
  game/runtime.ts  (RuntimeMirror: identity maps → Simulation calls)   ← the ONLY adapter
        │  existing Agent API (goToAnchor / startWorking / startReporting / markComplete)
        ▼
  game/system.ts  Simulation  ──emits──▶  core/events.ts  bus  ──▶  ship effects
```

Rules that define the boundary:

1. **`bridge/` is Node-only and three.js-free.** It reads `herdr`/`tm`/files and
   emits JSON. It never imports anything from `src/world/src`.
2. **`bridgeClient.ts` is transport-only.** It owns reconnect/backoff/fallback
   and the session token. It contains no world logic.
3. **`orchestrator.ts` is the W-20 seam.** `plan()`, `onTaskComplete()`,
   `onBlocked()` live here. `ScriptedOrchestrator` wraps `missions.ts` and today's
   assignment logic; `TeamMateOrchestrator` consumes mirror frames.
4. **`runtime.ts` is the single adapter from bridge JSON to the world.** It owns
   the identity maps (`taskId → projectId/moduleId`, `worker → agentId`) and is
   the only new code allowed to call `Simulation`/`Agent` mutators.
5. **`Simulation` keeps its monopoly on state→physical.** It gains a small
   additive public API (below); its internals and the ship/rooms/robots/nav are
   untouched.
6. **`core/events.ts` stays intra-world.** It gains bridge-lifecycle events
   (`bridge:linked`, `bridge:lost`, `agent:blocked`, `agent:unblocked`,
   `mirror:reset`) so the ship can raise beacons and the HUD can react. It is not
   the wire format.

`main.ts` picks the orchestrator: one line, exactly as W-20's acceptance
criterion asks.

```
// offline (today's behaviour, and the dist/ build)
const orchestrator = new ScriptedOrchestrator(MISSIONS, planFromText)

// live (bridge present)
const orchestrator = new TeamMateOrchestrator(new BridgeClient(), mirror)
```

---

## 2. Acceptance criterion 2 — options and recommendation

### 2.1 Bridge: Vite middleware vs standalone daemon

| | **A. Vite plugin middleware** | **B. Standalone local daemon** |
| --- | --- | --- |
| Where | `configureServer()` in `vite.config.ts` | `bridge/server.mjs`, `node bridge/server.mjs` |
| Extra process | none | one more thing to start |
| Origin/CORS | same origin (`localhost:5273`), no CORS | cross-origin → needs CORS + token |
| Ships to `dist/` | no (dev-only) | can serve `dist/` too |
| Restart | dies with Vite | survives Vite restarts |
| Security surface | smallest: one listener, same origin | larger: second port, CORS |
| Matches the task | `npm run dev` is the world's runtime | needed only if the world is packaged |

**Recommendation: A, structured so B is a mount away.** The world is a
dev-server app; Node is already present; same-origin removes CORS and halves the
security surface. Write the bridge as `createBridgeHandler(config)` returning a
plain `(req, res) => void`. `vite.config.ts` mounts it under
`/api/team-mate`; `bridge/server.mjs` is a ~20-line `http.createServer` wrapper
for the future packaged case. Keep both paths on **`127.0.0.1` only**.

### 2.2 Transport: browser poll vs server push (SSE/WebSocket)

| | **A. Browser polls GET /snapshot** | **B. Server polls → SSE push** | C. WebSocket |
| --- | --- | --- | --- |
| `herdr` spawns | 1 per client per tick | 1 shared, per tick | 1 shared |
| Latency | up to `POLL_MS` | up to `POLL_MS`, delivered immediately | up to `POLL_MS` |
| Reconnect | trivial | `EventSource` auto-reconnect + backoff | manual |
| Server code | smallest | one poll loop + fan-out, heartbeat | handshake + framing |
| Needed for dispatch | no (separate POST) | no | no |

**Recommendation: B (server-side poll at 1 Hz → SSE fan-out), with GET
`/snapshot` as the first-paint + fallback path.** One `herdr api snapshot` per
tick is shared by every tab instead of per-client; `EventSource` gives reconnect
for free and streams report lines as they land. WebSocket buys nothing: dispatch
is a single POST, not a duplex stream.

**Interval / churn argument.** Workers change state on the order of seconds to
minutes; a robot walks the ship in seconds. 1 Hz gives ≤1 s perceived latency,
far below noticing. The expensive call is not the snapshot (cheap and complete)
but `herdr agent read`; the bridge only reads a worker's terminal when its
`revision`/`state_change_seq` changed or it newly entered `idle`/`blocked`,
capped at 4 reads per tick with a 15 s per-worker cooldown. A digest
(`sha1` of the frame) suppresses unchanged SSE frames, and a 15 s heartbeat
keeps the connection warm. `TEAM_MATE_POLL_MS` overrides the interval.

---

## 3. Acceptance criterion 3 — the data/event contract

### 3.1 Identity mapping (the decision)

| World concept | Team Mate concept | Why |
| --- | --- | --- |
| **`Project`** | **one ledger task** (`tasks/<id>.json`) | A task, not a workspace or a session, is the unit that has a title, acceptance criteria, one worker, findings, a report and a terminal outcome — exactly the world `Project`'s shape. It is what earns a plaque. Session/workspace are context fields on it. |
| **`Task`** (world) | **one `acceptance[]` criterion** (+ synthesized rework rows from open findings) | The world board shows a row per task; acceptance criteria are the visible progress. This reuses the existing "Fix:" rework mechanic. |
| **`AgentRecord` / robot** | **one live worker** (Herdr agent), keyed by `task.worker` | The developer asked to see workers as robots; worker name is the stable identity. |
| **Team Mate robot** | **the primary** (the `teammate`-workspace agent, else the session) | The `team-mate` robot already exists in `Simulation`. |
| **Fleet / HQ** | **the Team Mate session** (`session.json`) | Session = the whole run; four HQ boards show the most-recent live tasks. |

Rejected alternative: *workspace = Project*. A workspace has no per-item
progress and can hold unrelated tabs, so the module board and progress bar would
be fiction. Recorded here so it is not re-litigated.

**Role inference** (Team Mate has no fixed roles; the world's robots do):

```
/^(backend|developer|dev|server|api)[-_]/  -> backend
/^(frontend|ui|web|client)[-_]/            -> frontend
/^(test|tester|qa)[-_]/                    -> test
/^(review|reviewer|audit)[-_]/             -> review
/^(foreman|orchestrator)/                  -> review   (placeholder until W-10)
else: keyword-match the task title/category, else backend
```

**Module assignment.** The mirror holds `taskId → moduleId`. A task claims a
module the first time it is seen non-terminal (`ModuleRegistry.next()`); the
mapping is stable for the task's life so modules never flicker. Terminal status
releases it. With `MODULE_SLOTS` (11) exhausted, surplus tasks go to an overflow
list rendered on Mission Control only; they claim a module when one frees.

### 3.2 Herdr fields consumed

`herdr api snapshot → result.snapshot`:

| Field | Use |
| --- | --- |
| `name` | worker identity; robot name and `AgentRecord.name` |
| `agent` (kind) | distinguishes the primary from workers |
| `agent_status` | drives `AgentState` (table below) |
| `workspace_id` / `workspace` | maps to the module band / project label |
| `cwd` | shown on the focus strip; must not leak into any file path the browser can request |
| `tab_id`, `pane_id`, `terminal_id` | display only; never a dispatch address |
| `terminal_title` | lab screen / report headline fallback |
| `revision`, `state_change_seq` | change detection; gates `herdr agent read` |

`herdr agent read <name> --source recent-unwrapped --lines N` produces report raw
text, only for changed/newly-idle/blocked workers.

### 3.3 Ledger fields consumed

`tasks/<id>.json`: `id, title, goal, acceptance[], constraints[], project, root,
workspace, worker, session, status, iteration, max_iterations, report,
findings[], created_at, updated_at`.
`timeline.jsonl` `{at, task, kind, summary}` for report/event headlines.
`session.json` `{id, started_at}` for the fleet and the reset key.
`reports/*.md` (by mtime) for full report text.

### 3.4 The mirror frame (wire contract, JSON)

```jsonc
{
  "at": 1737000000000,
  "digest": "sha1:…",
  "session": { "id": "ses_…", "startedAt": 1736990000000, "workspace": "teammate", "primary": "team-mate" },
  "agents": [{
    "name": "developer-alpha", "kind": "worker",
    "status": "working",            // working|idle|done|unknown|blocked
    "workspace": "world", "cwd": "/…/src/world",
    "tab": "tab_…", "pane": "pane_…", "terminal": "term_…",
    "title": "entity art", "revision": 42, "seq": 118, "primary": false
  }],
  "tasks": [{
    "id": "T-0142", "title": "Wire entity art into the world",
    "goal": "…", "acceptance": ["…", "…"], "constraints": ["…"],
    "project": "world", "root": "/…/src/world", "workspace": "world",
    "worker": "developer-alpha", "session": "ses_…",
    "status": "rework", "iteration": 2, "maxIterations": 3,
    "report": "…", "findings": [{
      "severity": "major", "category": "correctness", "title": "…",
      "detail": "…", "file": "src/…", "line": 42,
      "suggestion": "…", "status": "open"
    }],
    "createdAt": 0, "updatedAt": 0
  }],
  "reports": [{ "task": "T-0142", "worker": "reviewer-gamma", "at": 0, "text": "…" }]
}
```

### 3.5 Dispatch contract (browser → bridge)

Fixed surface. Nothing else is routable.

```
GET  /api/team-mate/health                 -> { ok, herdr, tm, root, pollMs }
GET  /api/team-mate/snapshot               -> MirrorFrame (last computed)
GET  /api/team-mate/stream                 -> SSE, event: frame, heartbeat ": ping"
POST /api/team-mate/task   { project, title, goal, acceptance[], constraints?[] } -> { id }
POST /api/team-mate/dispatch { taskId, role? } -> { worker }   // spawn + brief + send
POST /api/team-mate/decide { taskId, action: approve|request-changes|reject|finalize } -> { ok }
POST /api/team-mate/stop   { worker } -> { ok }
```

Required on every POST: `Origin: http://localhost:5273` (or the dev origin),
`Content-Type: application/json`, and `X-Team-Mate-Token` equal to a per-process
random token injected into the served page. **No endpoint accepts a command
string, a shell argument, a file path, or a keystroke.**

### 3.6 Lifecycle table — Herdr agent status → `AgentState`

| Herdr | World `AgentState` | Physical read (no text) |
| --- | --- | --- |
| `working` | `working` | at the station, head down, lens bright, ring fast |
| `idle` | `docked` | at its berth, head lifted, scanning |
| `done` | `docked` | ready-for-input, **not** `complete`; `complete` is reserved for a finished project |
| `blocked` | `blocked` | parked, **amber beacon** over the module door, report line naming the worker |
| `unknown` | `docked` | desaturated ring, `?` note on the lab screen; never invent work |
| worker absent | `docked` at home berth | the record persists until its task is terminal |

### 3.7 Lifecycle table — ledger task status → world effect

| Task status | Project / module | Board | Robot | Beacon | Team Mate |
| --- | --- | --- | --- | --- | --- |
| `planned` | module claimed, powered | criteria rows `QUEUED` | assembling on a launch pad | — | to HQ |
| `working` | powered | active criterion `ACTIVE` | `working` at workstation | — | HQ dais |
| `awaiting_review` | powered | row `AWAITING REVIEW` | `reporting` beat at module | — | HQ dais |
| `rework` | powered | synthesized `Fix:` row `ACTIVE` | returns to workstation, `working` | **red** | HQ dais |
| `ready_for_approval` | powered, board pulses | row `READY FOR APPROVAL` | `reporting` at module | — | HQ dais, HQ board highlights |
| `approved` | `completeProject`, power down | all rows `DONE` | `markComplete`, returns to berth | — | to command deck, reporting beat |
| `rejected` | archived failed | — | `markComplete` | **red** before archive | to command deck |
| `failed` | archived failed | — | `markComplete` | **red** | to command deck |
| `cancelled` | power down, no plaque | — | `docked` | — | stays in HQ |

### 3.8 Findings → world effect

| Severity / status | Effect |
| --- | --- |
| `blocker` or `major`, `open` | red beacon + one synthesized rework row per finding (mirrors today's `Fix:` mechanic) |
| `minor` / `nit`, `open` | board note row only, no beacon |
| `resolved` / `accepted` | row clears; beacon clears when no open blocker/major remains |

### 3.9 Reports (W-21)

- Bridge emits report texts (mtime-deduped) in the frame. **Only the worker's
  last message** is surfaced (developer decision): `herdr agent read` takes the
  final settled message, not the whole unwrapped tail, so the board stays a
  headline and the console scrollback holds the recent N.
- `RuntimeMirror` → `Simulation.pushReport(entry)`.
- `Simulation` emits the existing `report` event (ticker headline) and:
  - writes the full text to the HUD console scrollback (open with `E`), and
  - repaints the in-world **REPORTS** board (`screen:mission:e`) as wrapped rows.
- No `props.ts` / room change is needed: `setScreen` already exists and
  `ScreenData.rows` carries wrapped lines.
- The design keeps the "state reads without text" convention for *state*, and
  treats reports as the deliberate textual exception W-21 asks for.

---

## 4. Acceptance criterion 4 — dispatch safety

1. **Localhost only.** Both mounts bind `127.0.0.1`. Reject any request whose
   `Host`/`Origin` is not the dev origin.
2. **Token.** A per-process random token is injected into the page (Vite
   `define`) and required in `X-Team-Mate-Token`. A custom header forces a CORS
   preflight, so a random web page cannot silently POST to the bridge.
3. **Fixed surface.** Only the six endpoints in §3.5. No arbitrary `herdr`/`tm`
   arguments, no `herdr agent send-keys`, no keystroke injection, no path input.
4. **Auto-dispatch (developer decision).** `POST /task` both *creates* the
   ledger task and spawns its worker in one call: typing an instruction in the
   world console is the dispatch. The consequential action is therefore guarded
   by the localhost bind, the origin check and the per-process token rather than
   a second confirm; the console shows a clear `DISPATCHING …` state and the
   worker's robot appears within one poll. A separate `POST /dispatch` remains
   available to re-dispatch an existing task (e.g. a rework round).
5. **Blocked is surfaced, never answered.** When any agent is `blocked`, the
   bridge flags it, the world raises the amber beacon and a report line, and the
   console shows a non-actionable "BLOCKED — needs approval in its terminal"
   row. There is **no endpoint that answers a dialog.** The developer answers in
   Herdr; the mirror just observes the status go back to `working`.
6. **No secrets to the browser.** The frame carries only display fields; file
   contents, env, and raw terminal buffers are never sent (only the extracted
   report text).
7. **Kill switch.** `GET /health` reports whether `herdr`/`tm` are reachable;
   the world can drop to scripted mode without a restart.

---

## 5. Acceptance criterion 5 — file-by-file plan

### 5.1 Frozen (must show zero diff)

`src/world/ship.ts`, `src/world/nav.ts`, `src/world/layout.ts`,
`src/world/props.ts`, `src/world/interiors.ts`, `src/entities/robot.ts`,
`src/entities/developer.ts`, `src/core/engine.ts`, `src/core/batch.ts`,
`src/core/textures.ts`, `src/core/palette.ts`, `src/game/player.ts`.

### 5.2 New files (Node bridge, dependency-free `.mjs`)

- **`bridge/map.mjs`** — pure: `(snapshotJson, ledger) → MirrorFrame`. Implements
  §3.1–§3.4 and the lifecycle tables. Role inference and module assignment live
  here. Unit-testable with no I/O.
- **`bridge/herdr.mjs`** — `execFile('herdr', …)` with a timeout and single
  flight; parses `result.snapshot`; `read(name)` gated by revision/cooldown.
- **`bridge/ledger.mjs`** — resolves the ledger root (`TEAM_MATE_ROOT`, default
  `~/.teammate/`), scans `tasks/` by mtime, tails `timeline.jsonl`, reads
  `session.json`, lists `reports/`.
- **`bridge/dispatch.mjs`** — the §3.5 command surface; builds a brief from
  goal+acceptance; picks a `[a-z][a-z0-9_-]{0,31}` worker name; calls
  `tm task new`, `tm brief`, `tm send`, `tm task decide`, `tm stop`.
- **`bridge/server.mjs`** — `createBridgeHandler(config)` + a standalone
  `http.createServer` entry. Owns the 1 Hz poll loop, digest, SSE fan-out,
  heartbeat, auth/origin/token checks, and caps.

### 5.3 New files (browser)

- **`src/game/bridgeClient.ts`** — `fetch` + `EventSource`, backoff, one health
  probe at boot, `onFrame`/`onStatus` callbacks. Never throws into the frame
  loop.
- **`src/game/orchestrator.ts`** — the `Orchestrator` interface (W-20) plus
  `ScriptedOrchestrator` and `TeamMateOrchestrator`.
- **`src/game/runtime.ts`** — `RuntimeMirror`: identity maps, `MirrorFrame →
  Simulation` calls, session-change reset, dispatch helpers.

### 5.4 Changed files (surgical)

- **`vite.config.ts`** — mount `createBridgeHandler()` under `/api/team-mate`;
  inject the token via `define`.
- **`src/core/events.ts`** — add `bridge:linked`, `bridge:lost`,
  `agent:blocked`, `agent:unblocked`, `mirror:reset`.
- **`src/game/state.ts`** — add `Project.source?: 'scripted' | 'live'` and
  `AgentRecord.worker?: string`; `AgentRecord.status` already fits.
- **`src/game/system.ts`** —
  - make the needed methods public/additive: `createProjectFromPlan`,
    `mirrorAssign`, `mirrorSetState`, `pushReport`, `mirrorComplete`,
    `mirrorTeamMate`;
  - `snapshot()` filters `source !== 'live'` (no ghost replays);
  - `spawnAlert(moduleId, tone: 'red' | 'amber')`;
  - set the REPORTS board (`screen:mission:e`) and wrap report rows;
  - no ship/room/robot calls change.
- **`src/game/hud.ts`** — console scrollback of the last N reports; a
  non-actionable BLOCKED line; a DISPATCH confirm that calls the bridge only in
  live mode.
- **`src/main.ts`** — build the bridge client; probe health; pick the
  orchestrator (one line per W-20); in live mode `openConsole` dispatches through
  the mirror instead of `sim.createProject`.
- **`bridge/map.test.mjs`** — `node --test` fixtures over the lifecycle tables
  (no new dependency).

### 5.5 Ordered steps

1. **Contract + fixtures.** Write `bridge/map.mjs` + `bridge/map.test.mjs`
   against static fixtures for the two ledger tasks named in the brief and a
   five-agent snapshot. Verify: `node --test bridge` passes; the frame validates
   against §3.4.
2. **Read the runtime.** Implement `bridge/herdr.mjs`, `bridge/ledger.mjs`,
   `bridge/server.mjs` (poll → digest → SSE), and `GET /health`, `/snapshot`.
   Verify: `curl 127.0.0.1:5273/api/team-mate/snapshot` returns a frame; a
   second client sees identical frames; unchanged frames produce no SSE event.
3. **Mount and consume.** `vite.config.ts` + `bridgeClient.ts` + a read-only
   `RuntimeMirror` that only logs (does not mutate). Verify: browser console
   clean with the bridge up and absent; `bridge:linked`/`bridge:lost` fire.
4. **Read-only mirror into the world.** Map tasks → Projects, workers → robots,
   statuses → `AgentState`/beacons; Teams Mate ← primary. Verify: against the
   live session, every live worker is a robot in the correct room with the
   correct posture; the module board matches the ledger.
5. **Report surface (W-21).** `pushReport` + REPORTS board + console scrollback.
   Verify: the M1/entity-art reports are readable from inside the world.
6. **Orchestrator seam (W-20).** `orchestrator.ts`; swap `main.ts` to the live
   orchestrator. Verify: one-line swap keeps the whole world working; scripted
   mode is byte-for-byte today's behaviour.
7. **Dispatch.** `bridge/dispatch.mjs` + auth/token/origin checks + the two-step
   console. Verify: a task created in-world appears in `tm task list`; a spawned
   worker becomes a robot within 1 poll; arbitrary args are rejected.
8. **Blocked surfacing.** Amber beacon + non-actionable console row. Verify:
   `blocked` never auto-answers; the state returns to `working` only after a
   human answers in Herdr.
9. **Fallback + persistence hardening.** Exclude live projects from `snapshot()`;
   session-change reset; backoff then permanent scripted fallback. Verify: a
   reload with the bridge down is identical to today; a reload with it up has no
   ghosts.
10. **Guard + docs.** `git diff --stat` shows none of §5.1; update this file's
    status and the README "Connecting real AI" section.

---

## 6. Acceptance criterion 6 — definition of done + demo

### Definition of done

1. `npm run typecheck` passes.
2. `npm run build` passes.
3. Console is clean with the bridge up **and** absent (no errors, no three.js
   deprecation warnings; expected fallback is not logged as an error).
4. With no bridge, the app behaves exactly as today (scripted loop unchanged).
5. With the bridge, every live worker is a robot whose posture/light matches
   §3.6; blocked raises the amber beacon; approved raises a plaque; reports are
   readable in-world and in the console scrollback.
6. §5.1 frozen files show zero diff.
7. No new runtime dependency; the fallback path is dependency-free.
8. Dispatch is localhost-only, token-gated, fixed-surface, and never answers a
   blocked dialog.

### Manual demo script — "see Team Mate work and see workers in the rooms"

1. With the primary session running, start `npm run dev` and open
   `http://localhost:5273`. The console shows the bridge health once; no error
   if it is absent.
2. Board the ship. Fly to **Team Mate HQ**: the `team-mate` robot stands on the
   dais while the primary is `working`; the fleet screen shows the real worker
   count from `session.json`.
3. Fly south to **Mission Control**: the REPORTS board shows the newest reports
   — this session's M1 and entity-art reports — wrapped and readable.
4. Fly to the **project deck**: the module whose task is live is powered; its
   sign shows the task/project and its board shows the acceptance rows with the
   active one highlighted.
5. Follow the worker's robot: it is parked at the workstation in the room its
   role maps to, `working`, lens bright.
6. Trigger (or simply watch) a `rework`: the red beacon turns over that module
   door and a `Fix:` row appears on its board.
7. When the task reaches `ready_for_approval`, Team Mate walks to the dais and
   the HQ board highlights the task. Approve it (in Herdr or via the console
   confirm): the module powers down, a plaque with the task title appears in the
   **Mission Archive**, and the robot's lens dims.
8. If a worker goes `blocked`, the amber beacon lights over its module and a
   report names it; the console says it needs a human — it does not answer.
9. Press `E`: read the full report scrollback. No typed instruction was needed.
10. Kill Herdr/bridge: the world keeps running, reports "LINK LOST", and a
    reload falls back to the scripted simulation.

---

## 7. Acceptance criterion 8 — risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Herdr/ledger schema drift | One schema check at boot (`herdr api schema`); `map.mjs` fixtures pin every consumed field; unknown fields ignored, missing ones degrade to `unknown`/omitted. |
| `herdr`/`tm` slow or hung | `execFile` timeout (2.5 s), kill on timeout, single-flight poll (skip a tick rather than stack processes). |
| Security: bridge shells out with developer rights | `127.0.0.1` only; origin + token; fixed six-endpoint surface; no arbitrary args/keystrokes; dev-only (never in `dist/`). |
| Blocked dialog auto-answered | No endpoint can answer; `blocked` is surface-only by construction; §4.5. |
| Reproducibility: identity churn | Stable `taskId → moduleId` and `worker → agentId` maps; digest dedupe; explicit reset on `session.id` change. |
| Persistence ghosts | Live projects excluded from `snapshot()`/`save()`; `restore()` ignores `source:'live'`. |
| Performance | 1 Hz poll, ≤4 terminal reads/tick with cooldown, 11-module cap + overflow list, digest suppresses unchanged frames, screens already throttled to 0.5 s; all mirror work happens on the poll tick, never per frame. |
| Console noise | Expected fallback handled without `console.error`; SSE reconnect with backoff; boot probe treats 404 as "offline". |
| Concurrency with the other worker editing `src/world/src` | Re-read `system.ts`/`state.ts` before implementing; treat method names here as indicative; §5.1 guard catches accidental overlap. |
| Text vs "reads without text" convention | State still reads via posture/light/beacon; only reports (W-21) add text, and only on the designated board/console. |

---

## 8. Decisions (developer)

1. **Spawn policy — auto-dispatch.** `POST /task` creates the task *and* spawns
   the worker in one call; typing in the console is the dispatch. See §4.4.
2. **Overflow beyond 11 live tasks — queue.** Surplus tasks wait on Mission
   Control (§3.1 overflow list) and claim a module when one frees; modules are
   not released early.
3. **Report depth — last message.** Only the worker's final settled message is
   shown in-world; the console scrollback keeps the recent N (§3.9).
4. **`unknown` status — show the desaturated `?` robot.** As specified in §3.6;
   never invent work for an unclassified agent.
