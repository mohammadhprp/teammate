# Parallel run review: two landing pages at once

A developer installed a primary, provisioned `/Users/black/Developer`, and gave
Team Mate two projects **at the same time**, each a landing page:

- `teammate-landing` — the Team Mate product page, **neo-brutalist editorial**.
- `foreman-landing` — the Foreman feature page, **dark premium AI-infra SaaS**.

The styles were deliberately opposite, and both were to be taken end to end with
independent review. The developer then only observed, and injected the second
task while the first was running.

> **Historical note.** This run used the then-current Herdr runtime and the
> `tm spawn` / `tm send` / `tm wait` surface; "workspaces" and "tabs" below are
> Herdr's. Team Mate now runs workers as the host harness's native subagents and
> `tm` is ledger-only. The process lessons still stand.

Evidence: the primary's ledger at `~/.teammate/` (`tasks/`, `timeline.jsonl`,
`briefs/`, `reports/`, `session.json`), the two projects under
`/Users/black/Developer/`, and the live Herdr agents at the time.

## Outcome

One session (`sess_925d7d89`), four workers, two projects, ~60 minutes wall
clock. Both pages built, independently reviewed, verdict `pass`, and left
uncommitted for the developer:

| Task | Project | Worker | Build | Review | Verdict | Findings |
| --- | --- | --- | --- | --- | --- | --- |
| `tsk_349c0a10` | teammate-landing | designer-alpha | ~50m | reviewer-beta | pass | 3 nit (accepted) |
| `tsk_576c5f36` | foreman-landing | designer-beta | ~19m | reviewer-gamma | pass | 1 minor (accepted) |

The two pages share nothing visually: one is off-white paper, heavy black display
type, thick rules and a mono grid; the other is near-black with gradient glows,
glassy translucent cards and a rounded sans. That was the point, and the
independent reviewers confirmed each direction against fresh screenshots rather
than the builder's summary.

## What worked

- **Two projects in parallel, one coordinate.** A session marker (`session.started`)
  tagged both tasks; nothing stale was inherited and recovery was not needed.
  `designer-alpha` and `designer-beta` ran concurrently in their own project
  workspaces and never saw each other's trees.
- **A1 — canonical briefs.** Four briefs landed in `~/.teammate/briefs/`
  (`tsk_<id>-<worker>.md`), not in a temp dir; the ledger and files agree.
- **A3 — self-contained briefs.** Every brief opens with "Everything you need is
  inline… Do not read anything outside this project root", carries the product
  copy and design constraints verbatim, and names no path the worker cannot
  read. No worker blocked on the sandbox.
- **A2 — no permission dialogs.** The state dir and `/Users/black/Developer/*`
  were allowed up front; the primary read and wrote ledger and projects without
  a single approval prompt.
- **B3/B4 — prepared projects.** Bootstrap installed `frontend-design`
  (`skills-lock.json`, Skills CLI) into each project and wrote an `AGENTS.md`
  with a **Checks** section — offline `html-validate` plus `agent-browser` a11y
  and viewport screenshots — so the reviewers had real validators. The two skill
  populations (Team Mate-managed and Skills-CLI) coexisted with no collision.
- **Independent review earned its cost again.** The reviewers collected their
  own evidence, measured contrast (including manually for gradient surfaces axe
  could not resolve), and caught real defects: a chain legend overflowing the
  card at 375px, and several self-caught builder regressions in the brutalist
  page.
- **D1 was found and fixed live.** The primary first parked itself on a
  foreground `tm send --wait`; after the role and skills were updated, OpenCode
  hot-reloaded the instructions mid-run and the primary switched to backgrounded
  waits on its own.

## What was missing or broke

### 1. Saved reports are raw terminal captures

`tm report --save` writes the pane's rendered output. The files under
`~/.teammate/reports/` contain TUI chrome (`┃`, token/cost sidebars), soft-wrap
duplication, and the same line repeated. The underlying report was good; the
stored artifact is not clean markdown, and `task show` then reprints all of it.

