const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/aria-validation
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aria_validations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get ARIA validations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/aria-validation/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aria_validations WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ARIA validation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get ARIA validation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/aria-validation
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, element_selector, aria_attribute, current_value, expected_value, is_valid, recommendation, severity } = req.body;
    if (!audit_id) {
      return res.status(400).json({ error: 'audit_id is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO aria_validations (id, audit_id, element_selector, aria_attribute, current_value, expected_value, is_valid, recommendation, severity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id, audit_id, element_selector, aria_attribute, current_value, expected_value, is_valid, recommendation, severity]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create ARIA validation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/aria-validation/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { element_selector, aria_attribute, current_value, expected_value, is_valid, recommendation, severity } = req.body;
    const result = await pool.query(
      'UPDATE aria_validations SET element_selector = COALESCE($1, element_selector), aria_attribute = COALESCE($2, aria_attribute), current_value = COALESCE($3, current_value), expected_value = COALESCE($4, expected_value), is_valid = COALESCE($5, is_valid), recommendation = COALESCE($6, recommendation), severity = COALESCE($7, severity) WHERE id = $8 RETURNING *',
      [element_selector, aria_attribute, current_value, expected_value, is_valid, recommendation, severity, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ARIA validation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update ARIA validation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/aria-validation/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM aria_validations WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ARIA validation not found' });
    }
    res.json({ message: 'ARIA validation deleted successfully', validation: result.rows[0] });
  } catch (err) {
    console.error('Delete ARIA validation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/aria-validation/validate-ai
router.post('/validate-ai', authenticateToken, async (req, res) => {
  try {
    const { audit_id, element_selector, aria_attribute, current_value } = req.body;
    if (!element_selector || !aria_attribute) {
      return res.status(400).json({ error: 'element_selector and aria_attribute are required' });
    }

    const aiResult = await openRouter.validateAria(element_selector, aria_attribute, current_value);

    let saved = null;
    if (audit_id) {
      const id = uuidv4();
      const result = await pool.query(
        'INSERT INTO aria_validations (id, audit_id, element_selector, aria_attribute, current_value, expected_value, is_valid, recommendation, severity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [id, audit_id, element_selector, aria_attribute, current_value, aiResult.expected_value, aiResult.is_valid, aiResult.recommendation, aiResult.severity]
      );
      saved = result.rows[0];
    }

    res.json({ validation: saved, ai_result: aiResult });
  } catch (err) {
    console.error('ARIA validation AI error:', err);
    res.status(500).json({ error: 'AI ARIA validation failed: ' + err.message });
  }
});

module.exports = router;
