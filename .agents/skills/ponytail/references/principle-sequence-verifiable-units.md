# Sequence Work Into Verifiable Units

Break broad work into small units, and verify each unit before starting the next. A unit may be one migration, one endpoint, one importer change, or one focused refactor with its tests.

Start from a known-good state. Make one change. Run the narrowest relevant check. Inspect the result. Then continue. Do not batch many edits and postpone all verification until the end.

When commits are requested, order them so a reviewer can follow the proof: prerequisite or regression test, implementation, cleanup, and final verification. Preserve migration order and tenant safety at every step.
