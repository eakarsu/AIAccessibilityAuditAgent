const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

// GET /api/alt-text
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alt_text_generations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get alt text generations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/alt-text/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alt_text_generations WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alt text generation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get alt text generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/alt-text
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { audit_id, image_url, current_alt, generated_alt, context_description, confidence_score, ai_model, status } = req.body;
    if (!audit_id || !image_url) {
      return res.status(400).json({ error: 'audit_id and image_url are required' });
    }
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO alt_text_generations (id, audit_id, image_url, current_alt, generated_alt, context_description, confidence_score, ai_model, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id, audit_id, image_url, current_alt, generated_alt, context_description, confidence_score, ai_model, status || 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create alt text generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/alt-text/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { image_url, current_alt, generated_alt, context_description, confidence_score, status } = req.body;
    const result = await pool.query(
      'UPDATE alt_text_generations SET image_url = COALESCE($1, image_url), current_alt = COALESCE($2, current_alt), generated_alt = COALESCE($3, generated_alt), context_description = COALESCE($4, context_description), confidence_score = COALESCE($5, confidence_score), status = COALESCE($6, status) WHERE id = $7 RETURNING *',
      [image_url, current_alt, generated_alt, context_description, confidence_score, status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alt text generation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update alt text generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/alt-text/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM alt_text_generations WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alt text generation not found' });
    }
    res.json({ message: 'Alt text generation deleted successfully', generation: result.rows[0] });
  } catch (err) {
    console.error('Delete alt text generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/alt-text/generate-ai
router.post('/generate-ai', authenticateToken, async (req, res) => {
  try {
    const { audit_id, image_url, current_alt, context } = req.body;
    if (!image_url) {
      return res.status(400).json({ error: 'image_url is required' });
    }

    const aiResult = await openRouter.generateAltText(image_url, context);

    let saved = null;
    if (audit_id) {
      const id = uuidv4();
      const result = await pool.query(
        'INSERT INTO alt_text_generations (id, audit_id, image_url, current_alt, generated_alt, context_description, confidence_score, ai_model, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [id, audit_id, image_url, current_alt, aiResult.generated_alt, aiResult.context_description, aiResult.confidence_score, process.env.OPENROUTER_MODEL, 'completed']
      );
      saved = result.rows[0];
    }

    res.json({ generation: saved, ai_result: aiResult });
  } catch (err) {
    console.error('Generate alt text AI error:', err);
    res.status(500).json({ error: 'AI alt text generation failed: ' + err.message });
  }
});

module.exports = router;
