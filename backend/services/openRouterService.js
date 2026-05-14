const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Robust JSON parser that handles markdown code fences and partial JSON.
 */
function parseAIJson(text) {
  if (!text) return null;
  // Direct parse
  try { return JSON.parse(text); } catch (e) {}
  // Strip markdown code fences
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  // Extract first {...} block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
  }
  // Extract first [...] block
  const aStart = text.indexOf('[');
  const aEnd = text.lastIndexOf(']');
  if (aStart !== -1 && aEnd !== -1 && aEnd > aStart) {
    try { return JSON.parse(text.slice(aStart, aEnd + 1)); } catch (e) {}
  }
  return null;
}

async function callOpenRouter(systemPrompt, userPrompt, { jsonMode = true } = {}) {
  // Apply pass 5: short-circuit with 503 when API key is missing so all downstream
  // routes surface "AI not configured" instead of 500. ENV: OPENROUTER_API_KEY.
  if (!OPENROUTER_API_KEY) {
    const err = new Error('AI service not configured');
    err.statusCode = 503;
    err.missing = 'OPENROUTER_API_KEY';
    throw err;
  }
  const body = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  };

  // Request JSON output when supported
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000',
      'X-Title': 'AI Accessibility Audit Agent',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenRouter response');
  }
  return content;
}

async function auditSiteWithDom(url, auditType, domData) {
  const systemPrompt = `You are an expert web accessibility auditor. Analyze the provided DOM accessibility data for WCAG 2.1 violations. Return ONLY valid JSON with these fields:
{
  "overall_score": <number 0-100>,
  "issues_found": <number>,
  "pages_scanned": <number>,
  "issues": [{"severity": "critical|major|minor|info", "type": <string>, "description": <string>, "element_selector": <string|null>, "page_url": <string|null>, "wcag_criterion": <string>}],
  "summary": <string>
}`;

  const userPrompt = `Perform a ${auditType || 'full'} WCAG 2.1 accessibility audit on: ${url}

Extracted DOM accessibility data:
Page title: ${domData.title || 'Unknown'}
Page language: ${domData.lang || 'Not set'}
Accessibility attributes on elements:
${JSON.stringify(domData.elements, null, 2).slice(0, 8000)}

Analyze these real DOM elements for WCAG 2.1 compliance issues. Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for site audit');
  return parsed;
}

async function auditSite(url, auditType) {
  const systemPrompt = `You are an expert web accessibility auditor. Analyze the given website URL for WCAG 2.1 accessibility issues. Return ONLY valid JSON:
{
  "overall_score": <number 0-100>,
  "issues_found": <number>,
  "pages_scanned": <number>,
  "issues": [{"severity": "critical|major|minor|info", "type": <string>, "description": <string>, "element_selector": <string|null>, "page_url": <string|null>, "wcag_criterion": <string>}],
  "summary": <string>
}`;

  const userPrompt = `Perform a ${auditType || 'full'} WCAG 2.1 accessibility audit on: ${url}. Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for site audit');
  return parsed;
}

async function evaluateWcag(criterion, level, elementSelector, pageUrl) {
  const systemPrompt = `You are a WCAG 2.1 compliance expert. Return ONLY valid JSON:
{
  "status": "pass|fail|warning",
  "description": <string>,
  "recommendation": <string>,
  "confidence": <number 0-1>
}`;

  const userPrompt = `Evaluate WCAG criterion ${criterion} (Level ${level}) for element "${elementSelector}" on ${pageUrl}. Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for WCAG evaluation');
  return parsed;
}

async function suggestFix(issueDescription, elementSelector, wcagCriterion) {
  const systemPrompt = `You are an accessibility remediation expert. Return ONLY valid JSON:
{
  "suggestion_text": <string>,
  "code_before": <string>,
  "code_after": <string>,
  "confidence_score": <number 0-1>
}`;

  const userPrompt = `Suggest a fix for:
Issue: ${issueDescription}
Element: ${elementSelector}
WCAG: ${wcagCriterion}
Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for fix suggestion');
  return parsed;
}

async function generateReport(clientName, websiteUrl, complianceLevel, findings) {
  const systemPrompt = `You are an ADA compliance report writer. Return ONLY valid JSON:
{
  "report_type": <string>,
  "compliance_level": "A|AA|AAA",
  "summary": <string>,
  "findings": [{"area": <string>, "status": <string>, "details": <string>}],
  "recommendations": [<string>]
}`;

  const userPrompt = `Generate an ADA compliance report for:
Client: ${clientName}
Website: ${websiteUrl}
Target level: ${complianceLevel}
${findings ? `Findings: ${JSON.stringify(findings)}` : ''}
Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for report');
  return parsed;
}

async function analyzeContrast(foregroundColor, backgroundColor, fontSize) {
  const systemPrompt = `You are a color contrast accessibility expert. Return ONLY valid JSON:
{
  "contrast_ratio": <number>,
  "wcag_aa_pass": <boolean>,
  "wcag_aaa_pass": <boolean>,
  "recommendations": [<string>],
  "suggested_alternatives": [{"foreground": <string>, "background": <string>, "contrast_ratio": <number>, "passes_aa": <boolean>, "passes_aaa": <boolean>}]
}`;

  const userPrompt = `Analyze contrast between ${foregroundColor} and ${backgroundColor} at ${fontSize || '16px'}. Also suggest 3 alternative color pairs that pass WCAG AA. Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for contrast analysis');
  return parsed;
}

