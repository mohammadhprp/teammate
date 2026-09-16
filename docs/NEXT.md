# Next steps

Current state: The skill library is complete — 31 skills in `src/skills/` across
common (7), teammate (16), and worker (8) — with `scripts/tm.py`,
`scripts/task_store.py`, the templates, and an 84-test suite. The operating model
is validated end to end on live Herdr sessions with opencode and `omp`, and
review and approval match
[their design](implementation/07-review-and-approval.md): findings and the
developer's decision are persisted in the ledger, verdicts are derived from the
findings, and review/decision events reach `timeline.jsonl`.

An audit of the docs, config, skills, and `tm` code is written up in the
[audit and improvement plan](implementation/13-audit-and-improvement-plan.md).
The plan's P0-1…P0-5 are implemented: the `tm spawn` name clobber is fixed,
config states what it enforces, `herdr` and `find-skills` ship with the overlay,
`tm report --save` prefers the worker's clean `.teammate-report.md`, and workers
stop the servers they start. What remains is the parallel-run work below and the
open questions; the plan absorbs the items below and re-prioritizes the rest.

The hardening plan from the
[process review](implementation/11-process-review.md) is implemented:

- **A1** Briefs and reports have canonical locations — `state_dir/briefs` and
  `state_dir/reports`, written with `tm brief` and `tm report --save`.
  `delegate-task`, `run-rework`, and `independent-review` write briefs there;
  `task-ledger` records reports there.
- **A2** `install.sh` provisions the primary's OpenCode permissions for the
  state dir; `tm permissions allow --cwd <root>` allows a project, and
  `bootstrap-project` runs it before writing into a project.
- **A3** `worker-role`, `accept-assignment`, `delegate-task`, and
  `templates/worker-brief.md` forbid out-of-project paths and require every fact
  to be inline.
- **B1** The ledger is session-scoped (`tm session start`, `tm session end`) and
  prunable (`tm task prune` moves closed tasks to `state_dir/archive/`);
  `recover-run` reconciles only the open session.
- **B2** Evidence honesty is enforced: `verify-evidence`, `verify-change`,
  `report-result`, `review-change`, and `review-task` treat an unrun command
  transcript as a fabricated-evidence `blocker` and require re-running the
  decisive check.
- **B3** `bootstrap-project` and `templates/project-AGENTS.md` require an
  offline validator — HTML and accessibility for a UI — so a UI review runs at
  least one by default.
- **B4** `src/README.md` documents the two skill populations and the collision
  rule.
- **C1** `monitor-agents` documents waiting without blocking the primary.
- **C2** Tasks carry their session; `task list` shows the open session and
  `--all` shows history.
- **D1** (found on a live run) Non-blocking delivery is now the default: `send`
  omits `--wait`, and a real wait runs in a background shell — OpenCode's shell
  `background` flag, with ctrl+b in the TUI as the human fallback. Updated
  `src/AGENTS.md`, `delegate-task`, `monitor-agents`, and
  `parallel-coordination`.

The P0-1…P0-5 hardening from the audit plan is implemented; what remains is the
parallel-run review below and the open questions.

## Next: act on the parallel run review

A second live run — two landing pages, different styles, built and reviewed
concurrently — is written up in the
[parallel run review](implementation/12-parallel-run-review.md). E1 and E3
landed as audit P0-4 and P0-5; E2 moved to P1-2. The rest remain, each with a
gate that proves it:

- **E1** (done — audit P0-4) `tm report --save` stores a clean final message,
  not a rendered pane with TUI chrome and duplicated lines.
- **E2** (open — audit P1-2) Parallel UI streams get their own port and browser
  session, so two workers cannot hijack each other's tab.
- **E3** (done — audit P0-5) A worker that starts a server stops it before
  reporting; no stray listener survives a run.
- **E4** (open) Keep review tasks out of the approval queue.
- **E5** (open) Make `task show` quiet.
- **E6** (open) Require an interim status on long builds.

See the review for owners and gates.

## Open questions

- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once more runs test the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- Should a worker kind's Herdr integration be installed by default for reliable
  lifecycle states?
