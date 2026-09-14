# Accept assignment examples

Both examples are the same act: turn a brief into a restatement, and stop at the
first thing that cannot be resolved from the brief alone.

## A clear brief

Brief (abridged):

> Goal: Add `subtract(a, b)` to `acme/math.py`.
> Criteria: `from acme.math import subtract` works and `subtract(5, 3) == 2`; a
> test asserts it; existing tests pass.
> Constraints: no new dependencies.

Restatement:

```markdown
Goal: Add a subtract(a, b) function to acme/math.py.
Criteria:
- [ ] subtract is importable from acme.math
- [ ] subtract(5, 3) == 2
- [ ] a test asserts the behavior
- [ ] existing tests still pass
Area: acme/math.py, tests/
Constraints: no new dependencies; no commit/push
Output: the function, a test, and a verification report
Question: none
```

Begin with `implement-task`.

## A brief with a gap

Brief (abridged):

> Goal: Make the cache faster.
> Criteria: caching is faster.
> Constraints: don't change the public API.

"Faster" is not checkable, and there is no target to hit. Do not invent a
threshold. Raise one question with `raise-blocker`:

> Which operation should be faster, and by how much — is there a benchmark or
> target I should hit?

Then stop and wait.
