const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /api/clients
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json(result.rows);
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
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, website_url, industry, contact_email, contact_phone, plan, status } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO clients (id, name, website_url, industry, contact_email, contact_phone, plan, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, name, website_url, industry, contact_email, contact_phone, plan || 'basic', status || 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, website_url, industry, contact_email, contact_phone, plan, status } = req.body;
    const result = await pool.query(
      'UPDATE clients SET name = COALESCE($1, name), website_url = COALESCE($2, website_url), industry = COALESCE($3, industry), contact_email = COALESCE($4, contact_email), contact_phone = COALESCE($5, contact_phone), plan = COALESCE($6, plan), status = COALESCE($7, status) WHERE id = $8 RETURNING *',
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
});

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

module.exports = router;
