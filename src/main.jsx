import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global error catcher — shows errors visually if module fails before React
window.onerror = (msg, src, line, col, err) => {
  document.getElementById('root').innerHTML =
    `<div style="background:#0d1117;color:#f85149;padding:40px;font-family:monospace;font-size:13px">
      <div style="font-size:18px;margin-bottom:16px">⚠️ JS Error (before React)</div>
      <pre style="color:#c9d1d9;background:#161b22;padding:16px;border-radius:8px;white-space:pre-wrap">${msg}\n\nLine ${line}:${col}\n\n${err?.stack||''}</pre>
      <div style="margin-top:12px;color:#8b949e">Source: ${src}</div>
    </div>`;
};

window.onunhandledrejection = (e) => {
  console.error('[unhandledRejection]', e.reason);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
