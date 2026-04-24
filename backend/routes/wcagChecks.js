const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/wcag-checks
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wcag_checks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get wcag checks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wcag-checks/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wcag_checks WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'WCAG check not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get wcag check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wcag-checks
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, criterion, level, status, description, element_selector, recommendation } = req.body;
    if (!audit_id || !criterion) {
      return res.status(400).json({ error: 'audit_id and criterion are required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO wcag_checks (id, audit_id, criterion, level, status, description, element_selector, recommendation) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, audit_id, criterion, level || 'AA', status || 'pending', description, element_selector, recommendation]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create wcag check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/wcag-checks/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { criterion, level, status, description, element_selector, recommendation } = req.body;
    const result = await pool.query(
      'UPDATE wcag_checks SET criterion = COALESCE($1, criterion), level = COALESCE($2, level), status = COALESCE($3, status), description = COALESCE($4, description), element_selector = COALESCE($5, element_selector), recommendation = COALESCE($6, recommendation) WHERE id = $7 RETURNING *',
      [criterion, level, status, description, element_selector, recommendation, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'WCAG check not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update wcag check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/wcag-checks/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM wcag_checks WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'WCAG check not found' });
    }
    res.json({ message: 'WCAG check deleted successfully', check: result.rows[0] });
  } catch (err) {
    console.error('Delete wcag check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wcag-checks/:id/evaluate-ai
router.post('/:id/evaluate-ai', authenticateToken, async (req, res) => {
  try {
    const check = await pool.query('SELECT wc.*, sa.url as page_url FROM wcag_checks wc LEFT JOIN site_audits sa ON wc.audit_id = sa.id WHERE wc.id = $1', [req.params.id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'WCAG check not found' });
    }

    const checkData = check.rows[0];
    const aiResult = await openRouter.evaluateWcag(checkData.criterion, checkData.level, checkData.element_selector, checkData.page_url);

    const updated = await pool.query(
      'UPDATE wcag_checks SET status = $1, description = $2, recommendation = $3 WHERE id = $4 RETURNING *',
      [aiResult.status, aiResult.description, aiResult.recommendation, req.params.id]
    );

    res.json({ check: updated.rows[0], ai_result: aiResult });
  } catch (err) {
    console.error('Evaluate WCAG AI error:', err);
    res.status(500).json({ error: 'AI evaluation failed: ' + err.message });
  }
});

module.exports = router;
