BEGIN;
CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,full_name TEXT,role TEXT NOT NULL DEFAULT 'auditor',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE users SET tenant_id = 'legacy-' || id::text WHERE tenant_id IS NULL;
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'auditor';
CREATE TABLE IF NOT EXISTS governed_accessibility_audits(
 id BIGSERIAL PRIMARY KEY,tenant_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('reproduced','pending_manual_review','reviewed','rejected','failed')),
 input JSONB NOT NULL,report JSONB NOT NULL,failure_code TEXT,created_by TEXT NOT NULL,reviewed_by TEXT,review_reason TEXT,manual_evidence_reference TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_governed_audit_tenant_status ON governed_accessibility_audits(tenant_id,status);
CREATE TABLE IF NOT EXISTS governed_accessibility_audit_log(id BIGSERIAL PRIMARY KEY,audit_id BIGINT NOT NULL REFERENCES governed_accessibility_audits(id),tenant_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
COMMIT;
