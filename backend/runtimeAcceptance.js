'use strict';

const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const express = require('express');

const databaseUrl = String(process.env.DATABASE_URL || '');
const selectedEndpoint = String(process.env.RUNTIME_AI_ENDPOINT || '');
const selectedPath = selectedEndpoint.startsWith('/api/') ? selectedEndpoint.slice(4) : selectedEndpoint;
const feature = String(process.env.RUNTIME_AI_FEATURE || 'application-review');
const projectName = String(process.env.RUNTIME_PROJECT_NAME || 'Application');
const systemPrompt = String(process.env.RUNTIME_AI_SYSTEM_PROMPT || 'Provide a concise, practical, evidence-aware review for this application workflow.');

if (!databaseUrl) throw new Error('DATABASE_URL is required for runtime acceptance');
if (!selectedPath.startsWith('/ai/')) throw new Error('RUNTIME_AI_ENDPOINT must be an /api/ai/... path');

function literal(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function query(sql, rows = false) {
  const args = [databaseUrl, '-v', 'ON_ERROR_STOP=1'];
  if (rows) args.push('-At', '-F', '\t');
  args.push('-c', sql);
  const result = spawnSync('psql', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'database request failed').trim());
  return result.stdout.trim();
}

// Schema creation and operator provisioning are explicit opt-in operations.
// Normal boots never run DDL and never rewrite an existing operator password.
if (String(process.env.RUNTIME_SETUP || '') === '1') {
  const adminEmail = String(process.env.PROVISION_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.PROVISION_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '');
  if (!adminEmail || adminPassword.length < 12) throw new Error('Runtime administrator credentials are required when RUNTIME_SETUP=1');

  function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 32).toString('hex');
  }

  // Password hashes are written only on first insert; re-running setup keeps the
  // operator-chosen password and only reasserts role/active.
  function provisionUser(email, password, displayName, role) {
    return 'INSERT INTO runtime_app_users(email,password_hash,display_name,role,active) VALUES(' +
      literal(email) + ',' + literal(hashPassword(password)) + ',' + literal(displayName) + ',' + literal(role) +
      ',TRUE) ON CONFLICT(email) DO UPDATE SET role=EXCLUDED.role,active=TRUE;';
  }

  const statements = [
    'BEGIN;',
    'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    'CREATE TABLE IF NOT EXISTS runtime_app_users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT \'user\',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());',
    'CREATE TABLE IF NOT EXISTS runtime_app_sessions(token_hash TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES runtime_app_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());',
    'CREATE TABLE IF NOT EXISTS runtime_ai_interactions(id BIGSERIAL PRIMARY KEY,user_id UUID NOT NULL REFERENCES runtime_app_users(id),feature TEXT NOT NULL,input JSONB NOT NULL,output JSONB NOT NULL,model TEXT NOT NULL,provider_receipt JSONB NOT NULL DEFAULT \'{}\'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());',
    'ALTER TABLE runtime_ai_interactions ADD COLUMN IF NOT EXISTS provider_receipt JSONB NOT NULL DEFAULT \'{}\'::jsonb;',
    'CREATE INDEX IF NOT EXISTS runtime_ai_interactions_user_idx ON runtime_ai_interactions(user_id,created_at DESC);',
    provisionUser(adminEmail, adminPassword, 'Runtime Administrator', 'admin'),
  ];

  const reviewerEmail = String(process.env.PROVISION_REVIEWER_EMAIL || '').trim().toLowerCase();
  const reviewerPassword = String(process.env.PROVISION_REVIEWER_PASSWORD || '');
  if (reviewerEmail) {
    if (reviewerPassword.length < 12) throw new Error('PROVISION_REVIEWER_PASSWORD must be at least 12 characters when a reviewer email is provided');
    statements.push(provisionUser(reviewerEmail, reviewerPassword, 'Runtime Reviewer', 'reviewer'));
  }

  statements.push('COMMIT;');
  query(statements.join('\n'));
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function verifyPassword(password, stored) {
  const [kind, storedSalt, digest] = String(stored).split('$');
  if (kind !== 'scrypt' || !storedSalt || !digest) return false;
  const candidate = crypto.scryptSync(password, storedSalt, 32);
  const expected = Buffer.from(digest, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function actor(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const row = query(
    'SELECT u.id,u.email,u.display_name,u.role FROM runtime_app_sessions s JOIN runtime_app_users u ON u.id=s.user_id WHERE s.token_hash=' +
      literal(sha(token)) + ' AND s.expires_at>NOW() AND u.active=TRUE LIMIT 1',
    true
  );
  if (!row) return null;
  const [id, email, displayName, role] = row.split('\t');
  return { id, email, displayName, role };
}

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

router.post('/auth/login', (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const row = query(
      'SELECT id,email,password_hash,display_name,role FROM runtime_app_users WHERE active=TRUE AND email=' + literal(email) + ' LIMIT 1',
      true
    );
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const [id, userEmail, storedHash, displayName, role] = row.split('\t');
    if (!verifyPassword(password, storedHash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = crypto.randomBytes(32).toString('hex');
    query('INSERT INTO runtime_app_sessions(token_hash,user_id,expires_at) VALUES(' + literal(sha(token)) + ',' + literal(id) + "::uuid,NOW()+INTERVAL '24 hours')");
    return res.json({ token, user: { id, email: userEmail, name: displayName, role } });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/me', (req, res, next) => {
  try {
    const user = actor(req);
    return user ? res.json({ user }) : res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    return next(error);
  }
});

router.get('/ai/history', (req, res, next) => {
  try {
    const user = actor(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    const rows = query(
      "SELECT json_build_object('id',id,'feature',feature,'input',input,'output',output,'model',model,'providerReceipt',provider_receipt,'createdAt',created_at)::text FROM runtime_ai_interactions WHERE user_id=" +
        literal(user.id) + '::uuid ORDER BY created_at DESC LIMIT 50',
      true
    );
    return res.json({ history: rows ? rows.split('\n').map(JSON.parse) : [] });
  } catch (error) {
    return next(error);
  }
});

router.post(selectedPath, async (req, res, next) => {
  try {
    const user = actor(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    const prompt = String(req.body?.prompt || req.body?.question || req.body?.message || req.body?.context || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const baseUrl = String(process.env.OPENROUTER_BASE_URL || '').replace(/\/+$/, '');
    const model = String(process.env.OPENROUTER_MODEL || '').trim();
    const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    if (baseUrl !== 'https://openrouter.ai/api/v1' || !model || !apiKey) throw new Error('Exact OpenRouter configuration is required');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110000);
    let providerResponse;
    try {
      providerResponse = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'X-Title': projectName
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 650
        })
      });
    } finally {
      clearTimeout(timer);
    }
    if (!providerResponse.ok) throw new Error('OpenRouter API error (' + providerResponse.status + ')');
    const provider = await providerResponse.json();
    const content = String(provider.choices?.[0]?.message?.content || '').trim();
    if (!content) throw new Error('OpenRouter returned an empty response');
    const providerReceipt = {
      requestId: String(provider.id || ''),
      provider: String(provider.provider || 'openrouter'),
      upstreamModel: String(provider.model || model),
      created: Number(provider.created || 0)
    };
    if (!providerReceipt.requestId) throw new Error('OpenRouter provider receipt is missing');

    const saved = query(
      'INSERT INTO runtime_ai_interactions(user_id,feature,input,output,model,provider_receipt) VALUES(' +
        literal(user.id) + '::uuid,' + literal(feature) + ',' + literal(JSON.stringify(req.body || {})) + '::jsonb,' +
        literal(JSON.stringify({ content })) + '::jsonb,' + literal(model) + ',' + literal(JSON.stringify(providerReceipt)) +
        '::jsonb) RETURNING id',
      true
    );
    return res.json({ content, model, providerReceipt, interactionId: Number(saved), feature });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
