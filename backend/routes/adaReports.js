const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/ada-reports?page=1&limit=20
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [result, countResult] = await Promise.all([
      pool.query('SELECT * FROM ada_reports ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      pool.query('SELECT COUNT(*) FROM ada_reports'),
    ]);
    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Get ADA reports error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ada-reports/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ada_reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ADA report not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get ADA report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/ada-reports
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { client_id, report_type, compliance_level, summary, findings, recommendations, generated_by } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO ada_reports (id, client_id, report_type, compliance_level, summary, findings, recommendations, generated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, client_id, report_type, compliance_level, summary, JSON.stringify(findings), JSON.stringify(recommendations), generated_by]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create ADA report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/ada-reports/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { report_type, compliance_level, summary, findings, recommendations } = req.body;
    const result = await pool.query(
      'UPDATE ada_reports SET report_type = COALESCE($1, report_type), compliance_level = COALESCE($2, compliance_level), summary = COALESCE($3, summary), findings = COALESCE($4, findings), recommendations = COALESCE($5, recommendations) WHERE id = $6 RETURNING *',
      [report_type, compliance_level, summary, findings ? JSON.stringify(findings) : null, recommendations ? JSON.stringify(recommendations) : null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ADA report not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update ADA report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/ada-reports/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM ada_reports WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ADA report not found' });
    }
    res.json({ message: 'ADA report deleted successfully', report: result.rows[0] });
  } catch (err) {
    console.error('Delete ADA report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/ada-reports/:id/generate-ai
router.post('/:id/generate-ai', authenticateToken, async (req, res) => {
  try {
    const report = await pool.query('SELECT ar.*, c.name as client_name, c.website_url FROM ada_reports ar LEFT JOIN clients c ON ar.client_id = c.id WHERE ar.id = $1', [req.params.id]);
    if (report.rows.length === 0) {
      return res.status(404).json({ error: 'ADA report not found' });
    }

    const reportData = report.rows[0];
    const aiResult = await openRouter.generateReport(reportData.client_name, reportData.website_url, reportData.compliance_level, reportData.findings);

    const updated = await pool.query(
      'UPDATE ada_reports SET summary = $1, findings = $2, recommendations = $3, generated_by = $4 WHERE id = $5 RETURNING *',
      [aiResult.summary, JSON.stringify(aiResult.findings), JSON.stringify(aiResult.recommendations), 'ai', req.params.id]
    );

    // Persist AI result
    await pool.query(
      `INSERT INTO ai_results (id, entity_type, entity_id, endpoint, result_json, model, created_at)
       VALUES ($1, 'ada_report', $2, 'generate-ai', $3, $4, NOW())`,
      [uuidv4(), req.params.id, JSON.stringify(aiResult), process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
    ).catch(() => {});

    res.json({ report: updated.rows[0], ai_result: aiResult });
  } catch (err) {
    console.error('Generate AI report error:', err);
    res.status(err.statusCode || 500).json({ error: 'AI report generation failed: ' + err.message, missing: err.missing });
  }
});

// POST /api/ada-reports/:id/generate-vpat
router.post('/:id/generate-vpat', authenticateToken, async (req, res) => {
  try {
    const report = await pool.query(
      'SELECT ar.*, c.name as client_name, c.website_url FROM ada_reports ar LEFT JOIN clients c ON ar.client_id = c.id WHERE ar.id = $1',
      [req.params.id]
    );
    if (report.rows.length === 0) return res.status(404).json({ error: 'ADA report not found' });

    const reportData = report.rows[0];
    const vpat = await openRouter.generateVPAT(reportData.client_name, reportData.website_url, reportData.findings);

    await pool.query(
      `INSERT INTO ai_results (id, entity_type, entity_id, endpoint, result_json, model, created_at)
       VALUES ($1, 'ada_report', $2, 'generate-vpat', $3, $4, NOW())`,
      [uuidv4(), req.params.id, JSON.stringify(vpat), process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
    ).catch(() => {});

    res.json({ vpat, report_id: req.params.id });
  } catch (err) {
    console.error('VPAT generation error:', err);
    res.status(err.statusCode || 500).json({ error: 'VPAT generation failed: ' + err.message, missing: err.missing });
  }
});

module.exports = router;
