# Ponytail rules

Lazy means efficient, not careless. The best code is the code never written.

Before writing code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after understanding the problem, not instead of it. Read the
task and touched code, trace the real flow end to end, then choose the rung.

For bug fixes, find every caller of the function being changed and fix the
shared root cause once. Do not scatter symptom guards across callers.

Do not simplify away input validation at trust boundaries, error handling that
prevents data loss, security, accessibility, hardware calibration, or anything
explicitly requested. Non-trivial lazy code leaves one runnable check behind;
trivial one-liners need no test.

Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling and
upgrade path, for example:

```text
# ponytail: global lock, per-account locks if throughput matters
```
