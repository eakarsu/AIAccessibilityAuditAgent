import React, { useEffect, useState } from 'react';
import axios from 'axios';

// Color scale: 0 violations = green, then yellow -> orange -> red
function cellColor(count) {
  if (count <= 0) return '#16a34a';
  if (count <= 2) return '#eab308';
  if (count <= 5) return '#f97316';
  if (count <= 9) return '#ef4444';
  return '#7f1d1d';
}

function ViolationHeatmap() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios
      .get('/api/custom-views/violation-heatmap', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message || 'Failed to load'));
  }, []);

  if (error) return <div style={{ color: '#b91c1c' }}>Heatmap error: {error}</div>;
  if (!data) return <div>Loading violation heatmap…</div>;

  const { pages, criteria, cells } = data;
  const findCell = (page, criterion) =>
    cells.find((c) => c.page === page && c.criterion === criterion) || { violations: 0 };

  // gridTemplateColumns: first col for page label, then one per criterion
  const cols = `220px repeat(${criteria.length}, minmax(60px, 1fr))`;

  return (
    <div className="violation-heatmap" style={{ width: '100%', overflowX: 'auto' }}>
      <h3 style={{ margin: '0 0 8px' }}>Violation Heatmap (Pages × WCAG Criteria)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, minWidth: 720 }}>
        {/* header row */}
        <div style={{ background: '#f3f4f6', padding: '8px', fontWeight: 600 }}>Page \\ Criterion</div>
        {criteria.map((c) => (
          <div
            key={c.id}
            title={`${c.id} ${c.name} (Level ${c.level})`}
            style={{
              background: '#f3f4f6',
              padding: '8px 4px',
              fontSize: 11,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            <div>{c.id}</div>
            <div style={{ color: '#6b7280', fontWeight: 400 }}>{c.level}</div>
          </div>
        ))}
        {/* body rows */}
        {pages.map((page) => (
          <React.Fragment key={page}>
            <div
              style={{
                background: '#fafafa',
                padding: '8px',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              {page}
            </div>
            {criteria.map((c) => {
              const cell = findCell(page, c.id);
              return (
                <div
                  key={`${page}-${c.id}`}
                  title={`${page} · ${c.id} ${c.name}: ${cell.violations} violations`}
                  style={{
                    background: cellColor(cell.violations),
                    color: '#fff',
                    padding: '12px 4px',
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: 'center',
                    borderRadius: 2,
                  }}
                >
                  {cell.violations}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 12, alignItems: 'center' }}>
        <span>Severity:</span>
        {[
          { label: '0', c: '#16a34a' },
          { label: '1–2', c: '#eab308' },
          { label: '3–5', c: '#f97316' },
          { label: '6–9', c: '#ef4444' },
          { label: '10+', c: '#7f1d1d' },
        ].map((l) => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ background: l.c, width: 14, height: 14, borderRadius: 2 }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ViolationHeatmap;
