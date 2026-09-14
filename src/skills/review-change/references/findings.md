# Findings and verdicts

One finding is one observation. Keep it specific and testable.

## Schema

```json
{
  "severity": "major",
  "category": "bug",
  "title": "Null project throws instead of returning empty list",
  "detail": "listProjects dereferences project.id without a null check.",
  "file": "src/projects.ts",
  "line": 42,
  "suggestion": "Return an empty array when project is null.",
  "status": "open"
}
```

## Categories

| Category | Checks |
| --- | --- |
| `bug` | Incorrect logic, crashes, bad state, broken error paths. |
| `missing-requirement` | An acceptance criterion is not implemented. |
| `incorrect-behavior` | Implemented, but behaves differently than specified. |
| `regression` | Existing behavior broke. |
| `edge-case` | Empty, null, boundary, concurrent, or error inputs. |
| `scope` | Changes beyond or short of the requested scope. |
| `test-gap` | No test, or a test that does not assert the behavior. |
| `quality` | Naming, duplication, dead code, unclear structure. |

Also consider unexpected side effects and work that does not actually satisfy
the original task.

## Severity

| Severity | Meaning | Blocks a pass? |
| --- | --- | --- |
| `blocker` | Unsafe, broken, or fails a criterion. | Yes |
| `major` | Correctness or requirement gap. | Yes |
| `minor` | Real issue with limited impact. | No |
| `nit` | Style or preference. | No |

## Verdict rules

- **`pass`** requires every acceptance criterion to hold and no open `blocker`
  or `major` findings. Minor findings may remain if they are documented.
- **`fail`** means at least one open `blocker` or `major` finding.
- **`inconclusive`** means correctness cannot be determined, usually because
  evidence is missing. Escalate to the developer.

A pass verdict must not include open blocker or major findings.

## Safeguards

- **No self-approval.** A worker cannot pass its own work.
- **No rubber stamping.** A pass with zero checks is a process failure.
- **Bounded loops.** The iteration limit prevents endless rework.
- **Visible dissent.** `inconclusive` and disputed findings reach the developer.
- **Fresh evidence.** Collect evidence at each iteration; never reuse a prior
  diff snapshot as proof of the current state.
