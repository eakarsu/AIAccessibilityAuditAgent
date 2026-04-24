import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../services/api';
import {
  FiUsers, FiSearch, FiAlertTriangle, FiCheckCircle, FiTool,
  FiFileText, FiAward, FiDroplet, FiVolume2, FiCommand, FiCode,
  FiImage, FiBarChart2, FiClock, FiArrowRight, FiShield, FiLoader,
} from 'react-icons/fi';

const iconMap = { FiUsers, FiSearch, FiAlertTriangle, FiCheckCircle, FiTool, FiFileText, FiAward, FiDroplet, FiVolume2, FiCommand, FiCode, FiImage, FiBarChart2, FiClock, FiShield };

const featureDescriptions = {
  clients: 'Manage client accounts and website portfolios',
  'site-audits': 'Run comprehensive accessibility audits on websites',
  'wcag-checks': 'Verify WCAG 2.1 compliance criteria',
  issues: 'Track and resolve accessibility issues',
  'fix-suggestions': 'AI-powered code fix recommendations',
  'ada-reports': 'Generate ADA compliance documentation',
  'color-contrast': 'Analyze color contrast ratios',
  'screen-reader': 'Test screen reader compatibility',
  'keyboard-nav': 'Validate keyboard navigation paths',
  'aria-validation': 'Validate ARIA attributes and roles',
  'alt-text': 'Generate descriptive alt text with AI',
  scores: 'View accessibility score breakdowns',
  certificates: 'Manage compliance certifications',
  'audit-logs': 'View system activity logs',
};

const STATUS_COLORS = {
  completed: '#10b981', in_progress: '#f59e0b', pending: '#8b5cf6',
  failed: '#ef4444', pass: '#10b981', running: '#3b82f6',
};

const SEVERITY_COLORS = {
  critical: '#ef4444', major: '#f97316', minor: '#f59e0b', info: '#3b82f6',
};

function Dashboard({ features }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDashboardStats();
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const getCount = key => stats?.counts?.[key] ?? 0;

  const getIcon = feature => {
    const Icon = iconMap[feature.icon] || FiShield;
    return <Icon size={20} />;
  };

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-loading"><FiLoader className="fp-spin" style={{ fontSize: '2rem' }} /><p>Loading dashboard...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-page">
        <div className="dash-error">
          <FiAlertTriangle size={32} />
          <h3>Unable to load dashboard</h3>
          <p>{error}</p>
          <button className="dash-retry-btn" onClick={fetchStats}>Try Again</button>
        </div>
      </div>
    );
  }

  const topStats = [
    { key: 'clients', label: 'Total Clients', icon: FiUsers, accent: '#3b82f6', path: '/clients' },
    { key: 'audits', label: 'Total Audits', icon: FiSearch, accent: '#06b6d4', path: '/site-audits' },
    { key: 'issues', label: 'Open Issues', icon: FiAlertTriangle, accent: '#f59e0b', path: '/issues' },
    { key: 'certificates', label: 'Certificates', icon: FiAward, accent: '#10b981', path: '/certificates' },
  ];

  return (
    <div className="dash-page">
      {/* Header */}
      <div className="dash-header">
        <h1 className="dash-title">Welcome to AI Accessibility Audit Agent</h1>
        <p className="dash-subtitle">Your comprehensive platform for automated accessibility auditing, WCAG compliance checking, and AI-powered remediation.</p>
      </div>

      {/* Stat Cards */}
      <div className="dash-stats-grid">
        {topStats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.key} className="dash-stat-card" style={{ borderLeftColor: stat.accent }}>
              <div className="dash-stat-icon" style={{ background: `${stat.accent}15`, color: stat.accent }}><Icon size={20} /></div>
              <span className="dash-stat-label">{stat.label}</span>
              <p className="dash-stat-count">{getCount(stat.key)}</p>
              <button className="dash-view-all" onClick={() => navigate(stat.path)}>View All <FiArrowRight size={12} /></button>
            </div>
          );
        })}
      </div>

      {/* Feature Cards */}
      <h2 className="dash-section-title">Features</h2>
      <div className="dash-features-grid">
        {(features || []).map((f, i) => (
          <div
            key={f.path}
            className={`dash-feature-card ${hoveredCard === i ? 'dash-feature-hover' : ''}`}
            onMouseEnter={() => setHoveredCard(i)}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={() => navigate(`/${f.path}`)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') navigate(`/${f.path}`); }}
          >
            <div className="dash-feature-icon">{getIcon(f)}</div>
            <h3 className="dash-feature-title">{f.title}</h3>
            <p className="dash-feature-desc">{featureDescriptions[f.path] || 'Manage this feature'}</p>
            <FiArrowRight className="dash-feature-arrow" />
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      {(stats?.recent_audits?.length > 0 || stats?.recent_issues?.length > 0) && (
        <>
          <h2 className="dash-section-title">Recent Activity</h2>
          <div className="dash-activity-grid">
            <div className="dash-activity-panel">
              <h3 className="dash-activity-title"><FiSearch size={18} /> Recent Audits</h3>
              {(stats.recent_audits || []).slice(0, 5).map((a, i) => (
                <div key={a.id || i} className="dash-activity-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dash-activity-url">{a.url || 'Unknown'}</div>
                    <span className="dash-badge" style={{ background: `${STATUS_COLORS[a.status] || '#64748b'}18`, color: STATUS_COLORS[a.status] || '#64748b' }}>{a.status}</span>
                  </div>
                  {a.overall_score != null && (
                    <span className="dash-score" style={{ color: a.overall_score >= 80 ? '#10b981' : a.overall_score >= 50 ? '#f59e0b' : '#ef4444' }}>{a.overall_score}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="dash-activity-panel">
              <h3 className="dash-activity-title"><FiAlertTriangle size={18} /> Recent Issues</h3>
              {(stats.recent_issues || []).slice(0, 5).map((issue, i) => (
                <div key={issue.id || i} className="dash-activity-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className="dash-badge" style={{ background: `${SEVERITY_COLORS[issue.severity] || '#64748b'}18`, color: SEVERITY_COLORS[issue.severity] || '#64748b' }}>{issue.severity}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{issue.type}</span>
                    </div>
                    <div className="dash-activity-desc">{issue.description || 'No description'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;
