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

# 2. Render the harness's skills and agent definitions into the project once.
python3 scripts/tm.py skills sync --cwd ~/code/acme
python3 scripts/tm.py agents sync --cwd ~/code/acme

# 3. Persist the brief, then call the harness's subagent tool with it as the
#    prompt (here opencode `subagent`), and link the worker to the task.
python3 scripts/tm.py brief developer-alpha --task tsk_1a2b3c4d <<'EOF'
<brief built from templates/worker-brief.md>
EOF
# ~/.teammate/acme/briefs/tsk_1a2b3c4d-developer-alpha.md
# subagent(agent="developer", prompt=<brief>, description="Add subtract")
python3 scripts/tm.py task update tsk_1a2b3c4d --worker developer-alpha --status working

# 4. When the subagent returns, read the report it wrote.
python3 scripts/tm.py report developer-alpha
python3 scripts/tm.py task update tsk_1a2b3c4d --status awaiting_review

# 5. Review from evidence
python3 scripts/tm.py diff --cwd ~/code/acme --stat
(cd ~/code/acme && python3 -m unittest discover -s tests -q)
python3 scripts/tm.py task update tsk_1a2b3c4d --status ready_for_approval

# 6. After the developer approves
python3 scripts/tm.py task decide tsk_1a2b3c4d approve
```

## Parallel work across two projects

```bash
python3 scripts/tm.py task new --project acme --title "Add subtract" \
  --goal "Add subtract(a, b) returning a - b." \
  --acceptance "subtract(5, 3) == 2 and a test asserts it"
# tsk_a
python3 scripts/tm.py task new --project beta --title "Fix parser" \
  --goal "Fix the parser's handling of trailing commas." \
  --acceptance "the trailing-comma test passes"
# tsk_b

# Persist each brief, then start both as background subagents (harness support
# permitting) and link each worker to its task.
python3 scripts/tm.py brief developer-alpha --task tsk_a <<'EOF'
<acme brief>
EOF
python3 scripts/tm.py brief developer-beta --task tsk_b <<'EOF'
<beta brief>
EOF
# claude: Agent(..., run_in_background=True); omp: task(tasks=[...]);
# codex: spawn_agent then wait_agent. The harness notifies on completion.
python3 scripts/tm.py task update tsk_a --worker developer-alpha --status working
python3 scripts/tm.py task update tsk_b --worker developer-beta --status working

# Each background subagent notifies on completion; then read each report.
python3 scripts/tm.py report developer-alpha
python3 scripts/tm.py report developer-beta
```

Each worker is a native subagent scoped to its own project root, so project
context cannot leak between them.

## Recovering after a restart

```bash
python3 scripts/tm.py task list
python3 scripts/tm.py task find --worker developer-alpha
python3 scripts/tm.py task show tsk_1a2b3c4d
python3 scripts/tm.py report developer-alpha
```

The ledger lives in `~/.teammate/`, so this works even though the primary
agent's context was lost. `tm` cannot list live subagents, so the report and the
diff are the evidence a restart recovers from.
