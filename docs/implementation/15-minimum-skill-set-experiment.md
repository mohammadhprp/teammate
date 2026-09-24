# Experiment: the minimum worker skill set

Open question 2 in [Open questions](14-open-questions.md): what is the minimum
useful skill set? Today the answer is a guess. This experiment turns it into a
measurement.

**Hypothesis.** Eight skills are enough for a worker to complete a routine
assignment alone, and a gap announces itself when a task needs something the
worker does not have.

```
load-project-context  verify-evidence  handoff-report  commit-changes
worker-role           accept-assignment  implement-task  report-result
```

Everything else is a coordinator concern or a specialization.

## Setup

1. A throwaway target project, bootstrapped normally (`bootstrap-project`
   writes its `AGENTS.md`/`CONTEXT.md`), so the task is fair — a bare project
   would fail for lack of context, not lack of skill.

2. An experiment config that installs **only** the floor. Copy
   `team-mate.toml` to `exp.toml` and set:

   ```toml
   worker_skills = [
     "load-project-context", "verify-evidence", "handoff-report", "commit-changes",
     "worker-role", "accept-assignment", "implement-task", "report-result",
   ]
   ```

   `tm skills sync` copies exactly these into the project's harness skills
   directory.

## Run

```bash
# 1. A session, and the task up front.
python3 scripts/tm.py session start --project exp-min
python3 scripts/tm.py task new --project exp-min --title "Add slugify and a test" \
  --goal "Add slugify(text) to the project and cover it with a test." \
  --acceptance "slugify('A B') == 'a-b'" --acceptance "the project's tests pass"
# tsk_xxxxxxxx

# 2. Install only the floor skills into the project (note --config).
python3 scripts/tm.py --config exp.toml skills sync --cwd "$PROJECT"

# 3. Hand it a self-contained brief (E2: no path outside the project).
python3 scripts/tm.py brief dev-alpha --task tsk_xxxxxxxx <<'EOF'
# Task: Add slugify and a test

## Project
- Root: <project root>
- Read first: `AGENTS.md` and `CONTEXT.md` in this project.

## Goal
Add `slugify(text)` that lowercases and replaces runs of non-alphanumerics with
a single `-`, trimming leading and trailing `-`.

## Acceptance criteria
1. `slugify('A B') == 'a-b'`
2. The project's own tests pass.

## Constraints
- Work only inside this project. Never read or write a path outside it.
- Everything you need is inline. Do not expand scope.
- Do not commit, merge, push, publish, deploy, or delete.
- Stop any server or process you start before you report.

## Expected output
The change, plus a report in the `handoff-report` shape: requested, implemented,
changed, verified (command and real output), issues, remaining concerns,
assessment, decision.
EOF

# 4. Spawn a native subagent named dev-alpha through the harness's subagent
#    tool, passing the printed brief as its prompt, and link it to the task.
#    `tm` records; the harness runs the worker.
python3 scripts/tm.py task update tsk_xxxxxxxx --worker dev-alpha --status working

# 5. Observe the subagent through the harness; when it settles, read its report.
python3 scripts/tm.py report dev-alpha --task tsk_xxxxxxxx
```

Then review and record, per [Review and approval](07-review-and-approval.md).

## What to watch

- **Does the worker ask for a skill it does not have?** Its first "I need X"
  is the signal, and it names the gap directly.
- **Does it skip a step because a skill is absent?** A worker that skips
  verification, or hand-waves a report, was missing something.
- **Record the first absent-but-needed skill per task.** That is the datum.

## Gate

The task completes, **or** the first absent-but-needed skill is recorded. Both
outcomes are data; a failure is the more informative one.

## Results

| Task type | Installed | Outcome | First missing skill |
| --- | --- | --- | --- |
| code change (`slugify`) | the 8 | | |
| UI change | the 8 | | |
| investigation | the 8 | | |

## After three runs

The union of "first missing" across task types is the true floor. Any skill that
appears in every run is promoted into the floor; anything that never appears is
a specialization and can stay out. Record the conclusion back in
[Open questions](14-open-questions.md) and adjust `worker_skills` in
`team-mate.toml`.
