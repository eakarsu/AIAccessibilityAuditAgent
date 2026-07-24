require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { legacyPrototypeRoutesEnabled } = require('./config/runtime').validateRuntime();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Security headers
app.use(helmet());

// CORS - read from env in production
app.use(cors({
  origin: process.env.CLIENT_URL || `http://localhost:${process.env.FRONTEND_PORT || 3000}`,
  credentials: true,
}));

// Request logging
app.use(morgan('dev'));

app.use(express.json({ limit: '10mb' }));
app.use('/api', require('./runtimeAcceptance'));

app.use('/api', (req, res, next) => {
  const supported = ['/auth', '/health', '/governed-audits'];
  if (legacyPrototypeRoutesEnabled || supported.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) return next();
  return res.status(410).json({ error: 'Legacy prototype route is quarantined', code: 'prototype_route_quarantined' });
});

// General rate limiter: 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiter: 20 requests per 15 minutes (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI rate limiter: 20 requests per hour
const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many AI requests. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Audit rate limiter: 30 requests per 15 minutes
const auditRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many audit requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/dashboard', generalLimiter, require('./routes/dashboard'));
app.use('/api/clients', generalLimiter, require('./routes/clients'));
app.use('/api/site-audits', auditRateLimiter, require('./routes/siteAudits'));
app.use('/api/ai', aiRateLimiter, require('./routes/aiAudit'));
app.use('/api/accessibility', generalLimiter, require('./routes/accessibilityTools'));
app.use('/api/wcag-checks', generalLimiter, require('./routes/wcagChecks'));
app.use('/api/issues', generalLimiter, require('./routes/issues'));
app.use('/api/fix-suggestions', generalLimiter, require('./routes/fixSuggestions'));
app.use('/api/ada-reports', generalLimiter, require('./routes/adaReports'));
app.use('/api/color-contrast', generalLimiter, require('./routes/colorContrast'));
app.use('/api/screen-reader', generalLimiter, require('./routes/screenReader'));
app.use('/api/keyboard-nav', generalLimiter, require('./routes/keyboardNav'));
app.use('/api/aria-validation', generalLimiter, require('./routes/ariaValidation'));
app.use('/api/alt-text', generalLimiter, require('./routes/altText'));
app.use('/api/scores', generalLimiter, require('./routes/scores'));
app.use('/api/certificates', generalLimiter, require('./routes/certificates'));
app.use('/api/audit-logs', generalLimiter, require('./routes/auditLogs'));
app.use('/api/focus-order-risk', generalLimiter, require('./routes/focusOrderRisk'));
app.use('/api/governed-audits', auditRateLimiter, require('./routes/governedAudits'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\x1b[32m✓ Backend server running on http://localhost:${PORT}\x1b[0m`);
});

// Batch-generated stub and gap routes are intentionally not mounted as product APIs.

// === Custom Views (A11y Views) ===
app.use('/api/custom-views', require('./routes/customViews'));
