const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/site-audits
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM site_audits ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get site audits error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/site-audits/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM site_audits WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site audit not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get site audit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/site-audits
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { client_id, url, audit_type } = req.body;
    if (!client_id || !url) {
      return res.status(400).json({ error: 'client_id and url are required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO site_audits (id, client_id, url, status, audit_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, client_id, url, 'pending', audit_type || 'full']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create site audit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/site-audits/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { url, status, overall_score, issues_found, pages_scanned, audit_type } = req.body;
    const result = await pool.query(
      'UPDATE site_audits SET url = COALESCE($1, url), status = COALESCE($2, status), overall_score = COALESCE($3, overall_score), issues_found = COALESCE($4, issues_found), pages_scanned = COALESCE($5, pages_scanned), audit_type = COALESCE($6, audit_type) WHERE id = $7 RETURNING *',
      [url, status, overall_score, issues_found, pages_scanned, audit_type, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site audit not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update site audit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/site-audits/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM site_audits WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site audit not found' });
    }
    res.json({ message: 'Site audit deleted successfully', audit: result.rows[0] });
  } catch (err) {
    console.error('Delete site audit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/site-audits/:id/run-ai
router.post('/:id/run-ai', authenticateToken, async (req, res) => {
  try {
    const audit = await pool.query('SELECT * FROM site_audits WHERE id = $1', [req.params.id]);
    if (audit.rows.length === 0) {
      return res.status(404).json({ error: 'Site audit not found' });
    }

    const auditData = audit.rows[0];
    await pool.query('UPDATE site_audits SET status = $1 WHERE id = $2', ['in_progress', req.params.id]);

    const aiResult = await openRouter.auditSite(auditData.url, auditData.audit_type);

    const updated = await pool.query(
      'UPDATE site_audits SET status = $1, overall_score = $2, issues_found = $3, pages_scanned = $4, completed_at = NOW() WHERE id = $5 RETURNING *',
      ['completed', aiResult.overall_score, aiResult.issues_found, aiResult.pages_scanned, req.params.id]
    );

    // Store issues in accessibility_issues table
    if (aiResult.issues && Array.isArray(aiResult.issues)) {
      for (const issue of aiResult.issues) {
        await pool.query(
          'INSERT INTO accessibility_issues (id, audit_id, severity, type, description, element_selector, page_url, wcag_criterion, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [uuidv4(), req.params.id, issue.severity, issue.type, issue.description, issue.element_selector, issue.page_url, issue.wcag_criterion, 'open']
        );
      }
    }

    res.json({ audit: updated.rows[0], ai_result: aiResult });
  } catch (err) {
    console.error('Run AI audit error:', err);
    await pool.query('UPDATE site_audits SET status = $1 WHERE id = $2', ['failed', req.params.id]).catch(() => {});
    res.status(500).json({ error: 'AI audit failed: ' + err.message });
  }
});

module.exports = router;
