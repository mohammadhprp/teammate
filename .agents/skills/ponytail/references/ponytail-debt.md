# Ponytail debt

Use for `/ponytail-debt`, “what did ponytail defer”, or a request for the
shortcut ledger. Read and report only unless the user explicitly asks to write
the ledger to a file.

Search the repository for comment markers while skipping `node_modules`,
`.git`, and build output:

```bash
grep -rnE '(#|//) ?ponytail:' .
```

Treat each hit as one row, grouped by file:

`<file>:<line>, <what was simplified>. ceiling: <limit>. upgrade: <trigger>.`

Extract the ceiling and upgrade trigger from the comment. Mark entries with no
upgrade path or trigger as `no-trigger`. End with
`<N> markers, <M> with no trigger.` If there are no hits, say
`No ponytail: debt. Clean ledger.`
