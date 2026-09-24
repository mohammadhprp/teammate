# Examples

## Recovering after the primary restarted

The primary restarted with `tsk_1111` and `tsk_2222` in flight. Rebuild from the
ledger, then inspect the evidence each worker left before deciding.

```bash
# 1. What was in flight?
python3 scripts/tm.py task list
# tsk_1111  working   acme   i0/3  developer-alpha  Add subtract
# tsk_2222  working   acme   i0/3  developer-beta  Fix README typo

# 2. There is no live-worker list: read the evidence.
python3 scripts/tm.py report developer-alpha
# error: no report for developer-alpha: /Users/me/code/acme/.teammate-report.md is missing...
python3 scripts/tm.py diff --cwd ~/code/acme --stat
```

If the diff already shows `developer-alpha` edited `acme/ops.py`, the brief
landed: resume by delegating a reconciliation rather than resending it.
`developer-beta` left no report and no change, so it is orphaned. If the tree is
untouched, re-delegate `tsk_2222` to a new worker. If the tree holds a partial
edit and you cannot tell whether the brief landed, escalate instead of
re-delegating.

```bash
python3 scripts/tm.py task update tsk_2222 --status failed
# compose a recovery brief, persist it, then call the harness's subagent tool
python3 scripts/tm.py brief developer-gamma --task tsk_2222 <<'EOF'
<recovery brief: the README may be partly edited; reconcile it, do not redo it>
EOF
python3 scripts/tm.py task update tsk_2222 --worker developer-gamma --status working
```

The new brief says the README may already be partly edited — reconcile what is
there rather than redoing it — because a blind resend is what duplicates work.

## A worker that returned a question

A recovered worker whose report asks a question is waiting on a decision. Read
the report, carry the question to the developer, and leave the worker paused.
Answering it yourself would defeat the approval it was waiting for.

```bash
python3 scripts/tm.py report developer-alpha
```
