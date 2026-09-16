# Audit and improvement plan: the gap between promise and enforcement

An audit of the whole Team Mate overlay — design docs, `team-mate.toml`, the 30
skills, and the `tm` code — against what it claims to do. The design docs are
coherent and honest about open questions; the code layer (`src/scripts/tm.py`,
`src/scripts/task_store.py`) is small and clean. The gap is between what the
docs and config promise and what the thin layer enforces.

Most parallel-run items (E1–E6) are correctly documented as unbuilt in
[NEXT.md](../NEXT.md); a smaller set are silently broken or overclaimed as done.

Evidence: `path:line` citations throughout; `python3 -m unittest discover -s
src/scripts/tests -t src/scripts` passes (84 tests).

## Verdict

The operating model as written is sound. The docs do not contradict each other
in their design; they contradict the code where the code is thin. Three
findings are load-bearing defects — a real bug in `tm spawn`, config documented
as effective but not enforced, and an install that depends on skills it does not
ship. The rest is drift, overclaim, and the parallel-run gaps already named in
the [parallel run review](12-parallel-run-review.md).

## Implementation status

The P0 correctness pass below has since landed, with the test suite at 84 tests:

- **P0-1** — done. `cmd_spawn` no longer rebinds the worker name on a skipped
  skill; a regression test covers it.
- **P0-2** — done. `tm task new` reads `max_iterations` from config;
  `max_concurrent`, `review_policy`, `notify`, and `primary_workspace` are marked
  advisory, the single-file precedence is stated, and `skills_source` is
  documented (`src/team-mate.toml`).
- **P0-3** — done. `herdr` and `find-skills` ship in `src/skills/`.
- **P0-4** (E1) — done. `tm report --save` prefers the worker's clean
  `.teammate-report.md` and falls back to the pane only when it is absent.
- **P0-5** (E3) — done. A worker stops any server it starts (or records its
  PID/port) and `monitor-agents` confirms no listener before approval.

Beyond P0, these also landed: the review-task `kind` (P1-1 / E4), a quiet
`task show` (P1-3 / E5), an interim status on long runs (P1-4 / E6), the
skill-text and doc-drift corrections (P1-6, P1-7), CI running the suite plus a
skill-frontmatter validator (P2-1), and two ledger fixes — `task find --worker`
acts on the live task and saved report names are collision-free (P2-4, partial).
A teammate skill, `visual-report`, was added to render the developer report as
self-contained HTML (31 skills now).

Still open: E2 (P1-2), the `inconclusive` verdict (P1-5), and P2-2, P2-3, P2-6.
E2 was a P0 item in the [parallel run review](12-parallel-run-review.md) and is
P1-2 here: it needs a `bootstrap-project` / `AGENTS.md` change (per-stream ports
and browser sessions), not just a `tm` knob.

## What is solid

- **The skill library is internally consistent.** 31 skills (7 common / 16
  teammate / 8 worker), valid frontmatter, names matching directories; every
  `tm` command and flag referenced in a skill resolves against `build_parser()`.
- **The ledger model matches its design.** Findings as data, derived verdict,
  session tagging, and prune all line up with
  [07-review-and-approval.md](07-review-and-approval.md).
- **Review, rework, and escalation discipline is consistent** across the docs
  and the skills.

## What was missing or broke

### 1. Real bug — `tm spawn` renames the worker

`src/scripts/tm.py:291` `for name in skipped:` rebinds the worker name chosen at
`:280`; `:311`, `:336`, `:361`, `:367`, `:370` then use the last skipped *skill*
name. It fires when a project already owns a name in `worker_skills`
(`tm.py:258-260`, `src/README.md:122-124`). Reproduced: with
`skipped=['commit-changes']` the worker name became `commit-changes`. This
corrupts the agent name, the tab label, the printed output, and the ledger
`worker` link (`task find --worker`, recovery). No test covers `cmd_spawn`.

### 2. Config documented as effective but not enforced

`max_iterations` (`src/team-mate.toml:24`, `run-rework:34,38`) is ignored —
`tm task new` hard-codes the default 3 (`tm.py:818`, `task_store.py:150`). The
precedence "task > project > primary" (`src/team-mate.toml:3`,
`src/AGENTS.md:40-41`) is not implemented — one file is loaded. `max_concurrent`,
`review_policy`, `notify`, and `primary_workspace` are never read by code (agent
prose only). `skills_source` *is* read by code (`tm.py:182`) but undocumented.

