---
name: plan-work
description: "Turn an ambiguous goal into explicit, testable work before any agent is spawned: restate the outcome, derive acceptance criteria a reviewer could check, choose serial vs parallel, size the smallest useful team, and pick each worker's role. Use whenever a request is non-trivial, should be delegated, spans more than a trivial local edit, arrives vague ('make the app faster', 'add auth'), or reaches a point where it must become tasks — and use it to ask the developer up front instead of spending agents on the wrong work."
---

# Plan work

Planning turns a request into work someone else can check. It is far cheaper to
spend a minute here than to rework a worker's wrong guess, so the aim is the
smallest plan that makes the goal, the criteria, and the team unambiguous.
Planning produces the plan; `task-ledger` records it and `delegate-task` spawns
it. Planning never spawns a worker itself.

## When to use

- The request should be delegated, or spans more than a trivial local edit.
- The goal is vague, consequential, or has more than one plausible reading.
- Work touches more than one project, or needs independent review.

## When not to use

- A one-line, low-risk, local change: do it directly.
- The work is already planned and the criteria are agreed: skip to
  `task-ledger`, then `delegate-task`.

## Inputs

- The request, in the developer's words.
- The resolved project(s) and roots, from `multi-project-context`, prepared with
  `bootstrap-project` (an `AGENTS.md` and the skills the work needs).
- `team-mate.toml` for `max_concurrent`, `max_iterations`, and `review_policy`.

## Procedure

1. **Restate the goal as an outcome.** One or two sentences describing what is
   true when the work is done, not the activity taken. If you cannot state it
   without hedging, the goal is ambiguous — that is the signal to ask, not to
   guess.

2. **Ask before you spend agents.** Separate what blocks delegation from what a
   worker can settle in scope.
   - Blocking: the outcome, scope, or definition of success is unclear; the work
     is consequential (production, money, data, secrets); two readings lead to
     different criteria.
   - In scope: an implementation detail the project's own conventions or tests
     decide.
   Batch blocking questions into one message and stop; never delegate a guess.
   When the answer is a decision the developer must make, that is
   `escalate-decision`.

3. **Derive acceptance criteria a reviewer could check.** Each criterion should
   be observable and falsifiable by someone who did not write the code — ideally
   backed by a command from the project's own checks. Two to five is usually
   right. Prefer behavior (`subtract(5, 3) == 2`) over process ("use a helper")
   or unverifiable quality ("clean code"). These criteria become both the brief
   and the review input, so vague criteria guarantee a vague review. For a
   user-facing result — a page, a UI — include a criterion a person can see (the
   rendered output or a screenshot), not only that the source exists, and record
   the quality bar in the project's `AGENTS.md`.

4. **Decide serial vs parallel.** Parallel only when the streams are genuinely
   independent: different files or projects, no shared state, no order
   dependency. If two streams would touch the same file, run them serially or
   give that file to one. Stay within `max_concurrent` (`parallel-coordination`
   carries out the parallel path).

5. **Choose the smallest useful team.** One worker per coherent change. Add a
   worker only for real parallelism or a genuinely separate role — most often an
   independent reviewer when the change is risky or a criterion is hard to
   self-check (`independent-review`).
   Do not create a worker to help plan; planning is yours.

6. **Assign a role per worker.** The role follows from the assignment —
   implementation, review, investigation, debugging, testing, documentation.
   Give each worker its project, goal, criteria, constraints, and expected
   output. A worker asked to review is told to return findings only, not to fix
   (that is `review-task`).

7. **Choose the review path.** `review_policy` (`always` | `on-risk` |
   `never`) decides whether a settled task is reviewed; whether that review is a
   separate reviewer worker is a per-change call (`review-work`,
   `independent-review`). Fold any reviewer into the team size chosen above;
   rework beyond the plan is `run-rework`.

8. **Record the plan, then delegate.** Record each task with `task-ledger` so
   the plan survives a restart, then spawn with `delegate-task`. Planning ends
   before the first `spawn`.

## Output

A plan the primary or the developer can execute: per task, the project, role,
goal, acceptance criteria, constraints, ordering, dependencies, and review path.
A compact table is enough:

| Task | Project | Role | Acceptance criteria | Order |
| --- | --- | --- | --- | --- |
| ... | ... | implementation | ... | serial |
| ... | ... | review | findings only | after the first |

## Failure and escalation

- The goal is ambiguous or consequential → ask before delegating. A clarifying
  question costs one turn; a wrong delegation costs agents and a rework cycle.
- A criterion cannot be made checkable → the goal is underspecified. Surface
  that instead of writing a criterion the reviewer cannot use.
- The plan needs more workers than `max_concurrent` → sequence the work; do not
  silently exceed the limit.

## Related skills

- `task-ledger` records this plan; `delegate-task` spawns it.
- `multi-project-context` resolves the projects; `escalate-decision` raises the
  blocking questions.
- `independent-review` and `parallel-coordination` carry out the two choices
  made here.
