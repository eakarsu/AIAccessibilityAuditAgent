const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/color-contrast
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [result, countResult] = await Promise.all([
      pool.query('SELECT * FROM color_contrast_analyses ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      pool.query('SELECT COUNT(*) FROM color_contrast_analyses'),
    ]);
    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Get color contrast analyses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/color-contrast/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM color_contrast_analyses WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Color contrast analysis not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get color contrast analysis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/color-contrast
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, element_selector, foreground_color, background_color, contrast_ratio, wcag_aa_pass, wcag_aaa_pass, font_size } = req.body;
    if (!audit_id) {
      return res.status(400).json({ error: 'audit_id is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO color_contrast_analyses (id, audit_id, element_selector, foreground_color, background_color, contrast_ratio, wcag_aa_pass, wcag_aaa_pass, font_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id, audit_id, element_selector, foreground_color, background_color, contrast_ratio, wcag_aa_pass, wcag_aaa_pass, font_size]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create color contrast analysis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/color-contrast/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { element_selector, foreground_color, background_color, contrast_ratio, wcag_aa_pass, wcag_aaa_pass, font_size } = req.body;
    const result = await pool.query(
      'UPDATE color_contrast_analyses SET element_selector = COALESCE($1, element_selector), foreground_color = COALESCE($2, foreground_color), background_color = COALESCE($3, background_color), contrast_ratio = COALESCE($4, contrast_ratio), wcag_aa_pass = COALESCE($5, wcag_aa_pass), wcag_aaa_pass = COALESCE($6, wcag_aaa_pass), font_size = COALESCE($7, font_size) WHERE id = $8 RETURNING *',
      [element_selector, foreground_color, background_color, contrast_ratio, wcag_aa_pass, wcag_aaa_pass, font_size, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Color contrast analysis not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update color contrast analysis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/color-contrast/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM color_contrast_analyses WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Color contrast analysis not found' });
    }
    res.json({ message: 'Color contrast analysis deleted successfully', analysis: result.rows[0] });
  } catch (err) {
    console.error('Delete color contrast analysis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/color-contrast/analyze-ai
router.post('/analyze-ai', authenticateToken, async (req, res) => {
  try {
    const { audit_id, element_selector, foreground_color, background_color, font_size } = req.body;
    if (!foreground_color || !background_color) {
      return res.status(400).json({ error: 'foreground_color and background_color are required' });
    }

    const aiResult = await openRouter.analyzeContrast(foreground_color, background_color, font_size);

    let saved = null;
    if (audit_id) {
      const id = uuidv4();
      const result = await pool.query(
        'INSERT INTO color_contrast_analyses (id, audit_id, element_selector, foreground_color, background_color, contrast_ratio, wcag_aa_pass, wcag_aaa_pass, font_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [id, audit_id, element_selector, foreground_color, background_color, aiResult.contrast_ratio, aiResult.wcag_aa_pass, aiResult.wcag_aaa_pass, font_size]
      );
      saved = result.rows[0];
    }

    res.json({ analysis: saved, ai_result: aiResult });
  } catch (err) {
    console.error('Analyze contrast AI error:', err);
    res.status(500).json({ error: 'AI contrast analysis failed: ' + err.message });
  }
});

module.exports = router;
