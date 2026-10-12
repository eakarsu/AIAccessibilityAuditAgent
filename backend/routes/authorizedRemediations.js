'use strict';
const express = require('express');
const pool = require('../db');
const authenticate = require('../middleware/auth');
const { applyManifest, digest, validateDraft } = require('../domain/remediation');

const router = express.Router();
router.use(authenticate);
router.use((req, res, next) => {
  const actorId = req.user?.id;
  const tenantId = req.user?.tenantId || req.user?.tenant_id;
  if (!actorId || !tenantId) return res.status(403).json({ error: 'Verified actor and tenant are required.' });
  req.remediationActor = String(actorId);
  req.remediationTenant = String(tenantId);
  next();
});
const scoped = (req) => [req.remediationTenant, req.remediationActor];
const expose = (row) => row && ({
  ...row,
  boundary: 'Changes are applied only to this stored controlled HTML copy. They are not deployed, certified, or approved for production.',
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM authorized_remediations WHERE tenant_id=$1 AND actor_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100', scoped(req));
    res.json({ items: result.rows.map(expose), count: result.rows.length });
  } catch (_) { res.status(503).json({ error: 'Authorized remediation records are unavailable. Check the database connection and retry.' }); }
});
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM authorized_remediations WHERE id=$1 AND tenant_id=$2 AND actor_id=$3', [req.params.id, ...scoped(req)]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Authorized remediation record not found.' });
    res.json({ item: expose(result.rows[0]) });
  } catch (_) { res.status(503).json({ error: 'Authorized remediation record is unavailable. Retry the request.' }); }
});
router.post('/', async (req, res) => {
  const checked = validateDraft(req.body);
  if (!checked.valid) return res.status(400).json({ error: 'The remediation draft is incomplete or outside the authorized scope.', violations: checked.violations });
  const value = checked.value;
  try {
    const result = await pool.query(`INSERT INTO authorized_remediations
      (tenant_id,actor_id,title,target_url,authorized_host,authorization_reference,source_revision,original_source,working_source,source_sha256,fix_manifest)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) RETURNING *`,
    [...scoped(req), value.title, value.targetUrl, value.authorizedHost, value.authorizationReference, value.sourceRevision, value.originalSource, digest(value.originalSource), JSON.stringify(value.fixManifest)]);
    await pool.query('INSERT INTO authorized_remediation_log(remediation_id,tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)', [result.rows[0].id, ...scoped(req), 'draft_created', { sourceRevision: value.sourceRevision }]);
    res.status(201).json({ item: expose(result.rows[0]) });
  } catch (_) { res.status(503).json({ error: 'The remediation draft could not be saved. Retry the request.' }); }
});
router.put('/:id', async (req, res) => {
  const checked = validateDraft(req.body);
  if (!checked.valid) return res.status(400).json({ error: 'The remediation draft is incomplete or outside the authorized scope.', violations: checked.violations });
  const value = checked.value;
  try {
    const result = await pool.query(`UPDATE authorized_remediations SET title=$4,target_url=$5,authorized_host=$6,authorization_reference=$7,source_revision=$8,
      original_source=$9,working_source=$9,source_sha256=$10,output_sha256=NULL,fix_manifest=$11,verification=NULL,approval_reference=NULL,applied_at=NULL,updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2 AND actor_id=$3 AND status='draft' RETURNING *`,
    [req.params.id, ...scoped(req), value.title, value.targetUrl, value.authorizedHost, value.authorizationReference, value.sourceRevision, value.originalSource, digest(value.originalSource), JSON.stringify(value.fixManifest)]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Only an owned draft can be edited.' });
    await pool.query('INSERT INTO authorized_remediation_log(remediation_id,tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)', [req.params.id, ...scoped(req), 'draft_edited', { sourceRevision: value.sourceRevision }]);
    res.json({ item: expose(result.rows[0]) });
  } catch (_) { res.status(503).json({ error: 'The remediation draft could not be updated. Retry the request.' }); }
});
router.post('/:id/preview', async (req, res) => {
  try {
    const row = (await pool.query('SELECT * FROM authorized_remediations WHERE id=$1 AND tenant_id=$2 AND actor_id=$3', [req.params.id, ...scoped(req)])).rows[0];
    if (!row) return res.status(404).json({ error: 'Authorized remediation record not found.' });
    const result = applyManifest(row.original_source, row.fix_manifest);
    res.json({ preview: { workingSource: result.source, changes: result.changes, verification: result.verification, outputSha256: result.outputHash }, boundary: 'Preview only; no source or status was changed.' });
  } catch (error) { res.status(error.status || 422).json({ error: error.message || 'The controlled source could not be remediated.' }); }
});
router.post('/:id/apply', async (req, res) => {
  if (req.body?.confirmation !== 'APPLY TO CONTROLLED COPY' || !String(req.body?.approvalReference || '').trim()) return res.status(400).json({ error: 'Exact confirmation and an approval reference are required.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM authorized_remediations WHERE id=$1 AND tenant_id=$2 AND actor_id=$3 FOR UPDATE', [req.params.id, ...scoped(req)])).rows[0];
    if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Authorized remediation record not found.' }); }
    if (row.status !== 'draft') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This controlled copy was already remediated.' }); }
    if (digest(row.original_source) !== row.source_sha256) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Original-source integrity check failed.' }); }
    const applied = applyManifest(row.original_source, row.fix_manifest);
    if (!applied.verification.allPassed) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'One or more deterministic verification checks failed.', verification: applied.verification }); }
    const updated = (await client.query(`UPDATE authorized_remediations SET working_source=$1,output_sha256=$2,verification=$3,status='applied_to_controlled_copy',approval_reference=$4,applied_at=NOW(),updated_at=NOW()
      WHERE id=$5 AND tenant_id=$6 AND actor_id=$7 RETURNING *`, [applied.source, applied.outputHash, applied.verification, String(req.body.approvalReference).trim(), req.params.id, ...scoped(req)])).rows[0];
    await client.query('INSERT INTO authorized_remediation_log(remediation_id,tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)', [req.params.id, ...scoped(req), 'controlled_copy_applied', { sourceSha256: row.source_sha256, outputSha256: applied.outputHash, changes: applied.changes, verification: applied.verification, approvalReference: String(req.body.approvalReference).trim() }]);
    await client.query('COMMIT');
    res.json({ item: expose(updated), changes: applied.changes, verification: applied.verification });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(error.status || 503).json({ error: error.status ? error.message : 'The controlled remediation could not be applied. No changes were committed.' });
  } finally { client.release(); }
});
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await pool.query("DELETE FROM authorized_remediations WHERE id=$1 AND tenant_id=$2 AND actor_id=$3 AND status='draft' RETURNING id", [req.params.id, ...scoped(req)]);
    if (!deleted.rows[0]) return res.status(409).json({ error: 'Only an owned draft can be deleted; applied copies retain their evidence.' });
    res.json({ deleted: true, id: deleted.rows[0].id });
  } catch (_) { res.status(503).json({ error: 'The remediation draft could not be deleted. Retry the request.' }); }
});

module.exports = router;
