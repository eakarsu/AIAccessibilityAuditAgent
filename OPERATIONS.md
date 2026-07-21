# Operations and trust boundary

Normal startup never kills port owners, installs, creates/migrates a database, or seeds. Bootstrap and versioned migrations are explicit. No supported demo fixture currently exists, so the guarded seed command changes nothing.

Only authentication, health, and governed audits are supported by default. Historical generated/model routes return `410 prototype_route_quarantined`. A local inspection requires `ENABLE_LEGACY_PROTOTYPE_ROUTES=true`, which runtime validation rejects in production.

`/api/governed-audits` ingests reproducible axe evidence only for an explicitly authorized public host. It blocks private/internal, credential-bearing, and out-of-scope targets; requires source revision and per-finding evidence; preserves failures and transitions in tenant-scoped audit tables; and requires a different reviewer plus assistive-technology evidence. An automated pass is explicitly not a certification.

The API does not directly crawl user URLs. Authenticated sandboxed browser workers, source-control and issue-tracker integrations, real axe browser regressions, and manual assistive-technology review require configured external systems and qualified reviewers.
