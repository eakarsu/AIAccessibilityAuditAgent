'use strict';
const crypto = require('node:crypto');
const { authorizeTarget } = require('./auditPolicy');

const ALLOWED_RULES = new Set(['document-language', 'image-alt', 'form-label', 'button-name', 'heading-order', 'semantic-main']);
const text = (value) => String(value ?? '').trim();
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function validateDraft(input = {}) {
  const violations = [];
  const title = text(input.title);
  const targetUrl = text(input.targetUrl);
  const authorizedHost = text(input.authorizedHost);
  const authorizationReference = text(input.authorizationReference);
  const sourceRevision = text(input.sourceRevision);
  const originalSource = String(input.originalSource ?? '');
  const target = authorizeTarget(targetUrl, authorizedHost);
  violations.push(...target.violations);
  if (!title || title.length > 180) violations.push('valid_title_required');
  if (!authorizationReference || authorizationReference.length > 240) violations.push('authorization_reference_required');
  if (!sourceRevision || sourceRevision.length > 160) violations.push('source_revision_required');
  if (!originalSource.trim() || originalSource.length > 100000) violations.push('controlled_html_source_required');
  const manifest = Array.isArray(input.fixManifest) ? input.fixManifest : [];
  if (!manifest.length || manifest.length > 25) violations.push('fix_manifest_required');
  for (const [index, fix] of manifest.entries()) {
    if (!fix || !ALLOWED_RULES.has(text(fix.ruleId)) || !text(fix.selector) || !text(fix.replacement)) violations.push(`fix_${index}_invalid`);
  }
  return {
    valid: violations.length === 0,
    violations,
    value: { title, targetUrl: target.normalizedUrl || targetUrl, authorizedHost, authorizationReference, sourceRevision, originalSource, fixManifest: manifest },
  };
}

function tagWithId(source, tagPattern, id) {
  const matcher = new RegExp(`<(${tagPattern})\\b([^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*)>`, 'i');
  const match = matcher.exec(source);
  if (!match) throw Object.assign(new Error(`Target #${id} was not found in the controlled source.`), { status: 422 });
  return { matcher, match };
}

