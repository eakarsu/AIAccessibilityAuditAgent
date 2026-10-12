'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
backendRequire('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
const { Pool } = backendRequire('pg');
const { digest } = require('../backend/domain/remediation');

if (process.env.REMEDIATION_SEED_ACK !== 'add-fictional-controlled-copies') {
  throw new Error('Set REMEDIATION_SEED_ACK=add-fictional-controlled-copies for this additive seed only.');
}
const scenarios = [
  'Museum membership form', 'Library event registration', 'Community garden signup', 'Transit feedback page', 'University lab directory',
  'Public meeting archive', 'Food pantry request form', 'Parks activity booking', 'Neighborhood newsletter', 'Volunteer orientation',
  'Recycling guide', 'Civic workshop roster', 'Arts grant information', 'Animal shelter inquiry', 'Emergency-preparedness checklist',
];
const variants = [
  [{ ruleId: 'document-language', selector: 'html', replacement: 'en' }, { ruleId: 'image-alt', selector: '#hero-image', replacement: 'Illustration for the fictional training scenario' }, { ruleId: 'form-label', selector: '#email', replacement: 'Email address' }],
  [{ ruleId: 'button-name', selector: '#submit-request', replacement: 'Submit request' }, { ruleId: 'heading-order', selector: '#details-heading', replacement: 'h2' }, { ruleId: 'semantic-main', selector: '#primary-content', replacement: 'main' }],
  [{ ruleId: 'image-alt', selector: '#hero-image', replacement: 'Decorative community scene used in this fictional training copy' }, { ruleId: 'button-name', selector: '#submit-request', replacement: 'Save training response' }, { ruleId: 'form-label', selector: '#email', replacement: 'Contact email' }],
];
const source = (index) => `<!doctype html>\n<html>\n<head><title>Fictional accessibility training ${index}</title></head>\n<body>\n<div id="primary-content">\n<h1>Fictional training page ${index}</h1>\n<h3 id="details-heading">Details</h3>\n<img id="hero-image" src="/training-${index}.png">\n<form><input id="email" type="email"><button id="submit-request" type="submit"></button></form>\n</div>\n</body>\n</html>`;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const configuredEmail = String(process.env.PROVISION_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!configuredEmail) throw new Error('Configured demo actor email is required.');
    const actor = (await pool.query('SELECT id,email,role FROM runtime_app_users WHERE lower(email)=$1 AND active=TRUE', [configuredEmail])).rows[0];
    if (!actor) throw new Error('The configured active runtime demo actor was not found.');
    const before = Number((await pool.query('SELECT count(*) FROM authorized_remediations WHERE tenant_id=$1 AND actor_id=$2', ['runtime-app', actor.id])).rows[0].count);
    for (let index = 1; index <= scenarios.length; index++) {
      const html = source(index), manifest = variants[(index - 1) % variants.length];
      await pool.query(`INSERT INTO authorized_remediations
        (tenant_id,actor_id,training_key,title,target_url,authorized_host,authorization_reference,source_revision,original_source,working_source,source_sha256,fix_manifest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)
        ON CONFLICT(tenant_id,actor_id,training_key) DO NOTHING`, [
        'runtime-app', String(actor.id), `fictional-training-${String(index).padStart(2, '0')}`,
        `[Fictional training] ${scenarios[index - 1]}`, `https://scenario-${index}.example.invalid/controlled-copy`, 'example.invalid',
        `fictional-training-authorization:AIA11Y-${String(index).padStart(2, '0')} (controlled copy only)`, `training:revision-${String(index).padStart(2, '0')}`,
        html, digest(html), JSON.stringify(manifest),
      ]);
    }
    const after = Number((await pool.query('SELECT count(*) FROM authorized_remediations WHERE tenant_id=$1 AND actor_id=$2', ['runtime-app', actor.id])).rows[0].count);
    console.log(JSON.stringify({ database: (await pool.query('select current_database()')).rows[0].current_database, actor: { id: actor.id, email: actor.email, role: actor.role }, before, after, added: after - before, recordsAreFictionalControlledCopies: true }, null, 2));
  } finally { await pool.end(); }
})().catch((error) => { console.error(error.message); process.exit(1); });
