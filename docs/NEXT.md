# Next steps

Current state: the Team Mate operating model is validated end to end in earlier
live runs (opencode and `omp`), and the skill library, `tm` ledger CLI,
templates, and CI are in place. The product model has since moved to
**harness-native subagents**: the primary runs inside one harness and workers
are that harness's native subagents, while `tm` keeps only the ledger and the
per-harness adapters. The hardening from the process review and **all** P0–P2
items of the audit-and-improvement plan are implemented. What remains is
research, not unbuilt capability.

The history behind that state:

- [Process review](implementation/11-process-review.md) — the first
  bootstrap-and-build run; its hardening plan (A1–D1) is implemented.
- [Parallel run review](implementation/12-parallel-run-review.md) — two projects
  at once; its items E1–E6 all landed.
- [Audit and improvement plan](implementation/13-audit-and-improvement-plan.md) —
  the docs, config, skills, and `tm` code audited against what they enforce;
  P0–P2 implemented.

## Open questions

Each is answered as far as the evidence allows — a decision where the answer is
ours, an experiment with a gate where it needs a live run — in the
[open questions](implementation/14-open-questions.md) doc.

- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once more runs test the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- Which harness needs an extension to expose native subagents, and how should
  lifecycle state be observed per harness?
