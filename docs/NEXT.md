# Next steps

Current state: The skill library is complete — 30 skills in `src/skills/` across
common (7), teammate (15), and worker (8) — with `scripts/tm.py`,
`scripts/task_store.py`, the templates, and a 33-test suite. The operating model
is validated end to end on live Herdr sessions with opencode and `omp`, and
review and approval now match
[their design](implementation/07-review-and-approval.md): findings and the
developer's decision are persisted in the ledger, verdicts are derived from the
findings, and review/decision events reach `timeline.jsonl`.

What remains is hardening, not unbuilt capability. The plan is the
[process review](implementation/11-process-review.md), written after a real
bootstrap-and-build run.

## Next: act on the process review

Start with its P0 items, each with a gate that proves it:

- **A1** define where briefs and reports live (`state_dir/briefs`,
  `state_dir/reports` or `tm brief`/`tm report`) so a run never writes outside
  the sandbox.
- **A2** provision the primary's permissions in `install.sh` — allow
  `~/.teammate/**` and each project's `.agents/**` — so a fresh primary runs
  without a permission dialog.
- **A3** forbid out-of-project paths in worker briefs (`worker-role`,
  `accept-assignment`, `delegate-task`, `templates/worker-brief.md`) so a worker
  never blocks on the sandbox.

Then P1: ledger hygiene and session scoping (`task prune`/archive), enforced
evidence honesty (no unrun command transcripts), bootstrap-provided validators,
and documenting the two skill populations in `.agents/skills`. See the review
for owners and gates.

## Open questions

- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once more runs test the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- Should a worker kind's Herdr integration be installed by default for reliable
  lifecycle states?
