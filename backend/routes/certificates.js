const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /api/certificates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [result, countResult] = await Promise.all([
      pool.query('SELECT * FROM compliance_certificates ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      pool.query('SELECT COUNT(*) FROM compliance_certificates'),
    ]);
    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Get certificates error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/certificates/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM compliance_certificates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/certificates
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { client_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO compliance_certificates (id, client_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, client_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status || 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/certificates/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { certificate_type, compliance_level, valid_from, valid_until, issued_by, status } = req.body;
    const result = await pool.query(
      'UPDATE compliance_certificates SET certificate_type = COALESCE($1, certificate_type), compliance_level = COALESCE($2, compliance_level), valid_from = COALESCE($3, valid_from), valid_until = COALESCE($4, valid_until), issued_by = COALESCE($5, issued_by), status = COALESCE($6, status) WHERE id = $7 RETURNING *',
      [certificate_type, compliance_level, valid_from, valid_until, issued_by, status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/certificates/:siteId/generate - ADA compliance certificate generator
router.get('/:siteId/generate', authenticateToken, async (req, res) => {
  try {
    const { siteId } = req.params;

    // Fetch latest completed audit for this site (by id or url match)
    const auditResult = await pool.query(
      `SELECT sa.*, c.name as client_name
       FROM site_audits sa
       LEFT JOIN clients c ON sa.client_id = c.id
       WHERE (sa.id = $1 OR sa.client_id = $1)
         AND sa.status = 'completed'
         AND sa.overall_score IS NOT NULL
       ORDER BY sa.completed_at DESC
       LIMIT 1`,
      [siteId]
    );

    if (auditResult.rows.length === 0) {
      return res.status(404).json({ error: 'No completed audit found for this site' });
    }

    const audit = auditResult.rows[0];
    const score = parseFloat(audit.overall_score);

    if (score < 85) {
      return res.status(403).json({
        error: `Site score is ${score.toFixed(1)}/100. A score of 85 or above is required to generate a certificate.`,
        score,
      });
    }

    const auditDate = audit.completed_at ? new Date(audit.completed_at) : new Date();
    const validUntil = new Date(auditDate);
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    const formatDate = (d) => d.toISOString().split('T')[0];

    // Render with the maintained Puppeteer dependency used by the audit routes.
    let pdfBuffer = null;
    let browser = null;
    try {
      const puppeteer = require('puppeteer');
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ADA Compliance Certificate</title>
  <style>
    body { font-family: Georgia, serif; margin: 0; padding: 40px; background: #fff; color: #222; }
    .certificate { border: 8px double #2563eb; padding: 40px; max-width: 720px; margin: 0 auto; text-align: center; }
    .logo { font-size: 2rem; color: #2563eb; margin-bottom: 8px; }
    h1 { font-size: 2.2rem; color: #1e3a8a; margin: 0 0 8px; letter-spacing: 2px; }
    .subtitle { font-size: 1rem; color: #64748b; margin-bottom: 24px; }
    .site-name { font-size: 1.5rem; font-weight: bold; color: #0f172a; margin: 16px 0; }
    .score { font-size: 3rem; font-weight: bold; color: #16a34a; margin: 12px 0; }
    .score-label { font-size: 0.9rem; color: #64748b; }
    .details { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: left; }
    .details p { margin: 6px 0; font-size: 0.95rem; }
    .valid { font-size: 0.85rem; color: #64748b; margin-top: 24px; }
    .seal { font-size: 4rem; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="logo">AI Accessibility Audit Agent</div>
    <h1>ADA Compliance Certificate</h1>
    <div class="subtitle">Web Accessibility Compliance - WCAG 2.1</div>
    <div class="seal">🏆</div>
    <p>This certifies that</p>
    <div class="site-name">${audit.url}</div>
    ${audit.client_name ? `<p>Client: <strong>${audit.client_name}</strong></p>` : ''}
    <p>has been audited and meets ADA web accessibility standards.</p>
    <div class="score">${score.toFixed(1)}<span style="font-size:1.5rem">/100</span></div>
    <div class="score-label">Accessibility Score</div>
    <div class="details">
      <p><strong>Audit Date:</strong> ${formatDate(auditDate)}</p>
      <p><strong>Certificate Valid Until:</strong> ${formatDate(validUntil)}</p>
      <p><strong>Audit Type:</strong> ${audit.audit_type || 'Full Accessibility Audit'}</p>
      <p><strong>Pages Scanned:</strong> ${audit.pages_scanned || 'N/A'}</p>
      <p><strong>Issues Found:</strong> ${audit.issues_found || 0}</p>
    </div>
    <div class="valid">This certificate is valid for one year from the audit date and should be renewed with a new audit annually.</div>
  </div>
</body>
</html>`;

      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      pdfBuffer = Buffer.from(await page.pdf({ format: 'A4' }));
    } catch (pdfErr) {
      console.warn('PDF generation unavailable:', pdfErr.message);
    } finally {
      if (browser) await browser.close();
    }

    // Save certificate record
    try {
      const { v4: uuidv4 } = require('uuid');
      await pool.query(
        `INSERT INTO compliance_certificates (id, client_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status)
         VALUES ($1, $2, 'ada_compliance', 'AA', $3, $4, 'AI Accessibility Audit Agent', 'active')
         ON CONFLICT DO NOTHING`,
        [uuidv4(), audit.client_id, formatDate(auditDate), formatDate(validUntil)]
      );
    } catch (_) {}

    if (pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ada-certificate-${siteId}.pdf"`);
      return res.send(pdfBuffer);
    }

    // HTML fallback
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ADA Compliance Certificate</title>
  <style>
    body { font-family: Georgia, serif; margin: 0; padding: 40px; background: #f0f4ff; }
    .certificate { border: 8px double #2563eb; padding: 40px; max-width: 720px; margin: 40px auto; background: #fff; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
    h1 { font-size: 2.2rem; color: #1e3a8a; letter-spacing: 2px; }
    .score { font-size: 3rem; font-weight: bold; color: #16a34a; }
    .details { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: left; }
    .details p { margin: 6px 0; }
  </style>
</head>
<body>
  <div class="certificate">
    <h1>ADA Compliance Certificate</h1>
    <p>WCAG 2.1 Web Accessibility</p>
    <p>Awarded to: <strong>${audit.url}</strong></p>
    <div class="score">${score.toFixed(1)}/100</div>
    <div class="details">
      <p><strong>Audit Date:</strong> ${formatDate(auditDate)}</p>
      <p><strong>Valid Until:</strong> ${formatDate(validUntil)}</p>
      <p><strong>Audit Type:</strong> ${audit.audit_type || 'Full'}</p>
    </div>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('Generate certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/certificates/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM compliance_certificates WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    res.json({ message: 'Certificate deleted successfully', certificate: result.rows[0] });
  } catch (err) {
    console.error('Delete certificate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
