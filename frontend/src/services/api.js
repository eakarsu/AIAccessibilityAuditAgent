import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
export const runAuditAI = (id, requestOptions = {}) => api.post(`/site-audits/${id}/run-ai`, undefined, requestOptions);
export const getAuditDiff = (id) => api.get(`/site-audits/${id}/diff`);
export const crawlAudit = (id, data) => api.post(`/site-audits/${id}/crawl`, data);
export const evaluateWcagAI = (id, requestOptions = {}) => api.post(`/wcag-checks/${id}/evaluate-ai`, undefined, requestOptions);
export const suggestFixAI = (id, requestOptions = {}) => api.post(`/issues/${id}/suggest-fix-ai`, undefined, requestOptions);
export const updateIssueStatus = (id, status) => api.patch(`/issues/${id}/status`, { status });
export const generateFixAI = (data, requestOptions = {}) => api.post('/fix-suggestions/generate-ai', data, requestOptions);
export const generateAdaReportAI = (id, requestOptions = {}) => api.post(`/ada-reports/${id}/generate-ai`, undefined, requestOptions);
export const generateVPAT = (id, requestOptions = {}) => api.post(`/ada-reports/${id}/generate-vpat`, undefined, requestOptions);
export const analyzeContrastAI = (data, requestOptions = {}) => api.post('/color-contrast/analyze-ai', data, requestOptions);
export const testScreenReaderAI = (data, requestOptions = {}) => api.post('/screen-reader/test-ai', data, requestOptions);
export const testKeyboardNavAI = (data, requestOptions = {}) => api.post('/keyboard-nav/test-ai', data, requestOptions);
export const validateAriaAI = (data, requestOptions = {}) => api.post('/aria-validation/validate-ai', data, requestOptions);
export const generateAltTextAI = (data, requestOptions = {}) => api.post('/alt-text/generate-ai', data, requestOptions);
export const scheduleAudit = (clientId, data) => api.post(`/clients/${clientId}/schedule-audit`, data);
export const getClientBadge = (clientId) => api.get(`/clients/${clientId}/badge`);

// Tenant-scoped evidence workflow; the backend enforces reviewer separation.
export const getGovernedAudits = () => api.get('/governed-audits');
export const createGovernedAudit = (data, idempotencyKey) =>
  api.post('/governed-audits', data, { headers: { 'Idempotency-Key': idempotencyKey } });
export const submitGovernedAudit = (id) => api.post(`/governed-audits/${id}/submit`);
export const reviewGovernedAudit = (id, data) => api.post(`/governed-audits/${id}/review`, data);

// Actor-scoped deterministic remediation of stored, authorized HTML copies.
export const authorizedRemediationsApi = {
  getAll: () => api.get('/authorized-remediations'),
  getById: (id) => api.get(`/authorized-remediations/${id}`),
  create: (data) => api.post('/authorized-remediations', data),
  update: (id, data) => api.put(`/authorized-remediations/${id}`, data),
  preview: (id) => api.post(`/authorized-remediations/${id}/preview`),
  apply: (id, data) => api.post(`/authorized-remediations/${id}/apply`, data),
  remove: (id) => api.delete(`/authorized-remediations/${id}`),
};

// AI Tool endpoints under /api/ai/*
export const validateHeadingsAI = (data, requestOptions = {}) => api.post('/ai/validate-headings', data, requestOptions);
export const auditFormsAI = (data, requestOptions = {}) => api.post('/ai/audit-forms', data, requestOptions);
export const prioritizeIssuesAI = (data, requestOptions = {}) => api.post('/ai/prioritize-issues', data, requestOptions);
export const checkLinkTextAI = (data, requestOptions = {}) => api.post('/ai/check-link-text', data, requestOptions);
export const checkMediaAI = (data, requestOptions = {}) => api.post('/ai/check-media', data, requestOptions);
export const convertSemanticAI = (data, requestOptions = {}) => api.post('/ai/convert-semantic', data, requestOptions);
export const readabilityScoreAI = (data, requestOptions = {}) => api.post('/ai/readability-score', data, requestOptions);
export const monitoringDashboardAI = (requestOptions = {}) => api.get('/ai/monitoring-dashboard', requestOptions);
export const generateAccessiblePalette = (data, requestOptions = {}) => api.post('/ai/accessible-palette', data, requestOptions);
export const remediationChat = (data, requestOptions = {}) => api.post('/ai/remediation-chat', data, requestOptions);
export const getAIResults = (params = {}) => api.get('/ai/results', { params });

export default api;
