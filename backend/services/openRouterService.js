const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenRouter(systemPrompt, userPrompt) {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'AI Accessibility Audit Agent',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
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

function parseJSON(text) {
  // Try to extract JSON from markdown code blocks or raw text
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(raw);
}

async function auditSite(url, auditType) {
  const systemPrompt = `You are an expert web accessibility auditor. Analyze the given website URL for accessibility issues following WCAG 2.1 guidelines. Return your findings as a JSON object with these fields:
- overall_score (number 0-100)
- issues_found (number)
- pages_scanned (number)
- issues (array of objects with: severity, type, description, element_selector, page_url, wcag_criterion)
- summary (string)`;

  const userPrompt = `Perform a ${auditType || 'full'} accessibility audit on this website: ${url}. Provide a comprehensive analysis with specific issues found.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function evaluateWcag(criterion, level, elementSelector, pageUrl) {
  const systemPrompt = `You are a WCAG compliance expert. Evaluate whether a specific element meets a WCAG criterion. Return a JSON object with:
- status (string: "pass", "fail", or "warning")
- description (string: detailed explanation)
- recommendation (string: how to fix if failing)
- confidence (number 0-1)`;

  const userPrompt = `Evaluate WCAG criterion ${criterion} (Level ${level}) for element "${elementSelector}" on page ${pageUrl}. Determine if it passes, fails, or needs attention.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function suggestFix(issueDescription, elementSelector, wcagCriterion) {
  const systemPrompt = `You are an accessibility remediation expert. Given an accessibility issue, suggest a fix with before/after code examples. Return a JSON object with:
- suggestion_text (string: detailed fix explanation)
- code_before (string: example of problematic code)
- code_after (string: corrected code)
- confidence_score (number 0-1)`;

  const userPrompt = `Suggest a fix for this accessibility issue:
Issue: ${issueDescription}
Element: ${elementSelector}
WCAG Criterion: ${wcagCriterion}
Provide before and after code examples.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function generateReport(clientName, websiteUrl, complianceLevel, findings) {
  const systemPrompt = `You are an ADA compliance report writer. Generate a professional accessibility compliance report. Return a JSON object with:
- report_type (string)
- compliance_level (string: "A", "AA", or "AAA")
- summary (string: executive summary)
- findings (array of objects with: area, status, details)
- recommendations (array of strings)`;

  const userPrompt = `Generate an ADA compliance report for:
Client: ${clientName}
Website: ${websiteUrl}
Target compliance level: ${complianceLevel}
${findings ? `Existing findings: ${JSON.stringify(findings)}` : 'Perform a general assessment.'}`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function analyzeContrast(foregroundColor, backgroundColor, fontSize) {
  const systemPrompt = `You are a color contrast accessibility expert. Analyze color contrast ratios for WCAG compliance. Return a JSON object with:
- contrast_ratio (number)
- wcag_aa_pass (boolean)
- wcag_aaa_pass (boolean)
- recommendations (array of strings with suggested alternative colors if failing)`;

  const userPrompt = `Analyze the color contrast between foreground color ${foregroundColor} and background color ${backgroundColor} at font size ${fontSize || '16px'}. Calculate the contrast ratio and determine WCAG AA and AAA compliance.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function testScreenReader(pageUrl, elementType, elementSelector) {
  const systemPrompt = `You are a screen reader testing expert. Evaluate how screen readers would interpret web elements. Return a JSON object with:
- expected_announcement (string: what a screen reader should announce)
- actual_result (string: likely announcement based on the markup)
- status (string: "pass" or "fail")
- issues (array of strings describing any problems)
- recommendations (array of strings)`;

  const userPrompt = `Test how a screen reader would handle this element:
Page: ${pageUrl}
Element type: ${elementType}
Selector: ${elementSelector}
Evaluate the expected screen reader announcement and identify any issues.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function testKeyboardNav(pageUrl, elementSelector, elementType) {
  const systemPrompt = `You are a keyboard navigation accessibility expert. Evaluate keyboard accessibility of web elements. Return a JSON object with:
- is_focusable (boolean)
- has_visible_focus (boolean)
- keyboard_trap (boolean)
- tab_order (number or null)
- status (string: "pass" or "fail")
- issues (array of strings)
- recommendations (array of strings)`;

  const userPrompt = `Evaluate keyboard navigation for:
Page: ${pageUrl}
Element: ${elementSelector}
Type: ${elementType}
Check focusability, visible focus indicators, keyboard traps, and tab order.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function validateAria(elementSelector, ariaAttribute, currentValue) {
  const systemPrompt = `You are an ARIA validation expert. Validate the correct usage of ARIA attributes on web elements. Return a JSON object with:
- is_valid (boolean)
- expected_value (string or null)
- recommendation (string)
- severity (string: "critical", "major", "minor", or "info")
- explanation (string)`;

  const userPrompt = `Validate the ARIA attribute usage:
Element: ${elementSelector}
Attribute: ${ariaAttribute}
Current value: ${currentValue}
Determine if this ARIA usage is valid and provide recommendations.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

async function generateAltText(imageUrl, context) {
  const systemPrompt = `You are an image description expert for web accessibility. Generate appropriate alternative text for images. Return a JSON object with:
- generated_alt (string: concise, descriptive alt text)
- context_description (string: explanation of the image context)
- confidence_score (number 0-1)
- is_decorative (boolean: true if image is decorative and should have empty alt)`;

  const userPrompt = `Generate appropriate alt text for this image:
Image URL: ${imageUrl}
${context ? `Context: ${context}` : ''}
Provide concise, descriptive alternative text following WCAG best practices.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return parseJSON(content);
}

module.exports = {
  auditSite,
  evaluateWcag,
  suggestFix,
  generateReport,
  analyzeContrast,
  testScreenReader,
  testKeyboardNav,
  validateAria,
  generateAltText,
};
