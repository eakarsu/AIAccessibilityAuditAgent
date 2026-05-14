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

// GET /api/dashboard/trends - audit score trends, issue breakdown, improvements/regressions
router.get('/trends', authenticateToken, async (req, res) => {
  try {
    const [scoreTrends, issueBreakdown, improvements, regressions] = await Promise.all([
      // Score per site over last 30 days (time-series)
      pool.query(`
        SELECT
          url,
          DATE(created_at) as date,
          AVG(overall_score) as avg_score
        FROM site_audits
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND overall_score IS NOT NULL
        GROUP BY url, DATE(created_at)
        ORDER BY url, date
      `),
      // Issue category breakdown (pie chart data)
      pool.query(`
        SELECT
          type,
          COUNT(*) as count
        FROM accessibility_issues
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY type
        ORDER BY count DESC
      `),
      // Sites with most improvement (score increased the most)
      pool.query(`
        WITH ordered AS (
          SELECT url, overall_score, created_at,
            ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_at ASC) as rn_first,
            ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_at DESC) as rn_last
          FROM site_audits
          WHERE created_at >= NOW() - INTERVAL '30 days' AND overall_score IS NOT NULL
        ),
        first_scores AS (SELECT url, overall_score as first_score FROM ordered WHERE rn_first = 1),
        last_scores  AS (SELECT url, overall_score as last_score FROM ordered WHERE rn_last = 1)
        SELECT f.url,
          f.first_score,
          l.last_score,
          (l.last_score - f.first_score) as score_change
        FROM first_scores f
        JOIN last_scores l ON f.url = l.url
        WHERE l.last_score > f.first_score
        ORDER BY score_change DESC
        LIMIT 10
      `),
      // Sites that regressed (score decreased)
      pool.query(`
        WITH ordered AS (
          SELECT url, overall_score, created_at,
            ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_at ASC) as rn_first,
            ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_at DESC) as rn_last
          FROM site_audits
          WHERE created_at >= NOW() - INTERVAL '30 days' AND overall_score IS NOT NULL
        ),
        first_scores AS (SELECT url, overall_score as first_score FROM ordered WHERE rn_first = 1),
        last_scores  AS (SELECT url, overall_score as last_score FROM ordered WHERE rn_last = 1)
        SELECT f.url,
          f.first_score,
          l.last_score,
          (l.last_score - f.first_score) as score_change
        FROM first_scores f
        JOIN last_scores l ON f.url = l.url
        WHERE l.last_score < f.first_score
        ORDER BY score_change ASC
        LIMIT 10
      `),
    ]);

    res.json({
      score_trends: scoreTrends.rows,
      issue_breakdown: issueBreakdown.rows,
      most_improved: improvements.rows,
      regressed: regressions.rows,
    });
  } catch (err) {
    console.error('Dashboard trends error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
