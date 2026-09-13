# Boundary Discipline

Validate and normalize untrusted data at the boundary, then pass typed and validated values into internal domain code.

Relevant boundaries include FormRequests, route parameters, Artisan arguments, environment configuration, uploaded files, database rows, HTTP responses, CSV or Excel imports, and tenant context. Use existing requests, enums, rules, scopes, and service abstractions.

Do not accept `tenant_id` from untrusted Admin input when authenticated context determines the tenant. Do not repeat defensive validation throughout trusted internal call chains. Keep controllers and framework adapters thin; keep pricing, order, import, and state logic in the established services, actions, pipes, and domain structures.
