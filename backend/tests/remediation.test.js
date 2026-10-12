'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyManifest, digest, validateDraft } = require('../domain/remediation');

const original = '<!doctype html><html><body><div id="primary-content"><h1>Title</h1><h3 id="details-heading">Details</h3><img id="hero-image" src="x.png"><form><input id="email"><button id="submit-request"></button></form></div></body></html>';
const manifest = [
  { ruleId: 'document-language', selector: 'html', replacement: 'en' },
  { ruleId: 'semantic-main', selector: '#primary-content', replacement: 'main' },
  { ruleId: 'heading-order', selector: '#details-heading', replacement: 'h2' },
  { ruleId: 'image-alt', selector: '#hero-image', replacement: 'Fictional training scene' },
  { ruleId: 'form-label', selector: '#email', replacement: 'Email address' },
  { ruleId: 'button-name', selector: '#submit-request', replacement: 'Submit request' },
];

test('applies and verifies every supported deterministic fix without changing the original input', () => {
  const result = applyManifest(original, manifest);
  assert.equal(result.verification.allPassed, true);
  assert.equal(result.verification.checks.length, manifest.length);
  assert.equal(result.changes.length, manifest.length);
  assert.notEqual(result.source, original);
  assert.equal(digest(original), digest(String(original)));
  assert.match(result.source, /<html lang="en">/);
  assert.match(result.source, /<main id="primary-content">/);
  assert.match(result.source, /<h2 id="details-heading">Details<\/h2>/);
  assert.match(result.source, /alt="Fictional training scene"/);
  assert.match(result.source, /<label for="email">Email address<\/label>/);
  assert.match(result.source, /<button id="submit-request">Submit request<\/button>/);
});

test('requires an authorized public scope, revision, source and complete supported manifest', () => {
  const valid = validateDraft({ title: 'Fictional controlled copy', targetUrl: 'https://docs.example.invalid/a', authorizedHost: 'example.invalid', authorizationReference: 'fictional authorization', sourceRevision: 'training:r1', originalSource: original, fixManifest: manifest });
  assert.equal(valid.valid, true);
  const invalid = validateDraft({ title: '', targetUrl: 'http://127.0.0.1', authorizedHost: '127.0.0.1', originalSource: '', fixManifest: [{ ruleId: 'arbitrary-script', selector: 'body', replacement: 'x' }] });
  assert.equal(invalid.valid, false);
  assert(invalid.violations.includes('private_target_blocked'));
  assert(invalid.violations.includes('authorization_reference_required'));
  assert(invalid.violations.includes('source_revision_required'));
  assert(invalid.violations.includes('controlled_html_source_required'));
  assert(invalid.violations.includes('fix_0_invalid'));
});

test('fails closed when a declared selector is absent', () => {
  assert.throws(() => applyManifest(original, [{ ruleId: 'image-alt', selector: '#missing', replacement: 'Missing' }]), /was not found/);
});
