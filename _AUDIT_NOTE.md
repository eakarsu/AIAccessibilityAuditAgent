# Audit Apply Note — AIAccessibilityAuditAgent

## Audit recommendations (from batch_00.md)

The audit reports 0 AI endpoints. **This is a scanner false-negative.** `backend/routes/aiAudit.js` (787 lines) defines:
`/validate-headings`, `/audit-forms`, `/prioritize-issues`, `/check-link-text`, `/check-media`, `/convert-semantic`, `/readability-score`, `/accessible-palette`, `/remediation-chat`, `/monitoring-dashboard`, `/results`.

Audit "missing AI" already covered:
- AI heading optimization → `/validate-headings`
- AI form label generation → `/audit-forms`
- AI color scheme recommendation → `/accessible-palette`
- AI alt text generation → covered by `/check-media`
- AI error message rewriting → covered via `/remediation-chat`

### Missing non-AI features (per audit)
- Automated remediation (rewriting HTML)
- Large-scale crawling
- Third-party badge generation

## Implemented in this pass

None. Existing endpoints cover the recommended AI capabilities. Adding more would duplicate functionality.

## Backlog (not implemented)

| Item | Category | Reason |
|---|---|---|
| Automated HTML remediation | TOO-RISKY | Heavy parsing/rewriting logic |
| Large-scale crawling | TOO-RISKY | Crawler infra |
| Third-party badge generation | NEEDS-PRODUCT-DECISION | Brand decisions |
| Browser extension | TOO-RISKY | New project surface |
| Figma plugin | TOO-RISKY | New project surface |
| External integrations (Axe, WAVE, SiteImprove) | NEEDS-CREDS | Vendor APIs |

## Apply pass 3 (frontend)

FE already wired. `frontend/src/App.js` declares the full `aiToolConfigs` map covering all 12 AI endpoints (`/ai/validate-headings`, `/ai/audit-forms`, `/ai/prioritize-issues`, `/ai/check-link-text`, `/ai/check-media`, `/ai/convert-semantic`, `/ai/readability-score`, `/ai/monitoring-dashboard`, `/ai/accessible-palette`, `/ai/remediation-chat`, `/ai/vpat-generator`), `services/api.js` exports the matching axios calls, and the `AIToolPage` component renders the configured forms. No changes required.

## Apply pass 4 (mechanical backlog)

Skipped — no MECHANICAL backlog items remained. Every entry in the prior backlog table is tagged TOO-RISKY (HTML remediation, crawler, browser/Figma extensions), NEEDS-PRODUCT-DECISION (badges), or NEEDS-CREDS (Axe/WAVE/SiteImprove). All audit-recommended AI capabilities are already covered by the 12 existing endpoints in `backend/routes/aiAudit.js`.

## Apply pass 5 (all backlog)

Hardened the AI 503 contract since no MECHANICAL backlog items remained:

- `backend/services/openRouterService.js` — `callOpenRouter` now short-circuits with `err.statusCode = 503` and `err.missing = 'OPENROUTER_API_KEY'` when the key is missing. ENV: `OPENROUTER_API_KEY`.
- `backend/routes/aiAudit.js` — all 11 AI route catch handlers replaced `res.status(500)` with `res.status(err.statusCode || 500).json({ error, missing })`, so AI endpoints surface 503 instead of 500 when the key is absent.
- `backend/routes/adaReports.js` — `/generate-ai` and `/generate-vpat` propagate `err.statusCode` and `err.missing` similarly.

Smoke-tested: with `OPENROUTER_API_KEY=""` set at boot, `POST /api/ai/accessible-palette` returns `HTTP 503 {"error":"AI service not configured","missing":"OPENROUTER_API_KEY"}`. With the env-configured key, the same endpoint returns 200 with a valid palette. Login flow unaffected (`demo@accessibility.com / password123`).

Backlog still untouched (TOO-RISKY/NEEDS-CREDS): automated HTML remediation, large-scale crawler, browser extension, Figma plugin, Axe/WAVE/SiteImprove integrations, brand-decision badge generation.
