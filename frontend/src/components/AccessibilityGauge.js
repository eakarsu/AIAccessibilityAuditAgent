import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

function AccessibilityGauge() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios
      .get('/api/custom-views/accessibility-gauge', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message || 'Failed to load'));
  }, []);

  if (error) return <div style={{ color: '#b91c1c' }}>Gauge error: {error}</div>;
  if (!data) return <div>Loading accessibility gauge…</div>;

  // recharts RadialBar dataset
  const chartData = data.categories.map((c) => ({
    name: c.label,
    value: c.score,
    fill: c.color,
  }));

  return (
    <div className="accessibility-gauge" style={{ width: '100%' }}>
      <h3 style={{ margin: '0 0 8px' }}>Accessibility Score (0–100)</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }}>
        <div style={{ width: 320, height: 280, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="35%"
              outerRadius="95%"
              barSize={18}
              data={chartData}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={6} />
              <Tooltip />
              <Legend
                iconSize={10}
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: 0,
              right: 0,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 36, fontWeight: 700, color: '#111' }}>{data.overall}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Overall</div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 240 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>WCAG Principles Breakdown</h4>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>Category</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.key}>
                  <td style={{ padding: '6px 8px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        background: c.color,
                        marginRight: 8,
                        borderRadius: 2,
                      }}
                    />
                    {c.label}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{c.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AccessibilityGauge;
