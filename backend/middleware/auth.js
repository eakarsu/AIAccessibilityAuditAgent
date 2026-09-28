const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
// Runtime acceptance sessions are issued by runtimeAcceptance.js. They have no
// per-user tenant column, so all runtime operators share this explicit tenant.
const RUNTIME_TENANT_ID = process.env.RUNTIME_TENANT_ID || 'runtime-app';

function isRuntimeSessionToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);
}

async function findRuntimeSessionUser(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.role
       FROM runtime_app_sessions s
       JOIN runtime_app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE
      LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.authSource = 'jwt';
    return next();
  } catch (_) {
    // Not a JWT: fall through and try the runtime acceptance session tokens.
  }

  if (isRuntimeSessionToken(token)) {
    try {
      const sessionUser = await findRuntimeSessionUser(token);
      if (sessionUser) {
        req.user = {
          id: sessionUser.id,
          email: sessionUser.email,
          role: sessionUser.role,
          displayName: sessionUser.display_name,
          tenantId: RUNTIME_TENANT_ID,
        };
        req.authSource = 'runtime_session';
        return next();
      }
    } catch (err) {
      console.error('Runtime session lookup failed:', err.message);
    }
  }

  return res.status(403).json({ error: 'Invalid or expired token' });
}

module.exports = authenticateToken;
module.exports.isRuntimeSessionToken = isRuntimeSessionToken;
