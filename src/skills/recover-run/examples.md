# Examples

## Recovering after the primary restarted

The primary restarted with `tsk_1111` and `tsk_2222` in flight. Rebuild, pair
with live agents, and inspect before deciding.

```bash
# 1. What was in flight?
python3 scripts/tm.py task list
# tsk_1111  working   acme   i0/3  acme-1  Add subtract
# tsk_2222  working   acme   i0/3  acme-2  Fix README typo

# 2. What is actually alive?
python3 scripts/tm.py status
# acme-1  working  ...
# error: no agent named acme-2

# 3. acme-1 is alive: has it done the work? Inspect before re-sending anything.
python3 scripts/tm.py report acme-1 --lines 300
python3 scripts/tm.py diff --cwd ~/code/acme --stat
```

If `acme-1` already edited `acme/ops.py`, resume it — never resend the brief.
`acme-2` is orphaned, so it has no live state to resume; check whether its README
edit is in the tree. If the tree is untouched, re-delegate `tsk_2222` to a new
worker. If the tree already contains a partial edit and you cannot tell whether
the brief landed, escalate instead of re-delegating.

```bash
python3 scripts/tm.py task update tsk_2222 --status failed
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name acme-3 --task tsk_2222
python3 scripts/tm.py send acme-3 --brief /tmp/readme-recover.md
```

The new brief says the README may already be partly edited — reconcile what is
there rather than redoing it — because a blind resend is what duplicates work.

## A `blocked` worker during recovery

A recovered worker that Herdr reports as `blocked` is waiting on a decision.
Read the dialog with `python3 scripts/tm.py report <name> --source visible`, carry
the question to the developer, and leave the worker paused. Answering it yourself
would defeat the approval it was waiting for.
