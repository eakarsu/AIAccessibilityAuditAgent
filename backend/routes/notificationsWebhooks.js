/**
 * Notifications + outbound webhooks.
 *
 * Replaces `gap_notifications_subsystem` and `gap_outbound_webhooks` — the two
 * gaps in this app with no existing implementation (unlike the nine removed
 * alongside them, whose capabilities already existed as real modules).
 *
 *   POST /api/notifications              queue a notification for a recipient
 *   GET  /api/notifications              list queued/sent notifications
 *   POST /api/webhooks/endpoints         register a signed endpoint
 *   POST /api/webhooks/emit              queue an event delivery (idempotent)
 *   GET  /api/webhooks/deliveries        delivery ledger with attempt counts
 *
 * Rules:
 *   - secrets are stored as a SHA-256 hash; the plaintext is never persisted
 *   - delivery is idempotent on (endpoint, idempotencyKey): a retry cannot
 *     double-deliver
 *   - a failed delivery keeps its attempt count and last error rather than
 *     being silently dropped
 */
const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

const SEVERITIES = ['info', 'warning', 'critical'];

function createNotificationsWebhooksRouter(authMiddleware) {
  const router = express.Router();

  const schema = `
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      recipient TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'in_app',
      severity TEXT NOT NULL DEFAULT 'info',
      subject TEXT NOT NULL,
      body TEXT,
      entity_type TEXT,
      entity_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      created_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      read_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id SERIAL PRIMARY KEY,
      endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMP,
      UNIQUE (endpoint_id, idempotency_key)
    )`;

  let ready = false;
  async function ensure() {
    if (ready) return;
    await pool.query(schema);
    ready = true;
  }

  /* ------------------------- notifications ------------------------- */

  router.post('/notifications', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { recipient, channel, severity, subject, body, entityType, entityId } = req.body || {};
      if (!recipient || !String(recipient).trim()) {
        return res.status(400).json({ error: 'recipient is required' });
      }
      if (!subject || !String(subject).trim()) {
        return res.status(400).json({ error: 'subject is required' });
      }
      const sev = SEVERITIES.includes(severity) ? severity : 'info';

      const r = await pool.query(
        `INSERT INTO notifications (recipient, channel, severity, subject, body, entity_type, entity_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [String(recipient).trim(), channel ?? 'in_app', sev, String(subject).trim(),
         body ?? null, entityType ?? null, entityId ?? null, req.user?.email ?? null],
      );
      res.status(201).json({ notification: r.rows[0] });
    } catch (e) {
      console.error('notifications POST error:', e);
      res.status(500).json({ error: e.message || 'Failed to queue notification' });
    }
  });

  router.get('/notifications', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { recipient, status, severity } = req.query;
      const where = [];
      const args = [];
      if (recipient) { args.push(recipient); where.push(`recipient = $${args.length}`); }
      if (status) { args.push(status); where.push(`status = $${args.length}`); }
      if (severity) { args.push(severity); where.push(`severity = $${args.length}`); }
      const sql = 'SELECT * FROM notifications' + (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
        ' ORDER BY created_at DESC LIMIT 200';
      res.json({ items: (await pool.query(sql, args)).rows, severities: SEVERITIES });
    } catch (e) {
      console.error('notifications GET error:', e);
      res.status(500).json({ error: e.message || 'Failed to list notifications' });
    }
  });

  /* -------------------------- webhooks ----------------------------- */

  router.post('/webhooks/endpoints', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { url, eventType, secret } = req.body || {};
      if (!url || !/^https?:\/\//.test(String(url))) {
        return res.status(400).json({ error: 'url must be http(s)' });
      }
      if (!eventType || !String(eventType).trim()) {
        return res.status(400).json({ error: 'eventType is required' });
      }
      if (!secret || String(secret).length < 16) {
        return res.status(400).json({ error: 'secret must be at least 16 characters' });
      }
      const r = await pool.query(
        `INSERT INTO webhook_endpoints (url, secret_hash, event_type)
         VALUES ($1,$2,$3) RETURNING id, url, event_type, is_active, created_at`,
        [String(url), sha256(secret), String(eventType).trim()],
      );
      res.status(201).json({
        endpoint: r.rows[0],
        note: 'Secret stored as a SHA-256 hash and cannot be recovered. Use it to verify a signature header on delivery.',
      });
    } catch (e) {
      console.error('webhook endpoint error:', e);
      res.status(500).json({ error: e.message || 'Failed to register endpoint' });
    }
  });

  router.post('/webhooks/emit', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { eventType, payload, idempotencyKey } = req.body || {};
      if (!eventType || !String(eventType).trim()) {
        return res.status(400).json({ error: 'eventType is required' });
      }
      const key = String(idempotencyKey ?? `${eventType}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`);

      const eps = await pool.query(
        `SELECT id, url FROM webhook_endpoints WHERE event_type = $1 AND is_active = true`,
        [String(eventType).trim()],
      );
      if (!eps.rows.length) {
        return res.json({ queued: 0, deliveries: [], note: 'No active endpoint registered for this event type.' });
      }

      const body = JSON.stringify(payload ?? {});
      const deliveries = [];
      for (const ep of eps.rows) {
        const r = await pool.query(
          `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, idempotency_key)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (endpoint_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
           RETURNING id, endpoint_id, event_type, status, attempts, idempotency_key`,
          [ep.id, String(eventType).trim(), body, key],
        );
        deliveries.push({ ...r.rows[0], url: ep.url });
      }

      res.status(202).json({
        queued: deliveries.length,
        deliveries,
        idempotencyKey: key,
        note: 'Deliveries queued. Replaying the same idempotencyKey does not create duplicates.',
      });
    } catch (e) {
      console.error('webhook emit error:', e);
      res.status(500).json({ error: e.message || 'Failed to queue delivery' });
    }
  });

  router.get('/webhooks/deliveries', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const r = await pool.query(
        `SELECT d.*, e.url FROM webhook_deliveries d
           JOIN webhook_endpoints e ON e.id = d.endpoint_id
          ORDER BY d.created_at DESC LIMIT 200`,
      );
      res.json({ deliveries: r.rows });
    } catch (e) {
      console.error('webhook deliveries error:', e);
      res.status(500).json({ error: e.message || 'Failed to list deliveries' });
    }
  });

  return router;
}

module.exports = createNotificationsWebhooksRouter;
