BEGIN;
CREATE TABLE IF NOT EXISTS authorized_remediations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  training_key TEXT,
  title TEXT NOT NULL,
  target_url TEXT NOT NULL,
  authorized_host TEXT NOT NULL,
  authorization_reference TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'controlled_html' CHECK (source_kind = 'controlled_html'),
  original_source TEXT NOT NULL,
  working_source TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  output_sha256 TEXT,
  fix_manifest JSONB NOT NULL,
  verification JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','applied_to_controlled_copy')),
  approval_reference TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, actor_id, training_key)
);
CREATE INDEX IF NOT EXISTS idx_authorized_remediations_actor ON authorized_remediations(tenant_id, actor_id, created_at DESC);
CREATE TABLE IF NOT EXISTS authorized_remediation_log (
  id BIGSERIAL PRIMARY KEY,
  remediation_id BIGINT NOT NULL REFERENCES authorized_remediations(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
