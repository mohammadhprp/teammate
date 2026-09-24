# Examples

## Two independent streams, merged in the primary

Two independent changes in `acme`: one adds `subtract`, one fixes a doc typo.
They touch different files, so they may overlap. `max_concurrent` is 3.

```bash
# 1. Record both streams and fix the merge order: subtract lands first.
python3 scripts/tm.py task new --project acme --title "Add subtract" \
  --goal "Add subtract(a, b) returning a - b." \
  --acceptance "subtract(5, 3) == 2 and a test asserts it" \
  --acceptance "all existing tests still pass"
# tsk_1111
python3 scripts/tm.py task new --project acme --title "Fix README typo" \
  --goal "Correct the install command in README." \
  --acceptance "README install command matches install.sh"
# tsk_2222

# 2. Persist each brief, start both as background subagents, and link each
#    worker. The harness notifies as each finishes; do not block on the first.
python3 scripts/tm.py brief developer-alpha --task tsk_1111 <<'EOF'
<subtract brief>
EOF
python3 scripts/tm.py brief developer-beta --task tsk_2222 <<'EOF'
<README brief>
EOF
# claude: Agent(..., run_in_background=True); omp: task(tasks=[...]);
# codex: spawn_agent then wait_agent.
python3 scripts/tm.py task update tsk_1111 --worker developer-alpha --status working
python3 scripts/tm.py task update tsk_2222 --worker developer-beta --status working

# 3. Await completion, then read each report.
python3 scripts/tm.py report developer-alpha
python3 scripts/tm.py report developer-beta

# 4. Land in the declared order, re-checking the combined tree each time.
(cd ~/code/acme && python3 -m unittest discover -s tests -q)
python3 scripts/tm.py diff --cwd ~/code/acme --stat
```

`subtract` lands first and is verified on the tree; the README change lands
second and the tests run again, because the combined tree is a state neither
worker's own run proved. `git diff` for each stream is read in the primary; no
worker is asked to merge another's change.

## Two UI streams, one port and session each

Two UI changes in `acme` — a settings page and a profile page — touch different
files, so they may overlap. Their servers and browsers must not:

```bash
# settings stream: its own port and its own browser session.
(cd ~/code/acme && python3 -m http.server 8080) &
agent-browser --session settings shot --out settings.png

# profile stream: a different port and a different session.
(cd ~/code/acme && python3 -m http.server 8081) &
agent-browser --session profile shot --out profile.png
```

Distinct ports (`:8080`, `:8081`) and distinct sessions (`--session settings`,
`--session profile`) keep the streams out of each other's way. Sharing either
collides: both on `:8081` and neither with a session, one worker logged "A
concurrent agent-browser session on :8081 hijacked the shared browser tab
mid-run" — it was rendering the other stream's page.

## Streams that only look independent

A refactor of `parser.py` and a feature that also edits `parser.py` share a
write set. Running them together means the second worker overwrites the first,
and neither can see it. They are not independent, so run them serially — one
worker at a time, letting the first return before starting the next — or make
one stream own `parser.py` and rebase the other after it lands.
