import React, { useEffect, useState } from 'react';
import axios from 'axios';

function WCAGReportPDF() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios
      .get('/api/custom-views/sites', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => {
        const list = r.data.sites || [];
        setSites(list);
        if (list.length) setSiteId(list[0].id);
      })
      .catch((e) => setError(e.message || 'Failed to load sites'));
  }, []);

  const handleDownload = async () => {
    if (!siteId) return;
    setLoading(true);
    setMsg('');
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/custom-views/wcag-report-pdf', {
        params: { site_id: siteId },
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `wcag-report-${siteId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setMsg('PDF downloaded.');
    } catch (e) {
      setError(e.message || 'Failed to download PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wcag-report-pdf">
      <h3 style={{ margin: '0 0 8px' }}>WCAG Audit Report (PDF)</h3>
      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
        Pick a site and download a per-criterion PDF with severity and remediation guidance.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>
          Site:&nbsp;
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            style={{ padding: '6px 10px', minWidth: 240 }}
            disabled={sites.length === 0}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.url})
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={handleDownload}
          disabled={!siteId || loading}
          style={{
            padding: '8px 14px',
            background: '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: !siteId || loading ? 'not-allowed' : 'pointer',
            opacity: !siteId || loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>
      {error && <div style={{ color: '#b91c1c', marginTop: 10 }}>Error: {error}</div>}
      {msg && <div style={{ color: '#16a34a', marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

export default WCAGReportPDF;
