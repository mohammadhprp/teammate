# TLC Spec-Driven Examples

## Specify and implement a small feature

User: "Specify feature: add a 'last seen' timestamp to the profile page."

Good agent behavior:

- Auto-size the work: a ≤3 file change gets a one-line inline spec and skips Design and Tasks.
- Execute always starts by listing atomic steps inline, and escalates to a formal `tasks.md` only if that listing reveals more than ~5 steps.
- Derive tests from the spec's acceptance criteria, not the implementation.
- Make one atomic Conventional Commit per task, with the task marked complete before the commit.

## Full workflow on a complex feature

User: "Specify feature: credit-based usage billing with metering and invoicing."

Good agent behavior:

- Run the full Specify → Design → Tasks → Execute cycle with requirement IDs in EARS notation.
- Trigger discuss for gray areas (refunds, proration) and write decisions to `context.md`.
- Run `validate_spec.py` and `validate_tasks.py` before confirming artifacts, and `check_commit.py` on each commit.
- Offer sub-agents for batches over ~8 tasks, then let the orchestrator dispatch a fresh Verifier after the final commit.
- Write the Verifier's `validation.md` with per-AC evidence and the discrimination sensor result.

## Resume work

User: "Resume work."

Good agent behavior:

- Read `.specs/STATE.md` and reconcile the Handoff against git (`branch`, `status --porcelain`, recent commits) and `tasks.md`.
- Let evidence win over a stale snapshot when they disagree.
- Propose the reconciled next step before writing any code.
