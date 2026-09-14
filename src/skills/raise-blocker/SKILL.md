---
name: raise-blocker
description: "Turn a stall into one answerable question: state the blocker, give the smallest evidence that makes it decidable, ask exactly one precise question, propose the options with a recommendation, then stop and wait instead of guessing. Use when a worker hits an ambiguous brief, a missing decision, or a risky action outside its scope — anything it should not resolve alone — even when pushing ahead feels faster than asking."
---

# Raise a blocker

Guessing is the most expensive thing a worker can do: it spends effort on an
answer nobody asked for, and the rework returns as a review finding. A blocker
is progress when it becomes a question someone can answer in one step.

This is the worker's channel to the primary. The primary owns the conversation
with the developer (see `escalate-decision`); your job is to make the decision
cheap to make.

## When to use

- The brief is ambiguous, contradicts itself, or an acceptance criterion cannot
  be interpreted as written.
- The work needs a decision only the primary or developer can make — scope,
  priority, an interface, a tradeoff.
- Continuing would require a risky, out-of-scope, or hard-to-reverse action.
- A required check cannot run, or evidence is missing, and the task cannot
  proceed without it.

## When not to use

- You can settle it inside scope with the project's own context — read the code,
  docs, tests, and conventions first. This skill is for what you cannot settle
  alone.
- You have a preference but a reasonable default exists — take the default, say
  you did, and record the assumption. Do not block on taste.

## Inputs

- The blocker, in one sentence.
- What you tried and what you observed: the smallest evidence.
- The decision required, and the options you can see.

## Procedure

1. **State the blocker precisely.** One sentence naming what is stopping you and
   the artifact it concerns — a file, a criterion, a command.
2. **Give the smallest evidence.** The exact command and its output, the
   conflicting lines, or the two criteria that collide. Enough to decide; never
   a transcript dump.
3. **Ask exactly one question.** If you catch yourself writing "and also", split
   it and ask the most blocking one first — a bundle of questions gets a partial
   answer to each.
4. **Propose the options with a recommendation.** Options make the question
   answerable in one step; a recommendation shows you did the thinking.
5. **Say what you will do when answered**, so the reply unblocks an action
   rather than opening another round.
6. **Stop and wait.** Do not start a guessed version or half-implement an
   option. Silence is not progress; the only moving state is a delivered
   question.

## Output

One blocker message: the blocker, its smallest evidence, exactly one question,
the options with your recommendation, and what their answer unblocks.

## Failure and escalation

- Waiting is correct, not failure. Guessing and reworking is the failure.
- If the decision belongs to the developer, the primary escalates it for you
  (`escalate-decision` is the primary's); you do not need a direct channel.
- If several blockers stack, raise the one that stops the most work and list the
  rest in a line so they surface after the first answer.
