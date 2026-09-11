# ADHD Skill — Example Outputs

Realistic examples of how the `adhd` skill shapes output so it can be acted on immediately.

## Example 1: Bug fix (lead with action, numbered steps, one next step)

**User:** "Auth is broken after the jsonwebtoken upgrade."

**What the agent does (following `SKILL.md` rules 1–3, 8, 10):**

Run `npm test -- auth.spec.ts`, then open `src/auth.ts:42`.

1. Open `src/auth.ts`
2. Replace `verifyToken` (lines 42–58) with the snippet below
3. Run `npm test -- auth.spec.ts` (about 2 minutes)

Test fails at `auth.spec.ts:42`: expected 200, got 401. Cause: missing auth header. Fix: add `Authorization: Bearer ${token}` to the request.

Next: paste the first failing line if any test fails.

**Result:** Action first, no preamble, one concrete next step. No "Hope this helps!"

## Example 2: Multi-turn state restatement (rule 5, rule 7)

**User:** "Continue the migration — where were we?"

**What the agent does:**

Step 3 of 5 done: schema updated, `users` table has `email_verified_at`. Next: backfill the new column.

1. Run `npm run migrate:backfill -- --batch=1000` (about 10 minutes for 50k rows)
2. Verify: `SELECT COUNT(*) FROM users WHERE email_verified_at IS NULL;` should return 0

Login now works with magic links. Try: `npm run dev`, open `/login`.

Next: run the backfill command above.

**Result:** State restated on screen, win made visible, single next action.

## Example 3: Tangent suppression + time estimate (rules 4, 6)

**User:** "Fix the slow dashboard query."

**What the agent does:**

Add the missing index first — about 5 minutes:

1. Open `db/migrations/042_add_orders_index.ts`
2. Add `CREATE INDEX idx_orders_user_created ON orders(user_id, created_at)`
3. Run `npm run migrate && npm test -- orders.spec.ts` (about 3 minutes)

Separately: the dashboard also refetches on every tab focus. Want me to handle that next?

Next: run the migration and paste the query time before/after.

**Result:** One fix finished, second issue parked as a single question, concrete estimate.

## Example 4: Long list ranked and grouped (rule 9)

**User:** "What are my options for fixing flaky CI?"

**What the agent does:**

Use retry-with-quarantine first — about 30 minutes to set up.

Top fix:

1. Quarantine the 3 flaky specs, retry once on failure (about 30 minutes)

Also relevant, grouped:

- Speed (pick one): split test shards 2 → 4; cache `node_modules` per lockfile hash
- Signal (pick one): fail-fast on `auth.spec.ts`; post flaky-test summary as a PR comment

Skipped nothing — full candidate list kept in analysis, only presentation grouped.

Next: say which group to apply and I will edit the workflow file.
