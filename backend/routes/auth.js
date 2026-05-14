const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('\x1b[31mFATAL: JWT_SECRET environment variable is not set. Refusing to start.\x1b[0m');
  // Do not throw here (would crash on require); log loudly
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
      .matches(/\d/).withMessage('Password must contain at least one number'),
    body('full_name').notEmpty().withMessage('full_name is required').trim(),
    body('role').optional().isIn(['admin', 'auditor', 'viewer']).withMessage('Invalid role'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { email, password, full_name, role } = req.body;

      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const password_hash = await bcrypt.hash(password, 12);
      const id = uuidv4();
      const result = await pool.query(
        'INSERT INTO users (id, email, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role, created_at',
        [id, email, password_hash, full_name, role || 'auditor']
      );

      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET || 'fallback-dev-secret',
        { expiresIn: '24h' }
      );

      res.status(201).json({ user, token });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { email, password } = req.body;

      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET || 'fallback-dev-secret',
        { expiresIn: '24h' }
      );

      res.json({
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, created_at: user.created_at },
        token,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticateToken,
  [
    body('current_password').notEmpty().withMessage('current_password is required'),
    body('new_password')
      .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter')
      .matches(/\d/).withMessage('New password must contain at least one number'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { current_password, new_password } = req.body;
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      const user = result.rows[0];
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

      const new_hash = await bcrypt.hash(new_password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [new_hash, req.user.id]);

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
