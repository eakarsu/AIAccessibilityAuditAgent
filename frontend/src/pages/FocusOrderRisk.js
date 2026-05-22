import React, { useState } from 'react';

export default function FocusOrderRisk() {
  const [form, setForm] = useState({ tabStops: 48, visualOrderBreaks: 3, hiddenFocusable: 2, modalTrapMissing: true });
  const [result, setResult] = useState(null);
  const submit = async () => {
    const response = await fetch('/api/focus-order-risk/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      body: JSON.stringify(form),
    });
    setResult(await response.json());
  };
  return (
    <div className="page-container">
      <h1>Focus Order Risk</h1>
      <div className="card">
        {Object.entries(form).map(([key, value]) => (
          <label key={key}>{key.replace(/([A-Z])/g, ' $1')}
            {typeof value === 'boolean'
              ? <input type="checkbox" checked={value} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
              : <input type="number" value={value} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />}
          </label>
        ))}
        <button className="btn btn-primary" onClick={submit}>Score focus order</button>
      </div>
      {result && <div className="card"><h2>{result.level.toUpperCase()} · {result.score}/100</h2><ul>{result.fixes.map((fix) => <li key={fix}>{fix}</li>)}</ul></div>}
    </div>
  );
}
