/**
 * Pure-logic accessibility tools (no AI)
 * POST /api/accessibility/contrast-check  - real WCAG contrast ratio calculation
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authenticateToken = require('../middleware/auth');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

/**
 * Parse a hex color string (#RRGGBB or #RGB) into { r, g, b }
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  let r, g, b;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return { r, g, b };
}

/**
 * Compute relative luminance per WCAG 2.x
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance({ r, g, b }) {
  const linearize = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Contrast ratio between two colors
 */
function contrastRatio(hex1, hex2) {
  const L1 = relativeLuminance(hexToRgb(hex1));
  const L2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// POST /api/accessibility/contrast-check
router.post(
  '/contrast-check',
  authenticateToken,
  [
    body('foreground')
      .notEmpty().withMessage('foreground is required')
      .matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
      .withMessage('foreground must be a valid hex color (#RGB or #RRGGBB)'),
    body('background')
      .notEmpty().withMessage('background is required')
      .matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
      .withMessage('background must be a valid hex color (#RGB or #RRGGBB)'),
  ],
  (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { foreground, background } = req.body;
      const ratio = contrastRatio(foreground, background);
      const ratioRounded = Math.round(ratio * 100) / 100;

      // WCAG thresholds:
      // AA normal text: 4.5:1, AA large text: 3:1, AAA normal: 7:1, AAA large: 4.5:1
      res.json({
        ratio: ratioRounded,
        passesAA: ratio >= 4.5,         // normal text
        passesAAA: ratio >= 7,           // normal text
        passesLargeAA: ratio >= 3,       // large text (18pt+ or 14pt bold)
        passesLargeAAA: ratio >= 4.5,    // large text AAA
        foreground,
        background,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
