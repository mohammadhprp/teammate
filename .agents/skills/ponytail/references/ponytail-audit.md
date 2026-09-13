# Ponytail audit

Use for `/ponytail-audit` or a request to audit the whole repository for
over-engineering. Scan the whole tree, not only the current diff. Do not apply
fixes. Rank findings from the biggest cut first.

Use the review tags and hunt for standard-library or platform replacements,
single-implementation interfaces, one-product factories, delegating wrappers,
single-export files, dead flags or configuration, and hand-rolled standard
library behavior.

Report one finding per line:

`<tag> <what to cut>. <replacement>. [path]`

End with `net: -<N> lines, -<M> deps possible.` If nothing can be removed, say
`Lean already. Ship.` Scope is complexity only; do not report correctness,
security, or performance issues.
