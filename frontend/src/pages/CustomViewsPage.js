import React from 'react';
import ViolationHeatmap from '../components/ViolationHeatmap';
import AccessibilityGauge from '../components/AccessibilityGauge';
import WCAGReportPDF from '../components/WCAGReportPDF';
import AxeRulesEditor from '../components/AxeRulesEditor';

const cardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  marginBottom: 20,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

function CustomViewsPage() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 4px' }}>A11y Views</h1>
        <p style={{ color: '#6b7280', marginTop: 0 }}>
          Custom accessibility audit visualizations and tooling.
        </p>
      </div>

      <div style={cardStyle}><ViolationHeatmap /></div>
      <div style={cardStyle}><AccessibilityGauge /></div>
      <div style={cardStyle}><WCAGReportPDF /></div>
      <div style={cardStyle}><AxeRulesEditor /></div>
    </div>
  );
}

export default CustomViewsPage;
