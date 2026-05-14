const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/fix-suggestions?page=1&limit=20
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [result, countResult] = await Promise.all([
      pool.query('SELECT * FROM fix_suggestions ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      pool.query('SELECT COUNT(*) FROM fix_suggestions'),
    ]);
    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Get fix suggestions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/fix-suggestions/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fix_suggestions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fix suggestion not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get fix suggestion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/fix-suggestions
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { issue_id, suggestion_text, code_before, code_after, confidence_score, ai_model } = req.body;
    if (!issue_id || !suggestion_text) {
      return res.status(400).json({ error: 'issue_id and suggestion_text are required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO fix_suggestions (id, issue_id, suggestion_text, code_before, code_after, confidence_score, ai_model) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, issue_id, suggestion_text, code_before, code_after, confidence_score, ai_model]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create fix suggestion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/fix-suggestions/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { suggestion_text, code_before, code_after, confidence_score } = req.body;
    const result = await pool.query(
      'UPDATE fix_suggestions SET suggestion_text = COALESCE($1, suggestion_text), code_before = COALESCE($2, code_before), code_after = COALESCE($3, code_after), confidence_score = COALESCE($4, confidence_score) WHERE id = $5 RETURNING *',
      [suggestion_text, code_before, code_after, confidence_score, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fix suggestion not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update fix suggestion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/fix-suggestions/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM fix_suggestions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fix suggestion not found' });
    }
    res.json({ message: 'Fix suggestion deleted successfully', suggestion: result.rows[0] });
  } catch (err) {
    console.error('Delete fix suggestion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/fix-suggestions/generate-ai
router.post('/generate-ai', authenticateToken, async (req, res) => {
  try {
    const { issue_id } = req.body;
    if (!issue_id) {
      return res.status(400).json({ error: 'issue_id is required' });
    }

    const issue = await pool.query('SELECT * FROM accessibility_issues WHERE id = $1', [issue_id]);
    if (issue.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const issueData = issue.rows[0];
    const aiResult = await openRouter.suggestFix(issueData.description, issueData.element_selector, issueData.wcag_criterion);

    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO fix_suggestions (id, issue_id, suggestion_text, code_before, code_after, confidence_score, ai_model) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, issue_id, aiResult.suggestion_text, aiResult.code_before, aiResult.code_after, aiResult.confidence_score, process.env.OPENROUTER_MODEL]
    );

    res.json({ suggestion: result.rows[0], ai_result: aiResult });
  } catch (err) {
    console.error('Generate fix AI error:', err);
    res.status(500).json({ error: 'AI fix generation failed: ' + err.message });
  }
});

module.exports = router;
