---
name: implement-task
description: "Build the smallest change that satisfies the accepted criteria: orient in the codebase, follow the project's own patterns and commands, keep the diff inside the accepted scope, and run the project's checks as you go. Use when an assignment needs code, config, tests, or documentation changes and `accept-assignment` has confirmed the criteria — not for investigation-only work."
---

# Implement task

The "smallest change that satisfies the criteria" is the whole discipline. Every
extra line is review surface, a merge risk, and a place for a defect. The project
already has a way to do this; find it and extend it rather than inventing a
parallel shape.

## When to use

- An accepted assignment requires changes to code, config, tests, or docs.

## When not to use

- Investigation-only work with no change: that is `investigate-issue`.
- The criteria are not yet confirmed: run `accept-assignment` first.

## Inputs

- The confirmed criteria and constraints from `accept-assignment`.
- The project's conventions and check commands from `load-project-context`.
- The relevant source, tests, and documentation.

## Procedure

1. **Orient before editing.** Find the code that already does the closest thing;
   read it and its tests. Match its structure, naming, and error handling
   instead of introducing a new style, and locate the project's build / test /
   lint / typecheck commands.
2. **Plan the smallest change.** Note the files you expect to touch. If the list
   grows past the accepted area, stop and re-check with `accept-assignment` or
   `raise-blocker`.
3. **Change one thing at a time.** Make the minimal edit that satisfies a
   criterion, and add a test alongside behavior when the project's pattern
   expects one. Do not fold in unrelated cleanups, renames, or formatting.
4. **Run the project's checks as you go.** Run the narrowest relevant check
   after each change so a break is caught where it happened, not at the end. Use
   the project's own commands; do not substitute your own.
5. **Keep the tree clean.** Remove the scratch files, debug prints, and
   generated noise your work created (`__pycache__`, build output, editor
   files). Do not delete unrelated files, and do not commit — leave the tree for
   the primary unless the brief authorizes committing (`commit-changes`).
6. **Hand off to verify.** When the criteria look met, run the full check with
   `verify-change` before reporting with `report-result`.

## Output

A change that satisfies the accepted criteria, ready for `verify-change`.

## Failure and escalation

- The criteria cannot be met as written → stop and `raise-blocker`; never
  silently redefine them.
- The change needs a file, dependency, or decision outside the accepted scope →
  `raise-blocker` before expanding.
- A check fails and the cause is unclear → investigate it; never disable the
  check, and never hand off a known failure as done.
