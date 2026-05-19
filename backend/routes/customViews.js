// customViews.js — 4 endpoints for the AIAccessibilityAuditAgent custom views
// Domain: web accessibility auditing (WCAG / ADA)
// All data is synthesized (deterministic stub) so the views work without external deps.

const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');

// Optional auth (graceful when middleware shape differs)
let authMiddleware = null;
try {
  const m = require('../middleware/auth');
  authMiddleware = typeof m === 'function' ? m : (m.authenticateToken || m.default || null);
} catch (_) { /* no-op */ }

// In-memory store for AxeRulesEditor CRUD (process-lifetime persistence)
const defaultAxeRules = [
  { id: 'color-contrast',           description: 'Elements must have sufficient color contrast', enabled: true,  severity: 'serious' },
  { id: 'image-alt',                description: 'Images must have alternate text',              enabled: true,  severity: 'critical' },
  { id: 'label',                    description: 'Form elements must have labels',               enabled: true,  severity: 'critical' },
  { id: 'link-name',                description: 'Links must have discernible text',             enabled: true,  severity: 'serious' },
  { id: 'button-name',              description: 'Buttons must have discernible text',           enabled: true,  severity: 'critical' },
  { id: 'document-title',           description: 'Documents must have <title> element',          enabled: true,  severity: 'serious' },
  { id: 'html-has-lang',            description: '<html> element must have a lang attribute',    enabled: true,  severity: 'serious' },
  { id: 'landmark-one-main',        description: 'Document must have one main landmark',         enabled: true,  severity: 'moderate' },
  { id: 'region',                   description: 'All content must be in landmarks',             enabled: false, severity: 'moderate' },
  { id: 'duplicate-id',             description: 'IDs of active elements must be unique',        enabled: true,  severity: 'minor' },
  { id: 'aria-roles',               description: 'ARIA roles must be valid',                     enabled: true,  severity: 'serious' },
  { id: 'aria-valid-attr-value',    description: 'ARIA attribute values must be valid',          enabled: true,  severity: 'critical' },
  { id: 'meta-viewport',            description: 'Zooming and scaling must not be disabled',     enabled: true,  severity: 'serious' },
  { id: 'heading-order',            description: 'Heading levels should only increase by one',   enabled: true,  severity: 'moderate' },
  { id: 'tabindex',                 description: 'tabindex value must not be > 0',               enabled: true,  severity: 'serious' },
];
let axeRules = defaultAxeRules.map(r => ({ ...r }));
let nextRuleSeq = 1;

// ---------- helpers ----------
function ifAuth(handler) {
  return authMiddleware
    ? [authMiddleware, handler]
    : [handler];
}

function synthesizeHeatmap() {
  const pages = [
    '/index.html', '/about', '/products', '/cart',
    '/checkout', '/account', '/contact', '/blog',
  ];
  const criteria = [
    { id: '1.1.1', name: 'Non-text Content',          level: 'A'  },
    { id: '1.3.1', name: 'Info and Relationships',    level: 'A'  },
    { id: '1.4.3', name: 'Contrast (Minimum)',        level: 'AA' },
    { id: '2.1.1', name: 'Keyboard',                  level: 'A'  },
    { id: '2.4.4', name: 'Link Purpose',              level: 'A'  },
    { id: '2.4.7', name: 'Focus Visible',             level: 'AA' },
    { id: '3.1.1', name: 'Language of Page',          level: 'A'  },
    { id: '3.3.2', name: 'Labels or Instructions',    level: 'A'  },
    { id: '4.1.2', name: 'Name, Role, Value',         level: 'A'  },
  ];

  // deterministic pseudo-random by indexes (no external seed needed)
  const cells = [];
  pages.forEach((page, pi) => {
    criteria.forEach((c, ci) => {
      const base = (pi * 31 + ci * 17) % 13;
      const violations = Math.max(0, base - 2);
      cells.push({
        page,
        criterion: c.id,
        criterion_name: c.name,
        level: c.level,
        violations,
      });
    });
  });

  return { pages, criteria, cells };
}

function synthesizeGauge() {
  const categories = [
    { key: 'perceivable',    label: 'Perceivable',    score: 82, color: '#22c55e' },
    { key: 'operable',       label: 'Operable',       score: 76, color: '#3b82f6' },
    { key: 'understandable', label: 'Understandable', score: 88, color: '#a855f7' },
    { key: 'robust',         label: 'Robust',         score: 71, color: '#f59e0b' },
  ];
  const overall = Math.round(
    categories.reduce((s, c) => s + c.score, 0) / categories.length
  );
  return { overall, categories };
}

function synthesizeSites() {
  return [
    { id: 'site-1', name: 'Acme Storefront',    url: 'https://acme.example.com' },
    { id: 'site-2', name: 'Globex Marketing',   url: 'https://globex.example.com' },
    { id: 'site-3', name: 'Initech Portal',     url: 'https://initech.example.com' },
    { id: 'site-4', name: 'Hooli Cloud',        url: 'https://hooli.example.com' },
  ];
}

