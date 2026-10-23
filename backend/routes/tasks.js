'use strict';
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const policy = require('../domain/taskPolicy');
const DOMAIN_LABEL = 'accessibility audit';

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS app_tasks (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal',
  record_ref TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`;

async function callProvider(env, system, user) {
  const openRouter = env.OPENROUTER_API_KEY;
  const url = openRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const key = openRouter || env.OPENAI_API_KEY;
  const model = openRouter ? (env.OPENROUTER_MODEL || 'openrouter/auto') : (env.OPENAI_MODEL || 'gpt-4o-mini');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `AI provider request failed (${r.status}).`), { status: 502 });
  const text = data?.choices?.[0]?.message?.content || '';
  try { return { parsed: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')), model: data.model || model }; } catch (_) { return { parsed: { summary: text }, model: data.model || model }; }
}

const router = express.Router();
router.use(auth);
let ready; const ensure = () => { if (!ready) ready = pool.query(CREATE_SQL).catch((e) => { ready = null; throw e; }); return ready; };
const owner = (req) => String(req.user?.id ?? req.user?.userId ?? req.user?.sub ?? '');

  async function listTasks(req) {
    await ensure();
    const r = await pool.query('SELECT * FROM app_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500', [owner(req)]);
    return policy.filterTasks(r.rows, req.query || {});
  }

  router.get('/', async (req, res) => {
    try { const data = await listTasks(req); res.json({ data, pagination: { total: data.length } }); }
    catch (e) { res.status(503).json({ error: 'Task storage is unavailable. Check the database connection.' }); }
  });

  router.post('/', async (req, res) => {
    const { error, value } = policy.validateTaskInput(req.body);
    if (error) return res.status(400).json({ error });
    try {
      await ensure();
      const r = await pool.query(
        'INSERT INTO app_tasks (user_id,title,description,status,priority,record_ref) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [owner(req), value.title, value.description || null, value.status || 'todo', value.priority || 'normal', value.record_ref || null]);
      res.status(201).json(r.rows[0]);
    } catch (e) { res.status(503).json({ error: 'Task storage is unavailable. Check the database connection.' }); }
  });

  const update = async (req, res) => {
    const { error, value } = policy.validateTaskInput(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const keys = Object.keys(value);
    if (!keys.length) return res.status(400).json({ error: 'No task fields to update.' });
    try {
      await ensure();
      const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
      const r = await pool.query(`UPDATE app_tasks SET ${sets}, updated_at=NOW() WHERE id=$1 AND user_id=$${keys.length + 2} RETURNING *`,
        [req.params.id, ...keys.map((k) => value[k]), owner(req)]);
      if (!r.rows.length) return res.status(404).json({ error: 'Task not found.' });
      res.json(r.rows[0]);
    } catch (e) { res.status(503).json({ error: 'Task storage is unavailable. Check the database connection.' }); }
  };
  router.put('/:id', update);
  router.patch('/:id', update);

  // Domain AI over the caller's own task records. The provider is called only
  // when a key is configured; otherwise a labelled deterministic fallback is
  // returned (aiGenerated:false) — never presented as AI output.
  async function aiInsights(req, res, mode) {
    try {
      const tasks = await listTasks(req);
      if (!policy.hasProviderKey(process.env)) return res.json({ ...policy.fallbackInsights(tasks, DOMAIN_LABEL), mode });
      const { parsed, model } = await callProvider(process.env,
        `You are an assistant for ${DOMAIN_LABEL} work. Return JSON only with keys summary (string), prioritized (array of {title,reason}), nextActions (array of strings). Base everything only on the supplied records; do not invent records.`,
        JSON.stringify({ mode, tasks: tasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority, record_ref: t.record_ref })) }));
      const sections = policy.buildSections({
        total_tasks: tasks.length,
        open_tasks: tasks.filter((t) => t.status !== 'done').length,
        blocked_tasks: tasks.filter((t) => t.status === 'blocked').length,
        summary: parsed.summary || '',
      });
      res.json({ aiGenerated: true, provider: process.env.OPENROUTER_API_KEY ? 'openrouter' : 'openai', model, mode, ...parsed, sections });
    } catch (e) { res.status(e.status || 503).json({ error: e.message || 'AI insights are unavailable.' }); }
  }
  router.post('/ai/prioritize', (req, res) => aiInsights(req, res, 'prioritize'));
  router.post('/ai/summary', (req, res) => aiInsights(req, res, 'summary'));

module.exports = router;
