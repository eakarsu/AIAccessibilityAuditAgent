const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/keyboard-nav
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [result, countResult] = await Promise.all([
      pool.query('SELECT * FROM keyboard_nav_tests ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      pool.query('SELECT COUNT(*) FROM keyboard_nav_tests'),
    ]);
    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Get keyboard nav tests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/keyboard-nav/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM keyboard_nav_tests WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Keyboard nav test not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get keyboard nav test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/keyboard-nav
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, page_url, element_selector, element_type, tab_order, is_focusable, has_visible_focus, keyboard_trap, status } = req.body;
    if (!audit_id) {
      return res.status(400).json({ error: 'audit_id is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO keyboard_nav_tests (id, audit_id, page_url, element_selector, element_type, tab_order, is_focusable, has_visible_focus, keyboard_trap, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [id, audit_id, page_url, element_selector, element_type, tab_order, is_focusable, has_visible_focus, keyboard_trap, status || 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create keyboard nav test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/keyboard-nav/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { page_url, element_selector, element_type, tab_order, is_focusable, has_visible_focus, keyboard_trap, status } = req.body;
    const result = await pool.query(
      'UPDATE keyboard_nav_tests SET page_url = COALESCE($1, page_url), element_selector = COALESCE($2, element_selector), element_type = COALESCE($3, element_type), tab_order = COALESCE($4, tab_order), is_focusable = COALESCE($5, is_focusable), has_visible_focus = COALESCE($6, has_visible_focus), keyboard_trap = COALESCE($7, keyboard_trap), status = COALESCE($8, status) WHERE id = $9 RETURNING *',
      [page_url, element_selector, element_type, tab_order, is_focusable, has_visible_focus, keyboard_trap, status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Keyboard nav test not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update keyboard nav test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/keyboard-nav/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM keyboard_nav_tests WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Keyboard nav test not found' });
    }
    res.json({ message: 'Keyboard nav test deleted successfully', test: result.rows[0] });
  } catch (err) {
    console.error('Delete keyboard nav test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/keyboard-nav/test-ai
router.post('/test-ai', authenticateToken, async (req, res) => {
  try {
    const { audit_id, page_url, element_selector, element_type } = req.body;
    if (!page_url || !element_selector || !element_type) {
      return res.status(400).json({ error: 'page_url, element_selector, and element_type are required' });
    }

    const aiResult = await openRouter.testKeyboardNav(page_url, element_selector, element_type);

    let saved = null;
    if (audit_id) {
      const id = uuidv4();
      const result = await pool.query(
        'INSERT INTO keyboard_nav_tests (id, audit_id, page_url, element_selector, element_type, tab_order, is_focusable, has_visible_focus, keyboard_trap, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [id, audit_id, page_url, element_selector, element_type, aiResult.tab_order, aiResult.is_focusable, aiResult.has_visible_focus, aiResult.keyboard_trap, aiResult.status]
      );
      saved = result.rows[0];
    }

    res.json({ test: saved, ai_result: aiResult });
  } catch (err) {
    console.error('Keyboard nav AI test error:', err);
    res.status(500).json({ error: 'AI keyboard nav test failed: ' + err.message });
  }
});

module.exports = router;
