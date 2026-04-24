const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/issues
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accessibility_issues ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get issues error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/issues/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accessibility_issues WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get issue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/issues
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, severity, type, description, element_selector, page_url, wcag_criterion, status } = req.body;
    if (!audit_id || !description) {
      return res.status(400).json({ error: 'audit_id and description are required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO accessibility_issues (id, audit_id, severity, type, description, element_selector, page_url, wcag_criterion, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id, audit_id, severity || 'minor', type, description, element_selector, page_url, wcag_criterion, status || 'open']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create issue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/issues/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { severity, type, description, element_selector, page_url, wcag_criterion, status } = req.body;
    const result = await pool.query(
      'UPDATE accessibility_issues SET severity = COALESCE($1, severity), type = COALESCE($2, type), description = COALESCE($3, description), element_selector = COALESCE($4, element_selector), page_url = COALESCE($5, page_url), wcag_criterion = COALESCE($6, wcag_criterion), status = COALESCE($7, status) WHERE id = $8 RETURNING *',
      [severity, type, description, element_selector, page_url, wcag_criterion, status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update issue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/issues/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM accessibility_issues WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    res.json({ message: 'Issue deleted successfully', issue: result.rows[0] });
  } catch (err) {
    console.error('Delete issue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/issues/:id/suggest-fix-ai
router.post('/:id/suggest-fix-ai', authenticateToken, async (req, res) => {
  try {
    const issue = await pool.query('SELECT * FROM accessibility_issues WHERE id = $1', [req.params.id]);
    if (issue.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const issueData = issue.rows[0];
    const aiResult = await openRouter.suggestFix(issueData.description, issueData.element_selector, issueData.wcag_criterion);

    const fixId = uuidv4();
    const fix = await pool.query(
      'INSERT INTO fix_suggestions (id, issue_id, suggestion_text, code_before, code_after, confidence_score, ai_model) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [fixId, req.params.id, aiResult.suggestion_text, aiResult.code_before, aiResult.code_after, aiResult.confidence_score, process.env.OPENROUTER_MODEL]
    );

    res.json({ fix: fix.rows[0], ai_result: aiResult });
  } catch (err) {
    console.error('Suggest fix AI error:', err);
    res.status(500).json({ error: 'AI fix suggestion failed: ' + err.message });
  }
});

module.exports = router;
