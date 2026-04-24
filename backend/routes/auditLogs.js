const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /api/audit-logs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
    res.json(result.rows);
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

module.exports = router;
