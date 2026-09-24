# Open questions: resolutions and experiments

`docs/NEXT.md` lists six open research questions. This document answers each as
far as the current evidence allows: a decision where the answer is ours to make,
and a bounded experiment (with a gate) where it needs a live run first. Nothing
here builds a framework; two questions needed a small mechanism, which is noted
in place.

| # | Question | Resolution | Status |
| --- | --- | --- | --- |
| 1 | Project identity beyond name→root | Durable registry | mechanism built |
| 2 | Minimum useful skill set | Measure, do not cut yet | needs runs |
| 3 | State persistence and restart | Ledger is the source of truth | decided |
| 4 | Agent dependencies | Sequence in the plan, not a scheduler | decided |
| 5 | Cost / latency / agent count | Smallest team; compare with the roll-up | needs runs |
| 6 | Harness subagent integration | Verify per harness, fail loudly | needs live harnesses |

## 1. How should Team Mate identify projects beyond a name→root mapping?

**Current.** `multi-project-context` resolves a project name to a root, and a
task stores both `project` and `root`. Identity is implicit: a name is only ever
as good as the mapping supplied in the moment, and nothing records it. Nothing
detects a name reused for a different root.

**Decision.** Give projects a durable registry: `<state_dir>/projects.json`,
mapping a project name to its absolute root. The name is the stable handle; the
root is the authority. Registering an existing name against a *different* root
is refused unless forced, so a rename cannot silently redirect work. This keeps
the file-store shape the rest of the ledger already uses and adds no service.

**Mechanism.** `tm project add --name <name> --root <path> [--force]` and
`tm project list`. `multi-project-context` registers a project the first time it
resolves one.

**Experiment / gate.** Bootstrap two projects and register both. *Gate:* after a
primary restart, both resolve by name from `projects.json` with no re-typing of
roots; a conflicting rebind is refused.

**Residual.** Aliases, moved checkouts, and git worktrees are not solved by a
flat name→root map. Revisit only if a run hits one.

## 2. What is the minimum useful skill set?

**Current.** 34 skills; the primary sees teammate + common, and `worker_skills`
decides what a project receives. There is no usage data, so any "minimum" today
is a guess.

**Recommendation.** Do not cut the set on a hunch — measure it. The candidate
minimum is the eight a worker actually needs to complete an assignment alone:

`load-project-context`, `verify-evidence`, `handoff-report`, `commit-changes`,
`worker-role`, `accept-assignment`, `implement-task`, `report-result`.

Everything else is a coordinator concern or a specialization.

**Experiment / gate.** Run one non-trivial delegated task with a worker given
**only** those eight skills. *Gate:* the task completes without an absent skill
being needed — or the first "needed but not installed" skill names the true gap.
Repeat over a few task types; the union of gaps is the real floor. The runnable
protocol and record table are in
[Minimum skill set experiment](15-minimum-skill-set-experiment.md).

**Residual.** The floor depends on task mix; it is only meaningful after several
different runs, not one.

## 3. How much state should persist, and what should happen on restart?

**Current.** `<state_dir>/` holds the shared `projects.json` plus one directory
per project, each with `tasks/` (the ledger), `archive/`, `briefs/`, `reports/`,
`timeline.jsonl`, and `session.json`. The ledger explicitly survives the primary
ending (`task_store.py`). Worker subagents are the ephemeral part.

**Decision.** The ledger is the source of truth; worker subagents are
disposable. On a restart the primary reads the open session (`tm session
status`), the live tasks (`tm task list`), and the linked workers (`tm task
find --worker`), then classifies orphan / stuck / blocked — using the harness's
subagent state where it exposes one — and reconciles with `recover-run`. Briefs
and reports are durable evidence; `timeline.jsonl` is history. No daemon, and
nothing else needs to persist.

**Experiment / gate.** Kill a primary mid-run, restart, and reconcile the
running task from files alone. *Gate:* no lost work and no duplicated prompt —
the process review did this once; repeat and record.

**Residual.** Retention and archiving policy for `timeline.jsonl`, briefs, and
reports (currently `tm task prune` archives closed tasks only).

## 4. How should dependencies between agents be coordinated?

**Current.** `parallel-coordination` runs independent streams and checks three
things before overlapping: file write-set, shared state, and runtime resources
(port, browser session). There is no dependency graph, and results are assembled
in the primary.

**Decision.** Keep dependencies in the **plan**, not in a runtime. The primary
sequences dependent work — task B starts only after A's result is reviewed — and
a worker never waits on another worker's output. When a group must be supervised
while the primary stays free, a single Foreman coordinates that group. Do not
build a scheduler: every observed need so far is ordering, not a graph.

**Experiment / gate.** Run a three-task plan with one real dependency (A → B).
*Gate:* B does not start before A's result is accepted, and no worker is found
blocked on another worker.

**Residual.** Shared artifacts and fan-in may eventually justify a recorded
`depends_on`; add it only when a run needs it.

## 5. How should cost, latency, and agent count influence delegation?

**Current.** The ledger now records each task's elapsed time and, when the
harness reports them, tokens and cost. `max_concurrent` bounds the team but is
advisory.

**Recommendation.** Decide with a rule, not a model: use the smallest team that
removes a real serial bottleneck; add a worker only for genuine parallelism or a
separate role (a reviewer); treat a separate review as worth its cost for risky
or hard-to-self-check changes. Let the numbers accumulate before tuning.

**Mechanism.** `tm session summary` rolls up a session's tasks, distinct
workers, elapsed span, and recorded cost/tokens — the measurement this question
needs. Cost and tokens appear only when recorded; they are never fabricated.

**Experiment / gate.** After several runs, compare a serial plan and a parallel
plan for the same work. *Gate:* `tm session summary` shows tasks, workers,
elapsed, and (when available) cost for both, and one is measurably cheaper or
faster in a way that justifies the extra agent.

**Residual.** Cost/tokens arrive only if the harness reports them (question 6).
Until then, elapsed and agent count are the usable signals.

## 6. Which harness needs an extension for native subagents?

**Current.** The primary runs in one harness and workers are that harness's
native subagents. Two of the five harnesses need help to expose a subagent tool:
**Pi** has no native subagent tool, so a Pi extension/package must provide one;
**omp** (a Pi fork) provides a `task` tool with background subagents, but its
version-sensitive surface is not verified here. **Codex** exposes `spawn_agent`
plus `wait_agent` / `send_input` / `close_agent`, but those names are
source-derived and version-sensitive. OpenCode's `subagent` tool (V2; `task` in
V1) and Claude's `Agent` tool are the most settled. The adapter matrix records
each case and its uncertainty: [Harness adapters](16-harness-adapters.md).

**Recommendation.** Verify the subagent tool and its lifecycle surface for the
harness actually in use before a run, and fail loudly when it is absent rather
than run on unreliable lifecycle. `install.sh` and `bootstrap-project` should
confirm the resolved harness's adapter files exist and warn when the harness
needs an extension that is not installed. Lifecycle state
(`idle`/`working`/`done`/`blocked`) is now the harness's to report; where a
harness cannot, the primary treats the worker's report file and the ledger as
the evidence, and `unknown` is never success.

**Experiment / gate.** For each harness, spawn one worker and confirm that a
subagent is created, observed, and closed through the harness's own tool.
*Gate:* a per-harness table of "subagent tool present? background supported?
lifecycle observable?" that decides which harnesses are ready and which need an
extension.

**Residual.** The exact tool names and flags are version-sensitive; confirm them
against the installed harness rather than this repository. Pi's extension
mechanism and omp's background semantics need a live check.
