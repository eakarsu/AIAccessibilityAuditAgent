const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// GET /api/clients?page=1&limit=20
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const search = req.query.search ? `%${req.query.search}%` : null;

    let query = 'SELECT * FROM clients';
    let countQuery = 'SELECT COUNT(*) FROM clients';
    const params = [];
    const countParams = [];

    if (search) {
      query += ' WHERE (name ILIKE $1 OR contact_email ILIKE $1 OR industry ILIKE $1)';
      countQuery += ' WHERE (name ILIKE $1 OR contact_email ILIKE $1 OR industry ILIKE $1)';
      params.push(search);
      countParams.push(search);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Get clients error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients
router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Name is required').trim(),
    body('contact_email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
    body('website_url').optional({ checkFalsy: true }).isURL().withMessage('Invalid website URL'),
    body('plan').optional().isIn(['basic', 'professional', 'enterprise']).withMessage('Invalid plan'),
    body('status').optional().isIn(['active', 'inactive', 'pending']).withMessage('Invalid status'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { name, website_url, industry, contact_email, contact_phone, plan, status } = req.body;
      const id = uuidv4();
      const result = await pool.query(
        `INSERT INTO clients (id, name, website_url, industry, contact_email, contact_phone, plan, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, name, website_url || null, industry || null, contact_email || null, contact_phone || null, plan || 'basic', status || 'active']
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create client error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/clients/:id
router.put(
  '/:id',
  authenticateToken,
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
    body('contact_email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
    body('website_url').optional({ checkFalsy: true }).isURL().withMessage('Invalid website URL'),
    body('plan').optional().isIn(['basic', 'professional', 'enterprise']).withMessage('Invalid plan'),
    body('status').optional().isIn(['active', 'inactive', 'pending']).withMessage('Invalid status'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { name, website_url, industry, contact_email, contact_phone, plan, status } = req.body;
      const result = await pool.query(
        `UPDATE clients
         SET name = COALESCE($1, name),
             website_url = COALESCE($2, website_url),
             industry = COALESCE($3, industry),
             contact_email = COALESCE($4, contact_email),
             contact_phone = COALESCE($5, contact_phone),
             plan = COALESCE($6, plan),
             status = COALESCE($7, status)
         WHERE id = $8 RETURNING *`,
        [name, website_url, industry, contact_email, contact_phone, plan, status, req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update client error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/clients/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ message: 'Client deleted successfully', client: result.rows[0] });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:id/badge - SVG accessibility score badge
router.get('/:id/badge', async (req, res) => {
  try {
    const audit = await pool.query(
      'SELECT overall_score FROM site_audits WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [req.params.id, 'completed']
    );
    const score = audit.rows[0]?.overall_score ?? 'N/A';
    const color = score === 'N/A' ? '#999' : score >= 80 ? '#4c1' : score >= 50 ? '#e05d44' : '#e05d44';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect rx="3" width="200" height="20" fill="#555"/>
  <rect rx="3" x="130" width="70" height="20" fill="${color}"/>
  <rect rx="3" width="200" height="20" fill="url(#b)"/>
  <text x="65" y="14" fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle">accessibility</text>
  <text x="165" y="14" fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle">${score}${score !== 'N/A' ? '/100' : ''}</text>
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'max-age=3600');
    res.send(svg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate badge' });
  }
});

// POST /api/clients/:id/schedule-audit
router.post(
  '/:id/schedule-audit',
  authenticateToken,
  [
    body('frequency').isIn(['daily', 'weekly', 'monthly']).withMessage('frequency must be daily, weekly, or monthly'),
    body('audit_type').optional().isIn(['full', 'quick', 'wcag-only', 'ada-only']),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const client = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
      if (client.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

      const { frequency, audit_type } = req.body;
      const id = uuidv4();

      // Store schedule in audit_logs table as a scheduled entry
      await pool.query(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id_text, details, performed_by)
         VALUES ($1, 'schedule_audit', 'client', $2, $3, $4)`,
        [id, req.params.id, JSON.stringify({ frequency, audit_type: audit_type || 'full' }), req.user.id]
      );

      res.status(201).json({
        message: `Audit scheduled ${frequency} for client ${client.rows[0].name}`,
        schedule_id: id,
        frequency,
        audit_type: audit_type || 'full',
        next_run: getNextRun(frequency),
      });
    } catch (err) {
      console.error('Schedule audit error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

function getNextRun(frequency) {
  const now = new Date();
  if (frequency === 'daily') now.setDate(now.getDate() + 1);
  else if (frequency === 'weekly') now.setDate(now.getDate() + 7);
  else now.setMonth(now.getMonth() + 1);
  return now.toISOString();
}

module.exports = router;