### 3. Install gap — the overlay depends on skills it does not ship

`src/AGENTS.md:15,47` says load the `herdr` skill;
`src/skills/bootstrap-project/SKILL.md:51` and `src/skills/team-mate/SKILL.md:50`
rely on `find-skills`. Neither is in `src/skills/`, and `install.sh:148` copies
only `src/skills/`. A fresh install has a broken read-path on its own
instructions.

### 4. Verdict model mismatch

[07-review-and-approval.md:89-95](07-review-and-approval.md) defines
`pass`/`fail`/`inconclusive`; code implements only `pass`/`fail`
(`task_store.py:317-319`), and there is no status or field for `inconclusive`.
`docs/NEXT.md:7-10` overclaims that review "matches their design".

### 5. Parallel-run P0 (E1–E3), confirmed open

- E1 — `tm report --save` stores the rendered pane (`tm.py:424-443`), TUI chrome
  and all; `report-result:47` tells the worker to emit the report as its last
  message, and `handoff-report` never says to write a file.
- E2 — zero mentions of port or browser in any skill;
  `parallel-coordination:41-49` lists shared state but omits ports and browser
  sessions (the collision in
  [12-parallel-run-review.md:73-80](12-parallel-run-review.md)).
- E3 — no teardown rule in `worker-role`, `verify-change`, `monitor-agents`.

### 6. Parallel-run P1 (E4–E6), confirmed open

- E4 — no task kind or role in `create()` (`task_store.py:142-171`); every task
  can reach `ready_for_approval` (`tm.py:624-626,641-642`).
- E5 — `_render_task` reprints the entire report (`tm.py:547-548`).
- E6 — no interim-progress rule.

### 7. Skill-text defects

Non-existent invocation `delegate-task --wait`
(`parallel-coordination/SKILL.md:25`, `examples.md:50`). Foreground `--wait`
contradictions (`run-rework/SKILL.md:62`, `monitor-agents/SKILL.md:70` vs
`monitor-agents:54`, `delegate-task:72-78`, `parallel-coordination:88-91`,
`src/AGENTS.md:76-77`). Decision bypass `task update --status approved`
(`team-mate/examples.md:38`). `task-ledger` self-contradiction on unledgered
reviewers (`:118-121`) and wrong `task find --worker` semantics (`:94-95` vs
`task_store.py:231-235`). Missing contract sections in `review-work`,
`report-progress`, `worker-role`; `multi-project-context` has no Output section.
Duplicate triggers ("have two agents look at it" in `team-mate`, `plan-work`,
`parallel-coordination`; `review-change`/`review-task`;
`review-work`/`independent-review`).

### 8. Doc drift and overclaims

`src/README.md:168-169` and `docs/NEXT.md:45` say only open questions remain,
contradicted by `NEXT.md:47-63`. `NEXT.md` B4 claims `bootstrap-project`
references `src/README.md` (it does not); A1 claims `tm report --save` is used by
`delegate-task`/`run-rework`/`independent-review` (only `task-ledger` mentions
it). `10-skills-plan.md:3` ("proposal… does not build them") and `:112-116`
("distribution unresolved") contradict `:89-190` (built; "chosen B/C";
implemented in `tm.py:240-298`).

### 9. Hygiene

No CI (`.github/` has assets only; the 84 tests never run automatically).
Repo-root `.agents/skills/` is 129 tracked files / 24 skills (personal and
external: `adhd`, `ponytail`, `arena`, `notion-cli`, `skill-creator`, `herdr`,
`find-skills`) mixed into the product repo. `templates/worker-report.md` is still
"planned" (`10-skills-plan.md:629`) yet cited in its own sequencing gate.
`report --save` filenames use whole seconds (`tm.py:440`), so same-second saves
collide; `brief` has no timestamp while `report` does. There are no tests for
`cmd_spawn`, most status transitions, or `verdict`.

## Improvement plan

Ordered; each names the owning surface and the gate that proves it.

### P0 — fix what is broken or falsely claimed

