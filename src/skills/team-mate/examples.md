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

# 2. Spawn a worker linked to the task, write the brief under the state dir,
#    then send that path (--wait for serial work).
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name developer-alpha --task tsk_1a2b3c4d
# developer-alpha  idle  acme  wP  wP:t1
python3 scripts/tm.py brief developer-alpha --task tsk_1a2b3c4d <<'EOF'
<brief built from templates/worker-brief.md>
EOF
# ~/.teammate/briefs/tsk_1a2b3c4d-developer-alpha.md
python3 scripts/tm.py send developer-alpha --brief "<printed-path>"
# developer-alpha  working

# 3. Wait without blocking: background the wait (or poll `status`), then collect.
python3 scripts/tm.py wait developer-alpha --timeout 240000   # run this in a background shell
python3 scripts/tm.py report developer-alpha --lines 300
python3 scripts/tm.py task update tsk_1a2b3c4d --status awaiting_review

# 4. Review from evidence
python3 scripts/tm.py diff --cwd ~/code/acme --stat
(cd ~/code/acme && python3 -m unittest discover -s tests -q)
python3 scripts/tm.py task update tsk_1a2b3c4d --status ready_for_approval

# 5. After the developer approves
python3 scripts/tm.py task update tsk_1a2b3c4d --status approved
python3 scripts/tm.py stop developer-alpha
```

## Parallel work across two projects

```bash
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name developer-alpha --task tsk_a
python3 scripts/tm.py spawn --cwd ~/code/beta --project beta --name developer-beta --task tsk_b

# Write each brief under the state dir, then send both without --wait, then wait on each
python3 scripts/tm.py brief developer-alpha --task tsk_a <<'EOF'
<acme brief>
EOF
python3 scripts/tm.py send developer-alpha --brief "<printed-path>"
python3 scripts/tm.py brief developer-beta --task tsk_b <<'EOF'
<beta brief>
EOF
python3 scripts/tm.py send developer-beta --brief "<printed-path>"
python3 scripts/tm.py wait developer-alpha --timeout 300000
python3 scripts/tm.py wait developer-beta --timeout 300000
python3 scripts/tm.py status
```

Each worker runs in its own project workspace tab, so project context cannot
leak between them.

## Recovering after a restart

```bash
python3 scripts/tm.py task list
python3 scripts/tm.py task find --worker developer-alpha
python3 scripts/tm.py task show tsk_1a2b3c4d
```

The ledger lives in `~/.teammate/`, so this works even though the primary
agent's context was lost.
