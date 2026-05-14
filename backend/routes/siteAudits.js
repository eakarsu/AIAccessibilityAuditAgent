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

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// Try to crawl URL with Puppeteer; returns accessibility attributes or null on failure
async function crawlWithPuppeteer(url) {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(15000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const accessibilityData = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const data = [];
      let count = 0;
      elements.forEach(el => {
        if (count >= 200) return;
        const attrs = {};
        const accessibilityAttrs = ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
          'aria-expanded', 'aria-controls', 'aria-live', 'aria-atomic', 'aria-relevant',
          'aria-required', 'aria-invalid', 'aria-checked', 'aria-selected', 'aria-pressed',
          'role', 'alt', 'tabindex', 'lang', 'for', 'title'];
        accessibilityAttrs.forEach(attr => {
          const val = el.getAttribute(attr);
          if (val !== null) attrs[attr] = val;
        });
        if (Object.keys(attrs).length > 0) {
          data.push({ tag: el.tagName.toLowerCase(), attrs });
          count++;
        }
      });
      return { title: document.title, lang: document.documentElement.getAttribute('lang'), elements: data };
    });

    await browser.close();
    return accessibilityData;
  } catch (err) {
    console.warn('Puppeteer crawl failed, falling back to URL-only analysis:', err.message);
    return null;
  }
}

// Write audit log helper
async function writeAuditLog(action, entityType, entityId, details, userId) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id_text, details, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), action, entityType, entityId, JSON.stringify(details), userId || null]
    );
  } catch (_) {}
}

