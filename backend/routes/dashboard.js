const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /api/dashboard/stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [
      clients,
      audits,
      issues,
      wcagChecks,
      fixSuggestions,
      reports,
      certificates,
      recentAudits,
      issueBySeverity,
      recentIssues,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM clients'),
      pool.query('SELECT COUNT(*) as count FROM site_audits'),
      pool.query('SELECT COUNT(*) as count FROM accessibility_issues'),
      pool.query('SELECT COUNT(*) as count FROM wcag_checks'),
      pool.query('SELECT COUNT(*) as count FROM fix_suggestions'),
      pool.query('SELECT COUNT(*) as count FROM ada_reports'),
      pool.query('SELECT COUNT(*) as count FROM compliance_certificates'),
      pool.query('SELECT id, url, status, overall_score, created_at FROM site_audits ORDER BY created_at DESC LIMIT 5'),
      pool.query('SELECT severity, COUNT(*) as count FROM accessibility_issues GROUP BY severity'),
      pool.query('SELECT id, severity, type, description, status, created_at FROM accessibility_issues ORDER BY created_at DESC LIMIT 5'),
    ]);

    res.json({
      counts: {
        clients: parseInt(clients.rows[0].count),
        audits: parseInt(audits.rows[0].count),
        issues: parseInt(issues.rows[0].count),
        wcag_checks: parseInt(wcagChecks.rows[0].count),
        fix_suggestions: parseInt(fixSuggestions.rows[0].count),
        reports: parseInt(reports.rows[0].count),
        certificates: parseInt(certificates.rows[0].count),
      },
      recent_audits: recentAudits.rows,
      issues_by_severity: issueBySeverity.rows,
      recent_issues: recentIssues.rows,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
