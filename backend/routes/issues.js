const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

async function writeAuditLog(action, entityId, details, userId) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id_text, details, performed_by)
       VALUES ($1, $2, 'issue', $3, $4, $5)`,
      [uuidv4(), action, entityId, JSON.stringify(details), userId || null]
    );
  } catch (_) {}
}

// GET /api/issues?page=1&limit=20&audit_id=&severity=&status=
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const { audit_id, severity, status } = req.query;

    const conditions = [];
    const params = [];

    if (audit_id) { conditions.push(`audit_id = $${params.length + 1}`); params.push(audit_id); }
    if (severity) { conditions.push(`severity = $${params.length + 1}`); params.push(severity); }
    if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM accessibility_issues ${where} ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'minor' THEN 3 ELSE 4 END, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const countQuery = `SELECT COUNT(*) FROM accessibility_issues ${where}`;

    const countParams = [...params];
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
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
router.post(
  '/',
  authenticateToken,
  [
    body('audit_id').notEmpty().withMessage('audit_id is required'),
    body('description').notEmpty().withMessage('description is required'),
    body('severity').optional().isIn(['critical', 'major', 'minor', 'info']).withMessage('Invalid severity'),
    body('status').optional().isIn(['open', 'in_progress', 'resolved']).withMessage('Invalid status'),
    body('type').optional().trim(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { audit_id, severity, type, description, element_selector, page_url, wcag_criterion, status } = req.body;
      const id = uuidv4();
      const result = await pool.query(
        `INSERT INTO accessibility_issues (id, audit_id, severity, type, description, element_selector, page_url, wcag_criterion, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, audit_id, severity || 'minor', type || 'general', description, element_selector, page_url, wcag_criterion, status || 'open']
      );
      await writeAuditLog('create_issue', id, { severity, type }, req.user.id);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create issue error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/issues/:id
router.put(
  '/:id',
  authenticateToken,
  [
    body('severity').optional().isIn(['critical', 'major', 'minor', 'info']).withMessage('Invalid severity'),
    body('status').optional().isIn(['open', 'in_progress', 'resolved']).withMessage('Invalid status'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { severity, type, description, element_selector, page_url, wcag_criterion, status } = req.body;
      const result = await pool.query(
        `UPDATE accessibility_issues
         SET severity = COALESCE($1, severity),
             type = COALESCE($2, type),
             description = COALESCE($3, description),
             element_selector = COALESCE($4, element_selector),
             page_url = COALESCE($5, page_url),
             wcag_criterion = COALESCE($6, wcag_criterion),
             status = COALESCE($7, status)
         WHERE id = $8 RETURNING *`,
        [severity, type, description, element_selector, page_url, wcag_criterion, status, req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Issue not found' });
      }
      await writeAuditLog('update_issue', req.params.id, { status }, req.user.id);
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update issue error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PATCH /api/issues/:id/status - Dedicated status update
router.patch(
  '/:id/status',
  authenticateToken,
  [
    body('status').isIn(['open', 'in_progress', 'resolved']).withMessage('status must be open, in_progress, or resolved'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { status, assigned_to, notes } = req.body;
      const result = await pool.query(
        'UPDATE accessibility_issues SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Issue not found' });
      await writeAuditLog('update_issue_status', req.params.id, { status, assigned_to, notes }, req.user.id);
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update status error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

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
      `INSERT INTO fix_suggestions (id, issue_id, suggestion_text, code_before, code_after, confidence_score, ai_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [fixId, req.params.id, aiResult.suggestion_text, aiResult.code_before, aiResult.code_after, aiResult.confidence_score, process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
    );

    // Persist AI result
    await pool.query(
      `INSERT INTO ai_results (id, entity_type, entity_id, endpoint, result_json, model, created_at)
       VALUES ($1, 'issue', $2, 'suggest-fix-ai', $3, $4, NOW())`,
      [uuidv4(), req.params.id, JSON.stringify(aiResult), process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
    ).catch(() => {});

    res.json({ fix: fix.rows[0], ai_result: aiResult });
  } catch (err) {
    console.error('Suggest fix AI error:', err);
    res.status(500).json({ error: 'AI fix suggestion failed: ' + err.message });
  }
});

module.exports = router;
