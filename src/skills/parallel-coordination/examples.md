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

# 2. Spawn both, then submit both briefs without --wait.
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name acme-1 --task tsk_1111
python3 scripts/tm.py spawn --cwd ~/code/acme --project acme --name acme-2 --task tsk_2222
python3 scripts/tm.py send acme-1 --brief /tmp/subtract.md
python3 scripts/tm.py send acme-2 --brief /tmp/readme.md

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

## Streams that only look independent

A refactor of `parser.py` and a feature that also edits `parser.py` share a
write set. Running them together means the second worker overwrites the first,
and neither can see it. Serialize them with `delegate-task --wait`, or make one
stream own `parser.py` and rebase the other after it lands.
