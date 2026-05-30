/**
 * tradeApi.js — Frontend API calls for persistent trade storage
 * All calls go to the local backend (localhost:3000).
 * Falls back gracefully if backend is unavailable.
 */

const BASE = 'http://localhost:3000/api/trades';
const TIMEOUT = 5000;

async function apiFetch(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ── Load ─────────────────────────────────────────────────────────────────────
export async function loadPositions()    { return apiFetch('/positions'); }
export async function loadClosedTrades() { return apiFetch('/closed'); }
export async function loadSettings()     { return apiFetch('/settings'); }

// ── Save (full sync — sends complete current state) ───────────────────────────
export async function syncPositions(positions) {
  return apiFetch('/positions', { method: 'PUT', body: JSON.stringify(positions) });
}
export async function syncClosedTrades(trades) {
  return apiFetch('/closed', { method: 'PUT', body: JSON.stringify(trades) });
}
export async function saveSetting(key, value) {
  return apiFetch('/settings/' + key, { method: 'PUT', body: JSON.stringify({ value }) });
}
