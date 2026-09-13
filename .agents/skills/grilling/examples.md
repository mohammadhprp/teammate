# Grilling Skill — Example Outputs

Realistic examples of how the `grilling` skill stress-tests thinking through design-tree rounds.

## Example 1: New feature plan (frontier round, recommendations, wait)

**User:** "Grill me on my plan to add Redis caching to the API."

**What the agent does:**

Maps the design tree (invalidation strategy branches off what is cached; TTL branches off invalidation; cache key shape branches off endpoints covered), computes the frontier, and asks round 1:

```
❓ **Q1** - **What gets cached**: Which endpoints or queries go through Redis — everything, read-heavy endpoints only, or specific hot queries?

➡️ Read-heavy endpoints only. Caching everything multiplies invalidation bugs for little gain.

---

❓ **Q2** - **Where Redis lives**: Managed service (Upstash/ElastiCache), self-hosted container, or reuse existing infrastructure?

➡️ Managed service. One less stateful thing to operate for a first caching pass.
```

Then waits. Q3 (TTL values) stays out of this round — it depends on Q1's answer.

**Result:** Whole frontier asked at once, each with a recommendation, no guessing at unsettled answers.

## Example 2: Facts via sub-agent, decisions via user (don't block)

**User:** Answers Q1 with "specific hot queries" and Q2 with "self-hosted container."

**What the agent does:**

Settled decisions push the frontier outward. Q3 (TTL per query) is now askable. But "which queries are actually hot" is a fact, not a decision — dispatches a sub-agent to check access logs and slow-query stats instead of asking the user. Asks the rest of the frontier now (eviction policy, invalidation trigger); only the TTL question waits for the sub-agent's report.

**Result:** Facts looked up, decisions put to the user, no blocking on exploration.

## Example 3: Session close (frontier empty, confirm before acting)

**User:** Answers the final round on invalidation triggers.

**What the agent does:**

Frontier is empty — every branch visited (scope, hosting, TTLs, eviction, invalidation). States the shared understanding back in one summary and asks for confirmation. Does not write any code or config until the user confirms.

**Result:** Nothing silently assumed, no action before confirmed understanding.
