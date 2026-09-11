# Model the Domain

Represent domain rules in structures that make invalid states difficult to create instead of spreading conditions across files.

Prefer existing enums, state services, policies, value objects, typed request data, registries, scopes, and pipeline data. For Chideli, inspect `OrderStatusEnum`, `OrderItemStatusEnum`, `OrderStateService`, `OrderPipelineData`, pricing services, and sale policy types before adding branches.

Do not introduce an abstraction only to move code. Add one when it removes duplicated rules, contradictory states, or repeated conditionals. Preserve the existing ownership boundary and cover each meaningful state transition with tests.
