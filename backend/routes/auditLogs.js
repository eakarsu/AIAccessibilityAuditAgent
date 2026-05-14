const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /api/audit-logs?page=1&limit=20&entity_type=&action=
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { entity_type, action } = req.query;

    const conditions = [];
    const params = [];
    if (entity_type) { conditions.push(`entity_type = $${params.length + 1}`); params.push(entity_type); }
    if (action) { conditions.push(`action = $${params.length + 1}`); params.push(action); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      pool.query(`SELECT COUNT(*) FROM audit_logs ${where}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/audit-logs/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Audit log not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/audit-logs - Manual log entry (admin only)
router.post(
  '/',
  authenticateToken,
  [
    body('action').notEmpty().withMessage('action is required'),
    body('entity_type').notEmpty().withMessage('entity_type is required'),
  ],
  async (req, res) => {
    if (validationResult(req).isEmpty() === false) {
      return res.status(400).json({ errors: validationResult(req).array() });
    }
    try {
      const { action, entity_type, entity_id, details } = req.body;
      const id = uuidv4();
      const result = await pool.query(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id_text, details, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, action, entity_type, entity_id ? String(entity_id) : null, JSON.stringify(details || {}), String(req.user.id)]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create audit log error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
