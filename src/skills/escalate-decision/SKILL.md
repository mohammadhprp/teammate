---
name: escalate-decision
description: "Interrupt the developer only when a decision is truly theirs, and make the interruption answerable in one step: lead with the situation and the exact question, add the smallest evidence that makes the call possible, and list the real options. Use when a worker returns a question or fails, acceptance criteria are ambiguous, an action is risky or consequential (commit, merge, push, publish, deploy, delete, or exposing secrets), a review is inconclusive or disputed, or the rework iteration limit is reached — not for routine progress."
---

# Escalate a decision

Automation fails when it either hides a decision or drowns the developer in
them. Escalate when the answer genuinely belongs to the developer, and make
each escalation cheap to answer: one situation, one question, the evidence that
matters, and the options. The developer stays the final decision-maker;
everything else you coordinate.

## When to use

- A worker returned a question (is blocked) or has failed.
- Acceptance criteria are ambiguous or contradictory, and guessing would spend
  real work on the wrong target.
- An action is risky or consequential — commit, merge, push, publish, deploy,
  delete, or exposing secrets. These always need explicit approval.
- A review is `inconclusive`, or a reviewer and implementer dispute a finding.
- The rework loop reached `max_iterations` without converging.

## When not to use

- Routine progress or a completed task: that is `report-progress`.
- A question the task's own criteria or the project context already answers:
  decide it and record the decision. Escalating what you can settle yourself
  trains the developer to ignore escalations.

## Inputs

- The state that needs a decision, and what you tried.
- The smallest evidence that makes the decision possible — a worker's question,
  review findings, a diff stat, command output.
- The options, with your recommendation.

## Procedure

1. **Check that it is theirs.** Confirm the call needs developer intent or a
   risk appetite you do not have. If the criteria already answer it, decide and
   record the decision instead of asking.

2. **Write the decision brief, top-first:**
   - **Situation** — one line: what happened, and on which task or project.
   - **Question** — the exact choice, phrased so a one-word answer resolves it.
   - **Evidence** — the minimum that makes the call possible, quoted from its
     source rather than summarized from memory.
   - **Options** — the real alternatives, one line each, with your
     recommendation.

3. **For a worker that returned a question, do not answer it.** Read its report
   and forward the question:

   ```bash
   python3 scripts/tm.py report "<name>"
   ```

   The worker is waiting on the developer, not on you; answering on its behalf
   commits the project to a decision the developer never saw.

4. **Deliver it** with `report-progress`, which carries the shared
   `handoff-report` shape. Keep the decision request at the top of that report;
   the developer should not have to read past it to find the question.

5. **Act only as approved.** Record the decision on the ledger
   (`python3 scripts/tm.py task decide <id> approve|request-changes|reject|finalize`)
   and resume or stop. Consequential work pauses until the answer arrives.

## Output

A decision request the developer can answer in one step.

## Failure

- If the question is buried, rewrite it — a reader should not have to infer the
  choice from the report.
- Silence is not consent. Without an explicit answer, do not commit, merge,
  push, publish, deploy, or delete on the developer's behalf.
