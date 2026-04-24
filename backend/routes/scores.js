const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /api/scores
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accessibility_scores ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get scores error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/scores/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accessibility_scores WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Score not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get score error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/scores
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, category, score, max_score, weight, details } = req.body;
    if (!audit_id || !category) {
      return res.status(400).json({ error: 'audit_id and category are required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO accessibility_scores (id, audit_id, category, score, max_score, weight, details) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, audit_id, category, score, max_score, weight, details ? JSON.stringify(details) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create score error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/scores/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { category, score, max_score, weight, details } = req.body;
    const result = await pool.query(
      'UPDATE accessibility_scores SET category = COALESCE($1, category), score = COALESCE($2, score), max_score = COALESCE($3, max_score), weight = COALESCE($4, weight), details = COALESCE($5, details) WHERE id = $6 RETURNING *',
      [category, score, max_score, weight, details ? JSON.stringify(details) : null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Score not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update score error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/scores/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM accessibility_scores WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Score not found' });
    }
    res.json({ message: 'Score deleted successfully', score: result.rows[0] });
  } catch (err) {
    console.error('Delete score error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
