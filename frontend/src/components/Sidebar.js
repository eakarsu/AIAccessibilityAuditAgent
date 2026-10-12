import AIReportLibrary from "./AIReportLibrary";
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  FiShield,
  FiGrid,
  FiSearch,
  FiCheckCircle,
  FiAlertTriangle,
  FiBarChart2,
  FiTool,
  FiImage,
  FiDroplet,
  FiCode,
  FiVolume2,
  FiCommand,
  FiFileText,
  FiAward,
  FiClock,
  FiUsers,
  FiLogOut,
} from 'react-icons/fi';

const iconMap = {
  FiGrid,
  FiSearch,
  FiCheckCircle,
  FiAlertTriangle,
  FiBarChart2,
  FiTool,
  FiImage,
  FiDroplet,
  FiCode,
  FiVolume2,
  FiCommand,
  FiFileText,
  FiAward,
  FiClock,
  FiUsers,
};

// Evidence-review APIs remain protected on the server, but the demo navigation
// exposes only the draft-safe controlled-copy workflow.  We do not populate a
// governed-audit list with invented completed scans or reviewer evidence.
const sections = [];

function getInitials(name) {
  if (!name) return '??';
  return name
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function Sidebar({ user, features, aiTools, onLogout }) {
  const enabledPaths = new Set();
  if (features && Array.isArray(features)) {
    features.forEach((f) => { if (f.path) enabledPaths.add(f.path); });
  }
  const shouldShow = () => true;

  // Build AI Tools section dynamically from aiTools config
  const aiToolsItems = aiTools
    ? Object.entries(aiTools).map(([slug, cfg]) => ({ path: slug, title: cfg.title, icon: cfg.icon }))
    : [];

  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* Brand / Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <FiShield size={24} />
        </div>
        <div className="sidebar-logo-text">
          <h2>AI Accessibility</h2>
          <span>Audit Agent</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        {/* Native entry point */}
        <NavLink
          to="/authorized-remediations"
          end
          className={({ isActive }) =>
            `sidebar-nav-link${isActive ? ' active' : ''}`
          }
        >
          <FiTool className="nav-icon" />
          <span>Authorized Remediations</span>
        </NavLink>

        {/* Feature sections */}
        {sections.map((section) => {
          const visibleItems = section.items.filter((item) => shouldShow(item.path));
          if (visibleItems.length === 0) return null;

          return (
            <div className="sidebar-nav-section" key={section.title}>
              <div className="sidebar-nav-section-title">{section.title}</div>
              {visibleItems.map((item) => {
                const IconComponent = iconMap[item.icon];
                return (
                  <NavLink
                    key={item.path}
                    to={`/${item.path}`}
                    className={({ isActive }) =>
                      `sidebar-nav-link${isActive ? ' active' : ''}`
                    }
                  >
                    {IconComponent && <IconComponent className="nav-icon" />}
                    <span>{item.title}</span>
                  </NavLink>
                );
              })}
            </div>
          );
        })}

        {/* AI Tools (NEW) */}
        {aiToolsItems.length > 0 && (
          <div className="sidebar-nav-section">
            <div className="sidebar-nav-section-title">ADVANCED AI TOOLS</div>
            {aiToolsItems.map((item) => (
              <NavLink
                key={item.path}
                to={`/${item.path}`}
                className={({ isActive }) =>
                  `sidebar-nav-link${isActive ? ' active' : ''}`
                }
              >
                <span className="nav-icon" style={{ fontSize: 14 }}>{item.icon}</span>
                <span>{item.title}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>

      {/* Footer - User Info */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {getInitials(user?.full_name || user?.name)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.full_name || user?.name || 'User'}</div>
            <div className="sidebar-user-role">{user?.email || ''}</div>
          </div>
        </div>
        <button
          className="sidebar-nav-link"
          onClick={onLogout}
          aria-label="Logout"
          style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }}
        >
          <FiLogOut className="nav-icon" />
          <span>Logout</span>
        </button>
      </div>
    <AIReportLibrary /></nav>
  );
}

export default Sidebar;