### 2. Parallel workers shared the browser and a port

Both UI workers used `agent-browser` and a `python3 -m http.server`. They
collided: `designer-alpha` logged "A concurrent agent-browser session on :8081
hijacked the shared browser tab mid-run" and worked around it with
`agent-browser --session teammate`. `parallel-coordination` checks file
write-set independence but not shared *runtime* resources — browser session and
port.

### 3. Spawned processes outlived the run

After completion, `python3 -m http.server` was still listening on **:8080 and
:8081**. No worker stopped its server and the primary never checked, so the run
left two stray listeners.

### 4. Review tasks entered the approval queue

The build tasks are correctly `ready_for_approval`, but so are the *review*
tasks (`tsk_0f32eda2`, `tsk_d66f0909`). A review is not something the developer
approves; it is evidence for the build decision. The approval surface is
doubled and `review.verdict` is recorded twice for the same change.

### 5. A long build had no progress visibility

The first build ran ~50 minutes with no intermediate report. The primary had
backgrounded its wait and the developer saw nothing until review started — the
"observable autonomy" principle with a long blind spot.

## Signals to keep

- Bootstrap before delegate: the installed design skill and the checks in
  `AGENTS.md` are what made the render reviewable.
- Self-contained briefs; a worker never learns a path outside its project.
- Two skill populations documented and non-colliding.
- Independent review that renders, measures, and re-runs checks.
- One session, tagged tasks, no stale ledger.

## Improvement plan

Ordered; each names the owning surface and the gate that proves it.

### P0

- **E1 — Capture the report the worker meant.** `tm report --save` must store a
  clean final message, not the rendered pane: either have the worker write its
  report to a file under the project and `tm report` read that, or strip the
  chrome and collapsed-wrap duplication from the capture. *Owner:* `tm.py`,
  `report-result`, `handoff-report`. *Gate:* a saved report is clean markdown —
  no `┃`, no duplicated lines, no token/cost sidebar.
- **E2 — Isolate runtime resources per stream.** A UI stream must get its own
  port and its own browser session. Assign a unique port per project/stream and
  require a per-worker `agent-browser` session. *Owner:* `parallel-coordination`,
  `bootstrap-project`, `templates/project-AGENTS.md`. *Gate:* two UI workers
  render concurrently with no hijacked tab and no port clash.
- **E3 — Stop what you start.** A worker that launches a server must stop it
  before reporting (or record its PID/port for the primary), and the primary
  must confirm no stray listener remains before approval. *Owner:*
  `verify-change`/`worker-role`, `monitor-agents`. *Gate:* no leftover listener
  after a run.

### P1

- **E4 — Keep reviews out of the approval queue.** A review task ends at the
  recorded findings and verdict against the build task; it never becomes
  `ready_for_approval`. Refuse the transition for reviewer tasks, or record the
  verdict on the build task only. *Owner:* `task-ledger`, `review-work`,
  `tm.py`. *Gate:* only build tasks await the developer.
- **E5 — Make `task show` quiet.** Keep the report in `reports/`; render a short
  summary plus the report file path instead of reprinting the whole capture.
  *Owner:* `tm.py`. *Gate:* `task show` stays a handful of lines.
- **E6 — Progress on long builds.** Require the primary to emit one interim
  status when a worker runs past a threshold (for example a `status` snapshot
  and the elapsed time), so a 50-minute build is not silent. *Owner:*
  `monitor-agents`, `report-progress`. *Gate:* a long run produces an interim
  developer-visible update.

### P2

- **E7 — Cost and parallelism signal.** The ledger could record tokens/cost and
  wall-clock per task, feeding the open question on how cost, latency, and agent
  count should influence delegation. *Owner:* `task_store.py`, `06-reporting`.
  *Gate:* a completed task shows elapsed time and cost.
