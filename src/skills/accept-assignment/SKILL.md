---
name: accept-assignment
description: "Read the brief before spending effort: restate the goal and every acceptance criterion, name the files or area involved, and detect ambiguity. Use the moment a worker receives an assignment — especially a terse brief whose criteria look partial or whose instructions could conflict — to start on a confirmed understanding or ask one precise question instead of building on a guess."
---

# Accept assignment

A brief is written by someone who no longer holds your context, and one missing
or misread word can change the whole change. Restating it costs a minute and
catches the misread before any code is written.

Never invent a criterion to fill a gap. An invented criterion is a wrong one: it
will pass review without being anything that was asked for.

## When to use

- At the start of a delegated assignment, before starting the change.
- When the brief is terse, the criteria look partial, or two instructions
  appear to conflict.

## When not to use

- A trivial follow-up in a task you already accepted.

## Inputs

- The brief: project and root, goal, acceptance criteria, constraints, and
  expected output. The primary builds it from `templates/worker-brief.md`.
- The target project's context once you begin reading the area
  (`load-project-context`).

## Procedure

1. **Restate the goal.** One sentence, in your own words.
2. **Restate every criterion.** List each as a checklist item, unchanged in
   meaning. Each must be checkable by someone other than you.
3. **Name the area.** Which files, modules, tests, or docs the change will
   touch. Read just enough to confirm the area exists; do not start the change.
4. **Re-check the constraints.** Stay in the named project, do not expand scope,
   and do not commit / merge / push / publish / deploy / delete unless the brief
   says otherwise.
5. **Detect ambiguity.** Look for:
   - a criterion that cannot be checked as written;
   - two criteria or constraints that conflict;
   - an expected output with no clear shape;
   - a project or root that is missing or ambiguous;
   - a dependency the assignment needs but the constraints forbid.
6. **Decide.** If it is clear, state the restatement and begin with
   `implement-task`. If not, ask with `raise-blocker` — exactly one precise
   question — and do not start building in the meantime.

## Restatement shape

```markdown
Goal: <one sentence>
Criteria:
- [ ] <criterion, reworded only for clarity>
Area: <files / modules / docs>
Constraints: <as given, plus anything the project forbids>
Output: <what you will hand back>
Question: <none, or the single decision blocking you>
```

`examples.md` shows a clear brief and a brief with a gap.

## Output

A confirmed understanding — goal, criteria, area, constraints, output — or one
blocker question.

## Failure and escalation

- Ambiguous, contradictory, or incomplete brief → ask immediately with
  `raise-blocker`; never invent the missing criterion.
- A conflict between the brief and the project's own instructions → surface it
  rather than silently choosing one.