async function testScreenReader(pageUrl, elementType, elementSelector) {
  const systemPrompt = `You are a screen reader testing expert. Return ONLY valid JSON:
{
  "expected_announcement": <string>,
  "actual_result": <string>,
  "status": "pass|fail",
  "issues": [<string>],
  "recommendations": [<string>]
}`;

  const userPrompt = `Test screen reader behavior for element:
Page: ${pageUrl}, Type: ${elementType}, Selector: ${elementSelector}
Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for screen reader test');
  return parsed;
}

async function testKeyboardNav(pageUrl, elementSelector, elementType) {
  const systemPrompt = `You are a keyboard navigation expert. Return ONLY valid JSON:
{
  "is_focusable": <boolean>,
  "has_visible_focus": <boolean>,
  "keyboard_trap": <boolean>,
  "tab_order": <number|null>,
  "status": "pass|fail",
  "issues": [<string>],
  "recommendations": [<string>]
}`;

  const userPrompt = `Evaluate keyboard navigation for: Page: ${pageUrl}, Element: ${elementSelector}, Type: ${elementType}. Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for keyboard nav test');
  return parsed;
}

async function validateAria(elementSelector, ariaAttribute, currentValue) {
  const systemPrompt = `You are an ARIA validation expert. Return ONLY valid JSON:
{
  "is_valid": <boolean>,
  "expected_value": <string|null>,
  "recommendation": <string>,
  "severity": "critical|major|minor|info",
  "explanation": <string>
}`;

  const userPrompt = `Validate ARIA: Element: ${elementSelector}, Attribute: ${ariaAttribute}, Value: ${currentValue}. Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for ARIA validation');
  return parsed;
}

async function generateAltText(imageUrl, context) {
  const systemPrompt = `You are an image description expert for web accessibility. Return ONLY valid JSON:
{
  "generated_alt": <string>,
  "context_description": <string>,
  "confidence_score": <number 0-1>,
  "is_decorative": <boolean>
}`;

  const userPrompt = `Generate alt text for image URL: ${imageUrl}${context ? `. Context: ${context}` : ''}. Return valid JSON only.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for alt text generation');
  return parsed;
}

async function generateVPAT(clientName, websiteUrl, auditFindings) {
  const systemPrompt = `You are an accessibility compliance expert specializing in VPAT (Voluntary Product Accessibility Template) documents. Return ONLY valid JSON.`;

  const userPrompt = `Generate a VPAT 2.4 Rev document for:
Client: ${clientName}
Website: ${websiteUrl}
Audit Findings: ${JSON.stringify(auditFindings || {}).slice(0, 4000)}

Return JSON: {
  "product_name": <string>,
  "product_version": "Web Application",
  "report_date": <string>,
  "contact_info": <string>,
  "evaluation_methods": <string>,
  "wcag_sections": [{"criterion": <string>, "level": "A|AA|AAA", "conformance": "Supports|Partially Supports|Does Not Support|Not Applicable", "remarks": <string>}],
  "section_508": [{"section": <string>, "conformance": <string>, "remarks": <string>}],
  "legal_disclaimer": <string>,
  "executive_summary": <string>
}`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for VPAT');
  return parsed;
}

async function generateAccessiblePalette(primaryColor) {
  const systemPrompt = `You are a color accessibility expert. Return ONLY valid JSON.`;

  const userPrompt = `Given primary brand color ${primaryColor}, generate a complete accessible color palette where all foreground/background combinations pass WCAG AA (4.5:1 for normal text, 3:1 for large text).

Return JSON: {
  "primary": {"hex": <string>, "name": "Primary"},
  "background": {"hex": <string>, "name": "Background"},
  "surface": {"hex": <string>, "name": "Surface"},
  "text_primary": {"hex": <string>, "name": "Primary Text"},
  "text_secondary": {"hex": <string>, "name": "Secondary Text"},
  "accent": {"hex": <string>, "name": "Accent"},
  "success": {"hex": <string>, "name": "Success"},
  "warning": {"hex": <string>, "name": "Warning"},
  "error": {"hex": <string>, "name": "Error"},
  "contrast_checks": [{"pair": <string>, "ratio": <number>, "passes_aa": <boolean>, "passes_aaa": <boolean>}],
  "usage_guidelines": [<string>]
}`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for palette');
  return parsed;
}

async function generateRemediationChat(issue, userQuestion, history) {
  const systemPrompt = `You are a friendly, expert web accessibility remediation assistant. Given an accessibility issue, answer the developer's question with practical code examples and WCAG references. Return ONLY valid JSON:
{"answer": <string>, "code_example": <string|null>, "wcag_reference": <string|null>, "related_tips": [<string>]}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || []),
    { role: 'user', content: `Issue context: ${JSON.stringify(issue)}\n\nDeveloper question: ${userQuestion}` },
  ];

  const body = {
    model: OPENROUTER_MODEL,
    messages,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  };

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000',
      'X-Title': 'AI Accessibility Audit Agent',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = parseAIJson(content);
  if (!parsed) throw new Error('AI returned unparseable JSON for chat');
  return parsed;
}

// Raw call - returns parsed JSON if possible, otherwise raw text
async function callOpenRouterRaw(systemPrompt, userPrompt) {
  const content = await callOpenRouter(systemPrompt, userPrompt, { jsonMode: true });
  const parsed = parseAIJson(content);
  return parsed || content;
}

module.exports = {
  parseAIJson,
  auditSite,
  auditSiteWithDom,
  callOpenRouterRaw,
  evaluateWcag,
  suggestFix,
  generateReport,
  analyzeContrast,
  testScreenReader,
  testKeyboardNav,
  validateAria,
  generateAltText,
  generateVPAT,
  generateAccessiblePalette,
  generateRemediationChat,
};
