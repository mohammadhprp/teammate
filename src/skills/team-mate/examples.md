# Examples

## One delegated task

Request: "Add `subtract` to the Acme project."

```bash
# 1. Record the task (goal + acceptance criteria)
python3 scripts/tm.py task new --project acme --title "Add subtract" \
  --goal "Add subtract(a, b) returning a - b." \
  --acceptance "from acme import subtract works and subtract(5, 3) == 2" \
  --acceptance "a test asserts subtract(5, 3) == 2" \
  --acceptance "all existing tests still pass"
# tsk_1a2b3c4d

# 2. Spawn a worker linked to the task, then send the brief
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name acme-1 --task tsk_1a2b3c4d
# acme-1  idle  acme  wP  wP:t1
python3 scripts/tm.py send acme-1 --brief /tmp/brief.md --wait --timeout 240000
# acme-1  done

# 3. Collect and record
python3 scripts/tm.py report acme-1 --lines 300
python3 scripts/tm.py task update tsk_1a2b3c4d --status awaiting_review

# 4. Review from evidence
python3 scripts/tm.py diff --cwd ~/code/acme --stat
(cd ~/code/acme && python3 -m unittest discover -s tests -q)
python3 scripts/tm.py task update tsk_1a2b3c4d --status ready_for_approval

# 5. After the developer approves
python3 scripts/tm.py task update tsk_1a2b3c4d --status approved
python3 scripts/tm.py stop acme-1
```

## Parallel work across two projects

```bash
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name acme-1 --task tsk_a
python3 scripts/tm.py spawn --cwd ~/code/beta --project beta --name beta-1 --task tsk_b

# Send both without --wait, then wait on each
python3 scripts/tm.py send acme-1 --brief /tmp/acme.md
python3 scripts/tm.py send beta-1 --brief /tmp/beta.md
python3 scripts/tm.py wait acme-1 --timeout 300000
python3 scripts/tm.py wait beta-1 --timeout 300000
python3 scripts/tm.py status
```

Each worker runs in its own project workspace tab, so project context cannot
leak between them.

## Recovering after a restart

```bash
python3 scripts/tm.py task list
python3 scripts/tm.py task find --worker acme-1
python3 scripts/tm.py task show tsk_1a2b3c4d
```

The ledger lives in `~/.teammate/`, so this works even though the primary
agent's context was lost.
