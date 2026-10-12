import React, { useCallback, useEffect, useState } from 'react';
import { FiAlertCircle, FiCheckCircle, FiEdit2, FiLoader, FiPlus, FiRefreshCw, FiShield, FiTrash2, FiTool } from 'react-icons/fi';
import RecordDialog from './RecordDialog';
import { authorizedRemediationsApi } from '../services/api';

export const remediationExamples = [
  {
    label: 'Image and form fixes',
    values: {
      title: '[Fictional training draft] Museum signup fixes', targetUrl: 'https://museum.example.invalid/training-copy', authorizedHost: 'example.invalid',
      authorizationReference: 'fictional-training-authorization:UI-01 (controlled copy only)', sourceRevision: 'training:ui-revision-01',
      originalSource: '<!doctype html>\n<html>\n<body><main><h1>Membership</h1><img id="hero-image" src="/museum.png"><form><input id="email" type="email"><button id="submit-request"></button></form></main></body>\n</html>',
      fixManifest: JSON.stringify([{ ruleId: 'document-language', selector: 'html', replacement: 'en' }, { ruleId: 'image-alt', selector: '#hero-image', replacement: 'Museum entrance with an accessible ramp' }, { ruleId: 'form-label', selector: '#email', replacement: 'Email address' }, { ruleId: 'button-name', selector: '#submit-request', replacement: 'Submit membership request' }], null, 2),
    },
  },
  {
    label: 'Structure fixes',
    values: {
      title: '[Fictional training draft] Library structure fixes', targetUrl: 'https://library.example.invalid/training-copy', authorizedHost: 'example.invalid',
      authorizationReference: 'fictional-training-authorization:UI-02 (controlled copy only)', sourceRevision: 'training:ui-revision-02',
      originalSource: '<!doctype html>\n<html lang="en">\n<body><div id="primary-content"><h1>Events</h1><h3 id="details-heading">Event details</h3><button id="submit-request"></button></div></body>\n</html>',
      fixManifest: JSON.stringify([{ ruleId: 'semantic-main', selector: '#primary-content', replacement: 'main' }, { ruleId: 'heading-order', selector: '#details-heading', replacement: 'h2' }, { ruleId: 'button-name', selector: '#submit-request', replacement: 'Register for this event' }], null, 2),
    },
  },
  {
    label: 'Complete review fixture',
    values: {
      title: '[Fictional training draft] Community service page fixes', targetUrl: 'https://community.example.invalid/training-copy', authorizedHost: 'example.invalid',
      authorizationReference: 'fictional-training-authorization:UI-03 (controlled copy only)', sourceRevision: 'training:ui-revision-03',
      originalSource: '<!doctype html>\n<html>\n<body><div id="primary-content"><h1>Community services</h1><h3 id="details-heading">Request details</h3><img id="hero-image" src="/services.png"><form><input id="email"><button id="submit-request"></button></form></div></body>\n</html>',
      fixManifest: JSON.stringify([{ ruleId: 'document-language', selector: 'html', replacement: 'en' }, { ruleId: 'semantic-main', selector: '#primary-content', replacement: 'main' }, { ruleId: 'heading-order', selector: '#details-heading', replacement: 'h2' }, { ruleId: 'image-alt', selector: '#hero-image', replacement: 'Residents reviewing a fictional community services guide' }, { ruleId: 'form-label', selector: '#email', replacement: 'Contact email' }, { ruleId: 'button-name', selector: '#submit-request', replacement: 'Save training request' }], null, 2),
    },
  },
];
const empty = () => Object.fromEntries(Object.keys(remediationExamples[0].values).map((key) => [key, '']));
const message = (error) => error.response?.data?.error || error.message || 'Request failed.';
const statusText = (status) => status === 'applied_to_controlled_copy' ? 'Applied to controlled copy' : 'Draft';

