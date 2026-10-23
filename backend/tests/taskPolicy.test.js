'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTaskInput, filterTasks, toCsv, buildSections, deterministicTaskInsights, fallbackInsights, hasProviderKey } = require('../domain/taskPolicy');

const tasks = [
  { title: 'Fix contrast', description: 'Header', status: 'todo', priority: 'urgent', record_ref: 'r1' },
  { title: 'Ship', description: '', status: 'done', priority: 'low', record_ref: '' },
  { title: 'Blocked item', description: 'x', status: 'blocked', priority: 'high', record_ref: 'r2' },
];

test('validateTaskInput requires a title and accepts valid enums', () => {
  assert.equal(validateTaskInput({}).error, 'title is required.');
  assert.equal(validateTaskInput({ title: 'A', status: 'nope' }).error.includes('status'), true);
  assert.deepEqual(validateTaskInput({ title: ' A ' }).value, { title: 'A' });
  assert.deepEqual(validateTaskInput({ status: 'done' }, { partial: true }).value, { status: 'done' });
});

test('filterTasks applies search, status and priority filters', () => {
  assert.equal(filterTasks(tasks, { search: 'contrast' }).length, 1);
  assert.equal(filterTasks(tasks, { status: 'done' }).length, 1);
  assert.equal(filterTasks(tasks, { priority: 'high' })[0].title, 'Blocked item');
  assert.equal(filterTasks(tasks, {}).length, 3);
});

test('toCsv preserves 0/false and escapes quotes and commas', () => {
  const csv = toCsv([{ a: 0, b: false, c: 'x,"y"', d: '' }]);
  assert.ok(csv.includes("0,false,"));
  assert.ok(csv.includes("y"));
});

test('buildSections preserves false, 0 and empty values', () => {
  const s = buildSections({ ready: false, count: 0, note: '' });
  assert.deepEqual(s, [
    { label: 'Ready', value: false },
    { label: 'Count', value: 0 },
    { label: 'Note', value: '' },
  ]);
});

test('fallbackInsights is deterministic, labelled non-AI and keeps zero rates', () => {
  const out = fallbackInsights([], 'accessibility audit');
  assert.equal(out.aiGenerated, false);
  assert.equal(out.provider, null);
  assert.equal(out.completionRate, 0);
  assert.equal(out.sections.find((x) => x.label === 'Completion Rate Percent').value, 0);
  const ranked = deterministicTaskInsights(tasks, 'accessibility audit');
  assert.equal(ranked.prioritized[0].title, 'Fix contrast');
  assert.equal(hasProviderKey({}), false);
  assert.equal(hasProviderKey({ OPENAI_API_KEY: 'k' }), true);
});
