# Visual report manifest

`render_report.py` takes a JSON object and writes one self-contained HTML file.
Everything below is optional except a `title` or `summary` worth showing; the
renderer only formats what you give it and never invents content.

```text
render_report.py MANIFEST.json [--out REPORT.html]
```

Image paths in the manifest are resolved relative to the manifest file and
embedded as data URIs, so the HTML opens offline. A path that does not exist is
rendered as an explicit "not captured" placeholder — the report stays honest
about a missing artifact instead of hiding it.

## Top-level fields

| Field | Type | Purpose |
| --- | --- | --- |
| `title` | string | The report heading. |
| `summary` | string | One sentence: what now works or what changed. |
| `task` | string | Ledger task id (`tsk_…`). |
| `project` | string | Project name. |
| `status` | string | e.g. `ready for approval`. |
| `verdict` | string | `pass`, `fail`, or `inconclusive`. |
| `iteration` | string | e.g. `2 of 3`. |
| `generated_at` | string | When the report was rendered. |
| `sections` | object | The `handoff-report` text sections (below). |
| `blocks` | array | The visual evidence blocks (below). |
| `checks` | array | Verification rows (shorthand for a `checks` block). |
| `findings` | array | Review findings (shorthand for a findings table). |

### `sections`

The `handoff-report` shape. Each value is small markdown: paragraphs and `- `
bullets, with `` `code` `` and `**bold**` inline. Rendered in this order:
`requested`, `implemented`, `changed`, `verified`, `assessment`, then `decision`
(which is pulled into a prominent callout).

```json
"sections": {
  "requested": "Add a dark theme to the settings page.",
  "implemented": "A theme toggle persisted per user.",
  "changed": "src/settings/*, +180 / -24",
  "verified": "`pytest` 412 passed; contrast measured at 7.1:1.",
  "assessment": "Meets every criterion; verdict pass.",
  "decision": "Approve, request changes, or reject."
}
```

## Blocks

Each block is `{"type": …, "label": …}`, where `label` is the section heading.
Unknown types render as a visible note, never silently.

| `type` | Fields | Use for |
| --- | --- | --- |
| `images` | `items: [{src, caption}]` | A gallery; two items render side by side (before / after). |
| `image` | `src`, `caption` | One full-width artifact. |
| `code` | `before`, `after`, `language` | The decisive change; `before`+`after` render as a split. |
| `diff` | `text` | A unified diff, colored by line prefix. |
| `example` | `input`, `output`, `input_label`, `output_label`, `note` | A logic example: concrete input → output. |
| `checks` | `items: [{name, command, result, output}]` | `result` is `pass`/`fail`/`warn`/`skip`. |
| `findings` | `items: […]` | A findings table; same shape as the ledger finding. |
| `markdown` | `text` | Freeform prose inside the block flow. |

### Example: UI change

```json
"blocks": [
  {
    "type": "images",
    "label": "Before / after",
    "items": [
      {"src": "before.png", "caption": "Settings, light — 1280×800"},
      {"src": "after.png", "caption": "Settings, dark — 1280×800"}
    ]
  },
  {
    "type": "checks",
    "label": "Rendered checks",
    "items": [
      {"name": "contrast", "command": "axe labels", "result": "pass",
       "output": "no violations"}
    ]
  }
]
```

### Example: logic change

```json
"blocks": [
  {
    "type": "code",
    "label": "The fix",
    "language": "python",
    "before": "return items[0]",
    "after": "return items[0] if items else None"
  },
  {
    "type": "example",
    "label": "Empty input",
    "input": "subtract([])",
    "output": "None   # was: IndexError",
    "note": "Boundary the old code crashed on."
  }
]
```

## Findings and checks (top level)

```json
"checks": [
  {"name": "unit tests", "command": "pytest -q", "result": "pass",
   "output": "412 passed in 3.1s"}
],
"findings": [
  {"severity": "major", "category": "bug", "title": "Crash on empty input",
   "file": "src/math.py", "line": 42, "status": "resolved",
   "detail": "items[0] raised IndexError.", "suggestion": "Guard the empty list."}
]
```

`severity` is `blocker`/`major`/`minor`/`nit`; `status` is `open`/`resolved`/
`accepted` — the same vocabulary as the ledger (`07-review-and-approval.md`).
