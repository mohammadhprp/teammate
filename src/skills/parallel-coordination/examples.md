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

# 2. Spawn both, write each brief under the state dir, then submit both without
#    --wait. `tm brief` prints the path to pass to `send`.
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name developer-alpha --task tsk_1111
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name developer-beta --task tsk_2222
python3 scripts/tm.py brief developer-alpha --task tsk_1111 <<'EOF'
<subtract brief>
EOF
python3 scripts/tm.py send developer-alpha --brief "<printed-path>"
python3 scripts/tm.py brief developer-beta --task tsk_2222 <<'EOF'
<README brief>
EOF
python3 scripts/tm.py send developer-beta --brief "<printed-path>"

# 3. Poll the batch; a worker has settled when it is idle, done, or blocked.
python3 scripts/tm.py status

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
worker at a time, waiting via `python3 scripts/tm.py wait` / `status` (or a
backgrounded wait), not a flag — or make one stream own `parser.py` and rebase
the other after it lands.
