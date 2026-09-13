# Examples

## One delegated task

Request: "Add `subtract` to the Acme project."

```bash
# 1. Record the task (goal + acceptance criteria)
tm task new --project acme --title "Add subtract" \
  --goal "Add subtract(a, b) returning a - b." \
  --acceptance "from acme import subtract works and subtract(5, 3) == 2" \
  --acceptance "a test asserts subtract(5, 3) == 2" \
  --acceptance "all existing tests still pass"
# tsk_1a2b3c4d

# 2. Spawn a worker linked to the task, then send the brief
tm spawn --cwd ~/code/acme --project acme --name acme-1 --task tsk_1a2b3c4d
# acme-1  idle  acme  wP  wP:t1
tm send acme-1 --brief /tmp/brief.md --wait --timeout 240000
# acme-1  done

# 3. Collect and record
tm report acme-1 --lines 300
tm task update tsk_1a2b3c4d --status awaiting_review

# 4. Review from evidence
tm diff --cwd ~/code/acme --stat
(cd ~/code/acme && python3 -m unittest discover -s tests -q)
tm task update tsk_1a2b3c4d --status ready_for_approval

# 5. After the developer approves
tm task update tsk_1a2b3c4d --status approved
tm stop acme-1
```

## Parallel work across two projects

```bash
tm spawn --cwd ~/code/acme --project acme --name acme-1 --task tsk_a
tm spawn --cwd ~/code/beta --project beta --name beta-1 --task tsk_b

# Send both without --wait, then wait on each
tm send acme-1 --brief /tmp/acme.md
tm send beta-1 --brief /tmp/beta.md
tm wait acme-1 --timeout 300000
tm wait beta-1 --timeout 300000
tm status
```

Each worker runs in its own project workspace tab, so project context cannot
leak between them.

## Recovering after a restart

```bash
tm task list
tm task find --worker acme-1
tm task show tsk_1a2b3c4d
```

The ledger lives in `~/.teammate/`, so this works even though the primary
agent's context was lost.
