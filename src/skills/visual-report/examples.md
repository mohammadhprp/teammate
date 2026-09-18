# Visual report examples

Two worked reports: a UI change and a logic change. Both start from the same
`handoff-report` content and pick the visual the work demands. The first is also
rendered in full: see `examples/dark-theme-settings.html` (source:
`examples/dark-theme-settings.json` with `before.svg` / `after.svg`).

## A UI change: dark theme on the settings page

The point is *"this is what the UI does now"*, so show the rendered page before
and after, at a stated viewport, with the checks that measured it.

```bash
# 1. Capture at a fixed viewport (agent-browser, or the project's command).
agent-browser --session settings shot --viewport 1280x800 --out before.png
agent-browser --session settings shot --viewport 1280x800 --out after.png
# 2. Measure, do not assert.
npx axe --exit-zero labels        # contrast: 7.1:1, 0 violations
npx html-validate src/settings/*.html   # 0 errors
```

```json
{
  "title": "Dark theme for the settings page",
  "summary": "Adds a persisted dark theme; light and dark both pass contrast.",
  "task": "tsk_9f1c2a",
  "project": "acme-web",
  "status": "ready for approval",
  "verdict": "pass",
  "iteration": "2 of 3",
  "sections": {
    "requested": "Add a dark theme to the settings page that persists per user.",
    "implemented": "A theme toggle persisted in user preferences.",
    "changed": "src/settings/* — +180 / -24",
    "verified": "`pytest` 412 passed; contrast 7.1:1; html-validate clean.",
    "assessment": "Meets every criterion; verdict pass.",
    "decision": "Approve, request changes, or reject."
  },
  "blocks": [
    {
      "type": "images",
      "label": "Before / after — 1280×800",
      "items": [
        {"src": "before.png", "caption": "Before — light only"},
        {"src": "after.png", "caption": "After — dark theme"}
      ]
    }
  ],
  "checks": [
    {"name": "contrast", "command": "npx axe labels", "result": "pass",
     "output": "0 violations"},
    {"name": "markup", "command": "npx html-validate", "result": "pass",
     "output": "0 errors"},
    {"name": "tests", "command": "pytest -q", "result": "pass",
     "output": "412 passed in 3.1s"}
  ]
}
```

## A logic change: empty input crashes the parser

The point is *"this logic changed, and it handles this case"*, so show the
before/after code and one concrete input → output.

```json
{
  "title": "Parser no longer crashes on empty input",
  "summary": "`parse(\"\")` returns `[]` instead of raising `IndexError`.",
  "task": "tsk_4b7d01",
  "project": "acme-core",
  "status": "ready for approval",
  "verdict": "pass",
  "sections": {
    "requested": "`parse` must not raise on empty or whitespace input.",
    "implemented": "An early return for empty input; the token loop is unchanged.",
    "changed": "src/parser.py — +4 / -1",
    "verified": "`pytest tests/test_parser.py` 38 passed, including the new case.",
    "assessment": "Meets the criterion; no regression in the corpus.",
    "decision": "Approve, request changes, or reject."
  },
  "blocks": [
    {
      "type": "code",
      "label": "The fix",
      "language": "python",
      "before": "tokens = tokenize(text)\nfirst = tokens[0]\nreturn build(first, tokens[1:])",
      "after": "tokens = tokenize(text)\nif not tokens:\n    return []\nfirst = tokens[0]\nreturn build(first, tokens[1:])"
    },
    {
      "type": "example",
      "label": "Empty input",
      "input": "parse(\"\")",
      "output": "[]        # before: IndexError: list index out of range",
      "note": "The boundary the old code crashed on."
    },
    {
      "type": "diff",
      "label": "Diff",
      "text": "@@ -42,3 +42,6 @@ def parse(text):\n     tokens = tokenize(text)\n+    if not tokens:\n+        return []\n     first = tokens[0]"
    }
  ],
  "checks": [
    {"name": "parser tests", "command": "pytest tests/test_parser.py -q",
     "result": "pass", "output": "38 passed in 0.4s"}
  ],
  "findings": [
    {"severity": "major", "category": "bug", "title": "Crash on empty input",
     "file": "src/parser.py", "line": 42, "status": "resolved",
     "detail": "`tokens[0]` raised on empty input.",
     "suggestion": "Return `[]` before indexing."}
  ]
}
```

## Rendering either one

```bash
python3 <skill-dir>/scripts/render_report.py report.json \
  --out ~/.teammate/acme/reports/tsk_4b7d01-visual.html
open ~/.teammate/acme/reports/tsk_4b7d01-visual.html
```

A missing `before.png` renders a **not captured** placeholder — the report stays
honest rather than hiding the gap.
