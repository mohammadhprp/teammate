# Make Operations Idempotent

Design state-changing operations so repeated execution converges to the same correct state. Before changing a command, job, importer, pipeline step, or integration, answer:

- What happens if it runs twice?
- What happens if it crashes after each state change?
- What happens when Laravel retries the job?
- Can duplicate records, stock changes, notifications, or external requests occur?

Apply this especially to `app/Imports`, `app/Console/Commands`, `app/Jobs`, order pipes, stock actions, and Rahkaran or Elasticsearch synchronization.

Prefer stable external identifiers, unique database constraints, upserts, transactions, checkpointed progress, and safe retry behavior. Preserve tenant isolation while reconciling partial work. Test a successful run twice and test the important crash or retry boundary when practical.
