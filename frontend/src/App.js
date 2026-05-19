import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './styles/App.css';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sidebar from './components/Sidebar';
import FeaturePage from './pages/FeaturePage';
import AIToolPage from './pages/AIToolPage';
import CustomViewsPage from './pages/CustomViewsPage';
import { getMe } from './services/api';

// =====================================================
// NEW Custom Non-CRUD AI Tool configurations
// =====================================================
const aiToolConfigs = {
  'ai-validate-headings': {
    title: 'Headings Hierarchy Validator',
    subtitle: 'Check h1→h2→h3 structure, detect skipped levels, suggest fixes',
    icon: 'H₁',
    apiCall: 'validateHeadingsAI',
    method: 'post',
    fields: [
      { name: 'url', label: 'Website URL', placeholder: 'https://example.com' },
      { name: 'htmlContent', label: 'OR HTML Content', type: 'textarea', placeholder: '<h1>Main</h1><h3>Skipped</h3>...', rows: 6, help: 'Provide either URL or raw HTML' },
    ],
  },
  'ai-audit-forms': {
    title: 'Form Accessibility Auditor',
    subtitle: 'Validate label associations, required attribute, error messaging',
    icon: '📝',
    apiCall: 'auditFormsAI',
    method: 'post',
    fields: [
      { name: 'url', label: 'Website URL', placeholder: 'https://example.com/contact' },
      { name: 'htmlContent', label: 'OR HTML Content', type: 'textarea', rows: 6 },
    ],
  },
  'ai-prioritize-issues': {
    title: 'Remediation Priority Ranker',
    subtitle: 'Rank issues by user impact (critical/major/minor)',
    icon: '📊',
    apiCall: 'prioritizeIssuesAI',
    method: 'post',
    fields: [
      { name: 'issues', label: 'Issues (JSON array)', type: 'json', rows: 10, required: true,
        placeholder: '[{"description": "Missing alt text", "wcag": "1.1.1"}, ...]',
        help: 'Provide an array of issue objects to prioritize' },
    ],
  },
  'ai-check-link-text': {
    title: 'Link Text Quality Checker',
    subtitle: 'Identify generic links ("click here"), suggest descriptive text',
    icon: '🔗',
    apiCall: 'checkLinkTextAI',
    method: 'post',
    fields: [
      { name: 'url', label: 'Website URL', placeholder: 'https://example.com' },
      { name: 'htmlContent', label: 'OR HTML Content', type: 'textarea', rows: 6 },
    ],
  },
  'ai-check-media': {
    title: 'Media Accessibility Checker',
    subtitle: 'Verify captions, transcripts, descriptions for audio/video',
    icon: '🎬',
    apiCall: 'checkMediaAI',
    method: 'post',
    fields: [
      { name: 'url', label: 'Website URL', placeholder: 'https://example.com/page-with-video' },
      { name: 'htmlContent', label: 'OR HTML Content', type: 'textarea', rows: 6 },
    ],
  },
  'ai-convert-semantic': {
    title: 'Semantic HTML Converter',
    subtitle: 'Suggest semantic replacements (div→section, span→label)',
    icon: '🏷️',
    apiCall: 'convertSemanticAI',
    method: 'post',
    fields: [
      { name: 'html', label: 'HTML to Convert', type: 'textarea', rows: 10, required: true,
        placeholder: '<div class="header"><div class="logo">Logo</div></div>...' },
    ],
  },
  'ai-readability-score': {
    title: 'Accessibility Readability Score',
    subtitle: 'Analyze reading level, sentence complexity per WCAG 3.1 readability',
    icon: '📖',
    apiCall: 'readabilityScoreAI',
    method: 'post',
    fields: [
      { name: 'text', label: 'Text Content', type: 'textarea', rows: 10, required: true,
        placeholder: 'Paste page content to analyze...' },
    ],
  },
  'ai-monitoring-dashboard': {
    title: 'Accessibility Monitoring Dashboard',
    subtitle: 'Track audit score trends, flag regressions, alert on new issues',
    icon: '📈',
    apiCall: 'monitoringDashboardAI',
    method: 'get',
    autoLoad: true,
    fields: [],
  },
  'ai-accessible-palette': {
    title: 'Accessible Color Palette Generator',
    subtitle: 'Generate a full WCAG AA-compliant color palette from your brand color',
    icon: '🎨',
    apiCall: 'generateAccessiblePalette',
    method: 'post',
    fields: [
      { name: 'primary_color', label: 'Brand Color (hex)', placeholder: '#1a73e8', required: true,
        help: 'Enter a hex color code like #1a73e8' },
    ],
  },
  'ai-remediation-chat': {
    title: 'AI Remediation Assistant',
    subtitle: 'Ask questions about any accessibility issue and get code examples',
    icon: '💬',
    apiCall: 'remediationChat',
    method: 'post',
    fields: [
      { name: 'issue_id', label: 'Issue ID (optional)', placeholder: 'uuid of the issue for context' },
      { name: 'question', label: 'Your Question', type: 'textarea', rows: 4, required: true,
        placeholder: 'How do I fix missing alt text on dynamically loaded images?' },
    ],
  },
  'ai-vpat-generator': {
    title: 'VPAT Generator',
    subtitle: 'Generate a Voluntary Product Accessibility Template (VPAT 2.4) document',
    icon: '📋',
    apiCall: 'generateVPAT',
    method: 'post',
    fields: [
      { name: 'id', label: 'ADA Report ID', required: true, placeholder: 'UUID of existing ADA report' },
    ],
    // Special: this calls generateVPAT(id) not generateVPAT(data)
    customApiCall: true,
  },
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe().then(res => { setUser(res.data.user || res.data); setLoading(false); })
        .catch(() => { localStorage.removeItem('token'); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

  if (!user) return <Login onLogin={setUser} />;

  // Define all features with their configs
  const features = [
    { path: 'clients', title: 'Client Management', icon: 'FiUsers', apiName: 'clientsApi',
      columns: ['name', 'website_url', 'industry', 'contact_email', 'plan', 'status'],
      formFields: [
        { name: 'name', label: 'Company Name', required: true },
        { name: 'website_url', label: 'Website URL' },
        { name: 'industry', label: 'Industry' },
        { name: 'contact_email', label: 'Contact Email', type: 'email' },
        { name: 'contact_phone', label: 'Contact Phone' },
        { name: 'plan', label: 'Plan', type: 'select', options: ['basic', 'professional', 'enterprise'] },
        { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'pending'] }
      ]
    },
    { path: 'site-audits', title: 'Site Audits', icon: 'FiSearch', apiName: 'siteAuditsApi',
      columns: ['url', 'status', 'overall_score', 'issues_found', 'pages_scanned', 'audit_type', 'created_at'],
      hasAI: true, aiAction: 'runAuditAI', aiLabel: 'Run AI Audit',
      formFields: [
        { name: 'client_id', label: 'Client ID', required: true },
        { name: 'url', label: 'URL to Audit', required: true },
        { name: 'audit_type', label: 'Audit Type', type: 'select', options: ['full', 'quick', 'wcag-only', 'ada-only'] }
      ]
    },
    { path: 'wcag-checks', title: 'WCAG Compliance', icon: 'FiCheckCircle', apiName: 'wcagChecksApi',
      columns: ['criterion', 'level', 'status', 'description', 'element_selector', 'created_at'],
      hasAI: true, aiAction: 'evaluateWcagAI', aiLabel: 'AI Evaluate',
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'criterion', label: 'WCAG Criterion', required: true },
        { name: 'level', label: 'Level', type: 'select', options: ['A', 'AA', 'AAA'] },
        { name: 'status', label: 'Status', type: 'select', options: ['pass', 'fail', 'warning'] },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'element_selector', label: 'Element Selector' },
        { name: 'recommendation', label: 'Recommendation', type: 'textarea' }
      ]
    },
    { path: 'issues', title: 'Issues Tracker', icon: 'FiAlertTriangle', apiName: 'issuesApi',
      columns: ['severity', 'type', 'description', 'page_url', 'wcag_criterion', 'status', 'created_at'],
      hasAI: true, aiAction: 'suggestFixAI', aiLabel: 'AI Fix Suggestion',
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'severity', label: 'Severity', type: 'select', options: ['critical', 'major', 'minor', 'info'] },
        { name: 'type', label: 'Issue Type', required: true },
        { name: 'description', label: 'Description', type: 'textarea', required: true },
        { name: 'element_selector', label: 'Element Selector' },
        { name: 'page_url', label: 'Page URL' },
        { name: 'wcag_criterion', label: 'WCAG Criterion' },
        { name: 'status', label: 'Status', type: 'select', options: ['open', 'in_progress', 'resolved'] }
      ]
    },
    { path: 'fix-suggestions', title: 'AI Fix Suggestions', icon: 'FiTool', apiName: 'fixSuggestionsApi',
      columns: ['suggestion_text', 'confidence_score', 'ai_model', 'created_at'],
      hasAI: true, aiAction: 'generateFixAI', aiLabel: 'Generate AI Fix', aiIsPost: true,
      formFields: [
        { name: 'issue_id', label: 'Issue ID', required: true },
        { name: 'suggestion_text', label: 'Suggestion', type: 'textarea', required: true },
        { name: 'code_before', label: 'Code Before', type: 'textarea' },
        { name: 'code_after', label: 'Code After', type: 'textarea' },
        { name: 'confidence_score', label: 'Confidence Score', type: 'number' },
        { name: 'ai_model', label: 'AI Model' }
      ]
    },
    { path: 'ada-reports', title: 'ADA Compliance Reports', icon: 'FiFileText', apiName: 'adaReportsApi',
      columns: ['report_type', 'compliance_level', 'summary', 'generated_by', 'created_at'],
      hasAI: true, aiAction: 'generateAdaReportAI', aiLabel: 'Generate AI Report',
      formFields: [
        { name: 'client_id', label: 'Client ID', required: true },
        { name: 'report_type', label: 'Report Type', type: 'select', options: ['full', 'summary', 'executive', 'technical'] },
        { name: 'compliance_level', label: 'Compliance Level', type: 'select', options: ['compliant', 'partially_compliant', 'non_compliant'] },
        { name: 'summary', label: 'Summary', type: 'textarea' },
        { name: 'findings', label: 'Findings', type: 'textarea' },
        { name: 'recommendations', label: 'Recommendations', type: 'textarea' },
        { name: 'generated_by', label: 'Generated By' }
      ]
    },
    { path: 'color-contrast', title: 'Color Contrast Analyzer', icon: 'FiDroplet', apiName: 'colorContrastApi',
      columns: ['element_selector', 'foreground_color', 'background_color', 'contrast_ratio', 'wcag_aa_pass', 'wcag_aaa_pass', 'created_at'],
      hasAI: true, aiAction: 'analyzeContrastAI', aiLabel: 'AI Analyze', aiIsPost: true,
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'element_selector', label: 'Element Selector', required: true },
        { name: 'foreground_color', label: 'Foreground Color' },
        { name: 'background_color', label: 'Background Color' },
        { name: 'contrast_ratio', label: 'Contrast Ratio', type: 'number' },
        { name: 'wcag_aa_pass', label: 'WCAG AA Pass', type: 'select', options: ['true', 'false'] },
        { name: 'wcag_aaa_pass', label: 'WCAG AAA Pass', type: 'select', options: ['true', 'false'] },
        { name: 'font_size', label: 'Font Size' }
      ]
    },
    { path: 'screen-reader', title: 'Screen Reader Testing', icon: 'FiVolume2', apiName: 'screenReaderApi',
      columns: ['screen_reader', 'page_url', 'element_type', 'expected_announcement', 'status', 'created_at'],
      hasAI: true, aiAction: 'testScreenReaderAI', aiLabel: 'AI Test', aiIsPost: true,
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'screen_reader', label: 'Screen Reader', type: 'select', options: ['NVDA', 'VoiceOver', 'JAWS', 'TalkBack'] },
        { name: 'page_url', label: 'Page URL', required: true },
        { name: 'element_type', label: 'Element Type' },
        { name: 'element_selector', label: 'Element Selector' },
        { name: 'expected_announcement', label: 'Expected Announcement', type: 'textarea' },
        { name: 'actual_result', label: 'Actual Result', type: 'textarea' },
        { name: 'status', label: 'Status', type: 'select', options: ['pass', 'fail'] }
      ]
    },
    { path: 'keyboard-nav', title: 'Keyboard Navigation', icon: 'FiCommand', apiName: 'keyboardNavApi',
      columns: ['page_url', 'element_type', 'tab_order', 'is_focusable', 'has_visible_focus', 'keyboard_trap', 'status', 'created_at'],
      hasAI: true, aiAction: 'testKeyboardNavAI', aiLabel: 'AI Test', aiIsPost: true,
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'page_url', label: 'Page URL', required: true },
        { name: 'element_selector', label: 'Element Selector' },
        { name: 'element_type', label: 'Element Type' },
        { name: 'tab_order', label: 'Tab Order', type: 'number' },
        { name: 'is_focusable', label: 'Is Focusable', type: 'select', options: ['true', 'false'] },
        { name: 'has_visible_focus', label: 'Has Visible Focus', type: 'select', options: ['true', 'false'] },
        { name: 'keyboard_trap', label: 'Keyboard Trap', type: 'select', options: ['true', 'false'] },
        { name: 'status', label: 'Status', type: 'select', options: ['pass', 'fail'] }
      ]
    },
    { path: 'aria-validation', title: 'ARIA Validator', icon: 'FiCode', apiName: 'ariaValidationApi',
      columns: ['element_selector', 'aria_attribute', 'current_value', 'is_valid', 'severity', 'created_at'],
      hasAI: true, aiAction: 'validateAriaAI', aiLabel: 'AI Validate', aiIsPost: true,
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'element_selector', label: 'Element Selector', required: true },
        { name: 'aria_attribute', label: 'ARIA Attribute', required: true },
        { name: 'current_value', label: 'Current Value' },
        { name: 'expected_value', label: 'Expected Value' },
        { name: 'is_valid', label: 'Is Valid', type: 'select', options: ['true', 'false'] },
        { name: 'recommendation', label: 'Recommendation', type: 'textarea' },
        { name: 'severity', label: 'Severity', type: 'select', options: ['critical', 'major', 'minor', 'info'] }
      ]
    },
    { path: 'alt-text', title: 'Alt Text Generator', icon: 'FiImage', apiName: 'altTextApi',
      columns: ['image_url', 'current_alt', 'generated_alt', 'confidence_score', 'status', 'created_at'],
      hasAI: true, aiAction: 'generateAltTextAI', aiLabel: 'Generate AI Alt Text', aiIsPost: true,
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'image_url', label: 'Image URL', required: true },
        { name: 'current_alt', label: 'Current Alt Text' },
        { name: 'generated_alt', label: 'Generated Alt Text', type: 'textarea' },
        { name: 'context_description', label: 'Context Description', type: 'textarea' },
        { name: 'confidence_score', label: 'Confidence Score', type: 'number' },
        { name: 'ai_model', label: 'AI Model' },
        { name: 'status', label: 'Status', type: 'select', options: ['pending', 'generated', 'approved', 'rejected'] }
      ]
    },
    { path: 'scores', title: 'Accessibility Scores', icon: 'FiBarChart2', apiName: 'scoresApi',
      columns: ['category', 'score', 'max_score', 'weight', 'created_at'],
      formFields: [
        { name: 'audit_id', label: 'Audit ID', required: true },
        { name: 'category', label: 'Category', required: true },
        { name: 'score', label: 'Score', type: 'number', required: true },
        { name: 'max_score', label: 'Max Score', type: 'number' },
        { name: 'weight', label: 'Weight', type: 'number' },
        { name: 'details', label: 'Details', type: 'textarea' }
      ]
    },
    { path: 'certificates', title: 'Compliance Certificates', icon: 'FiAward', apiName: 'certificatesApi',
      columns: ['certificate_type', 'compliance_level', 'valid_from', 'valid_until', 'issued_by', 'status', 'created_at'],
      formFields: [
        { name: 'client_id', label: 'Client ID', required: true },
        { name: 'certificate_type', label: 'Certificate Type', type: 'select', options: ['WCAG 2.1', 'Section 508', 'ADA Title III', 'EN 301 549'] },
        { name: 'compliance_level', label: 'Compliance Level', type: 'select', options: ['A', 'AA', 'AAA'] },
        { name: 'valid_from', label: 'Valid From', type: 'date' },
        { name: 'valid_until', label: 'Valid Until', type: 'date' },
        { name: 'issued_by', label: 'Issued By' },
        { name: 'status', label: 'Status', type: 'select', options: ['active', 'expired', 'revoked', 'draft'] }
      ]
    },
    { path: 'audit-logs', title: 'Audit Logs', icon: 'FiClock', apiName: 'auditLogsApi',
      columns: ['action', 'entity_type', 'entity_id', 'details', 'ip_address', 'created_at'],
      readOnly: true,
      formFields: []
    },
  ];

  return (
    <div className="app-layout">
      <Sidebar user={user} features={features} aiTools={aiToolConfigs} onLogout={() => { localStorage.removeItem('token'); setUser(null); }} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard features={features} aiTools={aiToolConfigs} />} />
          {features.map(f => (
            <Route key={f.path} path={`/${f.path}`} element={<FeaturePage config={f} />} />
          ))}
          {Object.entries(aiToolConfigs).map(([slug, cfg]) => (
            <Route key={slug} path={`/${slug}`} element={<AIToolPage config={cfg} />} />
          ))}
          <Route path="/custom-views" element={<CustomViewsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
