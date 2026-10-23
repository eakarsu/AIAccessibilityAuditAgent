import React, { useState, useEffect, useCallback } from 'react';
import {
  FiPlus, FiX, FiEdit2, FiTrash2, FiSearch,
  FiZap, FiLoader, FiChevronRight, FiAlertCircle
} from 'react-icons/fi';
import * as api from '../services/api';

// --- Helpers ---
function formatLabel(str) {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
}

function getSeverityClass(key, value) {
  const val = String(value).toLowerCase();
  if (key.toLowerCase().includes('severity') || key.toLowerCase().includes('level')) {
    if (['critical', 'high'].includes(val)) return 'sev-critical';
    if (['major', 'medium'].includes(val)) return 'sev-major';
    if (['minor', 'low'].includes(val)) return 'sev-minor';
    if (['info'].includes(val)) return 'sev-info';
  }
  return '';
}

const STATUS_COLORS = {
  pass: '#10b981', fail: '#ef4444', warning: '#f59e0b',
  open: '#3b82f6', in_progress: '#f97316', resolved: '#10b981',
  active: '#10b981', inactive: '#64748b', critical: '#ef4444',
  major: '#f97316', minor: '#f59e0b', info: '#3b82f6',
  pending: '#8b5cf6', completed: '#10b981', draft: '#64748b',
  generated: '#06b6d4', approved: '#10b981', rejected: '#ef4444',
  expired: '#f59e0b', revoked: '#ef4444', failed: '#ef4444',
  compliant: '#10b981', partially_compliant: '#f59e0b', non_compliant: '#ef4444',
};

function isUrl(str) {
  try { const u = new URL(str); return ['http:', 'https:'].includes(u.protocol); } catch { return false; }
}

function isDateCol(col) {
  return col.includes('created_at') || col.includes('updated_at') || col.includes('completed_at') || col.includes('valid_from') || col.includes('valid_until');
}

function isBoolCol(col) {
  return ['wcag_aa_pass', 'wcag_aaa_pass', 'is_valid', 'is_focusable', 'has_visible_focus', 'keyboard_trap'].includes(col);
}

function isScoreCol(col) {
  return ['score', 'overall_score', 'confidence_score', 'contrast_ratio'].includes(col);
}

function formatDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderStatusBadge(value) {
  const v = String(value).toLowerCase();
  const color = STATUS_COLORS[v] || '#64748b';
  return <span className="fp-badge" style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>{v.replace(/_/g, ' ')}</span>;
}

function renderCell(col, value) {
  if (value === null || value === undefined) return <span className="fp-muted">—</span>;
  if (col === 'status' || col === 'severity' || col === 'compliance_level' || col === 'level') return renderStatusBadge(value);
  if (isScoreCol(col)) {
    const n = Number(value);
    const c = n > 80 ? '#10b981' : n > 50 ? '#f59e0b' : '#ef4444';
    return <span style={{ color: c, fontWeight: 700 }}>{n}{col !== 'contrast_ratio' && <span style={{ opacity: 0.4, fontWeight: 400 }}>/100</span>}</span>;
  }
  if (isDateCol(col)) return <span className="fp-muted">{formatDate(value)}</span>;
  if (isBoolCol(col)) {
    const pass = value === true || value === 'true' || value === 1;
    const c = pass ? '#10b981' : '#ef4444';
    return <span className="fp-badge" style={{ background: `${c}18`, color: c, border: `1px solid ${c}40` }}>{pass ? 'Pass' : 'Fail'}</span>;
  }
  const str = String(value);
  if (isUrl(str)) return <a href={str} target="_blank" rel="noopener noreferrer" className="fp-link">{str.length > 40 ? str.slice(0, 40) + '...' : str}</a>;
  return str.length > 50 ? str.slice(0, 50) + '...' : str;
}

function renderDetailValue(col, value) {
  if (value === null || value === undefined) return <span className="fp-muted">—</span>;
  if (col === 'status' || col === 'severity' || col === 'compliance_level' || col === 'level') return renderStatusBadge(value);
  if (isScoreCol(col)) {
    const n = Number(value);
    const c = n > 80 ? '#10b981' : n > 50 ? '#f59e0b' : '#ef4444';
    return <span style={{ color: c, fontWeight: 700, fontSize: '1.1rem' }}>{n}</span>;
  }
  if (isDateCol(col)) return formatDate(value);
  if (isBoolCol(col)) {
    const pass = value === true || value === 'true' || value === 1;
    const c = pass ? '#10b981' : '#ef4444';
    return <span className="fp-badge" style={{ background: `${c}18`, color: c, border: `1px solid ${c}40` }}>{pass ? 'Pass' : 'Fail'}</span>;
  }
  const str = String(value);
  if (isUrl(str)) return <a href={str} target="_blank" rel="noopener noreferrer" className="fp-link">{str}</a>;
  if (typeof value === 'object') return <pre className="fp-code-block">{JSON.stringify(value, null, 2)}</pre>;
  return str;
}

