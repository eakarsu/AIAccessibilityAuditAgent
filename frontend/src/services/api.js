import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (data) => api.post('/auth/register', data);
export const getMe = () => api.get('/auth/me');
export const changePassword = (data) => api.post('/auth/change-password', data);

// Dashboard
export const getDashboardStats = () => api.get('/dashboard/stats');
export const getDashboardTrends = () => api.get('/dashboard/trends');

// Generic CRUD factory with pagination support
const crud = (resource) => ({
  getAll: (params = {}) => api.get(`/${resource}`, { params }),
  getById: (id) => api.get(`/${resource}/${id}`),
  create: (data) => api.post(`/${resource}`, data),
  update: (id, data) => api.put(`/${resource}/${id}`, data),
  remove: (id) => api.delete(`/${resource}/${id}`),
});

export const clientsApi = crud('clients');
export const siteAuditsApi = crud('site-audits');
export const wcagChecksApi = crud('wcag-checks');
export const issuesApi = crud('issues');
export const fixSuggestionsApi = crud('fix-suggestions');
export const adaReportsApi = crud('ada-reports');
export const colorContrastApi = crud('color-contrast');
export const screenReaderApi = crud('screen-reader');
export const keyboardNavApi = crud('keyboard-nav');
export const ariaValidationApi = crud('aria-validation');
export const altTextApi = crud('alt-text');
export const scoresApi = crud('scores');
export const certificatesApi = crud('certificates');
export const auditLogsApi = crud('audit-logs');

// AI endpoints - match backend routes
export const runAuditAI = (id) => api.post(`/site-audits/${id}/run-ai`);
export const getAuditDiff = (id) => api.get(`/site-audits/${id}/diff`);
export const crawlAudit = (id, data) => api.post(`/site-audits/${id}/crawl`, data);
export const evaluateWcagAI = (id) => api.post(`/wcag-checks/${id}/evaluate-ai`);
export const suggestFixAI = (id) => api.post(`/issues/${id}/suggest-fix-ai`);
export const updateIssueStatus = (id, status) => api.patch(`/issues/${id}/status`, { status });
export const generateFixAI = (data) => api.post('/fix-suggestions/generate-ai', data);
export const generateAdaReportAI = (id) => api.post(`/ada-reports/${id}/generate-ai`);
export const generateVPAT = (id) => api.post(`/ada-reports/${id}/generate-vpat`);
export const analyzeContrastAI = (data) => api.post('/color-contrast/analyze-ai', data);
export const testScreenReaderAI = (data) => api.post('/screen-reader/test-ai', data);
export const testKeyboardNavAI = (data) => api.post('/keyboard-nav/test-ai', data);
export const validateAriaAI = (data) => api.post('/aria-validation/validate-ai', data);
export const generateAltTextAI = (data) => api.post('/alt-text/generate-ai', data);
export const scheduleAudit = (clientId, data) => api.post(`/clients/${clientId}/schedule-audit`, data);
export const getClientBadge = (clientId) => api.get(`/clients/${clientId}/badge`);

// AI Tool endpoints under /api/ai/*
export const validateHeadingsAI = (data) => api.post('/ai/validate-headings', data);
export const auditFormsAI = (data) => api.post('/ai/audit-forms', data);
export const prioritizeIssuesAI = (data) => api.post('/ai/prioritize-issues', data);
export const checkLinkTextAI = (data) => api.post('/ai/check-link-text', data);
export const checkMediaAI = (data) => api.post('/ai/check-media', data);
export const convertSemanticAI = (data) => api.post('/ai/convert-semantic', data);
export const readabilityScoreAI = (data) => api.post('/ai/readability-score', data);
export const monitoringDashboardAI = () => api.get('/ai/monitoring-dashboard');
export const generateAccessiblePalette = (data) => api.post('/ai/accessible-palette', data);
export const remediationChat = (data) => api.post('/ai/remediation-chat', data);
export const getAIResults = (params = {}) => api.get('/ai/results', { params });

export default api;