// GET /api/site-audits?page=1&limit=20&client_id=&status=
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const { client_id, status } = req.query;

    const conditions = [];
    const params = [];

    if (client_id) { conditions.push(`client_id = $${params.length + 1}`); params.push(client_id); }
    if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM site_audits ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const countQuery = `SELECT COUNT(*) FROM site_audits ${where}`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
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
router.post(
  '/',
  authenticateToken,
  [
    body('url').notEmpty().withMessage('url is required')
      .custom((val) => {
        if (!isValidUrl(val)) throw new Error('url must be a valid http or https URL');
        return true;
      }),
    body('client_id').notEmpty().withMessage('client_id is required'),
    body('audit_type').optional().isIn(['full', 'quick', 'wcag-only', 'ada-only']).withMessage('Invalid audit_type'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { client_id, url, audit_type } = req.body;
      const id = uuidv4();
      const result = await pool.query(
        'INSERT INTO site_audits (id, client_id, url, status, audit_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, client_id, url, 'pending', audit_type || 'full']
      );
      await writeAuditLog('create_audit', 'site_audit', id, { url, audit_type }, req.user.id);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create site audit error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/site-audits/:id
router.put(
  '/:id',
  authenticateToken,
  [
    body('url').optional().custom((val) => {
      if (val && !isValidUrl(val)) throw new Error('url must be a valid http or https URL');
      return true;
    }),
    body('status').optional().isIn(['pending', 'in_progress', 'completed', 'failed']).withMessage('Invalid status'),
    body('overall_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Score must be 0-100'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { url, status, overall_score, issues_found, pages_scanned, audit_type } = req.body;
      const result = await pool.query(
        `UPDATE site_audits
         SET url = COALESCE($1, url),
             status = COALESCE($2, status),
             overall_score = COALESCE($3, overall_score),
             issues_found = COALESCE($4, issues_found),
             pages_scanned = COALESCE($5, pages_scanned),
             audit_type = COALESCE($6, audit_type)
         WHERE id = $7 RETURNING *`,
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
  }
);

// DELETE /api/site-audits/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM site_audits WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site audit not found' });
    }
    await writeAuditLog('delete_audit', 'site_audit', req.params.id, { url: result.rows[0].url }, req.user.id);
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

    let aiResult;
    const crawledData = await crawlWithPuppeteer(auditData.url);

    if (crawledData) {
      aiResult = await openRouter.auditSiteWithDom(auditData.url, auditData.audit_type, crawledData);
    } else {
      aiResult = await openRouter.auditSite(auditData.url, auditData.audit_type);
    }

    const updated = await pool.query(
      'UPDATE site_audits SET status = $1, overall_score = $2, issues_found = $3, pages_scanned = $4, completed_at = NOW() WHERE id = $5 RETURNING *',
      ['completed', aiResult.overall_score, aiResult.issues_found, aiResult.pages_scanned, req.params.id]
    );

    // Store issues
    if (aiResult.issues && Array.isArray(aiResult.issues)) {
      for (const issue of aiResult.issues) {
        const issueId = uuidv4();
        await pool.query(
          `INSERT INTO accessibility_issues (id, audit_id, severity, type, description, element_selector, page_url, wcag_criterion, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [issueId, req.params.id, issue.severity, issue.type, issue.description, issue.element_selector, issue.page_url, issue.wcag_criterion, 'open']
        );
      }
    }

    // Auto-generate accessibility score breakdown
    const categories = { perceivable: 0, operable: 0, understandable: 0, robust: 0 };
    const counts = { perceivable: 0, operable: 0, understandable: 0, robust: 0 };
    (aiResult.issues || []).forEach(issue => {
      const crit = (issue.wcag_criterion || '').toLowerCase();
      const sev = issue.severity === 'critical' ? 20 : issue.severity === 'major' ? 10 : 5;
      if (crit.startsWith('1.')) { categories.perceivable += sev; counts.perceivable++; }
      else if (crit.startsWith('2.')) { categories.operable += sev; counts.operable++; }
      else if (crit.startsWith('3.')) { categories.understandable += sev; counts.understandable++; }
      else if (crit.startsWith('4.')) { categories.robust += sev; counts.robust++; }
    });
    for (const [cat, deduction] of Object.entries(categories)) {
      const catScore = Math.max(0, 100 - deduction);
      await pool.query(
        `INSERT INTO accessibility_scores (id, audit_id, category, score, max_score, weight)
         VALUES ($1, $2, $3, $4, 100, 25)
         ON CONFLICT DO NOTHING`,
        [uuidv4(), req.params.id, cat, catScore]
      ).catch(() => {});
    }

    // Auto-issue compliance certificate if score >= 85 and no critical issues
    const hasCritical = (aiResult.issues || []).some(i => i.severity === 'critical');
    if ((aiResult.overall_score || 0) >= 85 && !hasCritical) {
      const certId = uuidv4();
      const validUntil = new Date();
      validUntil.setFullYear(validUntil.getFullYear() + 1);
      await pool.query(
        `INSERT INTO compliance_certificates (id, client_id, audit_id, certificate_type, compliance_level, valid_from, valid_until, issued_by, status)
         VALUES ($1, $2, $3, 'wcag-2.1-aa', 'AA', NOW(), $4, 'AI Audit System', 'active')
         ON CONFLICT DO NOTHING`,
        [certId, auditData.client_id, req.params.id, validUntil.toISOString()]
      ).catch(() => {});
    }

    // Persist AI result
    await pool.query(
      `INSERT INTO ai_results (id, entity_type, entity_id, endpoint, result_json, model, created_at)
       VALUES ($1, 'site_audit', $2, 'run-ai', $3, $4, NOW())`,
      [uuidv4(), req.params.id, JSON.stringify(aiResult), process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
    ).catch(() => {});

    await writeAuditLog('run_ai_audit', 'site_audit', req.params.id, { score: aiResult.overall_score }, req.user.id);

    res.json({ audit: updated.rows[0], ai_result: aiResult, crawled: !!crawledData });
  } catch (err) {
    console.error('Run AI audit error:', err);
    await pool.query('UPDATE site_audits SET status = $1 WHERE id = $2', ['failed', req.params.id]).catch(() => {});
    res.status(500).json({ error: 'AI audit failed: ' + err.message });
  }
});

// GET /api/site-audits/:id/diff - Compare current vs previous audit
router.get('/:id/diff', authenticateToken, async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM site_audits WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Audit not found' });

    const prev = await pool.query(
      `SELECT * FROM site_audits WHERE client_id = $1 AND status = 'completed' AND created_at < $2 ORDER BY created_at DESC LIMIT 1`,
      [current.rows[0].client_id, current.rows[0].created_at]
    );

    const currentIssues = await pool.query(
      'SELECT * FROM accessibility_issues WHERE audit_id = $1', [req.params.id]
    );

    let prevIssues = { rows: [] };
    if (prev.rows.length > 0) {
      prevIssues = await pool.query(
        'SELECT * FROM accessibility_issues WHERE audit_id = $1', [prev.rows[0].id]
      );
    }

    const currentTypes = new Set(currentIssues.rows.map(i => `${i.type}:${i.element_selector}`));
    const prevTypes = new Set(prevIssues.rows.map(i => `${i.type}:${i.element_selector}`));

    const newIssues = currentIssues.rows.filter(i => !prevTypes.has(`${i.type}:${i.element_selector}`));
    const resolvedIssues = prevIssues.rows.filter(i => !currentTypes.has(`${i.type}:${i.element_selector}`));

    const scoreDelta = prev.rows.length > 0
      ? ((current.rows[0].overall_score || 0) - (prev.rows[0].overall_score || 0))
      : null;

    res.json({
      current_audit: current.rows[0],
      previous_audit: prev.rows[0] || null,
      score_delta: scoreDelta,
      new_issues: newIssues,
      resolved_issues: resolvedIssues,
      regression: newIssues.filter(i => i.severity === 'critical' || i.severity === 'major'),
      summary: prev.rows.length === 0
        ? 'No previous audit to compare against.'
        : `Score ${scoreDelta >= 0 ? '+' : ''}${scoreDelta?.toFixed(1)} | ${newIssues.length} new issues | ${resolvedIssues.length} resolved`,
    });
  } catch (err) {
    console.error('Diff error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/site-audits/:id/crawl - Multi-page crawler
router.post('/:id/crawl', authenticateToken, async (req, res) => {
  try {
    const audit = await pool.query('SELECT * FROM site_audits WHERE id = $1', [req.params.id]);
    if (audit.rows.length === 0) return res.status(404).json({ error: 'Audit not found' });

    const maxPages = Math.min(parseInt(req.body.max_pages) || 5, 10);
    const auditData = audit.rows[0];

    let puppeteer;
    try { puppeteer = require('puppeteer'); } catch (_) {
      return res.status(500).json({ error: 'Puppeteer not available' });
    }

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const visited = new Set();
    const toVisit = [auditData.url];
    const baseUrl = new URL(auditData.url).origin;
    const pageResults = [];

    while (toVisit.length > 0 && visited.size < maxPages) {
      const url = toVisit.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(15000);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const data = await page.evaluate(() => {
          const elements = [];
          document.querySelectorAll('[aria-label],[aria-labelledby],[role],[alt],[tabindex]').forEach(el => {
            const attrs = {};
            ['aria-label','aria-labelledby','role','alt','tabindex','aria-required','aria-hidden'].forEach(a => {
              const v = el.getAttribute(a);
              if (v !== null) attrs[a] = v;
            });
            elements.push({ tag: el.tagName.toLowerCase(), attrs });
          });
          const links = Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h.startsWith('http'));
          return { title: document.title, lang: document.documentElement.getAttribute('lang'), elements, links };
        });

        // Queue internal links
        data.links.forEach(link => {
          if (link.startsWith(baseUrl) && !visited.has(link) && toVisit.length < maxPages * 2) {
            toVisit.push(link);
          }
        });

        pageResults.push({ url, title: data.title, elements_count: data.elements.length });
        await page.close();
      } catch (pageErr) {
        pageResults.push({ url, error: pageErr.message });
      }
    }

    await browser.close();

    // Update audit with pages_scanned
    await pool.query(
      'UPDATE site_audits SET pages_scanned = $1 WHERE id = $2',
      [visited.size, req.params.id]
    );

    res.json({
      pages_crawled: visited.size,
      page_results: pageResults,
      message: `Crawled ${visited.size} pages. Run AI audit to analyze accessibility.`,
    });
  } catch (err) {
    console.error('Crawl error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