| # | Change | Owner | Gate |
| --- | --- | --- | --- |
| P0-1 | Fix `cmd_spawn` name clobber (`tm.py:291`) — use a non-shadowing loop variable | `tm.py`, tests | Regression test: a skipped skill leaves the worker name intact; `task find --worker` resolves |
| P0-2 | Make config real: `task new` reads `max_iterations`; correct the precedence claim (or implement it); mark `max_concurrent`/`review_policy`/`notify`/`primary_workspace` advisory or enforce; document `skills_source` | `tm.py`, `task_store.py`, docs | Changing `max_iterations` changes a new task's limit |
| P0-3 | Ship the skills the overlay depends on (`herdr`, `find-skills`) or make the dependency explicit/optional | `install.sh`, `src/AGENTS.md` | Fresh install: every skill named in `AGENTS.md` resolves |
| P0-4 | E1 — worker writes its report to a file; `tm report` reads it instead of the pane | `tm.py`, `report-result`, `handoff-report` | Saved report is clean markdown: no `┃`, no wrap duplication |
| P0-5 | E3 — worker stops any server it starts (record PID/port); `monitor-agents` confirms no listener before approval | `worker-role`, `verify-change`, `monitor-agents` | No leftover listener after a run |

### P1 — close the documented parallel-run gaps

| # | Change | Owner | Gate |
| --- | --- | --- | --- |
| P1-1 | E4 — add a task kind/role; refuse `ready_for_approval` for reviewer tasks | `task_store.py`, `tm.py`, skills | Only build tasks await the developer |
| P1-2 | E2 — per-stream port + browser session; add them to the shared-state list | `parallel-coordination`, `bootstrap-project`, template | Two UI workers render concurrently, no hijack/clash |
| P1-3 | E5 — `task show` prints a short summary + report path | `tm.py` | `task show` stays a handful of lines |
| P1-4 | E6 — interim status when a worker exceeds a threshold | `monitor-agents`, `report-progress` | A long run emits one developer-visible update |
| P1-5 | Represent `inconclusive` (status/finding field) or amend [07](07-review-and-approval.md) and the ten skills | `task_store.py`, `tm.py`, docs | An inconclusive review is recordable |
| P1-6 | Skill-text correctness pass (finding 7 above) | the affected skills | `--wait` guidance is consistent; no skill claims another's trigger |
| P1-7 | Doc drift pass (finding 8 above) | docs | No doc claims an unbuilt capability is done |

### P2 — durability and hygiene

| # | Change | Owner | Gate |
| --- | --- | --- | --- |
| P2-1 | Add CI running the 84 tests + a skill frontmatter validator | `.github/workflows` | CI fails on a bad `SKILL.md` or broken test |
| P2-2 | Resolve root `.agents/skills/` (remove personal skills, or document "this repo is also its own primary") | repo root, `install.sh` | The repo contains only product skills |
| P2-3 | Decide `templates/worker-report.md` (build or drop) | `src/templates`, plan | Plan and tree agree |
| P2-4 | Ledger robustness: collision-free report names, consistent brief/report naming, optional lock | `tm.py`, `task_store.py` | Two saves in one second do not overwrite |
| P2-5 | Tests for `cmd_spawn`, status transitions, `verdict` | `src/scripts/tests` | New paths covered |
| P2-6 | E7 — record tokens/cost and wall-clock per task | `task_store.py`, [06-reporting](06-reporting-and-observability.md) | A completed task shows elapsed time and cost |

### Sequencing and non-goals

P0-1 → P0-2 → P0-3 is a short correctness pass: fix the spawn bug, then make
the config honest, then close the install gap. P0-4, P0-5, and P1-2 share a
"worker runtime hygiene" theme — the report a worker leaves behind and the
processes and ports it leaves running. P1-6 and P1-7 are pure docs and can land
at any time.

Explicit non-goal: no daemon, plugin, or runtime. Prefer documenting advisory
knobs over building a policy engine.

## Signals to keep

- The design docs are the source of truth for intent; every claim they make
  should have an enforcing surface or be labeled advisory.
- Findings as data, verdict derived, decision recorded — do not let the code
  model less than the design.
- A fresh install must resolve every skill its own instructions name.
- The parallel-run gates (E1–E6) are the acceptance bar for the next run.
