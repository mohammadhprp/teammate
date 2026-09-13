# Ponytail review

Use for `/ponytail-review` or a request to review changes for
over-engineering. Review the current diff only. Do not apply fixes.

Scope is complexity only; route correctness bugs, security holes, and
performance issues to a normal review.

Report one finding per line:

`<file>:L<line>: <tag> <what to cut>. <replacement>.`

Tags:

- `delete:` dead code, unused flexibility, or speculative features; replacement
  is nothing.
- `stdlib:` hand-rolled functionality supplied by the standard library; name
  the function.
- `native:` a dependency or custom code doing what the platform already does;
  name the native feature.
- `yagni:` an abstraction with one implementation, unused configuration, or a
  layer with one caller.
- `shrink:` equivalent logic that can use fewer lines; show the shorter form.

End with `net: -<N> lines possible.` If there is nothing to cut, say
`Lean already. Ship.` Do not flag a single smoke test or assert-based
self-check as bloat.
