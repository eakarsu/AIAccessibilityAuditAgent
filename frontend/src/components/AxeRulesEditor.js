import React, { useEffect, useState } from 'react';
import axios from 'axios';

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'];

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function AxeRulesEditor() {
  const [rules, setRules] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({ id: '', description: '', enabled: true, severity: 'moderate' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get('/api/custom-views/axe-rules', { headers: authHeaders() });
      setRules(r.data.rules || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateRule = async (id, patch) => {
    try {
      const r = await axios.put(`/api/custom-views/axe-rules/${encodeURIComponent(id)}`, patch, {
        headers: authHeaders(),
      });
      setRules((curr) => curr.map((x) => (x.id === id ? { ...x, ...r.data } : x)));
    } catch (e) {
      setError(e.message || 'Update failed');
    }
  };

  const deleteRule = async (id) => {
    if (!window.confirm(`Delete rule "${id}"?`)) return;
    try {
      await axios.delete(`/api/custom-views/axe-rules/${encodeURIComponent(id)}`, {
        headers: authHeaders(),
      });
      setRules((curr) => curr.filter((x) => x.id !== id));
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  };

  const createRule = async (e) => {
    e.preventDefault();
    if (!draft.id.trim()) { setError('Rule id is required'); return; }
    try {
      const r = await axios.post('/api/custom-views/axe-rules', draft, { headers: authHeaders() });
      setRules((curr) => [...curr, r.data]);
      setDraft({ id: '', description: '', enabled: true, severity: 'moderate' });
      setError(null);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
    }
  };

  return (
    <div className="axe-rules-editor">
      <h3 style={{ margin: '0 0 8px' }}>Axe Rules Editor</h3>
      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
        Enable/disable axe-core rules and override severity. Used as the runtime config for site audits.
      </p>

      {error && <div style={{ color: '#b91c1c', marginBottom: 10 }}>Error: {error}</div>}

      <form
        onSubmit={createRule}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}
      >
        <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column' }}>
          Rule ID
          <input
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            placeholder="e.g. custom-rule"
            style={{ padding: '6px 8px', minWidth: 160 }}
          />
        </label>
        <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', flex: 1, minWidth: 200 }}>
          Description
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Short description"
            style={{ padding: '6px 8px' }}
          />
        </label>
        <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column' }}>
          Severity
          <select
            value={draft.severity}
            onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
            style={{ padding: '6px 8px' }}
          >
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Enabled
        </label>
        <button
          type="submit"
          style={{
            padding: '8px 14px',
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Add Rule
        </button>
      </form>

      {loading && <div>Loading rules…</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Enabled</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Rule ID</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Severity</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px' }}>
                  <input
                    type="checkbox"
                    checked={!!r.enabled}
                    onChange={(e) => updateRule(r.id, { enabled: e.target.checked })}
                  />
                </td>
                <td style={{ padding: '8px', fontFamily: 'monospace' }}>{r.id}</td>
                <td style={{ padding: '8px' }}>
                  <input
                    value={r.description || ''}
                    onChange={(e) => updateRule(r.id, { description: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
                <td style={{ padding: '8px' }}>
                  <select
                    value={r.severity}
                    onChange={(e) => updateRule(r.id, { severity: e.target.value })}
                    style={{ padding: '4px 6px' }}
                  >
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px' }}>
                  <button
                    onClick={() => deleteRule(r.id)}
                    style={{
                      padding: '4px 10px',
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '12px', color: '#6b7280' }}>No rules.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AxeRulesEditor;