// --- AI Result Renderer ---
function renderSimpleValue(key, value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function renderAIValue(key, value) {
  if (value === null || value === undefined) return <span className="fp-muted">—</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="fp-muted">None</p>;
    return (
      <div className="fp-ai-cards">
        {value.map((item, i) => (
          <div key={i} className="fp-ai-card">
            {typeof item === 'object' && item !== null ? (
              Object.entries(item).map(([k, v]) => (
                <div key={k} className="fp-ai-field">
                  <span className="fp-ai-field-label">{formatLabel(k)}:</span>
                  <span className={`fp-ai-field-value ${getSeverityClass(k, v)}`}>{renderSimpleValue(k, v)}</span>
                </div>
              ))
            ) : <p style={{ margin: 0 }}>{String(item)}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (key.includes('code') || key.includes('html') || key.includes('selector')) {
    return <pre className="fp-code-block"><code>{String(value)}</code></pre>;
  }
  if (typeof value === 'number') {
    if (key.includes('score') || key.includes('ratio')) {
      const pct = Math.min(value * (value <= 1 ? 100 : 1), 100);
      const c = pct > 80 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444';
      return (
        <div className="fp-score-bar-wrap">
          <div className="fp-score-bar"><div className="fp-score-fill" style={{ width: `${pct}%`, background: c }} /></div>
          <span className="fp-score-val">{value}</span>
        </div>
      );
    }
    return <span>{value}</span>;
  }
  if (typeof value === 'object' && value !== null) return renderAIResult(value);
  if (typeof value === 'boolean') {
    const c = value ? '#10b981' : '#ef4444';
    return <span className="fp-badge" style={{ background: `${c}18`, color: c, border: `1px solid ${c}40` }}>{value ? 'Yes' : 'No'}</span>;
  }
  return <p style={{ margin: 0, lineHeight: 1.6 }}>{String(value)}</p>;
}

function renderAIResult(result) {
  if (!result) return null;
  if (typeof result === 'string') return <p style={{ margin: 0, lineHeight: 1.6 }}>{result}</p>;
  if (typeof result !== 'object') return <p style={{ margin: 0 }}>{String(result)}</p>;
  return (
    <div className="fp-ai-sections">
      {Object.entries(result).map(([key, value]) => (
        <div key={key} className="fp-ai-section">
          <h4 className="fp-ai-section-title">{formatLabel(key)}</h4>
          {renderAIValue(key, value)}
        </div>
      ))}
    </div>
  );
}

// ============================
// FeaturePage Component
// ============================
export default function FeaturePage({ config }) {
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [showAIResult, setShowAIResult] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const limit = 20;

  const apiModule = api[config.apiName];

  const fetchItems = useCallback(async (currentPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiModule.getAll({ page: currentPage, limit });
      if (Array.isArray(res.data)) {
        setItems(res.data);
        setPagination(null);
      } else {
        setItems(res.data.data || []);
        setPagination(res.data.pagination || null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [apiModule, limit]);

  useEffect(() => {
    setPage(1);
    fetchItems(1);
    setSelectedItem(null);
    setShowForm(false);
    setAiResult(null);
    setShowAIResult(false);
    setSearchTerm('');
  }, [fetchItems, config.apiName]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchItems(newPage);
  };

  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return config.columns.some(col => {
      const v = item[col];
      return v != null && String(v).toLowerCase().includes(t);
    });
  });

  const openCreateForm = () => {
    const init = {};
    (config.formFields || []).forEach(f => { init[f.name] = ''; });
    setFormData(init);
    setEditingItem(null);
    setShowForm(true);
  };

  const openEditForm = item => {
    const init = {};
    (config.formFields || []).forEach(f => { init[f.name] = item[f.name] ?? ''; });
    setFormData(init);
    setEditingItem(item);
    setShowForm(true);
  };

  const handleFormSubmit = async e => {
    e.preventDefault();
    try {
      if (editingItem) {
        await apiModule.update(editingItem.id, formData);
      } else {
        await apiModule.create(formData);
      }
      setShowForm(false);
      setEditingItem(null);
      fetchItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async id => {
    try {
      await apiModule.remove(id);
      setDeleteConfirm(null);
      setSelectedItem(null);
      fetchItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleAIAction = async item => {
    if (!config.aiAction) return;
    setAiLoading(true);
    setAiResult(null);
    setShowAIResult(true);
    try {
      const aiFunc = api[config.aiAction];
      const res = config.aiIsPost ? await aiFunc(item) : await aiFunc(item.id);
      setAiResult(res.data.ai_result || res.data.data || res.data);
    } catch (err) {
      setAiResult({ error: err.response?.data?.error || err.message || 'AI analysis failed' });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="fp-page">
      {/* Header */}
      <div className="fp-header">
        <div>
          <h1 className="fp-title">{config.title}</h1>
          <p className="fp-subtitle">Manage and review {config.title.toLowerCase()} data</p>
        </div>
        <div className="fp-header-actions">
          <div className="fp-search-wrap">
            <FiSearch className="fp-search-icon" />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="fp-search-input" />
          </div>
          {!config.readOnly && (
            <button className="fp-create-btn" onClick={openCreateForm}><FiPlus /> New Item</button>
          )}
        </div>
      </div>

      {error && (
        <div className="fp-error-banner">
          <FiAlertCircle /> {error}
          <button onClick={() => setError(null)} className="fp-error-close"><FiX /></button>
        </div>
      )}

      <div className="fp-content">
        {/* Table */}
        <div className={`fp-table-container ${selectedItem ? 'fp-table-shrink' : ''}`}>
          {loading ? (
            <div className="fp-empty"><FiLoader className="fp-spin" /> Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div className="fp-empty">
              <p>No items found</p>
              <p className="fp-muted">{searchTerm ? 'Try a different search term' : 'Create a new item to get started'}</p>
            </div>
          ) : (
            <div className="fp-table-scroll">
              <table className="fp-table">
                <thead>
                  <tr>{config.columns.map(col => <th key={col}>{formatLabel(col)}</th>)}<th style={{ width: 36 }} /></tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => (
                    <tr key={item.id} className={selectedItem?.id === item.id ? 'fp-row-active' : ''} onClick={() => { setSelectedItem(item); setShowAIResult(false); setAiResult(null); }}>
                      {config.columns.map(col => <td key={col}>{renderCell(col, item[col])}</td>)}
                      <td><FiChevronRight className="fp-muted" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedItem && (
          <div className="fp-detail">
            <div className="fp-detail-header">
              <h2 className="fp-detail-title">{String(selectedItem[config.columns[0]] || '').slice(0, 60) || `Item`}</h2>
              <button className="fp-close-btn" onClick={() => setSelectedItem(null)}><FiX /></button>
            </div>
            <div className="fp-detail-body">
              <div className="fp-field-grid">
                {Object.entries(selectedItem).filter(([k]) => k !== 'password_hash').map(([key, value]) => (
                  <div key={key} className="fp-field-item">
                    <span className="fp-field-label">{formatLabel(key)}</span>
                    <span className="fp-field-value">{renderDetailValue(key, value)}</span>
                  </div>
                ))}
              </div>

              <div className="fp-actions">
                {!config.readOnly && (
                  <>
                    <button className="fp-btn fp-btn-edit" onClick={() => openEditForm(selectedItem)}><FiEdit2 /> Edit</button>
                    <button className="fp-btn fp-btn-delete" onClick={() => setDeleteConfirm(selectedItem)}><FiTrash2 /> Delete</button>
                  </>
                )}
                {config.hasAI && (
                  <button className="fp-btn fp-btn-ai" onClick={() => handleAIAction(selectedItem)} disabled={aiLoading}>
                    {aiLoading ? <FiLoader className="fp-spin" /> : <FiZap />} {config.aiLabel || 'Run AI'}
                  </button>
                )}
              </div>

              {showAIResult && (
                <div className="fp-ai-section-wrap">
                  <h3 className="fp-ai-title"><FiZap /> AI Analysis Result</h3>
                  {aiLoading ? (
                    <div className="fp-ai-loading"><FiLoader className="fp-spin-lg" /><p>AI is analyzing...</p></div>
                  ) : aiResult ? renderAIResult(aiResult) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="fp-pagination">
          <button
            className="fp-page-btn"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            Previous
          </button>
          <span className="fp-page-info">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button
            className="fp-page-btn"
            disabled={page >= pagination.totalPages}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fp-overlay" onClick={() => setShowForm(false)}>
          <div className="fp-modal" onClick={e => e.stopPropagation()}>
            <div className="fp-modal-header">
              <h2>{editingItem ? `Edit ${config.title}` : `New ${config.title}`}</h2>
              <button className="fp-close-btn" onClick={() => setShowForm(false)}><FiX /></button>
            </div>
            <form onSubmit={handleFormSubmit} className="fp-form">
              {(config.formFields || []).map(field => (
                <div key={field.name} className="fp-form-group">
                  <label className="fp-form-label">{field.label || formatLabel(field.name)}{field.required && <span className="fp-required"> *</span>}</label>
                  {field.type === 'textarea' ? (
                    <textarea value={formData[field.name] || ''} onChange={e => setFormData(p => ({ ...p, [field.name]: e.target.value }))} required={field.required} className="fp-form-input fp-textarea" />
                  ) : field.type === 'select' ? (
                    <select value={formData[field.name] || ''} onChange={e => setFormData(p => ({ ...p, [field.name]: e.target.value }))} required={field.required} className="fp-form-input">
                      <option value="">Select...</option>
                      {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input type={field.type || 'text'} value={formData[field.name] || ''} onChange={e => setFormData(p => ({ ...p, [field.name]: e.target.value }))} required={field.required} className="fp-form-input" />
                  )}
                </div>
              ))}
              <div className="fp-form-actions">
                <button type="button" className="fp-btn fp-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="fp-btn fp-btn-submit">{editingItem ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fp-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="fp-delete-modal" onClick={e => e.stopPropagation()}>
            <FiAlertCircle className="fp-delete-icon" />
            <h3>Are you sure?</h3>
            <p className="fp-muted">This action cannot be undone.</p>
            <div className="fp-delete-actions">
              <button className="fp-btn fp-btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="fp-btn fp-btn-confirm-delete" onClick={() => handleDelete(deleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
