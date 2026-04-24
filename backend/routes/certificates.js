const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /api/certificates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM compliance_certificates ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get certificates error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/certificates/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM compliance_certificates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/certificates
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { client_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO compliance_certificates (id, client_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, client_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status || 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/certificates/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { certificate_type, compliance_level, valid_from, valid_until, issued_by, status } = req.body;
    const result = await pool.query(
      'UPDATE compliance_certificates SET certificate_type = COALESCE($1, certificate_type), compliance_level = COALESCE($2, compliance_level), valid_from = COALESCE($3, valid_from), valid_until = COALESCE($4, valid_until), issued_by = COALESCE($5, issued_by), status = COALESCE($6, status) WHERE id = $7 RETURNING *',
      [certificate_type, compliance_level, valid_from, valid_until, issued_by, status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/certificates/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM compliance_certificates WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    res.json({ message: 'Certificate deleted successfully', certificate: result.rows[0] });
  } catch (err) {
    console.error('Delete certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
