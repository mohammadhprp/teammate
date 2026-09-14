# Next steps

Current state: The skill library is complete — 28 skills in `src/skills/` across
common (7), teammate (13), and worker (8) — with `scripts/tm.py`,
`scripts/task_store.py`, the templates, and a 23-test suite. The operating model
is validated end to end on live Herdr sessions with opencode and `omp`. What
remains is not new capability but making the **review and approval** model match
its design.

## Next: review and approval to parity with the design

[Review and approval](implementation/07-review-and-approval.md) defines the data
model the skills describe in prose but the ledger does not yet carry: a findings
schema with severity and category, verdict rules, and the developer's decision.
Bring the implementation to that design.

### 1. Persist structured findings

- Today: `task_store` seeds `findings: []`, `tm.py` only counts them, and
  nothing writes one. Reviewers return findings as prose in the report file, so
  rework is driven by text, not data.
- Do: a command that records validated findings (severity from
  `blocker|major|minor|nit`, category from the doc 07 table, `title`, `detail`,
  `file`, `line`, `suggestion`, `status`), appends a timeline event, and renders
  them in `task show`. The schema stays owned by
  `review-change/references/findings.md`.
- Wire it into `review-work` (record the verdict's findings) and `run-rework`
  (send only the open `blocker`/`major` findings).
- **Gate:** a failing review stores findings in the ledger; the verdict and the
  open findings are visible from `task show` and drive the rework prompt.

### 2. Persist the developer's decision

- Today: `approve` / `request-changes` / `reject` / `finalize` live in
  `team-mate` and `report-progress` prose; `escalate-decision` records the
  choice as a free-text `--note`, and `finalize` has no effect.
- Do: a decision command that records the choice, maps it to a status
  (`approve`/`finalize` → `approved`, `reject` → `rejected`, `request-changes` →
  `rework`), appends a timeline event, and is rendered by `task show`. `finalize`
  is the only path that enables `commit-changes`.
- **Gate:** each decision is recorded and visible after a restart; `finalize`
  is required before any commit.

### 3. Emit review and decision timeline events

- Today: `timeline.jsonl` records only `task.created`, `task.updated`, and
  `worker.spawned`.
- Do: append events for review started, findings recorded, verdict, rework sent,
  decision recorded — so doc 07's "Transparency" reconstruction works from the
  ledger alone.
- **Gate:** a task's review → rework → decision path is reconstructable from
  `timeline.jsonl`.

### 4. Reconcile doc 07 with the implemented model

- Doc 07 still shows raw `herdr agent …` for the trigger and evidence
  collection; the skills use the `tm` CLI (`tm status`, `tm report`, `tm diff`).
- Do: update doc 07 to the `tm` commands and the layered skills
  (`review-change` method, `review-work` coordination, `independent-review` /
  `review-task`, `run-rework`, `escalate-decision`), keeping the findings schema
  and verdict rules authoritative.
- **Gate:** doc 07 and the skills agree on commands, owners, and the findings
  schema.

## Other known gaps

- `tm diff` lists an untracked file but not its contents; the reviewer reads it.
- The library is larger than the validated set; trim skills no run uses.
- Reviewer workers are intentionally unledgered; `task-ledger` documents this
  for `recover-run`.
- Recovery was validated by losing the primary's context, not by killing a live
  primary process.
- Blocked detection depends on the agent's Herdr detection manifest
  (`permission_required` for opencode; `omp` needs its integration installed).

## Open questions

- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once more runs test the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- Should a worker kind's Herdr integration be installed by default for reliable
  lifecycle states?
