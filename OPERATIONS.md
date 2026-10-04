# Operations and trust boundary

Normal startup never kills port owners, installs, creates/migrates a database, or seeds. Bootstrap and versioned migrations are explicit. No supported demo fixture currently exists, so the guarded seed command changes nothing.

Runtime schema creation and operator provisioning are opt-in: run the backend once with `RUNTIME_SETUP=1` (plus `PROVISION_ADMIN_EMAIL`/`PROVISION_ADMIN_PASSWORD`, and optionally `PROVISION_REVIEWER_EMAIL`/`PROVISION_REVIEWER_PASSWORD`). Re-running setup never overwrites an existing operator password. Normal boots never run DDL or touch credentials, so runtime tables must have been provisioned at least once.

Only authentication, health, and governed audits are supported by default. Historical generated/model routes return `410 prototype_route_quarantined`. A local inspection requires `ENABLE_LEGACY_PROTOTYPE_ROUTES=true`, which runtime validation rejects in production.

`/api/governed-audits` ingests reproducible axe evidence only for an explicitly authorized public host. It blocks private/internal, credential-bearing, and out-of-scope targets; requires source revision and per-finding evidence; preserves failures and transitions in tenant-scoped audit tables; and requires a different reviewer plus assistive-technology evidence. An automated pass is explicitly not a certification.

The API does not directly crawl user URLs. Source-control and issue-tracker integrations, live browser regressions, and manual assistive-technology review still require configured external systems and qualified reviewers.

An operator-run worker can produce an axe evidence manifest after written authorization:

`cd backend && npm run governed-scan -- --url https://example.com/page --host example.com --authorization contract:123 --revision git:abc123 --output /secure/path/audit.json`

The worker resolves and pins a public IPv4 address, blocks private and out-of-scope targets, blocks third-party requests and redirects, and writes only rule, selector and evidence digests. It refuses to overwrite an existing file. Import the JSON file on the **Governed Audits** page, then submit it for independent manual review. The source revision and authorization reference are operator assertions; the worker cannot verify them. Blocking third-party resources can omit findings, and an axe run is not an assistive technology test or certification.
