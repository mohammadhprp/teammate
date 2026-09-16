# Next steps

Current state: The skill library is complete — 30 skills in `src/skills/` across
common (7), teammate (15), and worker (8) — with `scripts/tm.py`,
`scripts/task_store.py`, the templates, and a 52-test suite. The operating model
is validated end to end on live Herdr sessions with opencode and `omp`, and
review and approval match
[their design](implementation/07-review-and-approval.md): findings and the
developer's decision are persisted in the ledger, verdicts are derived from the
findings, and review/decision events reach `timeline.jsonl`.

An audit of the docs, config, skills, and `tm` code is written up in the
[audit and improvement plan](implementation/13-audit-and-improvement-plan.md).
That plan is the current next work: a short P0 correctness pass (a `tm spawn`
bug, config that is documented but not enforced, an install gap), then the
documented parallel-run gaps. It absorbs the items below and re-prioritizes the
rest.

The hardening plan from the
[process review](implementation/11-process-review.md) is implemented:

- **A1** Briefs and reports have canonical locations — `state_dir/briefs` and
  `state_dir/reports`, written with `tm brief` and `tm report --save` — used by
  `delegate-task`, `run-rework`, and `independent-review`.
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
  rule; `bootstrap-project` references it.
- **C1** `monitor-agents` documents waiting without blocking the primary.
- **C2** Tasks carry their session; `task list` shows the open session and
  `--all` shows history.
- **D1** (found on a live run) Non-blocking delivery is now the default: `send`
  omits `--wait`, and a real wait runs in a background shell — OpenCode's shell
  `background` flag, with ctrl+b in the TUI as the human fallback. Updated
  `src/AGENTS.md`, `delegate-task`, `monitor-agents`, and
  `parallel-coordination`.

Remaining work is the open questions below, not unbuilt capability.

## Next: act on the parallel run review

A second live run — two landing pages, different styles, built and reviewed
concurrently — is written up in the
[parallel run review](implementation/12-parallel-run-review.md). Start with its
P0 items, each with a gate that proves it:

- **E1** `tm report --save` stores a clean final message, not a rendered pane
  with TUI chrome and duplicated lines.
- **E2** Parallel UI streams get their own port and browser session, so two
  workers cannot hijack each other's tab.
- **E3** A worker that starts a server stops it before reporting; no stray
  listener survives a run.

Then P1: keep review tasks out of the approval queue, make `task show` quiet,
and require an interim status on long builds. See the review for owners and
gates.

## Open questions

- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once more runs test the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- Should a worker kind's Herdr integration be installed by default for reliable
  lifecycle states?
