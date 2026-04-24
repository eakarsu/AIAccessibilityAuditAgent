const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/screen-reader
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM screen_reader_tests ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get screen reader tests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/screen-reader/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM screen_reader_tests WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Screen reader test not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get screen reader test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/screen-reader
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, screen_reader, page_url, element_type, element_selector, expected_announcement, actual_result, status } = req.body;
    if (!audit_id) {
      return res.status(400).json({ error: 'audit_id is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO screen_reader_tests (id, audit_id, screen_reader, page_url, element_type, element_selector, expected_announcement, actual_result, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id, audit_id, screen_reader, page_url, element_type, element_selector, expected_announcement, actual_result, status || 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create screen reader test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/screen-reader/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { screen_reader, page_url, element_type, element_selector, expected_announcement, actual_result, status } = req.body;
    const result = await pool.query(
      'UPDATE screen_reader_tests SET screen_reader = COALESCE($1, screen_reader), page_url = COALESCE($2, page_url), element_type = COALESCE($3, element_type), element_selector = COALESCE($4, element_selector), expected_announcement = COALESCE($5, expected_announcement), actual_result = COALESCE($6, actual_result), status = COALESCE($7, status) WHERE id = $8 RETURNING *',
      [screen_reader, page_url, element_type, element_selector, expected_announcement, actual_result, status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Screen reader test not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update screen reader test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/screen-reader/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM screen_reader_tests WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Screen reader test not found' });
    }
    res.json({ message: 'Screen reader test deleted successfully', test: result.rows[0] });
  } catch (err) {
    console.error('Delete screen reader test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/screen-reader/test-ai
router.post('/test-ai', authenticateToken, async (req, res) => {
  try {
    const { audit_id, page_url, element_type, element_selector, screen_reader } = req.body;
    if (!page_url || !element_type || !element_selector) {
      return res.status(400).json({ error: 'page_url, element_type, and element_selector are required' });
    }

    const aiResult = await openRouter.testScreenReader(page_url, element_type, element_selector);

    let saved = null;
    if (audit_id) {
      const id = uuidv4();
      const result = await pool.query(
        'INSERT INTO screen_reader_tests (id, audit_id, screen_reader, page_url, element_type, element_selector, expected_announcement, actual_result, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [id, audit_id, screen_reader || 'AI Simulated', page_url, element_type, element_selector, aiResult.expected_announcement, aiResult.actual_result, aiResult.status]
      );
      saved = result.rows[0];
    }

    res.json({ test: saved, ai_result: aiResult });
  } catch (err) {
    console.error('Screen reader AI test error:', err);
    res.status(500).json({ error: 'AI screen reader test failed: ' + err.message });
  }
});

module.exports = router;
