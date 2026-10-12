import AIFieldPresets, { completeExample } from './AIFieldPresets';
import AIResultView from './AIResultView';
import useCancelableAI from './useCancelableAI';
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
  const [referenceRows, setReferenceRows] = useState([]);
  const [referenceError, setReferenceError] = useState('');
  const referenceFields = (config.fields || []).map((field) => field.name === 'issue_id' || config.customApiCall && field.name === 'id' ? { ...field, type: 'select', requiresExistingRecord: true, options: referenceRows.map((row) => ({ value: String(row.id), label: row.title || row.report_title || row.description || row.id })) } : field);

  const aiRequest = useCancelableAI();
  const { loading, error, setError, result: result, setResult: setResult } = aiRequest;



  useEffect(() => {
    let active = true;
    aiRequest.cancel(); setFormData({}); setResult(null); setError(null);
    setReferenceRows([]); setReferenceError('');
    const resource = config.customApiCall ? api.adaReportsApi : (config.fields || []).some((field) => field.name === 'issue_id') ? api.issuesApi : null;
    if (resource) resource.getAll({ limit: 100 }).then((response) => { if (!active) return; const rows = response.data?.data || response.data?.items || response.data; setReferenceRows(Array.isArray(rows) ? rows : []); }).catch(() => { if (active) setReferenceError('Saved record references could not be loaded. Select a record when the connection is available.'); });
    if (config.autoLoad) runRequest({});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.apiCall]);

  const runRequest = async (data) => aiRequest.run(async (options) => { const payload = { ...data }; for (const field of config.fields || []) { if (field.type === 'json' && payload[field.name]) { try { payload[field.name] = JSON.parse(payload[field.name]); } catch (_) { throw new Error(field.label + ': enter valid structured data.'); } } if (field.type === 'csv' && payload[field.name]) payload[field.name] = String(payload[field.name]).split(',').map((item) => item.trim()).filter(Boolean); } const fn = api[config.apiCall]; if (!fn) throw new Error('API method unavailable: ' + config.apiCall); const res = config.customApiCall && payload.id ? await fn(payload.id, options) : config.method === 'get' ? await fn(options) : await fn(payload, options); return res.data; });

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
      {config.autoLoad && <div className="sr-actions"><button type="button" className="fp-btn" disabled={loading} onClick={() => runRequest({})}>Refresh</button>{loading && <button type="button" className="fp-btn" onClick={aiRequest.cancel}>Cancel</button>}</div>}


      <div className="fp-content" style={{ display: 'block' }}>
        {!config.autoLoad && (
          <div className="fp-detail" style={{ position: 'static', maxWidth: 'none' }}>
            <div className="fp-detail-body">
              <form onSubmit={handleSubmit} className="fp-form">
                {referenceError && <p className="sr-notice" role="status">{referenceError}</p> }

            <AIFieldPresets fields={referenceFields} samples={[]} context={config.title} disabled={loading} onFill={(sample, index) => { setFormData(completeExample(referenceFields, sample, index, config.title, formData)); aiRequest.setResult(null); }} />

                {referenceFields.map((f) => (
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
                          <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>{typeof opt === 'object' ? opt.label : opt}</option>
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
                {loading && <button type="button" className="fp-btn" onClick={aiRequest.cancel}>Cancel</button>}</div>
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

        <AIResultView result={result} loading={loading} error={error} title={config.title} />
      </div>
    </div>
  );
}
