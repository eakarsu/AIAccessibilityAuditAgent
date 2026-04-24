require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors({ origin: `http://localhost:${process.env.FRONTEND_PORT || 3000}`, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/site-audits', require('./routes/siteAudits'));
app.use('/api/wcag-checks', require('./routes/wcagChecks'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/fix-suggestions', require('./routes/fixSuggestions'));
app.use('/api/ada-reports', require('./routes/adaReports'));
app.use('/api/color-contrast', require('./routes/colorContrast'));
app.use('/api/screen-reader', require('./routes/screenReader'));
app.use('/api/keyboard-nav', require('./routes/keyboardNav'));
app.use('/api/aria-validation', require('./routes/ariaValidation'));
app.use('/api/alt-text', require('./routes/altText'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/audit-logs', require('./routes/auditLogs'));

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
