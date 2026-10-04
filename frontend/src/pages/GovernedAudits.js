import React, { useEffect, useState } from 'react';
import { getGovernedAudits, createGovernedAudit, submitGovernedAudit, reviewGovernedAudit } from '../services/api';

const initial = {
  targetUrl: '', authorizedHost: '', authorizationReference: '', sourceRevision: '',
  axeRun: { runId: '', engineVersion: '', startedAt: '', completedAt: '', findings: [] },
};

const remediation = {
  'image-alt': 'Add a meaningful alt attribute for informative images. Use alt="" when an image is decorative.',
  'button-name': 'Give the button an accessible name through visible text or an appropriate aria-label.',
  label: 'Associate each form control with a visible label using for and id, or wrap the control in a label.',
  'color-contrast': 'Adjust foreground or background colors, then measure the contrast ratio at the rendered state.',
  'heading-order': 'Use headings in a logical sequence that reflects the page structure.',
};

function suggestionFor(finding) {
  return remediation[finding.ruleId] || 'Inspect the reported element and the rule guidance, then propose a code change for review.';
}

function errorMessage(error) {
  return error.response?.data?.error || error.message || 'Request failed';
}

export default function GovernedAudits({ user }) {
  const [audits, setAudits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previousId, setPreviousId] = useState('');
  const [form, setForm] = useState(initial);
  const [runText, setRunText] = useState('');
  const [review, setReview] = useState({ decision: 'approve', reason: '', assistiveTechnologyEvidenceRef: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    try {
      const response = await getGovernedAudits();
      const rows = Array.isArray(response.data) ? response.data : [];
      setAudits(rows);
      setSelected(current => rows.find(item => item.id === current?.id) || current);
    } catch (e) { setError(errorMessage(e)); }
  }
  useEffect(() => { refresh(); }, []);

  async function submitEvidence(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    let axeRun;
    try {
      const filePayload = JSON.parse(runText);
      const parsed = filePayload.axeRun || filePayload;
      if (!parsed || !Array.isArray(parsed.findings)) throw new Error('findings must be an array');
      // Keep only reproducible references and digests; axe node HTML can contain private data.
      axeRun = {
        runId: String(parsed.runId || ''),
        engineVersion: String(parsed.engineVersion || ''),
        startedAt: String(parsed.startedAt || ''),
        completedAt: String(parsed.completedAt || ''),
        findings: parsed.findings.map(finding => ({
          ruleId: String(finding.ruleId || ''),
          wcagCriterion: String(finding.wcagCriterion || ''),
          impact: String(finding.impact || ''),
          selector: String(finding.selector || ''),
          evidenceHash: String(finding.evidenceHash || ''),
        })),
      };
    } catch (e) {
      setError(`Axe run JSON is invalid: ${e.message}`);
      return;
    }
    setBusy(true);
    try {
      const response = await createGovernedAudit({ ...form, axeRun }, crypto.randomUUID());
      setSelected(response.data);
      setNotice('Evidence submitted. A human reviewer must verify the result.');
      await refresh();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function act(operation) {
    if (!selected) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = operation === 'submit'
        ? await submitGovernedAudit(selected.id)
        : await reviewGovernedAudit(selected.id, review);
      setSelected(response.data);
      setNotice(operation === 'submit' ? 'Sent for independent review.' : 'Review recorded.');
      await refresh();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const findings = Array.isArray(selected?.input?.axeRun?.findings) ? selected.input.axeRun.findings : [];
  const previous = audits.find(item => String(item.id) === previousId);
  const priorFindings = Array.isArray(previous?.input?.axeRun?.findings) ? previous.input.axeRun.findings : [];
  const identity = finding => `${finding.ruleId}::${finding.selector}`;
  const priorKeys = new Set(priorFindings.map(identity));
  const currentKeys = new Set(findings.map(identity));
  const added = previous ? findings.filter(finding => !priorKeys.has(identity(finding))) : [];
  const resolved = previous ? priorFindings.filter(finding => !currentKeys.has(identity(finding))) : [];
  const persistent = previous ? findings.filter(finding => priorKeys.has(identity(finding))) : [];
  return (
    <div className="feature-page">
      <div className="page-header"><h1>Governed accessibility audits</h1><p>Submit authorized axe evidence and review code level remediation ideas.</p></div>
      <p>Results reflect submitted evidence. They are not accessibility certification. A developer and assistive technology reviewer must verify changes on the exact source revision.</p>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section style={{ marginBottom: 24 }}>
        <h2>Existing audits</h2>
        {audits.length === 0 ? <p>No governed audits for this tenant yet.</p> : (
          <ul>{audits.map(item => <li key={item.id}>
            <button type="button" onClick={() => setSelected(item)}>
              {item.input?.targetUrl || `Audit ${item.id}`} · {item.status} · revision {item.input?.sourceRevision || 'unknown'}
            </button>
          </li>)}</ul>
        )}
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2>Submit an axe evidence manifest</h2>
        <form onSubmit={submitEvidence}>
          {[
            ['targetUrl', 'Target URL'], ['authorizedHost', 'Authorized host'],
            ['authorizationReference', 'Authorization reference'], ['sourceRevision', 'Exact source revision'],
          ].map(([field, label]) => <label key={field} style={{ display: 'block', marginBottom: 10 }}>
            {label}<input required value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} style={{ display: 'block', width: '100%' }} />
          </label>)}
          <label style={{ display: 'block' }}>Evidence manifest JSON (runId, engineVersion, startedAt, completedAt, findings with ruleId, wcagCriterion, impact, selector and evidenceHash). Raw HTML is discarded.
            <textarea required rows="9" value={runText} onChange={e => setRunText(e.target.value)} style={{ display: 'block', width: '100%' }} />
          </label>
          <label>Or load a JSON file
            <input type="file" accept=".json,application/json" onChange={async e => {
              const file = e.target.files?.[0];
              if (file) {
                const content = await file.text();
                try {
                  const parsed = JSON.parse(content);
                  if (parsed.axeRun) {
                    setForm(current => ({
                      ...current,
                      targetUrl: parsed.targetUrl || '',
                      authorizedHost: parsed.authorizedHost || '',
                      authorizationReference: parsed.authorizationReference || '',
                      sourceRevision: parsed.sourceRevision || '',
                    }));
                  }
                  setRunText(content);
                  setError('');
                } catch (_) { setError('JSON file could not be parsed.'); }
              }
            }} />
          </label>
          <button disabled={busy} type="submit">Record evidence</button>
        </form>
      </section>
      {selected && <section>
        <h2>Audit {selected.id}: {selected.status}</h2>
        <p>Target: {selected.input?.targetUrl}; source revision: {selected.input?.sourceRevision}; axe run: {selected.input?.axeRun?.runId}.</p>
        {selected.report?.violations?.length > 0 && <p role="alert">Evidence issues: {selected.report.violations.join(', ')}</p>}
        <h3>Finding evidence and remediation ideas</h3>
        {findings.length === 0 ? <p>No axe findings were submitted. Manual testing is still required.</p> : <ul>
          {findings.map((finding, index) => <li key={index} style={{ marginBottom: 12 }}>
            <strong>{finding.ruleId}</strong> ({finding.wcagCriterion}, {finding.impact}) at <code>{finding.selector}</code>.
            <br />Evidence hash: <code>{finding.evidenceHash}</code>.
            <br />Suggested change: {suggestionFor(finding)} Re-run {finding.ruleId} against this element after the change.
          </li>)}
        </ul>}
        <h3>Compare declared revisions</h3>
        <select value={previousId} onChange={e => setPreviousId(e.target.value)}>
          <option value="">Choose a previous run</option>
          {audits.filter(item => item.id !== selected.id && item.input?.targetUrl === selected.input?.targetUrl)
            .map(item => <option key={item.id} value={item.id}>Audit {item.id} · {item.input?.sourceRevision} · {item.created_at}</option>)}
        </select>
        {previous && <div>
          <p>Declared revisions: {previous.input?.sourceRevision} → {selected.input?.sourceRevision}. Match by rule ID and selector: {added.length} new, {resolved.length} absent, {persistent.length} persistent.</p>
          {previous.input?.sourceRevision === selected.input?.sourceRevision && <p role="alert">Both runs declare the same source revision; confirm which build was scanned.</p>}
          {resolved.length > 0 && <p>Absent in newer run: {resolved.map(finding => `${finding.ruleId} at ${finding.selector}`).join('; ')}. Verify with manual and assistive technology testing before closing.</p>}
          {added.length > 0 && <p>New in newer run: {added.map(finding => `${finding.ruleId} at ${finding.selector}`).join('; ')}.</p>}
        </div>}
        {selected.status === 'reproduced' && ['auditor', 'admin'].includes(user?.role) && <button disabled={busy} onClick={() => act('submit')}>Submit for manual review</button>}
        {selected.status === 'pending_manual_review' && ['reviewer', 'admin'].includes(user?.role) && <div>
          <h3>Independent review</h3>
          <select value={review.decision} onChange={e => setReview({ ...review, decision: e.target.value })}><option value="approve">Approve</option><option value="reject">Reject</option></select>
          <input placeholder="Specific review reason" value={review.reason} onChange={e => setReview({ ...review, reason: e.target.value })} />
          <input placeholder="Assistive technology evidence reference" value={review.assistiveTechnologyEvidenceRef} onChange={e => setReview({ ...review, assistiveTechnologyEvidenceRef: e.target.value })} />
          <button disabled={busy || !review.reason.trim() || !review.assistiveTechnologyEvidenceRef.trim()} onClick={() => act('review')}>Record review</button>
        </div>}
      </section>}
    </div>
  );
}