export default function AuthorizedRemediations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [approvalReference, setApprovalReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const response = await authorizedRemediationsApi.getAll(); setItems(response.data.items || []); }
    catch (error) { setLoadError(message(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const openNew = () => { setForm(empty()); setEditing(null); setShowForm(true); setActionError(''); setNotice(''); };
  const openEdit = (item) => {
    setForm({ title: item.title, targetUrl: item.target_url, authorizedHost: item.authorized_host, authorizationReference: item.authorization_reference, sourceRevision: item.source_revision, originalSource: item.original_source, fixManifest: JSON.stringify(item.fix_manifest, null, 2) });
    setEditing(item); setSelected(null); setShowForm(true); setActionError('');
  };
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setActionError('');
    try {
      let fixManifest; try { fixManifest = JSON.parse(form.fixManifest); } catch (_) { throw new Error('Fix manifest must be valid JSON.'); }
      const payload = { ...form, fixManifest };
      if (editing) await authorizedRemediationsApi.update(editing.id, payload); else await authorizedRemediationsApi.create(payload);
      setShowForm(false); setEditing(null); setNotice(editing ? 'Draft updated; the immutable applied evidence boundary was preserved.' : 'Fictional controlled-copy draft created.'); await load();
    } catch (error) { setActionError(message(error)); }
    finally { setBusy(false); }
  };
  const runPreview = async () => {
    setBusy(true); setActionError('');
    try { const response = await authorizedRemediationsApi.preview(selected.id); setPreview(response.data.preview); }
    catch (error) { setActionError(message(error)); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setActionError('');
    try {
      const response = await authorizedRemediationsApi.apply(selected.id, { confirmation: confirmed ? 'APPLY TO CONTROLLED COPY' : '', approvalReference });
      setSelected(response.data.item); setPreview({ workingSource: response.data.item.working_source, verification: response.data.verification, outputSha256: response.data.item.output_sha256 });
      setNotice('Deterministic fixes were applied and verified on the stored controlled copy only. No external site was changed or certified.'); await load();
    } catch (error) { setActionError(message(error)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setActionError('');
    try { await authorizedRemediationsApi.remove(selected.id); setSelected(null); setDeleteConfirm(false); setNotice('Draft deleted.'); await load(); }
    catch (error) { setActionError(message(error)); }
    finally { setBusy(false); }
  };
  const closeRecord = () => { setSelected(null); setPreview(null); setDeleteConfirm(false); setApprovalReference(''); setConfirmed(false); setActionError(''); };

  return <div className="fp-page remediation-page">
    <header className="fp-header"><div><span className="remediation-eyebrow"><FiShield /> Governed execution</span><h1 className="fp-title">Authorized remediations</h1><p className="fp-subtitle">Apply deterministic accessibility fixes to explicitly authorized, stored HTML copies. External sites are never changed by this workflow.</p></div><button type="button" className="fp-create-btn" onClick={openNew}><FiPlus /> New controlled copy</button></header>
    {notice && <p className="remediation-notice" role="status">{notice}</p>}
    {loadError && <div className="fp-error-banner" role="alert"><FiAlertCircle /><span>{loadError}</span><button type="button" className="fp-btn" onClick={load}><FiRefreshCw /> Retry</button></div>}
    {loading ? <div className="fp-empty" role="status"><FiLoader className="fp-spin" /> Loading authorized records…</div> : !loadError && <>
      <div className="remediation-summary"><strong>{items.length} persisted controlled-copy records</strong><span>Actor-scoped · original source retained · applied output hash recorded</span></div>
      <div className="remediation-records">{items.map((item) => <button type="button" className="remediation-record" key={item.id} onClick={() => { setSelected(item); setPreview(null); setDeleteConfirm(false); setActionError(''); }}><span><strong>{item.title}</strong><small>{item.target_url}</small></span><span className={`remediation-status ${item.status}`}>{statusText(item.status)}</span></button>)}</div>
    </>}
    {showForm && <RecordDialog title={editing ? 'Edit controlled-copy draft' : 'New controlled-copy draft'} onClose={() => setShowForm(false)}><form className="remediation-form" onSubmit={save}>
      <section className="sr-presets"><div><strong>Fill every field</strong><p>Each fictional example independently fills all editable fields. Review authorization and source content before saving.</p></div><div className="sr-actions">{remediationExamples.map((sample) => <button type="button" className="btn btn-secondary" key={sample.label} onClick={() => setForm({ ...sample.values })}>{sample.label}</button>)}</div></section>
      {actionError && <p role="alert" className="fp-error-banner"><FiAlertCircle /> {actionError}</p>}
      {[['title','Title'],['targetUrl','Target URL'],['authorizedHost','Authorized host'],['authorizationReference','Authorization reference'],['sourceRevision','Exact source revision']].map(([key,label]) => <label key={key}>{label}<input required value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <label>Original controlled HTML<textarea required rows="10" value={form.originalSource} onChange={(event) => setForm({ ...form, originalSource: event.target.value })} /></label>
      <label>Deterministic fix manifest (JSON)<textarea required rows="10" value={form.fixManifest} onChange={(event) => setForm({ ...form, fixManifest: event.target.value })} /></label>
      <div className="remediation-actions"><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Update draft' : 'Create draft'}</button></div>
    </form></RecordDialog>}
    {selected && <RecordDialog title={selected.title} onClose={closeRecord}><div className="remediation-detail">
      {actionError && <p role="alert" className="fp-error-banner"><FiAlertCircle /> {actionError}</p>}
      <div className="remediation-facts"><div><span>Status</span><strong>{statusText(selected.status)}</strong></div><div><span>Source revision</span><strong>{selected.source_revision}</strong></div><div><span>Authorization</span><strong>{selected.authorization_reference}</strong></div><div><span>Target</span><strong>{selected.target_url}</strong></div></div>
      <p className="remediation-boundary">{selected.boundary}</p>
      <h3>Fix manifest</h3><ul>{selected.fix_manifest.map((fix, index) => <li key={index}><code>{fix.ruleId}</code> at <code>{fix.selector}</code> → {fix.replacement}</li>)}</ul>
      <div className="remediation-code-grid"><section><h3>Original source</h3><pre>{selected.original_source}</pre><small>SHA-256: {selected.source_sha256}</small></section><section><h3>{selected.status === 'draft' ? 'Preview / working source' : 'Applied controlled copy'}</h3><pre>{preview?.workingSource || selected.working_source}</pre><small>SHA-256: {preview?.outputSha256 || selected.output_sha256 || 'Not applied'}</small></section></div>
      {(preview?.verification || selected.verification) && <div className="remediation-verification"><FiCheckCircle /><strong>Deterministic checks passed</strong><span>{(preview?.verification || selected.verification).checks.length} supported changes verified against the stored output.</span></div>}
      {selected.status === 'draft' && <><div className="remediation-approval"><label>Approval reference<input value={approvalReference} onChange={(event) => setApprovalReference(event.target.value)} placeholder="Required reviewer/change reference" /></label><label className="remediation-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Apply only to this controlled copy; do not deploy or certify.</label></div><div className="remediation-actions"><button type="button" className="btn btn-secondary" onClick={runPreview} disabled={busy}><FiTool /> Preview fixes</button><button type="button" className="btn btn-primary" onClick={apply} disabled={busy || !confirmed || !approvalReference.trim()}><FiCheckCircle /> Apply authorized fixes</button></div></>}
      <div className="remediation-actions remediation-record-actions"><button type="button" className="btn btn-secondary" onClick={closeRecord}>Cancel</button>{selected.status === 'draft' && <><button type="button" className="btn btn-secondary" onClick={() => openEdit(selected)}><FiEdit2 /> Edit</button><button type="button" className="btn btn-danger" onClick={() => setDeleteConfirm(true)}><FiTrash2 /> Delete</button></>}</div>
      {deleteConfirm && <div className="remediation-delete"><p>This deletes only this draft; applied evidence cannot be deleted from this UI.</p><button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(false)}>Cancel</button><button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>Confirm delete</button></div>}
    </div></RecordDialog>}
  </div>;
}