function applyOne(source, fix) {
  const ruleId = text(fix.ruleId);
  const selector = text(fix.selector);
  const replacement = text(fix.replacement);
  if (!ALLOWED_RULES.has(ruleId)) throw Object.assign(new Error(`Unsupported remediation rule: ${ruleId}`), { status: 422 });
  if (ruleId === 'document-language') {
    if (selector !== 'html' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(replacement)) throw Object.assign(new Error('Document language requires selector html and a valid language tag.'), { status: 422 });
    if (!/<html\b/i.test(source)) throw Object.assign(new Error('The controlled source has no html element.'), { status: 422 });
    return /<html\b[^>]*\blang=["'][^"']*["']/i.test(source)
      ? source.replace(/(<html\b[^>]*\blang=)["'][^"']*["']/i, `$1"${escapeHtml(replacement)}"`)
      : source.replace(/<html\b/i, `<html lang="${escapeHtml(replacement)}"`);
  }
  if (!/^#[A-Za-z][\w:.-]*$/.test(selector)) throw Object.assign(new Error(`Rule ${ruleId} requires a simple #id selector.`), { status: 422 });
  const id = selector.slice(1);
  if (ruleId === 'image-alt') {
    const { matcher, match } = tagWithId(source, 'img', id);
    const updated = /\balt=["'][^"']*["']/i.test(match[0])
      ? match[0].replace(/\balt=["'][^"']*["']/i, `alt="${escapeHtml(replacement)}"`)
      : match[0].replace(/\s*\/?\s*>$/, ` alt="${escapeHtml(replacement)}">`);
    return source.replace(matcher, updated);
  }
  if (ruleId === 'form-label') {
    tagWithId(source, 'input|select|textarea', id);
    const label = `<label for="${escapeHtml(id)}">${escapeHtml(replacement)}</label>`;
    const existing = new RegExp(`<label\\b([^>]*\\bfor=["']${escapeRegExp(id)}["'][^>]*)>[\\s\\S]*?<\\/label>`, 'i');
    if (existing.test(source)) return source.replace(existing, label);
    const control = tagWithId(source, 'input|select|textarea', id);
    return source.replace(control.matcher, `${label}\n${control.match[0]}`);
  }
  if (ruleId === 'button-name') {
    const pair = new RegExp(`(<button\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>)[\\s\\S]*?(<\\/button>)`, 'i');
    if (!pair.test(source)) throw Object.assign(new Error(`Button #${id} was not found in the controlled source.`), { status: 422 });
    return source.replace(pair, `$1${escapeHtml(replacement)}$2`);
  }
  if (ruleId === 'heading-order') {
    if (!/^h[1-6]$/i.test(replacement)) throw Object.assign(new Error('Heading replacement must be h1 through h6.'), { status: 422 });
    const pair = new RegExp(`<h([1-6])\\b([^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*)>([\\s\\S]*?)<\\/h\\1>`, 'i');
    if (!pair.test(source)) throw Object.assign(new Error(`Heading #${id} was not found in the controlled source.`), { status: 422 });
    return source.replace(pair, `<${replacement.toLowerCase()}$2>$3</${replacement.toLowerCase()}>`);
  }
  if (ruleId === 'semantic-main') {
    if (replacement.toLowerCase() !== 'main') throw Object.assign(new Error('Semantic main remediation requires replacement main.'), { status: 422 });
    const pair = new RegExp(`<div\\b([^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*)>([\\s\\S]*?)<\\/div>`, 'i');
    if (!pair.test(source)) throw Object.assign(new Error(`Container #${id} was not found in the controlled source.`), { status: 422 });
    return source.replace(pair, '<main$1>$2</main>');
  }
  return source;
}

function verifyOne(source, fix) {
  const selector = text(fix.selector), replacement = text(fix.replacement), id = selector.startsWith('#') ? selector.slice(1) : '';
  if (fix.ruleId === 'document-language') return new RegExp(`<html\\b[^>]*\\blang=["']${escapeRegExp(replacement)}["']`, 'i').test(source);
  if (fix.ruleId === 'image-alt') return new RegExp(`<img\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*\\balt=["']${escapeRegExp(escapeHtml(replacement))}["']`, 'i').test(source);
  if (fix.ruleId === 'form-label') return new RegExp(`<label\\b[^>]*\\bfor=["']${escapeRegExp(id)}["'][^>]*>${escapeRegExp(escapeHtml(replacement))}<\\/label>`, 'i').test(source);
  if (fix.ruleId === 'button-name') return new RegExp(`<button\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>${escapeRegExp(escapeHtml(replacement))}<\\/button>`, 'i').test(source);
  if (fix.ruleId === 'heading-order') return new RegExp(`<${escapeRegExp(replacement)}\\b[^>]*\\bid=["']${escapeRegExp(id)}["']`, 'i').test(source);
  if (fix.ruleId === 'semantic-main') return new RegExp(`<main\\b[^>]*\\bid=["']${escapeRegExp(id)}["']`, 'i').test(source);
  return false;
}

function applyManifest(originalSource, manifest) {
  let source = String(originalSource);
  const changes = [];
  for (const fix of manifest) {
    const beforeHash = digest(source);
    source = applyOne(source, fix);
    const afterHash = digest(source);
    if (beforeHash === afterHash) throw Object.assign(new Error(`Rule ${fix.ruleId} did not change the controlled source.`), { status: 422 });
    changes.push({ ruleId: text(fix.ruleId), selector: text(fix.selector), beforeHash, afterHash });
  }
  const checks = manifest.map((fix) => ({ ruleId: text(fix.ruleId), selector: text(fix.selector), passed: verifyOne(source, fix) }));
  return { source, changes, verification: { allPassed: checks.every((check) => check.passed), checks }, outputHash: digest(source) };
}

module.exports = { ALLOWED_RULES, applyManifest, digest, validateDraft };
