require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
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

// BATCH_00_AUDIT_MOUNTS
app.use('/api/alt-text-vision', require('./routes/altTextVision'));
app.use('/api/heading-hierarchy', require('./routes/headingHierarchy'));
app.use('/api/figma-plugin-bridge', require('./routes/figmaPluginBridge'));
app.use('/api/color-fixer', require('./routes/colorFixer'));
app.use('/api/external-audit-bridge', require('./routes/externalAuditBridge'));

// === Batch 00 Gaps & Frontend Mounts ===
app.use('/api/gap-ai-alt-text-generation-images', require('./routes/gap_ai_alt_text_generation_images'));
app.use('/api/gap-ai-heading-structure-optimizer', require('./routes/gap_ai_heading_structure_optimizer'));
app.use('/api/gap-ai-color-scheme-recommendation-balancing', require('./routes/gap_ai_color_scheme_recommendation_balancing'));
app.use('/api/gap-ai-form-label-generation', require('./routes/gap_ai_form_label_generation'));
app.use('/api/gap-ai-error-message-rewriting-screen', require('./routes/gap_ai_error_message_rewriting_screen'));
app.use('/api/gap-automated-html-remediation-rewriter', require('./routes/gap_automated_html_remediation_rewriter'));
app.use('/api/gap-large-scale-crawling-spidering', require('./routes/gap_large_scale_crawling_spidering'));
app.use('/api/gap-client-website-embeddable-badge', require('./routes/gap_client_website_embeddable_badge'));
app.use('/api/gap-browser-extension-live-scan', require('./routes/gap_browser_extension_live_scan'));
app.use('/api/gap-outbound-webhooks', require('./routes/gap_outbound_webhooks'));
app.use('/api/gap-notifications-subsystem', require('./routes/gap_notifications_subsystem'));

// === Custom Views (A11y Views) ===
app.use('/api/custom-views', require('./routes/customViews'));
