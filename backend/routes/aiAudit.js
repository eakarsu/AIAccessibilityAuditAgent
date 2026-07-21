/**
 * AI-powered accessibility audit routes
 * POST /api/ai/validate-headings
 * POST /api/ai/audit-forms
 * POST /api/ai/prioritize-issues
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authenticateToken = require('../middleware/auth');
const openRouter = require('../services/openRouterService');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function crawlHeadings(url) {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(15000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const headings = await page.evaluate(() => {
      const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      const result = [];
      document.querySelectorAll(tags.join(',')).forEach(el => {
        result.push({ level: parseInt(el.tagName[1]), text: el.innerText.trim() });
      });
      return result;
    });
    await browser.close();
    return headings;
  } catch (err) {
    return null;
  }
}

async function crawlForms(url) {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(15000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const forms = await page.evaluate(() => {
      const inputs = [];
      document.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => {
        const id = el.getAttribute('id');
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const ariaRequired = el.getAttribute('aria-required');
        const associatedLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
        const role = el.getAttribute('role');
        inputs.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type'),
          id,
          name: el.getAttribute('name'),
          ariaLabel,
          ariaLabelledBy,
          ariaRequired,
          hasAssociatedLabel: !!associatedLabel,
          labelText: associatedLabel ? associatedLabel.innerText.trim() : null,
          role,
          required: el.hasAttribute('required'),
          outerHTML: el.outerHTML.slice(0, 300),
        });
      });
      return inputs;
    });
    await browser.close();
    return forms;
  } catch (err) {
    return null;
  }
}

function parseHeadingsFromHtml(htmlContent) {
  const regex = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
  const headings = [];
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    headings.push({ level: parseInt(match[1][1]), text: match[2].replace(/<[^>]+>/g, '').trim() });
  }
  return headings;
}

function parseFormsFromHtml(htmlContent) {
  const inputs = [];
  const inputRegex = /<(input|select|textarea)[^>]*>/gi;
  let match;
  while ((match = inputRegex.exec(htmlContent)) !== null) {
    const tag = match[0];
    const getId = tag.match(/id=["']([^"']+)["']/i);
    const getAriaLabel = tag.match(/aria-label=["']([^"']+)["']/i);
    const getAriaRequired = tag.match(/aria-required=["']([^"']+)["']/i);
    const id = getId ? getId[1] : null;
    const labelMatch = id ? new RegExp(`for=["']${id}["']`).test(htmlContent) : false;
    inputs.push({
      tag: match[1],
      id,
      ariaLabel: getAriaLabel ? getAriaLabel[1] : null,
      ariaRequired: getAriaRequired ? getAriaRequired[1] : null,
      hasAssociatedLabel: labelMatch,
      outerHTML: tag.slice(0, 300),
    });
  }
  return inputs;
}

// POST /api/ai/validate-headings
router.post(
  '/validate-headings',
  authenticateToken,
  [
    body().custom((_, { req }) => {
      if (!req.body.url && !req.body.htmlContent) {
        throw new Error('Either url or htmlContent is required');
      }
      if (req.body.url && !isValidUrl(req.body.url)) {
        throw new Error('url must be a valid http or https URL');
      }
      return true;
    }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { url, htmlContent } = req.body;

      let headings = null;
      if (url) {
        headings = await crawlHeadings(url);
      }
      if (!headings && htmlContent) {
        headings = parseHeadingsFromHtml(htmlContent);
      }
      if (!headings) {
        return res.status(422).json({ error: 'Could not extract headings from the provided source' });
      }

      // Pure logic checks - no AI needed
      const issues = [];
      const h1s = headings.filter(h => h.level === 1);
      if (h1s.length === 0) {
        issues.push({ type: 'missing_h1', severity: 'critical', message: 'Page has no H1 heading' });
      } else if (h1s.length > 1) {
        issues.push({ type: 'multiple_h1', severity: 'major', message: `Page has ${h1s.length} H1 headings; only one is recommended` });
      }

      // Check for skipped levels
      for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1].level;
        const curr = headings[i].level;
        if (curr > prev + 1) {
          issues.push({
            type: 'skipped_level',
            severity: 'major',
            message: `Heading level skipped from H${prev} to H${curr} (at: "${headings[i].text.slice(0, 50)}")`,
          });
        }
      }

      // Check for empty headings
      headings.forEach((h, idx) => {
        if (!h.text) {
          issues.push({ type: 'empty_heading', severity: 'critical', message: `H${h.level} heading at position ${idx + 1} is empty` });
        }
      });

      // Build heading tree
      const headingTree = headings.map((h, i) => ({ ...h, index: i + 1 }));

      res.json({
        valid: issues.length === 0,
        issues,
        headingTree,
        total_headings: headings.length,
      });
    } catch (err) {
      console.error('Validate headings error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/audit-forms
router.post(
  '/audit-forms',
  authenticateToken,
  [
    body().custom((_, { req }) => {
      if (!req.body.url && !req.body.htmlContent) throw new Error('Either url or htmlContent is required');
      if (req.body.url && !isValidUrl(req.body.url)) throw new Error('url must be a valid http or https URL');
      return true;
    }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { url, htmlContent } = req.body;

      let formElements = null;
      if (url) {
        formElements = await crawlForms(url);
      }
      if (!formElements && htmlContent) {
        formElements = parseFormsFromHtml(htmlContent);
      }

      // Pure logic checks
      const issues = [];
      if (formElements) {
        formElements.forEach((el, i) => {
          if (!el.ariaLabel && !el.hasAssociatedLabel && !el.ariaLabelledBy) {
            issues.push({
              type: 'missing_label',
              severity: 'critical',
              element: el.tag,
              id: el.id,
              message: `Form element "${el.tag}"${el.id ? ` (id="${el.id}")` : ''} has no associated label, aria-label, or aria-labelledby`,
              fix: `Add <label for="${el.id || 'input-id'}">Label text</label> or aria-label="Label text"`,
            });
          }
          if (el.required && !el.ariaRequired) {
            issues.push({
              type: 'missing_aria_required',
              severity: 'major',
              element: el.tag,
              id: el.id,
              message: `Required field "${el.tag}"${el.id ? ` (id="${el.id}")` : ''} lacks aria-required="true"`,
              fix: 'Add aria-required="true" to required form fields',
            });
          }
        });
      }

      // Get AI fix suggestions for issues found
      let aiSuggestions = null;
      if (issues.length > 0) {
        const prompt = `The following form accessibility issues were found${url ? ` on ${url}` : ''}:
${JSON.stringify(issues, null, 2)}

For each issue, provide specific, actionable fix suggestions with code examples. Return as JSON: { fixes: [{ issue_type, fix_description, code_example }] }`;
        const systemPrompt = 'You are an expert web accessibility engineer. Provide concise, implementable fixes for form accessibility issues. Return valid JSON.';
        try {
          aiSuggestions = await openRouter.callOpenRouterRaw(systemPrompt, prompt);
        } catch (_) {}
      }

      res.json({
        issues,
        elements_checked: formElements ? formElements.length : 0,
        ai_suggestions: aiSuggestions,
      });
    } catch (err) {
      console.error('Audit forms error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/prioritize-issues
router.post(
  '/prioritize-issues',
  authenticateToken,
  [
    body('issues').isArray({ min: 1 }).withMessage('issues must be a non-empty array'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { issues } = req.body;

      const prompt = `Rank the following accessibility issues by user impact. Consider WCAG level (A > AA > AAA), percentage of users affected (e.g., screen reader users, keyboard-only users, color-blind users), and fix complexity (low/medium/high).

Issues to rank:
${JSON.stringify(issues, null, 2)}

Return a JSON object: {
  prioritized: [{
    original_issue: <issue object>,
    rank: <number starting at 1>,
    impact_score: <0-100>,
    affected_user_pct: <estimated %>,
    fix_complexity: "low|medium|high",
    wcag_level: "A|AA|AAA|unknown",
    reasoning: <string>
  }],
  summary: <string>
}`;

      const systemPrompt = 'You are an expert accessibility consultant. Prioritize accessibility issues by real-world user impact. Return valid JSON only.';
      const aiResponse = await openRouter.callOpenRouterRaw(systemPrompt, prompt);

      // Persist AI result
      const pool = require('../db');
      const { v4: uuidv4 } = require('uuid');
      await pool.query(
        `INSERT INTO ai_results (id, entity_type, entity_id, endpoint, result_json, model, created_at)
         VALUES ($1, 'issues_batch', $2, 'prioritize-issues', $3, $4, NOW())`,
        [uuidv4(), 'batch', JSON.stringify(aiResponse), process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
      ).catch(() => {});

      res.json({ result: aiResponse });
    } catch (err) {
      console.error('Prioritize issues error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/check-link-text - Link text quality checker
router.post(
  '/check-link-text',
  authenticateToken,
  [
    body().custom((_, { req }) => {
      if (!req.body.url && !req.body.htmlContent && !Array.isArray(req.body.links)) {
        throw new Error('Either url, htmlContent, or links array is required');
      }
      return true;
    }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { url, htmlContent, links: linksInput } = req.body;
      let links = linksInput;

      if (!links && url) {
        try {
          const puppeteer = require('puppeteer');
          const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          const page = await browser.newPage();
          await page.setDefaultNavigationTimeout(15000);
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({
              href: a.getAttribute('href') || '',
              text: a.innerText.trim(),
              ariaLabel: a.getAttribute('aria-label') || null,
              title: a.getAttribute('title') || null,
            }));
          });
          await browser.close();
        } catch (_) {}
      }

      if (!links && htmlContent) {
        const re = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
        links = [];
        let m;
        while ((m = re.exec(htmlContent)) !== null) {
          links.push({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() });
        }
      }

      if (!links || links.length === 0) {
        return res.status(422).json({ error: 'No links found' });
      }

      const generic = ['click here', 'here', 'read more', 'more', 'learn more', 'this', 'this link', 'link', 'click', 'go'];
      const issues = [];
      links.forEach((l, idx) => {
        const txt = (l.text || '').trim().toLowerCase();
        if (!txt && !l.ariaLabel) {
          issues.push({ index: idx, href: l.href, type: 'empty_link', severity: 'critical', message: 'Link has no accessible text or aria-label' });
        } else if (generic.includes(txt)) {
          issues.push({ index: idx, href: l.href, text: l.text, type: 'generic_text', severity: 'major', message: `Link text "${l.text}" is not descriptive`, suggestion: 'Use descriptive text that conveys the link destination or purpose' });
        } else if (txt.length < 3 && !l.ariaLabel) {
          issues.push({ index: idx, href: l.href, text: l.text, type: 'too_short', severity: 'minor', message: `Link text "${l.text}" is too short` });
        }
        if (l.href && /\.(pdf|docx?|xlsx?|pptx?|zip)$/i.test(l.href) && !/(pdf|doc|excel|word|powerpoint|zip|download)/i.test(txt)) {
          issues.push({ index: idx, href: l.href, type: 'undisclosed_filetype', severity: 'minor', message: 'Link to file does not indicate file type', suggestion: 'Indicate the file type in link text (e.g., "Annual Report (PDF)")' });
        }
      });

      let aiSuggestions = null;
      if (issues.length > 0) {
        const prompt = `Suggest descriptive replacement link text for the following accessibility-flagged links:
${JSON.stringify(issues.slice(0, 20), null, 2)}

Return JSON: { suggestions: [{ index, original_text, suggested_text, rationale }] }`;
        try {
          aiSuggestions = await openRouter.callOpenRouterRaw(
            'You are a web accessibility editor. Suggest concise, descriptive link text. Return valid JSON.',
            prompt
          );
        } catch (_) {}
      }

      res.json({ total_links: links.length, issues, ai_suggestions: aiSuggestions });
    } catch (err) {
      console.error('Check link text error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/check-media - Media accessibility checker
router.post(
  '/check-media',
  authenticateToken,
  [
    body().custom((_, { req }) => {
      if (!req.body.url && !req.body.htmlContent) throw new Error('Either url or htmlContent is required');
      return true;
    }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { url, htmlContent } = req.body;
      let media = null;

      if (url) {
        try {
          const puppeteer = require('puppeteer');
          const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          const page = await browser.newPage();
          await page.setDefaultNavigationTimeout(15000);
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          media = await page.evaluate(() => {
            const elements = [];
            document.querySelectorAll('video, audio').forEach(el => {
              elements.push({
                tag: el.tagName.toLowerCase(),
                src: el.getAttribute('src') || (el.querySelector('source') || {}).src || null,
                hasCaptions: !!el.querySelector('track[kind="captions"], track[kind="subtitles"]'),
                hasDescription: !!el.querySelector('track[kind="descriptions"]'),
                controls: el.hasAttribute('controls'),
                autoplay: el.hasAttribute('autoplay'),
                muted: el.hasAttribute('muted'),
              });
            });
            document.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"]').forEach(el => {
              elements.push({ tag: 'iframe', src: el.getAttribute('src'), title: el.getAttribute('title') || null });
            });
            return elements;
          });
          await browser.close();
        } catch (_) {}
      }

      if (!media && htmlContent) {
        media = [];
        const videoRe = /<(video|audio)[^>]*>([\s\S]*?)<\/\1>/gi;
        let m;
        while ((m = videoRe.exec(htmlContent)) !== null) {
          const inner = m[2];
          media.push({
            tag: m[1],
            hasCaptions: /track[^>]*kind=["'](captions|subtitles)["']/i.test(inner),
            hasDescription: /track[^>]*kind=["']descriptions["']/i.test(inner),
            controls: /<\1[^>]*controls/i.test(m[0]),
            autoplay: /<\1[^>]*autoplay/i.test(m[0]),
          });
        }
      }

      if (!media || media.length === 0) {
        return res.json({ media_count: 0, issues: [], message: 'No video/audio media found' });
      }

      const issues = [];
      media.forEach((el, idx) => {
        if ((el.tag === 'video' || el.tag === 'audio') && !el.hasCaptions) {
          issues.push({ index: idx, tag: el.tag, type: 'missing_captions', severity: 'critical', message: `${el.tag} element lacks captions/subtitles`, wcag: '1.2.2 Captions (Prerecorded)' });
        }
        if (el.tag === 'video' && !el.hasDescription) {
          issues.push({ index: idx, tag: el.tag, type: 'missing_audio_description', severity: 'major', message: 'video lacks audio descriptions', wcag: '1.2.5 Audio Description (Prerecorded)' });
        }
        if (el.autoplay && !el.muted) {
          issues.push({ index: idx, tag: el.tag, type: 'autoplay_unmuted', severity: 'major', message: 'autoplay without muted causes accessibility issues', wcag: '1.4.2 Audio Control' });
        }
        if (!el.controls && (el.tag === 'video' || el.tag === 'audio')) {
          issues.push({ index: idx, tag: el.tag, type: 'no_controls', severity: 'major', message: `${el.tag} lacks user controls` });
        }
        if (el.tag === 'iframe' && !el.title) {
          issues.push({ index: idx, tag: el.tag, type: 'iframe_no_title', severity: 'major', message: 'video iframe lacks title attribute', wcag: '4.1.2 Name, Role, Value' });
        }
      });

      res.json({ media_count: media.length, issues, media });
    } catch (err) {
      console.error('Check media error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/convert-semantic - Semantic HTML converter
router.post(
  '/convert-semantic',
  authenticateToken,
  [body('html').notEmpty().withMessage('html is required')],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { html } = req.body;

      const prompt = `Convert the following HTML to use semantic HTML5 elements where appropriate. Replace generic divs/spans with semantic equivalents like <header>, <nav>, <main>, <article>, <section>, <aside>, <footer>, <button>, <label>, <figure>, etc. Add proper ARIA roles where helpful.

Original HTML:
${html}

Return JSON: { converted_html, changes: [{ original_element, new_element, rationale }], aria_additions: [{ element, attribute, value, rationale }], wcag_improvements: [string] }`;

      const aiResponse = await openRouter.callOpenRouterRaw(
        'You are an expert in semantic HTML5 and WCAG 2.1. Convert non-semantic HTML to semantic equivalents. Return valid JSON.',
        prompt
      );

      res.json({ result: aiResponse });
    } catch (err) {
      console.error('Convert semantic error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/readability-score - Readability score analyzer
router.post(
  '/readability-score',
  authenticateToken,
  [body('text').notEmpty().withMessage('text is required')],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { text } = req.body;

      // Pure logic: compute Flesch-Kincaid and other metrics
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const words = text.match(/\b\w+\b/g) || [];
      const wordCount = words.length;
      const sentenceCount = sentences.length || 1;

      // Approximate syllable count
      function countSyllables(word) {
        word = word.toLowerCase().replace(/[^a-z]/g, '');
        if (word.length <= 3) return 1;
        word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
        word = word.replace(/^y/, '');
        const matches = word.match(/[aeiouy]{1,2}/g);
        return matches ? matches.length : 1;
      }
      const totalSyllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
      const avgSentenceLength = wordCount / sentenceCount;
      const avgSyllablesPerWord = totalSyllables / (wordCount || 1);

      const fleschReadingEase = 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;
      const fleschKincaidGrade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;

      // Get AI suggestions for simplification
      let aiSuggestions = null;
      try {
        const prompt = `Analyze the readability of the following text. Identify complex words, jargon, and overly long sentences. Suggest plain-language alternatives.

Text:
${text.slice(0, 2000)}

Return JSON: { complex_words: [{ word, replacement }], long_sentences: [{ original, simplified }], jargon: [{ term, plain_explanation }], plain_summary: string }`;
        aiSuggestions = await openRouter.callOpenRouterRaw(
          'You are a plain-language editor specializing in WCAG 3.1 readability guidelines. Return valid JSON.',
          prompt
        );
      } catch (_) {}

      const grade = Math.max(1, Math.round(fleschKincaidGrade));
      const wcagCompliant = fleschKincaidGrade <= 9;

      res.json({
        word_count: wordCount,
        sentence_count: sentenceCount,
        avg_sentence_length: Math.round(avgSentenceLength * 10) / 10,
        avg_syllables_per_word: Math.round(avgSyllablesPerWord * 100) / 100,
        flesch_reading_ease: Math.round(fleschReadingEase * 10) / 10,
        flesch_kincaid_grade: grade,
        wcag_aaa_compliance: wcagCompliant,
        wcag_note: wcagCompliant
          ? 'Reading level is below 9th grade — meets WCAG 3.1.5 (AAA)'
          : 'Reading level is above 9th grade — fails WCAG 3.1.5 (AAA). Consider simplifying.',
        ai_suggestions: aiSuggestions,
      });
    } catch (err) {
      console.error('Readability score error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// GET /api/ai/monitoring-dashboard - Accessibility Monitoring Dashboard
router.get(
  '/monitoring-dashboard',
  authenticateToken,
  async (req, res) => {
    try {
      const { Pool } = require('pg');
      const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'accessibility_audit',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
      });

      // Score trends for last 30 days
      let scoreTrends = [];
      try {
        const result = await pool.query(
          `SELECT DATE(created_at) AS day, AVG(score) AS avg_score, COUNT(*) AS audits
           FROM scores
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY DATE(created_at)
           ORDER BY day ASC`
        );
        scoreTrends = result.rows;
      } catch (_) {}

      // Issue counts by severity
      let issueBySeverity = [];
      try {
        const result = await pool.query(
          `SELECT severity, COUNT(*) AS count FROM issues GROUP BY severity ORDER BY count DESC`
        );
        issueBySeverity = result.rows;
      } catch (_) {}

      // Recent regressions: audits whose latest score dropped
      let regressions = [];
      try {
        const result = await pool.query(
          `SELECT s1.audit_id, s1.score AS latest_score, s2.score AS prior_score,
                  (s1.score - s2.score) AS delta, s1.created_at
           FROM scores s1
           JOIN LATERAL (
             SELECT score FROM scores s2
             WHERE s2.audit_id = s1.audit_id AND s2.created_at < s1.created_at
             ORDER BY s2.created_at DESC LIMIT 1
           ) s2 ON true
           WHERE s1.score < s2.score
           ORDER BY s1.created_at DESC LIMIT 10`
        );
        regressions = result.rows;
      } catch (_) {}

      // New issues last 7 days
      let newIssuesCount = 0;
      try {
        const result = await pool.query(
          `SELECT COUNT(*) AS count FROM issues WHERE created_at >= NOW() - INTERVAL '7 days'`
        );
        newIssuesCount = parseInt(result.rows[0].count, 10);
      } catch (_) {}

      res.json({
        score_trends: scoreTrends,
        issue_by_severity: issueBySeverity,
        regressions,
        new_issues_7d: newIssuesCount,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Monitoring dashboard error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/accessible-palette - Generate accessible color palette from brand color
router.post(
  '/accessible-palette',
  authenticateToken,
  [body('primary_color').notEmpty().withMessage('primary_color is required')],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { primary_color } = req.body;
      const result = await openRouter.generateAccessiblePalette(primary_color);

      // Persist
      const pool = require('../db');
      const { v4: uuidv4 } = require('uuid');
      await pool.query(
        `INSERT INTO ai_results (id, entity_type, entity_id, endpoint, result_json, model, created_at)
         VALUES ($1, 'palette', $2, 'accessible-palette', $3, $4, NOW())`,
        [uuidv4(), primary_color, JSON.stringify(result), process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
      ).catch(() => {});

      res.json({ palette: result, primary_color });
    } catch (err) {
      console.error('Accessible palette error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// POST /api/ai/remediation-chat - AI chat for remediation guidance
router.post(
  '/remediation-chat',
  authenticateToken,
  [
    body('question').notEmpty().withMessage('question is required'),
    body('issue_id').optional(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { question, issue_id, history } = req.body;
      const pool = require('../db');
      const { v4: uuidv4 } = require('uuid');

      let issue = null;
      if (issue_id) {
        const r = await pool.query('SELECT * FROM accessibility_issues WHERE id = $1', [issue_id]);
        issue = r.rows[0] || null;
      }

      const answer = await openRouter.generateRemediationChat(issue, question, history || []);

      await pool.query(
        `INSERT INTO ai_results (id, entity_type, entity_id, endpoint, result_json, model, created_at)
         VALUES ($1, 'chat', $2, 'remediation-chat', $3, $4, NOW())`,
        [uuidv4(), issue_id || 'general', JSON.stringify(answer), process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022']
      ).catch(() => {});

      res.json(answer);
    } catch (err) {
      console.error('Remediation chat error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

// GET /api/ai/results - List persisted AI results with pagination
router.get(
  '/results',
  authenticateToken,
  async (req, res) => {
    try {
      const pool = require('../db');
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const { entity_type, entity_id } = req.query;

      const conditions = [];
      const params = [];
      if (entity_type) { conditions.push(`entity_type = $${params.length + 1}`); params.push(entity_type); }
      if (entity_id) { conditions.push(`entity_id = $${params.length + 1}`); params.push(entity_id); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const countParams = [...params];
      params.push(limit, offset);

      const [result, countResult] = await Promise.all([
        pool.query(`SELECT * FROM ai_results ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
        pool.query(`SELECT COUNT(*) FROM ai_results ${where}`, countParams),
      ]);

      const total = parseInt(countResult.rows[0].count);
      res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      console.error('Get AI results error:', err);
      res.status(err.statusCode || 500).json({ error: err.message, missing: err.missing });
    }
  }
);

module.exports = router;
