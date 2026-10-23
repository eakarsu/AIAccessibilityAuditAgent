'use strict';
// Pure helpers for authenticated tasks, main-record export, and AI insights.
// No database or network access here so every behaviour is unit-testable.

const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'];
const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function validateTaskInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Task body is required.' };
  const value = {};
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) return { error: 'title is required.' };
    if (body.title.trim().length > 255) return { error: 'title must be 255 characters or fewer.' };
    value.title = body.title.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 5000) return { error: 'description must be a string of 5,000 characters or fewer.' };
    value.description = body.description;
  }
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) return { error: `status must be one of: ${TASK_STATUSES.join(', ')}.` };
    value.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!TASK_PRIORITIES.includes(body.priority)) return { error: `priority must be one of: ${TASK_PRIORITIES.join(', ')}.` };
    value.priority = body.priority;
  }
  if (body.record_ref !== undefined) {
    if (typeof body.record_ref !== 'string' || body.record_ref.length > 255) return { error: 'record_ref must be a string of 255 characters or fewer.' };
    value.record_ref = body.record_ref;
  }
  return { value };
}

function filterTasks(tasks, { search, status, priority } = {}) {
  const q = search ? String(search).trim().toLowerCase() : '';
  return (tasks || []).filter((t) => {
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (q) {
      const hay = `${t.title || ''} ${t.description || ''} ${t.record_ref || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v); // preserves 0 and false
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows, columns) {
  const list = rows || [];
  const cols = columns && columns.length ? columns : (list[0] ? Object.keys(list[0]) : []);
  return [cols.join(','), ...list.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
}

// Labelled sections for rendering AI/record JSON. Values are kept raw so
// false, 0 and '' survive instead of being dropped by truthiness checks.
function buildSections(record) {
  if (!record || typeof record !== 'object') return [];
  return Object.entries(record).map(([key, value]) => ({
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: value === undefined ? null : value,
  }));
}

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

function deterministicTaskInsights(tasks, domainLabel) {
  const list = tasks || [];
  const open = list.filter((t) => t.status !== 'done');
  const done = list.filter((t) => t.status === 'done').length;
  const blocked = list.filter((t) => t.status === 'blocked').length;
  const completionRate = list.length ? Math.round((done / list.length) * 100) : 0;
  const prioritized = [...open]
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2))
    .slice(0, 5)
    .map((t) => ({ title: t.title, status: t.status, priority: t.priority || 'normal', record_ref: t.record_ref || '' }));
  const nextActions = [];
  if (blocked) nextActions.push(`Unblock ${blocked} blocked ${domainLabel} task(s) first.`);
  if (prioritized.length) nextActions.push(`Start with: ${prioritized[0].title}.`);
  if (!list.length) nextActions.push(`No ${domainLabel} tasks yet; create the first task to track follow-up work.`);
  return { total: list.length, open: open.length, done, blocked, completionRate, prioritized, nextActions };
}

function hasProviderKey(env = process.env) {
  return Boolean(env.OPENROUTER_API_KEY || env.OPENAI_API_KEY);
}

// Clearly labelled deterministic fallback: never presented as AI output.
function fallbackInsights(tasks, domainLabel) {
  const insights = deterministicTaskInsights(tasks, domainLabel);
  return {
    aiGenerated: false,
    provider: null,
    notice: 'No AI provider configured (OPENROUTER_API_KEY/OPENAI_API_KEY). Showing deterministic insights computed from your records.',
    ...insights,
    sections: buildSections({ total_tasks: insights.total, open_tasks: insights.open, completed_tasks: insights.done, blocked_tasks: insights.blocked, completion_rate_percent: insights.completionRate }),
  };
}

module.exports = { TASK_STATUSES, TASK_PRIORITIES, validateTaskInput, filterTasks, toCsv, buildSections, deterministicTaskInsights, hasProviderKey, fallbackInsights };
