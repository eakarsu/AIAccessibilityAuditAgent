const router = require('express').Router();

router.post('/score', (req, res) => {
  const { tabStops = 0, visualOrderBreaks = 0, hiddenFocusable = 0, modalTrapMissing = false } = req.body || {};
  const score = Math.min(100, Math.round(
    Math.max(0, Number(tabStops) - 30) * 1.2 +
    Number(visualOrderBreaks) * 14 +
    Number(hiddenFocusable) * 10 +
    (modalTrapMissing ? 25 : 0)
  ));
  res.json({
    feature: 'focus_order_risk',
    score,
    level: score >= 70 ? 'critical' : score >= 35 ? 'needs-fix' : 'pass',
    fixes: [
      Number(visualOrderBreaks) > 0 && 'Align DOM order with visual reading order.',
      Number(hiddenFocusable) > 0 && 'Remove hidden interactive elements from tab order.',
      modalTrapMissing && 'Add focus trap and return focus behavior for modals.',
      Number(tabStops) > 30 && 'Group long controls with skip links or landmarks.',
    ].filter(Boolean),
  });
});

module.exports = router;