function synthesizeViolationsFor(siteId) {
  // Group by WCAG criterion. Deterministic per siteId hash.
  const hash = String(siteId).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const violationsByCriterion = {
    '1.1.1 Non-text Content (A)': [
      { severity: 'critical', element: 'img.hero',         issue: 'Missing alt attribute on banner image',         remediation: 'Add a meaningful alt="" describing the image. Use alt="" for purely decorative images.' },
      { severity: 'serious',  element: 'img.product[]',    issue: 'Generic alt="image" on 12 product photos',      remediation: 'Generate descriptive alt text per product (e.g., "Red leather wallet, front view").' },
    ],
    '1.4.3 Contrast (Minimum) (AA)': [
      { severity: 'serious',  element: '.btn-primary',     issue: 'Foreground #FFFFFF on #B0E0FF has ratio 1.9:1', remediation: 'Increase contrast to at least 4.5:1 for normal text. Try background #1E66B0.' },
      { severity: 'moderate', element: 'footer a',         issue: 'Link color #999 on white has ratio 2.8:1',      remediation: 'Use #595959 or darker for AA compliance on white backgrounds.' },
    ],
    '2.1.1 Keyboard (A)': [
      { severity: 'critical', element: '.modal-close',     issue: 'Close button only responds to mouse click',     remediation: 'Add keydown handler for Enter/Space; use a native <button> element.' },
    ],
    '2.4.7 Focus Visible (AA)': [
      { severity: 'serious',  element: 'a, button',        issue: '`outline: none` removes focus indicator',       remediation: 'Provide a visible :focus-visible style (e.g., 2px solid currentColor outline).' },
    ],
    '3.3.2 Labels or Instructions (A)': [
      { severity: 'critical', element: 'input#search',     issue: 'Input has placeholder but no associated <label>', remediation: 'Add <label for="search">Search</label> or aria-label="Search".' },
    ],
    '4.1.2 Name, Role, Value (A)': [
      { severity: 'serious',  element: 'div.tabs[role=tab]', issue: 'Custom tab widget missing aria-selected state', remediation: 'Manage aria-selected="true|false" on tabs; expose aria-controls.' },
    ],
  };

  // perturb counts slightly by hash so different sites look different
  const out = {};
  Object.entries(violationsByCriterion).forEach(([k, arr], idx) => {
    const skip = (hash + idx) % 5 === 0;
    if (!skip) out[k] = arr;
  });
  return out;
}

// ---------- 1. VIOLATION HEATMAP ----------
router.get('/violation-heatmap', ...ifAuth((req, res) => {
  res.json(synthesizeHeatmap());
}));

// ---------- 2. ACCESSIBILITY SCORE GAUGE ----------
router.get('/accessibility-gauge', ...ifAuth((req, res) => {
  res.json(synthesizeGauge());
}));

// ---------- 3. WCAG AUDIT REPORT PDF ----------
router.get('/sites', ...ifAuth((req, res) => {
  res.json({ sites: synthesizeSites() });
}));

router.get('/wcag-report-pdf', ...ifAuth((req, res) => {
  const siteId = req.query.site_id || 'site-1';
  const sites = synthesizeSites();
  const site = sites.find(s => s.id === siteId) || sites[0];
  const grouped = synthesizeViolationsFor(siteId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="wcag-report-${siteId}.pdf"`);

  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  doc.pipe(res);

  // Header
  doc.fontSize(20).fillColor('#111').text('WCAG Audit Report', { align: 'left' });
  doc.moveDown(0.25);
  doc.fontSize(11).fillColor('#555').text(`Site: ${site.name}`);
  doc.text(`URL:  ${site.url}`);
  doc.text(`Generated: ${new Date().toISOString()}`);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(0.75);

  // Summary
  const totalViolations = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
  doc.fontSize(12).fillColor('#111').text(`Summary: ${totalViolations} violations across ${Object.keys(grouped).length} WCAG criteria.`);
  doc.moveDown(0.75);

  // Per-criterion sections
  Object.entries(grouped).forEach(([criterion, arr]) => {
    doc.fontSize(13).fillColor('#1d4ed8').text(criterion);
    doc.moveDown(0.25);
    arr.forEach((v, i) => {
      doc.fontSize(10).fillColor('#111')
        .text(`  ${i + 1}. [${v.severity.toUpperCase()}] ${v.element}`);
      doc.fontSize(10).fillColor('#444')
        .text(`     Issue: ${v.issue}`);
      doc.fontSize(10).fillColor('#16a34a')
        .text(`     Remediation: ${v.remediation}`);
      doc.moveDown(0.4);
    });
    doc.moveDown(0.5);
  });

  doc.fontSize(9).fillColor('#888').text('Generated by AIAccessibilityAuditAgent — custom views.', 50, 740, { align: 'center', width: 512 });

  doc.end();
}));

// ---------- 4. AXE RULES EDITOR (CRUD) ----------
router.get('/axe-rules', ...ifAuth((req, res) => {
  res.json({ rules: axeRules });
}));

router.post('/axe-rules', ...ifAuth((req, res) => {
  const { id, description, enabled, severity } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });
  if (axeRules.find(r => r.id === id)) {
    return res.status(409).json({ error: 'rule id already exists' });
  }
  const rule = {
    id,
    description: description || '',
    enabled: enabled !== false,
    severity: severity || 'moderate',
    _seq: nextRuleSeq++,
  };
  axeRules.push(rule);
  res.status(201).json(rule);
}));

router.put('/axe-rules/:id', ...ifAuth((req, res) => {
  const idx = axeRules.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'rule not found' });
  const { description, enabled, severity } = req.body || {};
  if (description !== undefined) axeRules[idx].description = description;
  if (enabled    !== undefined) axeRules[idx].enabled    = !!enabled;
  if (severity   !== undefined) axeRules[idx].severity   = severity;
  res.json(axeRules[idx]);
}));

router.delete('/axe-rules/:id', ...ifAuth((req, res) => {
  const before = axeRules.length;
  axeRules = axeRules.filter(r => r.id !== req.params.id);
  if (axeRules.length === before) return res.status(404).json({ error: 'rule not found' });
  res.json({ ok: true });
}));

module.exports = router;
