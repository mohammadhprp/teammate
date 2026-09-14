# Next steps

Current state: The skill library is complete — 30 skills in `src/skills/` across
common (7), teammate (15), and worker (8) — with `scripts/tm.py`,
`scripts/task_store.py`, the templates, and a 33-test suite. The operating model
is validated end to end on live Herdr sessions with opencode and `omp`, and
review and approval now match
[their design](implementation/07-review-and-approval.md): findings and the
developer's decision are persisted in the ledger, verdicts are derived from the
findings, and review/decision events reach `timeline.jsonl`.

What remains is hardening and open questions, not unbuilt capability.

## Known gaps

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
