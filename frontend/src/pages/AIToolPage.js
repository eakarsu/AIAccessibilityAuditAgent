import React, { useState, useEffect } from 'react';
import { FiZap, FiLoader, FiAlertCircle, FiCpu, FiDownload } from 'react-icons/fi';
import * as api from '../services/api';

/**
 * Generic AI Tool page for NEW custom non-CRUD features
 * config: {
 *   title, subtitle, icon, apiCall (function name in api),
 *   method ('post'|'get'),
 *   fields: [{ name, label, type ('text'|'textarea'|'select'|'number'|'json'), placeholder, options, rows }],
 *   autoLoad: boolean (true for GET endpoints like monitoring-dashboard)
 * }
 */
export default function AIToolPage({ config }) {
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setFormData({});
    setResult(null);
    setError(null);
    if (config.autoLoad) {
      runRequest({});
    }
    // eslint-disable-next-line
  }, [config.apiCall]);

  const runRequest = async (data) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Coerce JSON fields
      const payload = { ...data };
      (config.fields || []).forEach((f) => {
        if (f.type === 'json' && payload[f.name]) {
          try {
            payload[f.name] = JSON.parse(payload[f.name]);
          } catch (_) {
            // leave as is
          }
        }
        if (f.type === 'csv' && payload[f.name]) {
          payload[f.name] = String(payload[f.name])
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      });

      const fn = api[config.apiCall];
      if (!fn) throw new Error(`API method ${config.apiCall} not found`);
      // Support custom calls where a single id field is passed as arg
      let res;
      if (config.customApiCall && payload.id) {
        res = await fn(payload.id);
      } else {
        res = config.method === 'get' ? await fn() : await fn(payload);
      }
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runRequest(formData);
  };

  return (
    <div className="fp-page">
      <div className="fp-header">
        <div>
          <h1 className="fp-title">
            <span style={{ marginRight: 8 }}>{config.icon || '🔧'}</span>{config.title}
          </h1>
          <p className="fp-subtitle">{config.subtitle}</p>
        </div>
      </div>

      <div className="fp-content" style={{ display: 'block' }}>
        {!config.autoLoad && (
          <div className="fp-detail" style={{ position: 'static', maxWidth: 'none' }}>
            <div className="fp-detail-body">
              <form onSubmit={handleSubmit} className="fp-form">
                {(config.fields || []).map((f) => (
                  <div key={f.name} className="fp-form-group">
                    <label className="fp-form-label">
                      {f.label}{f.required && <span className="fp-required"> *</span>}
                    </label>
                    {f.type === 'textarea' || f.type === 'json' ? (
                      <textarea
                        className="fp-form-input fp-textarea"
                        placeholder={f.placeholder}
                        value={formData[f.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                        rows={f.rows || 4}
                        required={f.required}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        className="fp-form-input"
                        value={formData[f.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                        required={f.required}
                      >
                        <option value="">Select...</option>
                        {(f.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        className="fp-form-input"
                        placeholder={f.placeholder}
                        value={formData[f.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                        required={f.required}
                      />
                    )}
                    {f.help && <p className="fp-muted" style={{ marginTop: 4, fontSize: 12 }}>{f.help}</p>}
                  </div>
                ))}
                <div className="fp-form-actions">
                  <button type="submit" className="fp-btn fp-btn-ai" disabled={loading}>
                    {loading ? <FiLoader className="fp-spin" /> : <FiZap />} Run Analysis
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading && (
          <div className="fp-ai-loading" style={{ marginTop: 20 }}>
            <FiLoader className="fp-spin-lg" />
            <p>Analyzing...</p>
          </div>
        )}

        {error && (
          <div className="fp-error-banner" style={{ marginTop: 20 }}>
            <FiAlertCircle /> {error}
          </div>
        )}

        {result && (
          <div className="fp-detail" style={{ marginTop: 20, position: 'static', maxWidth: 'none' }}>
            <div className="fp-detail-header">
              <h2 className="fp-detail-title"><FiCpu /> Result</h2>
              <button
                className="fp-btn fp-btn-edit"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${config.title.replace(/\s+/g, '-').toLowerCase()}-result.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <FiDownload /> Export JSON
              </button>
            </div>
            <div className="fp-detail-body">
              <ResultRenderer data={result} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRenderer({ data }) {
  if (data === null || data === undefined) return <span className="fp-muted">—</span>;
  if (typeof data === 'string') {
    // Try parse JSON
    try {
      const parsed = JSON.parse(data);
      return <ResultRenderer data={parsed} />;
    } catch {
      return <pre className="fp-code-block">{data}</pre>;
    }
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="fp-muted">Empty list</p>;
    return (
      <div className="fp-ai-cards">
        {data.map((item, i) => (
          <div key={i} className="fp-ai-card">
            {typeof item === 'object' ? <ResultRenderer data={item} /> : String(item)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === 'object') {
    return (
      <div className="fp-ai-sections">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="fp-ai-section">
            <h4 className="fp-ai-section-title">{formatKey(key)}</h4>
            <ResultRenderer data={value} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === 'boolean') {
    const c = data ? '#10b981' : '#ef4444';
    return <span className="fp-badge" style={{ background: `${c}18`, color: c, border: `1px solid ${c}40` }}>{data ? 'Yes' : 'No'}</span>;
  }
  return <span>{String(data)}</span>;
}

function formatKey(k) {
  return String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
