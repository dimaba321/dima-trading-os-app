import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import Chart from 'chart.js/auto';
import { loadPositions, loadClosedTrades, syncPositions, syncClosedTrades, loadSettings, saveSetting } from './api/tradeApi';
import {
  calculateCalibration, generateRankReport,
  calculateTradeScore, detectEmotional, getTradeR,
  getRankFromElo, getRankFromScore, checkPromotion,
  pointsToNextRank, updateElo, RANK_DEFS, ELO_BANDS,
  getConfidence,
} from './engine/rankingEngine';

// sendPrompt: copies to clipboard + shows toast
    function sendPrompt(text) {
      navigator.clipboard.writeText(text).catch(() => {});
      const t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2200);
    }


// ═══════════════════════════════════════════════════════════════
//  DATA
// ═══════════════════════════════════════════════════════════════

const ACCOUNT = 14444;   // IBI portfolio value as of May 30, 2026 — includes all 24 historical trades
const BACKEND = 'http://localhost:3000';
const BACKEND_URL = BACKEND;
const capital = ACCOUNT;

// ── CLOSED TRADES — full history through May 29, 2026 (24 trades) ────────────
const TRADES = [
  // April 2026
  {ticker:"SEDG",shares:60,entry:38.50,exit:40.88,date:"2026-04-26",pnl:148.78,notes:"Trendline bounce + 150 SMA",pattern:"Trendline Bounce"},
  {ticker:"SEDG",shares:40,entry:38.50,exit:43.18,date:"2026-04-26",pnl:176.00,notes:"Trendline bounce + 150 SMA",pattern:"Trendline Bounce"},
  {ticker:"IREN",shares:25,entry:51.58,exit:45.94,date:"2026-04-28",pnl:-141.00,notes:"Triangle breakout — BTC broke $75K",pattern:"Triangle Breakout"},
  {ticker:"ONDS",shares:100,entry:12.67,exit:9.51,date:"2026-04-28",pnl:-315.98,notes:"Emotional buy — stop hit",pattern:"Emotional Buy"},
  {ticker:"TJX",shares:15,entry:157.57,exit:156.04,date:"2026-04-28",pnl:-22.95,notes:"Trendline break exit",pattern:"Trendline Break"},
  // May 2026
  {ticker:"CRWV",shares:15,entry:107.58,exit:119.41,date:"2026-05-01",pnl:177.45,notes:"Triple confluence — T1 hit",pattern:"Triple Confluence"},
  {ticker:"SEDG",shares:40,entry:42.39,exit:42.80,date:"2026-05-06",pnl:16.40,notes:"Pre-earnings exit",pattern:"Pre-Earnings Entry"},
  {ticker:"IREN",shares:20,entry:49.98,exit:51.70,date:"2026-05-07",pnl:34.40,notes:"Partial exit pre-earnings",pattern:"Pre-Earnings Entry"},
  {ticker:"IREN",shares:10,entry:49.98,exit:58.90,date:"2026-05-07",pnl:89.20,notes:"Runner exit pre-earnings",pattern:"Pre-Earnings Entry"},
  {ticker:"RKLB",shares:30,entry:80.51,exit:80.65,date:"2026-05-07",pnl:4.20,notes:"Pre-earnings exit",pattern:"Pre-Earnings Entry"},
  {ticker:"XE",shares:40,entry:32.41,exit:31.56,date:"2026-05-12",pnl:-34.00,notes:"Speculative IPO — stop triggered",pattern:"IPO / Speculative"},
  {ticker:"NVDA",shares:10,entry:207.63,exit:227.42,date:"2026-05-15",pnl:197.90,notes:"Retest bounce — partial exit",pattern:"Retest Bounce"},
  {ticker:"IONQ",shares:30,entry:48.67,exit:52.45,date:"2026-05-15",pnl:113.40,notes:"Earnings recovery — T1 exit",pattern:"Earnings Recovery"},
  {ticker:"NVDA",shares:5,entry:217.14,exit:225.53,date:"2026-05-20",pnl:41.95,notes:"Runner exit pre-earnings",pattern:"Pre-Earnings Entry"},
  {ticker:"CIFR",shares:60,entry:20.04,exit:19.76,date:"2026-05-20",pnl:-16.80,notes:"BTC below $79.5K — stop triggered",pattern:"BTC Correlation Play"},
  {ticker:"IREN",shares:25,entry:55.99,exit:52.51,date:"2026-05-20",pnl:-86.95,notes:"BTC weakness — stop triggered",pattern:"BTC Correlation Play"},
  {ticker:"TEAM",shares:15,entry:93.47,exit:81.40,date:"2026-05-22",pnl:-181.05,notes:"Counter-trend — declining 150 SMA, stop triggered",pattern:"Earnings Recovery"},
  {ticker:"TTWO",shares:9,entry:235.10,exit:227.33,date:"2026-05-22",pnl:-69.93,notes:"Stop triggered",pattern:""},
  {ticker:"IREN",shares:25,entry:48.86,exit:55.15,date:"2026-05-22",pnl:188.70,notes:"Target T1 hit",pattern:"BTC Correlation Play"},
  {ticker:"IONQ",shares:30,entry:49.00,exit:56.13,date:"2026-05-22",pnl:213.90,notes:"Target T1 hit",pattern:"Support Level Test"},
  {ticker:"CRWV",shares:15,entry:108.14,exit:102.40,date:"2026-05-27",pnl:-86.10,notes:"Stop triggered @ $102.40",pattern:"Retest Bounce"},
  {ticker:"TSLA",shares:4,entry:408.65,exit:442.05,date:"2026-05-27",pnl:133.60,notes:"Closed @ $442.05",pattern:"Triple Confluence"},
  {ticker:"NEE",shares:15,entry:89.97,exit:87.10,date:"2026-05-29",pnl:-43.05,notes:"Stop triggered @ $87.10",pattern:"150 SMA Bounce"},
  {ticker:"NOW",shares:15,entry:107.54,exit:122.82,date:"2026-05-29",pnl:229.20,notes:"Closed @ $122.82 — target hit",pattern:"Earnings Recovery"},
];

// Sum of P&L from all pre-loaded trades — already baked into ACCOUNT=$14,444.
// Only P&L ABOVE this baseline is "new" and should be added to the account value.
const BASELINE_PNL = parseFloat(TRADES.reduce((s, t) => s + t.pnl, 0).toFixed(2));

// ── OPEN POSITIONS — as of May 29, 2026 ────────────────────────────────────
const DEFAULT_POS = [
  {id:1,ticker:"IGV", shares:20, entry:90.71, stop:88.00, t1:95.79, t2:0,notes:"Software sector ETF",pattern:"Sector Rotation",   rationale:"Software sector inflow + SMA support", date:"2026-05-22"},
  {id:2,ticker:"GEN", shares:65, entry:24.59, stop:22.80, t1:28.00, t2:0,notes:"Crossed 150 SMA with volume",pattern:"150 SMA Bounce",rationale:"150 SMA crossed upward, strong volume",date:"2026-05-22"},
  {id:3,ticker:"NTNX",shares:30, entry:49.43, stop:46.00, t1:57.00, t2:0,notes:"150 SMA + Volume Spike",pattern:"150 SMA + Volume Spike",rationale:"",date:"2026-05-27"},
  {id:4,ticker:"NVDL",shares:15, entry:107.72,stop:104.00,t1:116.00,t2:0,notes:"Support Level Test — 2x NVDA leveraged ETF",pattern:"Support Level Test",rationale:"",date:"2026-05-27"},
  {id:5,ticker:"ONDS",shares:100,entry:12.69, stop:11.69, t1:15.00, t2:0,notes:"Resistance Breakout — re-entry",pattern:"Resistance Breakout",rationale:"",date:"2026-05-29"},
];

const RANKS = [
  {name:"Bronze",       img:"ranks/rank_bronze.png",   color:"#cd7f32", req:{pf:1.0, wr:40, trades:5},   desc:"First steps — learning to cut losses"},
  {name:"Silver",       img:"ranks/rank_silver.png",   color:"#a8b0b8", req:{pf:1.2, wr:45, trades:15},  desc:"System is working — consistent entries"},
  {name:"Gold",         img:"ranks/rank_gold.png",     color:"#d4a520", req:{pf:1.4, wr:50, trades:25},  desc:"Consistent edge — rules followed"},
  {name:"Platinum",     img:"ranks/rank_platinum.png", color:"#4ade80", req:{pf:1.6, wr:55, trades:40},  desc:"Strong edge — position sizing mastered"},
  {name:"Diamond",      img:"ranks/rank_diamond.png",  color:"#60a5fa", req:{pf:1.8, wr:60, trades:60},  desc:"Precision execution — top 10% retail"},
  {name:"Elite",        img:"ranks/rank_elite.png",    color:"#a855f7", req:{pf:2.2, wr:63, trades:100}, desc:"Professional grade — consistent alpha"},
  {name:"Master Trader",img:"ranks/rank_master.png",   color:"#f85149", req:{pf:2.5, wr:65, trades:150}, desc:"The absolute best — elite tier"},
];

const MINER_TICKERS = new Set(["IREN","CIFR","MARA","CLSK","RIOT","BTBT","HUT"]);

// ── Trade patterns (mandatory on entry — feeds stats agent pattern matrix) ───
const TRADE_PATTERNS = [
  // 150 SMA System
  "150 SMA Bounce",
  "Approaching 150 SMA",
  "Above 150 SMA Trend",
  "150 SMA + Volume Spike",
  "150 SMA + Sector Strength",
  // Price Action
  "Trendline Bounce",
  "Trendline Break",
  "Support Level Test",
  "Resistance Breakout",
  "Retest Bounce",
  "Flag / Continuation",
  "Triangle Breakout",
  "Double Bottom",
  "Higher Low",
  // Confluence
  "Triple Confluence",
  "RSI Oversold + SMA",
  "SMA + MACD Cross",
  "BB Squeeze + SMA",
  // Event / Fundamental
  "Earnings Recovery",
  "Pre-Earnings Entry",
  "Post-Earnings Dip",
  "BTC Correlation Play",
  "Sector Rotation",
  "News Catalyst",
  "IPO / Speculative",
  // Risk flags — honest self-tagging
  "Emotional Buy",
  "FOMO Entry",
  "Averaging Down",
  "No Clear Reason",
];

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

async function fetchLivePrices(tickers) {
  if (!tickers.length) return {};
  const symbols = [...new Set(tickers)].join(",");

  // Route through the local backend (Node.js has no CORS restrictions)
  // Falls back to allorigins proxy if backend is offline
  const tryFetch = async (url, opts={}) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), ...opts });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };

  try {
    // Primary: backend proxy at localhost:3000/api/prices
    const data = await tryFetch(`http://localhost:3000/api/prices?symbols=${encodeURIComponent(symbols)}`);
    // Backend returns { TICKER: { price, change, name } }
    if (data && !data.error && Object.keys(data).length > 0) return data;
    throw new Error('empty response');
  } catch {
    // Fallback: allorigins.win CORS proxy
    try {
      const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChangePercent`;
      const d = await tryFetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`);
      const result = {};
      (d.quoteResponse?.result || []).forEach(q => {
        result[q.symbol] = { price: q.regularMarketPrice, change: q.regularMarketChangePercent ?? 0 };
      });
      return result;
    } catch {
      return {};
    }
  }
}

function getStats(closed) {
  const w = closed.filter(t => t.pnl > 0), l = closed.filter(t => t.pnl <= 0);
  const net = parseFloat(closed.reduce((s, t) => s + t.pnl, 0).toFixed(2));
  const gp = parseFloat(w.reduce((s, t) => s + t.pnl, 0).toFixed(2));
  const gl = parseFloat(Math.abs(l.reduce((s, t) => s + t.pnl, 0)).toFixed(2));
  return {
    net, gp, gl,
    wr: closed.length ? parseFloat((w.length / closed.length * 100).toFixed(1)) : 0,
    pf: gl > 0 ? parseFloat((gp / gl).toFixed(2)) : 0,
    aw: w.length ? parseFloat((gp / w.length).toFixed(2)) : 0,
    al: l.length ? parseFloat((gl / l.length).toFixed(2)) : 0,
    wins: w.length, losses: l.length, total: closed.length,
  };
}

function getStreak(closed) {
  if (!closed.length) return { cur: 0, best: 0, type: "W" };
  const curType = closed[closed.length - 1].pnl > 0 ? "W" : "L";
  let cur = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    const t = closed[i].pnl > 0 ? "W" : "L";
    if (t === curType) cur++; else break;
  }
  let best = 1, run = 1;
  for (let i = 1; i < closed.length; i++) {
    const same = (closed[i].pnl > 0) === (closed[i - 1].pnl > 0);
    run = same ? run + 1 : 1;
    if (run > best) best = run;
  }
  return { cur, best, type: curType };
}

function getRankIdx(pf, wr, trades) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) {
    const q = RANKS[i].req;
    if (pf >= q.pf && wr >= q.wr && trades >= q.trades) r = i;
  }
  return r;
}

function getTime() {
  const now = new Date();
  const il = new Intl.DateTimeFormat("en-IL", { timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  const nyN = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const h = nyN.getHours(), m = nyN.getMinutes(), day = nyN.getDay(), mins = h * 60 + m;
  let status, statusColor;
  if (day === 0 || day === 6) { status = "WEEKEND"; statusColor = "#8b949e"; }
  else if (mins >= 570 && mins < 960) { status = "OPEN"; statusColor = "#3fb950"; }
  else if (mins >= 240 && mins < 570) { status = "PRE-MARKET"; statusColor = "#d29922"; }
  else { status = "CLOSED"; statusColor = "#ff2d55"; }
  return { il, ny, status, statusColor };
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════

// Cyberpunk color palette
const bg       = "#07070d";
const bg2      = "#101019";
const bg3      = "#15151f";
const elevated = "#1b1b28";
const hover    = "#20202e";
const bdr      = "#25253a";
const bdr2     = "#34344e";
const accent   = "#ff6b00";   // orange primary
const accent2  = "#00e5ff";   // cyan secondary
const grn      = "#14f195";   // neon green (profit)
const red      = "#ff2d55";   // neon red (loss)
const amb      = "#ffb800";   // amber
const txt      = "#e9e9f2";
const txt2     = "#8b8ba6";
const txt3     = "#51516a";
const mono     = "'JetBrains Mono', 'SF Mono', monospace";
const display  = "'Chakra Petch', 'JetBrains Mono', monospace";

const C = {
  card: { background: `linear-gradient(180deg, ${bg3}, ${bg2})`, border: `1px solid ${bdr}`, borderRadius: 4, position: "relative", boxShadow: `0 0 22px rgba(255,107,0,0.10)`, padding: 12, marginBottom: 10 },
  csm: { background: bg3, border: `1px solid ${bdr}`, borderRadius: 4, padding: "7px 9px" },
  stat: { background: `linear-gradient(180deg, ${bg3}, ${bg2})`, border: `1px solid ${bdr}`, borderRadius: 4, padding: "12px 14px", position: "relative", boxShadow: `0 0 22px rgba(255,107,0,0.08)` },
  sl:   { fontSize: 9, color: txt2, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4, fontFamily: display, fontWeight: 600 },
  sh:   { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  stit: { fontSize: 11, fontWeight: 600, color: txt2, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: display },
  tbl:  { width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: mono },
  th:   { fontSize: 8.5, color: txt3, textTransform: "uppercase", padding: "8px 14px", textAlign: "left", borderBottom: `1px solid ${bdr}`, fontWeight: 600, letterSpacing: "0.1em", background: "#0c0c14" },
  td:   { padding: "9px 14px", borderBottom: `1px solid rgba(255,255,255,0.03)` },
  fp:   { background: `linear-gradient(180deg, ${bg3}, ${bg2})`, border: `1px solid ${bdr}`, borderRadius: 4, padding: 14, marginBottom: 12 },
  fl:   { fontSize: 9, color: txt2, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3, display: "block" },
  fi:   { width: "100%", background: elevated, border: `1px solid ${bdr2}`, color: txt, fontFamily: mono, fontSize: 12, padding: "8px 12px", borderRadius: 3, outline: "none", marginBottom: 6, boxSizing: "border-box" },
  fgr:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 },
  fgr3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 6 },
  btn:  (v) => ({ background: v === "green" ? "rgba(255,107,0,0.15)" : v === "red" ? "rgba(255,45,85,0.12)" : elevated, color: v === "green" ? accent : v === "red" ? red : txt2, border: v === "green" ? `1px solid rgba(255,107,0,0.45)` : v === "red" ? `1px solid rgba(255,45,85,0.35)` : `1px solid ${bdr2}`, borderRadius: 3, padding: "9px 12px", cursor: "pointer", fontFamily: mono, fontSize: 11, fontWeight: 600, width: "100%", marginBottom: 4, textShadow: v === "green" ? "0 0 10px rgba(255,107,0,0.6)" : "none", boxShadow: v === "green" ? "0 0 14px rgba(255,107,0,0.2)" : "none" }),
  sk:   (emg) => ({ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: elevated, border: emg ? `1px solid rgba(255,45,85,0.35)` : `1px solid ${bdr}`, borderRadius: 3, cursor: "pointer", textAlign: "left", width: "100%", fontFamily: mono, marginBottom: 5 }),
  rcard:(col) => ({ borderRadius: 4, padding: 14, border: `1.5px solid ${col}`, textAlign: "center", marginBottom: 10, background: "rgba(0,0,0,0.2)" }),
  rrow: (cur, col) => ({ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", borderRadius: 4, border: cur ? `1.5px solid ${col}` : `1px solid ${bdr}`, marginBottom: 3 }),
  pb:   { height: 4, borderRadius: 2, background: bdr, marginTop: 6 },
  sel:  { background: elevated, border: `1px solid ${bdr2}`, color: txt, fontFamily: mono, fontSize: 11, padding: "5px 8px", borderRadius: 3, outline: "none", cursor: "pointer" },
  nav:  { height: 54, flex: "none", display: "flex", alignItems: "center", padding: "0 16px", gap: 18, borderBottom: `1px solid ${bdr}`, background: "linear-gradient(180deg, #0d0d16, #090910)", position: "relative", zIndex: 5 },
  logo: { fontFamily: display, fontWeight: 700, fontSize: 14, letterSpacing: "0.08em" },
  tab:  (on) => ({ position: "relative", fontFamily: display, fontSize: 12, fontWeight: on ? 600 : 500, letterSpacing: "0.04em", color: on ? accent : txt2, background: on ? `rgba(255,107,0,0.08)` : "transparent", border: `1px solid ${on ? "rgba(255,107,0,0.45)" : "transparent"}`, borderRadius: 3, padding: "6px 11px", cursor: "pointer", textShadow: on ? "0 0 10px rgba(255,107,0,0.6)" : "none", transition: "all 0.15s", whiteSpace: "nowrap" }),
  page: { flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" },
  g5: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 12 },
  g4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 },
  g2: { display: "grid", gridTemplateColumns: "1fr 256px", gap: 10 },
  g2e: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  wrap: { display: "flex", flexDirection: "column", fontFamily: mono, fontSize: 12, background: bg, color: txt, minHeight: "100vh", overflow: "hidden", position: "relative" },
};

// ═══════════════════════════════════════════════════════════════
//  TV CHART (iframe — no API key needed)
// ═══════════════════════════════════════════════════════════════

function TradingViewChart({ ticker }) {
  const src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_${ticker}&symbol=${encodeURIComponent(ticker)}&interval=D&hidesidetoolbar=1&hideTopBar=1&theme=dark&style=1&locale=en&allow_symbol_change=0&save_image=0&toolbarbg=07070d`;
  return (
    <div style={{ height: 280, borderRadius: 4, overflow: "hidden", border: `1px solid ${bdr}`, marginTop: 8, background: bg3 }}>
      <iframe
        src={src}
        style={{ width: "100%", height: "100%", border: "none" }}
        allowTransparency="true"
        title={`Chart ${ticker}`}
      />
    </div>
  );
}

function TweetModal({ draft, onTextChange, onClose, onPost, posting }) {
  if (!draft) return null;
  const ov  = {position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.82)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16};
  const box = {background:"#0d0f16",border:"1px solid #2a2f3e",borderRadius:12,padding:24,width:"100%",maxWidth:520};
  const charColor = draft.text.length > 260 ? "#ff6a3d" : "#555";
  return (
    <div style={ov} onClick={onClose}>
      <div style={box} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:700,color:"#e2e8f0",marginBottom:14}}>📣 Tweet Preview</div>
        {draft.image
          ? <img src={`data:image/png;base64,${draft.image}`} style={{width:"100%",borderRadius:6,marginBottom:12,maxHeight:220,objectFit:"cover"}} alt="chart"/>
          : <div style={{background:"#1a1f2e",borderRadius:6,padding:14,marginBottom:12,fontSize:11,color:"#888",textAlign:"center"}}>
              {draft.chartFailed ? "Chart unavailable — text-only tweet" : "Capturing chart..."}
            </div>
        }
        <textarea
          value={draft.text}
          onChange={e=>onTextChange(e.target.value)}
          style={{width:"100%",boxSizing:"border-box",background:"#1a1f2e",border:"1px solid #2a2f3e",color:"#e2e8f0",borderRadius:6,padding:"10px 12px",fontSize:12,minHeight:110,fontFamily:"inherit",resize:"vertical",outline:"none"}}
        />
        <div style={{fontSize:10,color:charColor,textAlign:"right",marginTop:2}}>{draft.text.length}/280</div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button type="button" onClick={onClose} style={{flex:1,padding:"9px",background:"#1a1f2e",border:"1px solid #2a2f3e",color:"#aaa",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Cancel</button>
          <button type="button" onClick={onPost} disabled={posting||!draft.text} style={{flex:2,padding:"9px",background:posting?"#0f5d8a":"#1d9bf0",border:"none",color:"#fff",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700}}>
            {posting ? "Posting..." : "Post to X"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════

// ── Data version — bump whenever DEFAULT_POS or TRADES changes ───────────────
const DATA_VERSION = "2026-05-30-v5";  // force reload from SQLite — fixed stop=0 bug

// Atomic version check — runs ONCE before component mounts.
// Clears BOTH keys together so useState never sees a partial reset.
(function checkDataVersion() {
  try {
    if (localStorage.getItem("dima_data_ver") !== DATA_VERSION) {
      localStorage.removeItem("dima_p5");
      localStorage.removeItem("dima_c5");
      localStorage.removeItem("dima_deposits");  // clear old deposits — ACCOUNT already includes everything
      localStorage.setItem("dima_data_ver", DATA_VERSION);
      console.log('[data] Reset to defaults v' + DATA_VERSION);
    }
  } catch {}
})();

// ── Module-scope sub-components (moved here to avoid nested component definitions) ──

function Btn({ label, variant, onClick }) {
  return <button type="button" style={C.btn(variant)} onClick={onClick}>{label}</button>;
}

function Sk({ icon, label, desc, prompt, emg, onSkill }) {
  return (
    <button type="button" style={C.sk(emg)} onClick={() => onSkill(prompt, label)}>
      <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: emg ? red : txt }}>{label} ↗</div>
        <div style={{ fontSize: 10, color: txt3, marginTop: 1 }}>{desc}</div>
      </div>
    </button>
  );
}

function SpeedometerGauge({ value, title, gId }) {
  const v = value != null ? Math.max(0, Math.min(100, value)) : null;
  const W = 230, H = 138, cx = W / 2, cy = 118, r = 92;

  function polar(pcx, pcy, pr, deg) {
    const a = (deg - 180) * Math.PI / 180;
    return [pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)];
  }
  function arcPath(acx, acy, ar, startDeg, endDeg) {
    const [x1, y1] = polar(acx, acy, ar, startDeg);
    const [x2, y2] = polar(acx, acy, ar, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${ar} ${ar} 0 ${large} 1 ${x2} ${y2}`;
  }

  const vSafe = v ?? 50;
  const needleDeg = (vSafe / 100) * 180;
  const [nx, ny] = polar(cx, cy, r - 12, needleDeg);

  const valCol = v == null ? txt3 : v <= 25 ? '#ff2d55' : v <= 45 ? '#ff7a45' : v <= 55 ? '#ffb800' : v <= 75 ? '#9be15d' : '#14f195';
  const zoneLbl = v == null ? '—' : v <= 25 ? 'EXTREME FEAR' : v <= 45 ? 'FEAR' : v <= 55 ? 'NEUTRAL' : v <= 75 ? 'GREED' : 'EXTREME GREED';

  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const deg = (i / 10) * 180;
    const [x1, y1] = polar(cx, cy, r + 2, deg);
    const [x2, y2] = polar(cx, cy, r - (i % 5 === 0 ? 10 : 5), deg);
    ticks.push({ x1, y1, x2, y2, major: i % 5 === 0 });
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: txt2, textAlign: 'center', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4, fontFamily: display }}>{title}</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", width: "100%", display: "block" }}>
        <defs>
          <linearGradient id={`g${gId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ff2d55"/>
            <stop offset="35%"  stopColor="#ff7a45"/>
            <stop offset="50%"  stopColor="#ffb800"/>
            <stop offset="70%"  stopColor="#9be15d"/>
            <stop offset="100%" stopColor="#14f195"/>
          </linearGradient>
          <filter id={`ng${gId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* track */}
        <path d={arcPath(cx, cy, r, 0, 180)} fill="none" stroke="#1c1c2b" strokeWidth="14" strokeLinecap="round"/>
        {/* colored arc */}
        <path d={arcPath(cx, cy, r, 0, 180)} fill="none" stroke={`url(#g${gId})`} strokeWidth="9" strokeLinecap="round" opacity="0.95"/>
        {/* ticks */}
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.major ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"} strokeWidth={t.major ? 1.4 : 1}/>
        ))}
        {/* needle */}
        {v != null && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#fff" strokeWidth="2.4" strokeLinecap="round" filter={`url(#ng${gId})`} style={{ transition: "all 0.7s cubic-bezier(.22,1,.36,1)" }}/>
            <circle cx={cx} cy={cy} r="6" fill="#0a0a12" stroke="#fff" strokeWidth="1.6"/>
            <circle cx={cx} cy={cy} r="2" fill={valCol}/>
          </>
        )}
        {/* value */}
        <text x={cx} y={cy - 26} textAnchor="middle" fontFamily={mono} fontWeight="800" fontSize="30" fill={valCol}
          style={{ filter: `drop-shadow(0 0 8px ${v != null && v >= 55 ? "rgba(20,241,149,.5)" : "rgba(255,45,85,.45)"})` }}>
          {v ?? '—'}
        </text>
      </svg>
      <div style={{ fontSize: 11, fontWeight: 700, color: valCol, fontFamily: mono, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: -2 }}>{zoneLbl}</div>
    </div>
  );
}

export default function DimaTradingOS() {
  // ── state ──────────────────────────────────────────────────
  const [tab, setTab] = useState("dash");
  // Load from localStorage immediately (fast, synchronous)
  const [positions, setPositions] = useState(() => {
    try { const s = localStorage.getItem("dima_p5"); return s ? JSON.parse(s) : DEFAULT_POS; }
    catch { return DEFAULT_POS; }
  });
  const [closed, setClosed] = useState(() => {
    try { const s = localStorage.getItem("dima_c5"); return s ? JSON.parse(s) : TRADES.map(t=>({...t})); }
    catch { return TRADES.map(t=>({...t})); }
  });
  const [btc, setBtc] = useState({ price: null, change: null });
  const [time, setTime] = useState(getTime());
  const [form, setForm] = useState({ ticker: "", shares: "", entry: "", stop: "", t1: "", t2: "", pattern: "", rationale: "", notes: "" });
  const [cf, setCf] = useState({ ticker: "", exit: "", shares: "" });

  const [prices, setPrices] = useState({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedPos, setExpandedPos] = useState(null);
  const [skillLog, setSkillLog] = useState([]);
  const [histTicker,    setHistTicker]    = useState("ALL");
  const [histResult,    setHistResult]    = useState("ALL");
  const [editingTrade,  setEditingTrade]  = useState(null);
  const [editTradeData, setEditTradeData] = useState({});
  // ELO — calibration (stored in localStorage)
  const [calibration, setCalibration] = useState(() => {
    try { const s = localStorage.getItem("dima_calibration"); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [showCalibration, setShowCalibration] = useState(false);
  // ELO — close position quality flags
  const [cfExec, setCfExec] = useState({ followedPlan:false, perfectEntry:false, cleanExit:false });
  const [cfEmotional, setCfEmotional] = useState(false);
  // Skill journal
  const [skillJournal, setSkillJournal] = useState('');
  // API key management
  const [serverConfig, setServerConfig]   = useState(null);
  const [configInputs, setConfigInputs]   = useState({ ANTHROPIC_API_KEY:'', TELEGRAM_BOT_TOKEN:'', TELEGRAM_CHAT_ID:'', NEWS_API_KEY:'', FINNHUB_API_KEY:'' });
  const [configSaving, setConfigSaving]   = useState(false);
  const [configSaved,  setConfigSaved]    = useState(false);
  const [apiKeysOpen,  setApiKeysOpen]    = useState(false);
  // API key test
  const [keyTestResult, setKeyTestResult] = useState(null);
  const [keyTesting,    setKeyTesting]    = useState(false);
  const [agentStats, setAgentStats] = useState(null);
  const [agentStatsLoading, setAgentStatsLoading] = useState(false);
  const [universeStatus, setUniverseStatus] = useState(null);
  const [universeScanRunning, setUniverseScanRunning] = useState(false);
  const [serverLogs, setServerLogs] = useState([]);
  const serverLogEndRef = React.useRef(null);
  const [journalMonth, setJournalMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });


  // tweet state
  const [tweetDraft,   setTweetDraft]   = useState(null);
  const [showTweet,    setShowTweet]    = useState(false);
  const [tweetPosting, setTweetPosting] = useState(false);
  // agent state
  const [agentStatus,   setAgentStatus]   = useState({scout:'idle',hot:'idle',position:'idle',stats:'idle',ceo:'idle'});
  const [agentLog,      setAgentLog]      = useState([]);
  const [agentReport,   setAgentReport]   = useState(null);
  const [agentsRunning, setAgentsRunning] = useState(false);
  const [ceoStream,     setCeoStream]     = useState('');
  const [pendingSignalId, setPendingSignalId] = useState(null);
  const [liveSignals,     setLiveSignals]     = useState([]);
  // watchlist + sectors
  const WL_SECTORS = {
    '🪙 BTC Miners':['MARA','RIOT','CLSK','IREN','CORZ','HUT','BTBT','CIFR','MSTR','COIN','HOOD','SQ'],
    '💾 Semis / AI HW':['NVDA','AMD','AVGO','INTC','QCOM','MRVL','SMCI','AMAT','LRCX','KLAC','MU','TXN','ON','MCHP','ARM','TSM'],
    '🤖 AI / Software':['META','GOOGL','MSFT','AMZN','CRM','NOW','SNOW','PLTR','AI','BBAI','SOUN','AAPL','ORCL','SAP'],
    '🏥 Healthcare':['UNH','JNJ','LLY','ABBV','MRK','PFE','TMO','ABT','DHR','ISRG','MRNA','REGN','VRTX','DXCM'],
    '💰 Financials':['JPM','BAC','GS','MS','V','MA','PYPL','C','WFC','BLK','SCHW','AXP','COF','USB'],
    '⚡ Energy':['XOM','CVX','COP','SLB','MPC','PSX','VLO','HAL','OXY','EOG','DVN','FANG'],
    '🏗️ Industrial':['CAT','DE','BA','HON','GE','MMM','UPS','FDX','LMT','RTX','NOC','GD','ITW'],
    '🛒 Consumer':['TSLA','HD','LOW','NKE','SBUX','MCD','TGT','WMT','COST','DG','DLTR'],
    '📡 Telecom / Media':['T','VZ','TMUS','DIS','NFLX','CMCSA','CHTR','ROKU','SPOT','PARA'],
    '🏠 REITs':['AMT','PLD','EQIX','SPG','O','AVB','EQR','VTR','WELL'],
    '🔬 Biotech':['BIIB','GILD','AMGN','EXAS','NTLA','CRSP','EDIT','MRNA'],
    '🌱 Clean Energy':['ENPH','SEDG','FSLR','RUN','NOVA','PLUG','BLNK','CHPT'],
  };
  const WL_ALL=[...new Set(Object.values(WL_SECTORS).flat())];
  const [watchlist,    setWatchlist]    = useState(()=>{try{const s=localStorage.getItem("dima_wl");return s?JSON.parse(s):WL_ALL;}catch{return WL_ALL;}});
  const [watchPrices,  setWatchPrices]  = useState({});
  const [wlInput,      setWlInput]      = useState('');
  const [wlLoading,    setWlLoading]    = useState(false);
  // backend / stats panel / fear & greed
  const [backendConn,  setBackendConn]  = useState(false);
  const [statsPanel,   setStatsPanel]   = useState(false);
  const [statsData,    setStatsData]    = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [fearGreed,    setFearGreed]    = useState(null);
  const [fngLoading,   setFngLoading]   = useState(false);
  const [fngCrypto,    setFngCrypto]    = useState(null);
  const [fngCryptoLoading, setFngCryptoLoading] = useState(false);
  // brains tab removed — state kept as no-op to avoid refactoring blk_functions.js refs
  const [brainChecks,  setBrainChecks]  = useState({});
  const [customTasks,  setCustomTasks]  = useState({});
  const [taskInput,    setTaskInput]    = useState({});
  // settings
  const [apiKey,       setApiKey]       = useState(()=>{try{return localStorage.getItem("dima_key")||"";}catch{return "";}});
  const [keyInput,     setKeyInput]     = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [username,     setUsername]     = useState(()=>{try{return localStorage.getItem("dima_username")||"Dima";}catch{return "Dima";}});
  // Chat state
  // Chat history — persisted to localStorage so diary sees conversations after restart
  const [chatMessages, setChatMessages] = useState(() => {
    try { const s = localStorage.getItem("dima_chat"); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [chatInput,    setChatInput]    = useState('');
  const [chatLoading,  setChatLoading]  = useState(false);
  const chatEndRef = React.useRef(null);
  // Deposit state (top-level — never inside IIFE)
  const [totalDeposits, setTotalDeposits] = useState(()=>{try{return parseFloat(localStorage.getItem("dima_deposits")||"0");}catch{return 0;}});
  // Editable account value — user sets this to their actual broker balance
  const [accountValue, setAccountValue] = useState(()=>{
    try { return parseFloat(localStorage.getItem("dima_account_value")||String(ACCOUNT)); }
    catch { return ACCOUNT; }
  });
  const [showDeposit,   setShowDeposit]   = useState(false);
  const [depositNIS,    setDepositNIS]    = useState("2000");
  // Trading Diary
  const [diaryLoading, setDiaryLoading]   = useState(false);
  const [diaryResult,  setDiaryResult]    = useState(null); // {success, filePath, error}

  const wlInputRef = React.useRef(null);
  const eqRef = useRef(null), ptRef = useRef(null);
  const eqChart = useRef(null), ptChart = useRef(null);

  // ── CSS keyframes injection ────────────────────────────────
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      @keyframes pulse { 0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(20,241,149,0.55); } 50% { opacity:0.6; box-shadow: 0 0 0 5px rgba(20,241,149,0); } }
      @keyframes flashUp { 0% { color: #14f195; } 100% {} }
      @keyframes flashDown { 0% { color: #ff2d55; } 100% {} }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      @keyframes scanBar { 0% { width:0%; margin-left:0; } 50% { width:60%; margin-left:20%; } 100% { width:0%; margin-left:100%; } }
      @keyframes pulse2 { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: #07070d; }
      ::-webkit-scrollbar-thumb { background: #34344e; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: #ff6b00; }
      input, select, textarea { font-family: 'JetBrains Mono', monospace !important; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // ── effects ────────────────────────────────────────────────
  useEffect(() => { const t = setInterval(() => setTime(getTime()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { fetchBTC(); const t = setInterval(fetchBTC, 30000); return () => clearInterval(t); }, []);

  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;

  // Restore ELO calibration from backend if localStorage is empty (new machine / cleared cache)
  useEffect(() => {
    // Load account value from backend settings
    fetch('http://localhost:3000/api/trades/settings/account_value')
      .then(r => r.json())
      .then(d => {
        if (d.value) {
          const v = parseFloat(d.value);
          if (!isNaN(v) && v > 0) {
            setAccountValue(v);
            try { localStorage.setItem('dima_account_value', String(v)); } catch {}
          }
        }
      }).catch(() => {});

    // Load username from backend (set during first-run setup)
    fetch('http://localhost:3000/api/trades/settings/username')
      .then(r => r.json())
      .then(d => {
        if (d.value) {
          setUsername(d.value);
          try { localStorage.setItem("dima_username", d.value); } catch {}
        }
      }).catch(() => {});

    if (calibrationRef.current) return; // already loaded from localStorage
    fetch('http://localhost:3000/api/trades/settings/elo_calibration')
      .then(r => r.json())
      .then(d => {
        if (d.value) {
          const cal = JSON.parse(d.value);
          setCalibration(cal);
          try { localStorage.setItem("dima_calibration", d.value); } catch {}
          console.log('[ELO] Calibration restored from backend');
        }
      }).catch(() => {});
  }, []);

  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const closedRef = useRef(closed);
  closedRef.current = closed;
  const pricesRef = useRef(prices);
  pricesRef.current = prices;

  // ── Startup: load from backend DB (source of truth after first sync) ─────────
  useEffect(() => {
    // Load positions from backend — if backend has data, use it (overrides localStorage)
    loadPositions().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setPositions(data);
        try { localStorage.setItem("dima_p5", JSON.stringify(data)); } catch {}
        console.log('[DB] Loaded', data.length, 'positions from backend');
        // Sync to portfolio.service.js so Position Monitor agent reads correct data
        fetch('http://localhost:3000/api/portfolio/sync', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ positions: data, prices: pricesRef.current }),
        }).catch(() => {});
      } else if (data && data.length === 0) {
        // Backend is empty — seed it with current state
        syncPositions(positionsRef.current).catch(() => {});
      }
    }).catch(() => {}); // backend offline — localStorage already loaded

    loadClosedTrades().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setClosed(data);
        try { localStorage.setItem("dima_c5", JSON.stringify(data)); } catch {}
        console.log('[DB] Loaded', data.length, 'closed trades from backend');
      } else if (data && data.length === 0) {
        syncClosedTrades(closedRef.current).catch(() => {});
      }
    }).catch(() => {});
  }, []); // runs once on mount

  // Load server log history + subscribe to live log lines
  useEffect(() => {
    if (!window.electronAPI) return;
    // Load history from buffer
    window.electronAPI.getLogHistory?.().then(lines => {
      if (lines?.length) setServerLogs(lines.map(l => l.line));
    }).catch(() => {});
    // Subscribe to live lines via preload bridge
    window.electronAPI.onServerLog?.((line) => {
      setServerLogs(prev => {
        const next = [...prev, line];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });
  }, []);

  // Auto-scroll server log to bottom when new lines arrive and tab is open
  useEffect(() => {
    if (tab === 'server') serverLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serverLogs, tab]);

  // Load skill journal from backend on startup
  useEffect(() => {
    fetch('http://localhost:3000/api/skill-journal')
      .then(r => r.json())
      .then(d => { if (d.content) setSkillJournal(d.content); })
      .catch(() => {});
  }, []);

  // Save to localStorage (fast, local cache)
  useEffect(() => { try { localStorage.setItem("dima_p5", JSON.stringify(positions)); } catch {} }, [positions]);
  useEffect(() => { try { localStorage.setItem("dima_c5", JSON.stringify(closed)); } catch {} }, [closed]);
  // Sync to backend (persistent database) — fire-and-forget, won't block UI
  useEffect(() => { syncPositions(positions).catch(() => {}); }, [positions]);
  useEffect(() => { syncClosedTrades(closed).catch(() => {}); }, [closed]);
  // Persist chat history to localStorage (last 60 messages) + backend settings
  useEffect(() => {
    if (!chatMessages.length) return;
    const recent = chatMessages.slice(-60);
    try { localStorage.setItem("dima_chat", JSON.stringify(recent)); } catch {}
    // Also backup to backend (fire-and-forget)
    fetch('http://localhost:3000/api/trades/settings/chat_history', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ value: JSON.stringify(recent.slice(-20)) }), // last 20 to backend
    }).catch(() => {});
  }, [chatMessages]);
  // buildCharts must be declared BEFORE the useEffect that depends on it (avoids TDZ)
  const buildCharts = useCallback(() => {
    if (eqRef.current && !eqChart.current) {
      const chronological = [...closed].sort((a, b) => {
        if (a.seq != null && b.seq != null) return a.seq - b.seq;
        return (a.date||'') > (b.date||'') ? 1 : -1;
      });
      let cum = 0;
      const data = chronological.map(t => { cum = parseFloat((cum + t.pnl).toFixed(2)); return cum; });
      const labs = chronological.map(t => t.ticker);
      const ptC = data.map((_, i) => data[i] >= (i > 0 ? data[i - 1] : 0) ? "rgba(63,185,80,1)" : "rgba(248,81,73,1)");
      eqChart.current = new Chart(eqRef.current, {
        type: "line",
        data: { labels: labs, datasets: [{ data, borderColor: "rgba(20,241,149,0.7)", backgroundColor: "rgba(20,241,149,0.04)", fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: ptC.map(c => c.includes("63,185") ? "rgba(20,241,149,1)" : "rgba(255,45,85,1)"), pointBorderColor: ptC.map(c => c.includes("63,185") ? "rgba(20,241,149,1)" : "rgba(255,45,85,1)"), borderWidth: 1.5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => "$" + c.parsed.y.toFixed(2) }, backgroundColor: bg3, titleColor: txt2, bodyColor: txt, borderColor: bdr2, borderWidth: 1 } }, scales: { x: { ticks: { font: { size: 8, family: "'JetBrains Mono', monospace" }, color: txt3, autoSkip: true, maxRotation: 45 }, grid: { color: bdr } }, y: { ticks: { font: { size: 8, family: "'JetBrains Mono', monospace" }, color: txt3, callback: v => "$" + v }, grid: { color: bdr } } } },
      });
    }
    if (ptRef.current && !ptChart.current) {
      const patMap = {};
      closed.forEach(t => {
        const p = t.pattern || "Untagged";
        if (!patMap[p]) patMap[p] = { w: 0, t: 0 };
        patMap[p].t++;
        if (t.pnl > 0) patMap[p].w++;
      });
      const labs = Object.keys(patMap).slice(0, 12);
      const data = labs.map(k => parseFloat((patMap[k].w / patMap[k].t * 100).toFixed(0)));
      const cols = data.map(v => v >= 50 ? "rgba(20,241,149,0.7)" : "rgba(255,45,85,0.7)");
      ptChart.current = new Chart(ptRef.current, {
        type: "bar",
        data: { labels: labs, datasets: [{ data, backgroundColor: cols, borderRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y + "% win rate" }, backgroundColor: bg3, titleColor: txt2, bodyColor: txt, borderColor: bdr2, borderWidth: 1 } }, scales: { x: { ticks: { font: { size: 8, family: "'JetBrains Mono', monospace" }, color: txt3, maxRotation: 45 }, grid: { display: false } }, y: { min: 0, max: 100, ticks: { font: { size: 8, family: "'JetBrains Mono', monospace" }, color: txt3, callback: v => v + "%" }, grid: { color: bdr } } } },
      });
    }
  }, [closed]);

  useEffect(() => {
    if (tab === "stats") {
      const tid = setTimeout(buildCharts, 120);
      return () => clearTimeout(tid);
    } else {
      if (eqChart.current) { eqChart.current.destroy(); eqChart.current = null; }
      if (ptChart.current) { ptChart.current.destroy(); ptChart.current = null; }
    }
  }, [tab, closed, buildCharts]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "analytics") fetchAgentStats(); }, [tab]);

  // refreshWatchPrices must be declared BEFORE the useEffect that depends on it (avoids TDZ)
  const refreshWatchPrices = useCallback(async () => {
    if (!watchlist.length) return;
    setWlLoading(true);
    const data = await fetchLivePrices(watchlist);
    if (Object.keys(data).length) setWatchPrices(data);
    setWlLoading(false);
  }, [watchlist]);

  // watchlist + backend
  useEffect(()=>{
    if(watchlist.length) refreshWatchPrices();
    const t=setInterval(refreshWatchPrices,60000); return()=>clearInterval(t);
  },[watchlist.length, refreshWatchPrices]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    fetchBackendStats();
    const t=setInterval(fetchBackendStats,30000); return()=>clearInterval(t);
  },[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    fetchFearGreed(); fetchFearGreedCrypto();
    const t=setInterval(()=>{fetchFearGreed();fetchFearGreedCrypto();},300000); return()=>clearInterval(t);
  },[]);

  const refreshPrices = useCallback(async () => {
    const tickers = positions.map(p => p.ticker);
    if (!tickers.length) return;
    setPriceLoading(true);
    const data = await fetchLivePrices(tickers);
    if (Object.keys(data).length) {
      setPrices(data);
      setLastUpdated(new Date());
      // Keep backend heat calculator up-to-date with fresh prices
      fetch('http://localhost:3000/api/portfolio/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions, prices: data }),
      }).catch(() => {});
    }
    setPriceLoading(false);
  }, [positions]);

  useEffect(() => {
    refreshPrices();
    const t = setInterval(refreshPrices, 60000);
    return () => clearInterval(t);
  }, [refreshPrices]);

  // ── api ────────────────────────────────────────────────────
  async function fetchAgentStats() {
    setAgentStatsLoading(true);
    try {
      const [statsR, univR] = await Promise.all([
        fetch(`${BACKEND}/api/stats/full`),
        fetch(`${BACKEND}/api/universe/status`),
      ]);
      if (statsR.ok) setAgentStats(await statsR.json());
      if (univR.ok)  setUniverseStatus(await univR.json());
    } catch {}
    setAgentStatsLoading(false);
  }

  async function runUniverseScan() {
    setUniverseScanRunning(true);
    try {
      await fetch(`${BACKEND}/api/universe/scan`, { method: 'POST' });
      // Poll status after 60s — scan takes time
      setTimeout(async () => {
        try { const r = await fetch(`${BACKEND}/api/universe/status`); if (r.ok) setUniverseStatus(await r.json()); } catch {}
        setUniverseScanRunning(false);
      }, 60000);
    } catch { setUniverseScanRunning(false); }
  }

  // Load server config status on startup
  useEffect(() => {
    fetch(`${BACKEND}/api/config`)
      .then(r => r.json())
      .then(d => setServerConfig(d))
      .catch(() => {});
  }, []);

  async function saveServerConfig() {
    // Only send fields that have a value entered
    const payload = {};
    Object.entries(configInputs).forEach(([k, v]) => { if (v.trim()) payload[k] = v.trim(); });
    if (!Object.keys(payload).length) return;
    setConfigSaving(true);
    try {
      const r = await fetch(`${BACKEND}/api/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        // Also update Anthropic key in localStorage for frontend use
        if (payload.ANTHROPIC_API_KEY) {
          setApiKey(payload.ANTHROPIC_API_KEY);
          try { localStorage.setItem('dima_key', payload.ANTHROPIC_API_KEY); } catch {}
        }
        setConfigInputs({ ANTHROPIC_API_KEY:'', TELEGRAM_BOT_TOKEN:'', TELEGRAM_CHAT_ID:'', NEWS_API_KEY:'', FINNHUB_API_KEY:'' });
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 3000);
        // Refresh status
        const fresh = await fetch(`${BACKEND}/api/config`).then(r2 => r2.json()).catch(() => null);
        if (fresh) setServerConfig(fresh);
      }
    } catch {}
    setConfigSaving(false);
  }

  async function fetchBTC() {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true");
      const d = await r.json();
      setBtc({ price: d.bitcoin.usd, change: d.bitcoin.usd_24h_change });
    } catch {}
  }

  // ── journal prompt builder ─────────────────────────────────
  function buildJournalPrompt(month) {
    const [yr, mo] = month.split("-");
    const monthName = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
    const monthTrades = closed.filter(t => t.date && t.date.startsWith(month));
    if (!monthTrades.length) return `Build my monthly trading journal for ${monthName}. No trades were recorded for this month yet.`;

    const mStats = getStats(monthTrades);
    const patMap = {};
    monthTrades.forEach(t => {
      const p = t.pattern || "Untagged";
      if (!patMap[p]) patMap[p] = { wins: 0, losses: 0, pnl: 0 };
      if (t.pnl > 0) patMap[p].wins++; else patMap[p].losses++;
      patMap[p].pnl += t.pnl;
    });

    const emotionalFlags = ["Emotional Buy", "FOMO Entry", "Averaging Down", "No Clear Reason"];
    const flagged = monthTrades.filter(t => emotionalFlags.includes(t.pattern));

    const tradeLines = monthTrades.map(t =>
      `• ${t.date} | ${t.ticker} | Pattern: ${t.pattern || "None"} | Entry $${t.entry} → Exit $${t.exit} | P&L ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)} ${t.pnl >= 0 ? "✅" : "❌"}${t.rationale ? ` | Why I took it: "${t.rationale}"` : " | (no rationale recorded)"}`
    ).join("\n");

    const patLines = Object.entries(patMap)
      .sort((a, b) => b[1].pnl - a[1].pnl)
      .map(([p, s]) => `  ${p}: ${s.wins}W/${s.losses}L | Net $${s.pnl.toFixed(0)}`)
      .join("\n");

    return `Build my monthly trading journal for ${monthName}.\n\nTRADES THIS MONTH (${monthTrades.length} total):\n${tradeLines}\n\nMONTH STATS:\nWin rate: ${mStats.wr}% | Net P&L: ${mStats.net >= 0 ? "+" : ""}$${mStats.net} | Profit factor: ${mStats.pf} | ${mStats.wins}W / ${mStats.losses}L | Avg win: $${mStats.aw} | Avg loss: $${mStats.al}\n\nPATTERN BREAKDOWN:\n${patLines}${flagged.length ? `\n\n⚠️ EMOTIONAL / UNDISCIPLINED TRADES FLAGGED (${flagged.length}): ${flagged.map(t => `${t.ticker} tagged as "${t.pattern}"`).join(", ")} — these MUST be addressed honestly in the journal.` : ""}\n\nWrite a structured monthly journal with: 1) Performance summary, 2) Trade-by-trade review with lessons (especially use the recorded rationale to check if my reasoning was sound), 3) Pattern effectiveness analysis, 4) Emotional discipline review ${flagged.length ? "(flag the " + flagged.length + " emotional/undisciplined trades strongly)" : ""}, 5) What to improve next month. Be brutally honest — this is how I grow as a trader.`;
  }

  // ── actions ────────────────────────────────────────────────

  // ── brain helpers ─────────────────────────────────────────
  function toggleCheck(id) {
    setBrainChecks(prev=>{ const next={...prev,[id]:!prev[id]}; try{localStorage.setItem("dima_checks",JSON.stringify(next));}catch{} return next; });
  }
  function addTask(sectionId) {
    const text=(taskInput[sectionId]||"").trim(); if (!text) return;
    const id="custom_"+sectionId+"_"+Date.now();
    setCustomTasks(prev=>{ const next={...prev,[sectionId]:[...(prev[sectionId]||[]),{id,label:text}]}; try{localStorage.setItem("dima_tasks",JSON.stringify(next));}catch{} return next; });
    setTaskInput(prev=>({...prev,[sectionId]:""}));
  }
  function deleteTask(sectionId, taskId) {
    setCustomTasks(prev=>{ const next={...prev,[sectionId]:(prev[sectionId]||[]).filter(t=>t.id!==taskId)}; try{localStorage.setItem("dima_tasks",JSON.stringify(next));}catch{} return next; });
  }

  // ── agent helpers ─────────────────────────────────────────
  const agentLogRef = React.useRef([]);
  function addLog(agent, text) {
    const entry = { time: getTime(), agent, text };
    agentLogRef.current = [...agentLogRef.current, entry];
    setAgentLog([...agentLogRef.current]);
  }
  async function callAgent(prompt, maxTokens) {
    const resp = await fetch('http://localhost:3000/api/claude', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        apiKey,
        model:'claude-sonnet-4-6',
        maxTokens: maxTokens||1200,
        messages:[{role:'user', content:prompt}],
      }),
    });
    const d = await resp.json();
    return d.content?.[0]?.text || '';
  }
  function parseJSON(text) {
    try { return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { return {}; }
  }

  // ── Stats computation ────────────────────────────────────
  function computeStatsForAgent(trades) {
    if (!trades || trades.length === 0) return null;
    const valid = trades.filter(t => typeof t.pnl === 'number' && t.entry > 0);
    if (valid.length === 0) return null;
    const total = valid.length;
    const wins = valid.filter(t => t.pnl > 0);
    const losses = valid.filter(t => t.pnl <= 0);
    const winRate = wins.length / total;
    const grossWin = wins.reduce((s,t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s,t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 99 : 0;
    const avgWin = wins.length > 0 ? +(grossWin / wins.length).toFixed(2) : 0;
    const avgLoss = losses.length > 0 ? +(grossLoss / losses.length).toFixed(2) : 0;
    const expectancy = +((winRate * avgWin) - ((1 - winRate) * avgLoss)).toFixed(2);
    let peak = 0, cum = 0, maxDD = 0;
    for (const t of valid) { cum += t.pnl; if (cum > peak) peak = cum; if (peak - cum > maxDD) maxDD = peak - cum; }
    const recent = valid.slice(-10);
    const recentWins = recent.filter(t => t.pnl > 0);
    const recentWR = recent.length > 0 ? recentWins.length / recent.length : winRate;
    const recentGrossWin = recentWins.reduce((s,t) => s + t.pnl, 0);
    const recentLosses = recent.filter(t => t.pnl <= 0);
    const recentGrossLoss = Math.abs(recentLosses.reduce((s,t) => s + t.pnl, 0));
    const recentPF = recentGrossLoss > 0 ? +(recentGrossWin / recentGrossLoss).toFixed(2) : recentGrossWin > 0 ? 99 : 0;
    const edgeDeterioration = recent.length >= 5 && recentWR < winRate - 0.15;
    const byTicker = {};
    valid.forEach(t => { byTicker[t.ticker] = (byTicker[t.ticker]||0) + t.pnl; });
    const tickerEntries = Object.entries(byTicker);
    const bestEntry = tickerEntries.length > 0 ? tickerEntries.reduce((a,b) => a[1] > b[1] ? a : b) : null;
    const bestTicker = bestEntry ? bestEntry[0] : null;
    const bestTickerPnl = bestEntry ? +bestEntry[1].toFixed(2) : 0;
    const tickerStats = {};
    valid.forEach(t => { if (!tickerStats[t.ticker]) tickerStats[t.ticker]={wins:0,total:0}; tickerStats[t.ticker].total++; if(t.pnl>0)tickerStats[t.ticker].wins++; });
    const badTickers = Object.entries(tickerStats).filter(([,s])=>s.total>=5&&s.wins/s.total<0.4).map(([k])=>k);
    const confidence = Math.min(1, total / 30);
    return { total, winRate, profitFactor, expectancy, avgWin, avgLoss, maxDD, recentWR, recentPF, recentCount:recent.length, edgeDeterioration, bestTicker, bestTickerPnl, badTickers, confidence };
  }

  // ── take trade from signal ───────────────────────────────
  function takeTradeFromSignal(sig) {
    setForm(prev=>({
      ...prev,
      ticker:  sig.ticker||'',
      entry:   String(sig.entry||''),
      stop:    String(sig.stop||''),
      t1:      String(sig.target||sig.t1||''),
      t2:      '',
      pattern: sig.setupType||sig.setup||'',
      rationale:'Agent signal · score '+sig.score,
      notes:   (sig.setupType||sig.setup||'').replace(/_/g,' '),
    }));
    setPendingSignalId(sig.signalId||null);
    setTab('pos');
  }

  // ── run agents ───────────────────────────────────────────
  async function runAgents() {
    if (!apiKey) { setShowSettings(true); return; }
    setAgentsRunning(true);
    setAgentReport(null);
    setCeoStream('');
    agentLogRef.current = [];
    setAgentLog([]);
    setAgentStatus({scout:'idle',hot:'idle',position:'idle',stats:'idle',ceo:'idle'});

    // SCOUT
    setAgentStatus(prev=>({...prev,scout:'running'}));
    addLog('scout','Starting 150 SMA scan...');
    const sPrompt = `You are the SCOUT AGENT. Today: ${new Date().toDateString()}. BTC: ${btc.price?'$'+btc.price.toLocaleString()+' ('+(btc.change?.toFixed(2)||'?')+'%)':'unknown'}.

Scan for 150 SMA swing trade setups across S&P 500, Nasdaq 100, and BTC miners (IREN MARA RIOT CORZ CLSK HUT CIFR MSTR COIN).

MANDATORY FILTERS: Market Cap >= $2B | Avg Volume >= 3M | Price >= $10 | No earnings within 2 weeks

SETUPS (score out of 100):
SMA_BOUNCE → Price at/just bounced off 150 SMA from above (0-3% above) = BEST (+40pts base)
APPROACHING → 0-5% above SMA, pulling back on declining volume (+25pts)
ABOVE_TREND → 5-20% above SMA, healthy uptrend (+20pts)
BELOW_WATCH → 0-5% below SMA, watching for reclaim (+5pts)

Add pts: +30 if RVOL>1.5, +20 if SMA rising strongly, +15 if sector ETF above 150 SMA, +10 if BTC miners AND BTC>$79.5K

Return exactly this JSON (no other text):
{"signals":[{"ticker":"X","setupType":"SMA_BOUNCE","score":88,"entry":150.00,"stop":145.50,"target":159.00,"note":"one-line reason"}]}
Top 5 setups only, score >= 65.`;

    let scoutResult = {};
    try {
      const st = await callAgent(sPrompt, 1500);
      scoutResult = parseJSON(st);
      setAgentStatus(prev=>({...prev,scout:'done'}));
      addLog('scout',`Found ${(scoutResult.signals||[]).length} setup(s).`);
    } catch(e) {
      setAgentStatus(prev=>({...prev,scout:'error'}));
      addLog('scout','Error: '+e.message);
    }

    // WHATS HOT
    setAgentStatus(prev=>({...prev,hot:'running'}));
    addLog('hot','Scanning social momentum...');
    const hPrompt = `You are the WHATS HOT AGENT. Today: ${new Date().toDateString()}.

Scan for stocks with REAL multi-source momentum. Rules: Market Cap >= $2B, Avg Vol >= 3M, Price >= $10.
Cross-validate: Reddit (r/stocks r/wallstreetbets r/investing r/options), news/analyst upgrades, price+volume action.
2+ sources required — single-source hype is noise.

Score 0-10: Reddit×0.3 + News×0.3 + Volume×0.2 + PriceAction×0.2
Bonus: +1.5 if RVOL>1.5, +1 if 1d change>3%. Penalty: -2 if no volume confirmation.
Minimum qualifying score: 6.5

Return exactly this JSON (no other text):
{"hot":[{"ticker":"X","score":8.2,"catalyst":"why it's hot — specific catalyst","sources":["reddit","news"]}]}
Top 5 only, score >= 6.5.`;

    let hotResult = {};
    try {
      const ht = await callAgent(hPrompt, 1200);
      hotResult = parseJSON(ht);
      setAgentStatus(prev=>({...prev,hot:'done'}));
      addLog('hot',`Found ${(hotResult.hot||[]).length} hot name(s).`);
    } catch(e) {
      setAgentStatus(prev=>({...prev,hot:'error'}));
      addLog('hot','Error: '+e.message);
    }

    // POSITION MONITOR
    setAgentStatus(prev=>({...prev,position:'running'}));
    addLog('position','Reviewing open positions...');
    const posStr2 = positions.length
      ? positions.map(p=>`${p.ticker}: ${p.shares}sh @ $${p.entry}, stop $${p.stop}, T1 $${p.t1}${p.notes?` (${p.notes})`:''}`)
        .join('\n')
      : 'No open positions.';
    const pPrompt = `You are the POSITION MONITOR. Review these open positions vs current market conditions.

BTC: ${btc.price?'$'+btc.price.toLocaleString():' unknown'} — ${btc.price>=79500?'ABOVE $79.5K → miners HOLD':'BELOW $79.5K → miners at risk'}
Account: $${capital.toLocaleString()}

OPEN POSITIONS:
${posStr2}

For each position assess: is the thesis still valid? How close to stop? Any catalyst risk?

Return exactly this JSON (no other text):
{"positions":[{"ticker":"X","health":"GREEN","action":"HOLD","urgency":"LOW","note":"one-line reason"}],"alerts":["any urgent actions or empty array"]}`;

    let posResult = {};
    try {
      const pt = await callAgent(pPrompt, 800);
      posResult = parseJSON(pt);
      setAgentStatus(prev=>({...prev,position:'done'}));
      addLog('position',`Reviewed ${positions.length} position(s).`);
    } catch(e) {
      setAgentStatus(prev=>({...prev,position:'error'}));
      addLog('position','Error: '+e.message);
    }

    // STATS AGENT
    setAgentStatus(prev=>({...prev,stats:'running'}));
    addLog('stats','Computing edge metrics...');
    const edgeData = computeStatsForAgent(closed);
    let statsNote = 'No closed trades yet.';
    let systemHealth = 'unknown';
    if (edgeData) {
      systemHealth = edgeData.profitFactor>=1.5&&edgeData.winRate>=0.5?'strong':edgeData.profitFactor>=1?'weak':'danger';
      statsNote = `WR:${(edgeData.winRate*100).toFixed(0)}% PF:${edgeData.profitFactor.toFixed(2)} Exp:$${edgeData.expectancy.toFixed(2)}/trade Health:${systemHealth}`;
    }
    setAgentStatus(prev=>({...prev,stats:'done'}));
    addLog('stats',statsNote);

    // CEO AGENT (streaming)
    setAgentStatus(prev=>({...prev,ceo:'running'}));
    addLog('CEO','Synthesizing all data...');

    const scoutSignals=(scoutResult.signals||[]).map(s=>`${s.ticker} ${s.setupType} score:${s.score} entry:${s.entry} stop:${s.stop} target:${s.target} — ${s.note}`).join('\n')||'No setups found.';
    const hotNames=(hotResult.hot||[]).map(h=>`${h.ticker} score:${h.score} — ${h.catalyst}`).join('\n')||'No hot names.';
    const posAlerts=(posResult.alerts||[]).join(', ')||'All positions healthy.';

    const ceoPrompt = `You are the CEO AGENT — ${username}'s chief trading strategist. Today: ${new Date().toDateString()}.

═══ AGENT REPORTS ═══

SCOUT (150 SMA setups):
${scoutSignals}

WHATS HOT (momentum):
${hotNames}

POSITION ALERTS:
${posAlerts}

STATS/EDGE: ${statsNote}

BTC: ${btc.price?'$'+btc.price.toLocaleString():' unknown'}
Account: $${capital.toLocaleString()} | Open positions: ${positions.length}

═══ YOUR SYNTHESIS RULES ═══

STEP 1 — TIER CLASSIFICATION:
Tier 1 → Same ticker in BOTH Scout AND Hot → max 3 → PRIORITY TRADES
Tier 2 → Scout only (technical, no momentum) → watchlist, action = "watch"
Tier 3 → Hot only (no technical setup) → action = "avoid until setup forms"

STEP 2 — QUALITY FILTER:
Scout signal score >= 75 required for Tier 1.
Distance from 150 SMA <= 3% preferred.
Both must pass for Tier 1.

STEP 3 — MARKET REGIME:
Assess SPY vs 150 SMA. If SPY BELOW its 150 SMA:
→ Risk-off: reject BREAKOUT setups, require score >= 80 for Tier 1.
→ Only PULLBACK/APPROACH setups allowed.

STEP 4 — POSITION FILTER:
Remove any ticker already in ${username}'s open positions.

STEP 5 — TRADE PLAN (for every Tier 1):
entry = current price, stop = entry × 0.97, target = entry × 1.06 (2:1 R:R minimum)

STEP 6 — STATS FEEDBACK:
If systemHealth is "danger" → add size-reduction warning.
If edge deteriorating → only "high" confidence trades qualify.

═══ OUTPUT FORMAT (follow exactly) ═══

First output this EXACT JSON (one line):
{"alerts":[],"priority_trades":[{"ticker":"X","setup":"SMA_BOUNCE","action":"enter","confidence":"high","entry":0,"stop":0,"target":0,"score":0,"note":"reason"}],"market_summary":"SPY regime + BTC + theme","actions":["step 1","step 2"]}

Then NEW LINE: write a direct 2-4 sentence debrief to ${username}. Be honest. Name best opportunity or biggest risk.`;

    try {
      // Use streaming proxy for CEO report — shows character-by-character
      const resp = await fetch('http://localhost:3000/api/claude-stream', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          apiKey,
          model:'claude-sonnet-4-6',
          maxTokens:1500,
          messages:[{role:'user',content:ceoPrompt}],
        }),
      });
      if (!resp.ok) throw new Error('Stream error HTTP ' + resp.status);
      const reader = resp.body.getReader();
      const dec    = new TextDecoder();
      let full = '';
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim();
          if (d==='[DONE]') break;
          try {
            const j = JSON.parse(d);
            if (j.type === 'error') throw new Error(j.error);
            if (j.type==='content_block_delta'&&j.delta?.text) { full += j.delta.text; setCeoStream(full); }
          } catch(pe) { if (pe.message !== 'error') throw pe; }
        }
      }
      setAgentStatus(prev=>({...prev,ceo:'done'}));
      addLog('CEO','Report complete.');
      const report = parseJSON(full);
      report._raw = full;
      setAgentReport(report);
      // Push priority trades to liveSignals panel
      if ((report.priority_trades||[]).length) {
        setLiveSignals(prev=>{
          const existing=new Set(prev.map(s=>s.ticker));
          const newSigs=report.priority_trades
            .filter(t=>!existing.has(t.ticker))
            .map(t=>({...t,receivedAt:new Date().toISOString(),signalId:'ceo_'+t.ticker+'_'+Date.now()}));
          return [...prev,...newSigs];
        });
      }
    } catch(err) {
      setAgentStatus(prev=>({...prev,ceo:'error'}));
      addLog('CEO','Error: '+err.message);
    }
    setAgentsRunning(false);
  }

  // ── tweet helpers ─────────────────────────────────────────
  async function generateTweetPreview(type, data) {
    setTweetDraft({ text:'', image:null, chartFailed:false });
    setShowTweet(true);
    try {
      const r = await fetch(BACKEND_URL+'/api/generate-trade-preview', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type, data })
      });
      if (!r.ok) throw new Error('Server '+r.status);
      setTweetDraft(await r.json());
    } catch(err) {
      let text = '';
      if (type==='OPEN') text = `$${data.ticker}\n\nEntry: $${data.entry}${data.target?'\nTarget: $'+data.target:''}\nStop:  $${data.stop}\n\n#${data.ticker} #stocks #trading`;
      if (type==='CLOSE') { const win=data.pnl>=0; text = `$${data.ticker}\n\nEntry: $${data.entry} → Exit: $${data.exit}\n${win?'WIN':'LOSS'}  ${win?'+':'-'}$${Math.abs(data.pnl).toFixed(2)}\n\n#${data.ticker} #stocks #trading`; }
      setTweetDraft({ text, image:null, chartFailed:true });
    }
  }
  function publishTweet() {
    if (!tweetDraft?.text) return;
    const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetDraft.text);
    (window.electronAPI ? window.electronAPI.openExternal(url) : window.open(url, '_blank'));
    setShowTweet(false);
    setTweetDraft(null);
  }

  // watchlist helpers
  function addToWatchlist() {
    const raw = (wlInputRef.current ? wlInputRef.current.value : "") || wlInput || "";
    const t = raw.trim().toUpperCase();
    if (!t || watchlist.includes(t)) { setWlInput(""); if(wlInputRef.current) wlInputRef.current.value=""; return; }
    const next=[...watchlist,t];
    setWatchlist(next);
    try{localStorage.setItem("dima_wl",JSON.stringify(next));}catch{}
    setWlInput(""); if(wlInputRef.current) wlInputRef.current.value="";
  }
  function removeFromWatchlist(ticker) {
    const next=watchlist.filter(t=>t!==ticker);
    setWatchlist(next);
    try{localStorage.setItem("dima_wl",JSON.stringify(next));}catch{}
  }
  async function fetchBackendStats() {
    setStatsLoading(true);
    try {
      const r=await fetch(BACKEND_URL+'/api/stats/full');
      if(r.ok){setStatsData(await r.json());setBackendConn(true);}
    } catch {}
    setStatsLoading(false);
  }
  async function journalAndDownload(monthKey) {
    const mKey=monthKey||journalMonth;
    const prompt=buildJournalPrompt(mKey);
    logSkill(prompt,'Journal: '+mKey);
  }

  // ── Trading Diary (.docx) ─────────────────────────────────────────────────
  async function generateTradingDiary(month) {
    if (!window.electronAPI?.generateDiary) {
      alert('Trading Diary requires the Electron app — not available in browser mode.');
      return;
    }
    setDiaryLoading(true);
    setDiaryResult(null);
    try {
      const result = await window.electronAPI.generateDiary({
        positions,
        closed,
        stats,
        eloRank,
        currentElo,
        calibration,
        month:    month || journalMonth,
        username: username || 'Trader',
        apiKey,
        // Pass the actual chat conversation from the Chat tab
        // Filter to meaningful exchanges (skip single-word messages)
        chatHistory: chatMessages
          .filter(m => {
            // Only messages with real content
            if (!m.content || m.content.length < 20) return false;
            // If message has a timestamp, filter to the selected month
            if (m.ts) {
              const msgMonth = m.ts.slice(0, 7); // YYYY-MM
              const targetMonth = month || journalMonth;
              return msgMonth === targetMonth;
            }
            // No timestamp (old messages) — include them
            return true;
          })
          .slice(-40)
          .map(m => ({
            role: m.role,
            content: m.content.slice(0, 800),
            // Include timestamp so diary knows when each message was sent
            ts: m.ts ? new Date(m.ts).toLocaleString('en-GB', {
              timeZone: 'Asia/Jerusalem',
              day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
            }) : null,
          })),
      });
      setDiaryResult(result);
    } catch(e) {
      setDiaryResult({ success: false, error: e.message });
    } finally {
      setDiaryLoading(false);
      // Auto-dismiss success after 4s
      setTimeout(() => setDiaryResult(null), 4000);
    }
  }
  function sendToChat(text) { sp(text); }

  async function testApiKey() {
    setKeyTesting(true); setKeyTestResult(null);
    try {
      const r = await fetch('http://localhost:3000/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ apiKey, model:'claude-sonnet-4-6', maxTokens:5, messages:[{role:'user',content:'hi'}] })
      });
      const d = await r.json();
      if (d.type === 'error') setKeyTestResult({ok:false, msg: d.error?.message || 'Invalid key'});
      else if (d.content?.[0]?.text) setKeyTestResult({ok:true, msg:'✓ Key is valid and working'});
      else setKeyTestResult({ok:false, msg:'Unexpected: '+JSON.stringify(d).slice(0,80)});
    } catch(e) { setKeyTestResult({ok:false, msg:e.message}); }
    setKeyTesting(false);
  }

  // ── Calibration ──────────────────────────────────────────────────────────
  function runCalibration() {
    const result = calculateCalibration(closed);
    setCalibration(result);
    try { localStorage.setItem("dima_calibration", JSON.stringify(result)); } catch {}
    // Backup to backend — survives localStorage clear and machine changes
    fetch('http://localhost:3000/api/trades/settings/elo_calibration', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ value: JSON.stringify(result) }),
    }).catch(() => {});
    setShowCalibration(true);
    console.log('[ELO] Calibration complete:', result);
  }

  // ── Fear & Greed fetchers ──────────────────────────────────────────────────
  async function fetchFearGreed() {
    setFngLoading(true);
    try {
      const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const d = await r.json(); setFearGreed(d.fear_and_greed); }
    } catch {}
    setFngLoading(false);
  }
  async function fetchFearGreedCrypto() {
    setFngCryptoLoading(true);
    try {
      const r = await fetch('https://api.alternative.me/fng/', { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const d = await r.json(); setFngCrypto(d.data?.[0]); }
    } catch {}
    setFngCryptoLoading(false);
  }

  // ── Claude AI Chat ──────────────────────────────────────────────────────────
  // System prompt is a FUNCTION — computed fresh each call so date/time is always current
  function buildSystemPrompt() {
    const now = new Date();
    // Use 'en-GB' — universally supported in all Chromium builds (unlike 'en-IL')
    const ilTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem', weekday:'long', year:'numeric',
      month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false
    }).format(now);
    const nyTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York', weekday:'long', hour:'2-digit', minute:'2-digit', hour12:false
    }).format(now);
    const nyHour = parseInt(new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',hour12:false}).format(now));
    const nyDay  = new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',weekday:'short'}).format(now);
    const isWeekend   = ['Sat','Sun'].includes(nyDay);
    const isMarketOpen = !isWeekend && nyHour >= 9 && nyHour < 16;
    const marketStatus = isWeekend ? 'CLOSED (weekend)' : isMarketOpen ? '🟢 OPEN' : '🔴 CLOSED';

    // Build live position summary from current state
    const positionsSummary = positions.length > 0
      ? positions.map(p => `- ${p.ticker}: ${p.shares}sh @$${p.entry}, stop $${p.stop||'—'}, T1 $${p.t1||'—'}${p.pattern ? ` [${p.pattern}]` : ''}`).join('\n')
      : '- No open positions';

    return `You are ${username}'s personal trading assistant — brutally honest, stone cold, no softening.

CURRENT DATE & TIME:
🇮🇱 Israel: ${ilTime}
🇺🇸 New York: ${nyTime}
📈 US Market: ${marketStatus}

TRADER: ${username} | Account: $${(ACCOUNT + totalDeposits).toLocaleString()} | Swing trader using the 150 SMA system.

THE 150 SMA SYSTEM (ONLY system he trades):
1. 150 SMA must be RISING — declining SMA = NO entry, period
2. Price must be ABOVE the 150 SMA
3. Then check technicals: trendline, pattern, volume, support/resistance
4. Confirmation candle required (bounce, long lower wick, strong close)
5. Volume confirmation on breakouts — institutional level required
STOPS: Just below 150 SMA or trendline. NEVER move wider.
EXITS: Before resistance, NEVER hold through earnings.
SIZING: Max 10-15% per stock. Max 5-9% for BTC miners (IREN,CIFR,MARA,MSTR,COIN).

CURRENT OPEN POSITIONS (live — ${positions.length} open):
${positionsSummary}

LIVE TRADING STATS (from ${closed.length} closed trades):
- Net P&L: ${stats.net >= 0 ? '+' : ''}$${stats.net.toFixed(2)}
- Win Rate: ${stats.wr.toFixed(1)}% (${stats.wins}W / ${stats.losses}L)
- Profit Factor: ${stats.pf.toFixed(2)}
- Avg Win: +$${stats.aw.toFixed(2)} | Avg Loss: -$${stats.al.toFixed(2)}
- ELO Rank: ${eloRank?.name || 'Unknown'} (${currentElo} ELO)
- Emotional trades: ${closed.filter(t => ['Emotional Buy','FOMO Entry','Averaging Down','No Clear Reason'].includes(t.pattern) || t.emotional).length} / ${closed.length}

PSYCHOLOGY — NON-NEGOTIABLE:
- Earnings = gamble. He doesn't gamble.
- Excitement = danger signal. Calm = professional.
- Cash is a valid position when no setup exists
- Day trading: DISCONTINUED after SOXL -$300 while driving
- Never trade while distracted/driving
- Hope is not a stop loss. When you're hoping, exit.

BEHAVIORAL RULE — THIS IS CRITICAL:
Be brutally honest. Use strong language when earned. If he's about to make a stupid trade with real money: "Are you out of your fucking mind?" is appropriate. No softening. No "interesting approach." Facts + verdict + alternative. Always.
If his idea is wrong: say it's wrong with specific reasons.
If his idea is right: confirm it directly with the same directness.

SKILLS YOU HAVE:
- Chart analysis (150 SMA system, pattern recognition)
- Position sizing calculations
- Risk management review
- Market hours check (Israel UTC+3 summer, NY market 09:30-16:00)
- What's Hot scan (Reddit, news momentum)
- Smart money sector scanner
- Stock scout (finding 150 SMA setups)
- Psychology check (emotional trade detection)
- Trading journal review
${skillJournal ? `\nSKILL JOURNAL (${username}'s own recorded lessons — reference these when relevant):\n${skillJournal.slice(0, 2000)}` : ''}`;
  }

  // Quick-send to chat — used by Quick Actions buttons (auto-sends without user pressing Enter)
  async function quickSend(prompt) {
    if (!apiKey) { setTab('chat'); alert('Set your API key on the Dashboard tab first'); return; }
    setTab('chat');
    await new Promise(r => setTimeout(r, 150)); // let tab switch render
    const now = new Date().toISOString();
    const newMsg = { role: 'user', content: prompt, ts: now };
    const history = [...chatMessages, newMsg];
    setChatMessages(history);
    setChatLoading(true);
    try {
      let systemPrompt;
      try { systemPrompt = buildSystemPrompt(); } catch { systemPrompt = `You are ${username}'s trading assistant.`; }
      const resp = await fetch('http://localhost:3000/api/claude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model: 'claude-sonnet-4-6', maxTokens: 2000,
          system: systemPrompt, messages: history.map(m => ({ role: m.role, content: m.content })) }),
      });
      const d = await resp.json();
      if (!resp.ok || d.type === 'error') throw new Error(d.error?.message || 'API error');
      const reply = d.content?.[0]?.text || '(empty response)';
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply, ts: new Date().toISOString() }]);
    } catch(e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '❌ Error: ' + e.message, ts: new Date().toISOString() }]);
    }
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    if (!apiKey) { alert('Set your API key on the Dashboard tab first'); return; }
    const now = new Date().toISOString();
    const newMsg = { role: 'user', content: text, ts: now };
    const history = [...chatMessages, newMsg];
    setChatMessages(history);
    setChatInput('');
    setChatLoading(true);
    try {
      let systemPrompt;
      try { systemPrompt = buildSystemPrompt(); }
      catch(pe) { systemPrompt = `You are ${username}'s trading assistant. Be honest and direct.`; console.error('[chat] buildSystemPrompt error:', pe); }

      // Route through local backend — avoids Electron browser security restrictions
      const resp = await fetch('http://localhost:3000/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model:     'claude-sonnet-4-6',
          maxTokens: 2000,
          system:    systemPrompt,
          messages:  history.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const d = await resp.json();

      // Surface the real Claude error instead of hiding it
      if (!resp.ok || d.type === 'error') {
        const errMsg = d.error?.message || `HTTP ${resp.status}: ${JSON.stringify(d)}`;
        throw new Error(errMsg);
      }

      const reply = d.content?.[0]?.text || '(empty response)';
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply, ts: new Date().toISOString() }]);
    } catch(e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '❌ Error: ' + e.message, ts: new Date().toISOString() }]);
    }
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  function addPosition() {
    const { ticker, shares, entry, stop, t1, t2, pattern, rationale, notes } = form;
    if (!ticker || !shares || !entry || !stop || !pattern) return;

    const tickerUpper  = ticker.toUpperCase();
    const positionSize = parseFloat(entry) * parseFloat(shares);
    const MINERS       = new Set(['IREN','CIFR','MARA','CLSK','RIOT','BTBT','HUT','MSTR','COIN']);
    const maxPct       = MINERS.has(tickerUpper) ? 0.09 : 0.15;
    const positionPct  = positionSize / ACCOUNT;

    // Warn if position exceeds sizing rules (don't block — just alert)
    if (positionPct > maxPct) {
      const pctDisplay   = (positionPct * 100).toFixed(1);
      const maxDisplay   = (maxPct * 100).toFixed(0);
      const ok = window.confirm(
        `⚠️ POSITION SIZE WARNING\n\n` +
        `${tickerUpper}: ${parseFloat(shares)} shares @ $${parseFloat(entry).toFixed(2)} = $${positionSize.toFixed(0)} (${pctDisplay}% of account)\n` +
        `Your rule: Max ${maxDisplay}% per ${MINERS.has(tickerUpper) ? 'BTC miner' : 'stock'}\n\n` +
        `This trade exceeds your sizing rules. Continue anyway?`
      );
      if (!ok) return;
    }

    const p = { id: Date.now(), ticker: tickerUpper, shares: parseFloat(shares), entry: parseFloat(entry), stop: parseFloat(stop), t1: parseFloat(t1) || 0, t2: parseFloat(t2) || 0, pattern, rationale, notes, date: new Date().toISOString().split("T")[0] };
    setPositions(prev => [...prev, p]);
    setForm({ ticker: "", shares: "", entry: "", stop: "", t1: "", t2: "", pattern: "", rationale: "", notes: "" });
    generateTweetPreview('OPEN',{ticker:p.ticker,entry:p.entry,stop:p.stop,target:p.t1||null});
    sp(`I just added ${p.ticker} — ${p.shares} shares at $${p.entry}, stop $${p.stop}, target $${p.t1}. Pattern: ${p.pattern}.${p.rationale ? ` My rationale: "${p.rationale}"` : ""} Analyze this trade against my 150 SMA system and tell me if my reasoning holds.`);
  }

  function closePosition() {
    const { ticker, exit, shares: sc } = cf;
    if (!ticker || !exit) return;
    const pos = positions.find(p => p.ticker === ticker.toUpperCase());
    if (!pos) return;
    const shares = sc ? parseFloat(sc) : pos.shares;
    const pnl    = parseFloat(((parseFloat(exit) - pos.entry) * shares).toFixed(2));
    const closedTrade = {
      ticker:    ticker.toUpperCase(),
      shares, entry: pos.entry, exit: parseFloat(exit), pnl,
      stop:      pos.stop || 0,     // ← carry stop for accurate R calculation
      t1:        pos.t1 || 0,
      date:      new Date().toISOString().split("T")[0],
      notes:     "Closed @ $" + exit,
      pattern:   pos.pattern   || "",
      rationale: pos.rationale || "",
      emotional: (()=>{
        // Auto-detect — cannot be overridden by user
        if (!pos.stop || pos.stop <= 0) return true;
        const emoPats=new Set(['Emotional Buy','FOMO Entry','Averaging Down','No Clear Reason','No Pattern','']);
        if (emoPats.has(pos.pattern||'')) return true;
        const exitP=parseFloat(exit)||0;
        if (exitP>0&&pos.stop>0&&exitP<pos.stop&&exitP<pos.entry) return true;
        const MINERS=new Set(['IREN','CIFR','MARA','CLSK','RIOT','BTBT','HUT','MSTR']);
        const maxPct=MINERS.has(ticker.toUpperCase())?0.09:0.15;
        if((pos.shares*pos.entry)/ACCOUNT>maxPct) return true;
        return false;
      })(),                          // ← auto-detected, not user input
      execution: { ...cfExec },     // ← execution quality flags
    };
    setClosed(prev => [...prev, closedTrade]);
    if (!sc || parseFloat(sc) >= pos.shares) setPositions(prev => prev.filter(p => p.ticker !== ticker.toUpperCase()));
    else setPositions(prev => prev.map(p => p.ticker === ticker.toUpperCase() ? { ...p, shares: p.shares - parseFloat(sc) } : p));
    // Reset close form + ELO flags
    setCf({ ticker: "", exit: "", shares: "" });
    setCfExec({ followedPlan:false, perfectEntry:false, cleanExit:false });
    setCfEmotional(false);
    generateTweetPreview('CLOSE',{ticker:ticker.toUpperCase(),entry:pos.entry,exit:parseFloat(exit),pnl});
    if (eqChart.current) { eqChart.current.destroy(); eqChart.current = null; }
    const pt = (pnl >= 0 ? "+" : "") + "$" + Math.abs(pnl).toFixed(2);
    const eloChg = calculateEloChange(closedTrade);
    sp(`Closed ${ticker.toUpperCase()} at $${exit}. P&L: ${pt}. ELO change: ${eloChg.total > 0 ? '+' : ''}${eloChg.total}${eloChg.isEmotional?' (EMOTIONAL PENALTY -150)':''}. Was my rationale correct?`);
  }

  function sp(prompt) {
    try { sendPrompt(prompt); } catch {}
  }

  function logSkill(prompt, name) {
    setSkillLog(prev => [{ name, time: new Date() }, ...prev.slice(0, 9)]);
    sp(prompt);
  }

  // ── derived ────────────────────────────────────────────────
  const getUnrealized = (pos) => {
    const px = prices[pos.ticker]?.price;
    return px != null ? (px - pos.entry) * pos.shares : null;
  };

  const getHealth = (pos) => {
    const px = prices[pos.ticker]?.price;
    if (px == null) return null;
    if (px <= pos.stop) return 0;
    const range = pos.t1 - pos.stop;
    if (range <= 0) return null;
    return parseFloat(Math.min(10, Math.max(0, (px - pos.stop) / range * 10)).toFixed(1));
  };

  const healthColor = (h) => h == null ? txt3 : h >= 7 ? grn : h >= 4 ? amb : red;

  const statsForDisplay = computeStatsForAgent(closed);
  const unrealizedTotal = positions.reduce((sum, p) => {
    const u = getUnrealized(p);
    return u != null ? sum + u : sum;
  }, 0);

  const minerExposure = positions
    .filter(p => MINER_TICKERS.has(p.ticker))
    .reduce((s, p) => s + p.entry * p.shares, 0);

  const stats = getStats(closed);
  const streak = getStreak(closed);

  // ── ELO CALIBRATION SYSTEM ────────────────────────────────────────────────
  // Phase 1: Calibration runs on all historical trades → sets startingElo
  // Phase 2: New trades (after calibration count) add live ELO on top
  const calibratedCount  = calibration?.tradesAnalyzed ?? 0;
  const historicalTrades = closed.slice(0, calibratedCount);
  const newTrades        = closed.slice(calibratedCount);   // trades added after last calibration
  const calibrationElo   = calibration?.startingElo ?? 0;

  // Live ELO = calibrationElo + sum of new trade scores
  const liveEloChanges = newTrades.reduce((sum, t) => sum + calculateTradeScore(t).total, 0);
  const currentElo     = Math.max(0, calibrationElo + liveEloChanges);
  const eloRank        = getRankFromElo(currentElo);
  const eloPromotion   = checkPromotion(currentElo, newTrades.length >= 5 ? newTrades : closed);
  const eloToNext      = pointsToNextRank(currentElo);

  // Annotate closed trades with ELO change (for history tab)
  const eloTimeline = closed.map((t, i) => {
    if (i < calibratedCount) return { ...t, _elo: { total: 0, r: getTradeR(t), isCalibrated: true } };
    return { ...t, _elo: calculateTradeScore(t) };
  });

  // Legacy rank (PF/WR based) — still used for rank ladder
  const ri   = getRankIdx(stats.pf, stats.wr, stats.total);
  const rank = RANKS[ri] ?? eloRank;
  const nextR = RANKS[Math.min(ri + 1, RANKS.length - 1)] ?? eloRank;
  const prog = ri === RANKS.length - 1 ? 100 : Math.min(100, Math.max(0, (stats.pf - rank.req.pf) / (nextR.req.pf - rank.req.pf) * 100));
  // ──────────────────────────────────────────────────────────────────────────

  const btcCol = btc.price ? (btc.price < 79500 ? red : btc.price < 80000 ? amb : grn) : txt2;
  const pnlCol = stats.net >= 0 ? grn : red;
  const unrCol = unrealizedTotal >= 0 ? grn : red;

  const bestTrade = closed.length ? closed.reduce((a, b) => a.pnl > b.pnl ? a : b) : null;
  const worstTrade = closed.length ? closed.reduce((a, b) => a.pnl < b.pnl ? a : b) : null;

  const tickerStats = {};
  closed.forEach(t => {
    if (!tickerStats[t.ticker]) tickerStats[t.ticker] = { total: 0, wins: 0, pnl: 0 };
    tickerStats[t.ticker].total++;
    if (t.pnl > 0) tickerStats[t.ticker].wins++;
    tickerStats[t.ticker].pnl += t.pnl;
  });

  const histTickers = ["ALL", ...new Set(closed.map(t => t.ticker))];
  // History: NEWEST ON TOP, OLDEST AT BOTTOM
  // Primary: date DESC (May 29 before April 26)
  // Secondary: seq DESC within same date (last trade of day on top)
  const filteredHist = [...closed]
    .sort((a, b) => {
      const da = a.date || '', db = b.date || '';
      if (db !== da) return db > da ? 1 : -1;        // date DESC — newer date first
      if (a.seq != null && b.seq != null) return b.seq - a.seq; // seq DESC within same date
      return 0;
    })
    .filter(t => {
    if (histTicker !== "ALL" && t.ticker !== histTicker) return false;
    if (histResult === "WIN" && t.pnl <= 0) return false;
    if (histResult === "LOSS" && t.pnl > 0) return false;
    return true;
  });

  const morningPrompt = `Morning briefing — ${new Date().toDateString()}.\nOpen positions: ${positions.map(p => `${p.ticker} ${p.shares}sh @ $${p.entry} stop $${p.stop} T1 $${p.t1}${p.pattern ? " [" + p.pattern + "]" : ""}`).join("; ")}.\nBTC: ${btc.price ? "$" + btc.price.toLocaleString() : "unknown"}. Unrealized P&L: ${unrealizedTotal >= 0 ? "+" : ""}$${unrealizedTotal.toFixed(0)}.\nGive me 3 key things to watch today and flag any positions at risk.`;

  // ── sub-components (Btn and SpeedometerGauge and Sk defined at module scope above) ──
  // PriceRefreshBtn inlined below as JSX (captures component state)

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{
      ...C.wrap,
      background: `radial-gradient(1200px 700px at 70% -10%, rgba(255,107,0,0.08), transparent 60%), radial-gradient(900px 600px at -5% 110%, rgba(0,229,255,0.06), transparent 60%), ${bg}`
    }}>
      {/* Grid overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px)`,
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(120% 90% at 50% 0%, #000 35%, transparent 85%)"
      }} />

      {/* NAV */}
      <div style={C.nav}>
        {/* Moving accent hairline */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 1, overflow: "hidden", zIndex: 6 }}>
          <div style={{ position: "absolute", inset: 0, width: "40%",
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            animation: "sweep 6s linear infinite", opacity: 0.7 }} />
        </div>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          <div style={{
            width: 26, height: 26, display: "grid", placeItems: "center",
            border: `1px solid ${accent}`, color: accent,
            fontFamily: display, fontWeight: 700, fontSize: 15,
            boxShadow: `0 0 14px rgba(255,107,0,0.5), inset 0 0 8px rgba(255,107,0,0.15)`,
            clipPath: "polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)",
            flexShrink: 0
          }}>D</div>
          <div style={C.logo}>
            <span style={{ color: accent }}>DIMA</span>
            <span style={{ color: txt3, margin: "0 5px" }}>//</span>
            <span style={{ color: txt }}>TRADING OS</span>
          </div>
          <span style={{ fontSize: 8, color: txt3, border: `1px solid ${bdr}`, padding: "1px 4px", borderRadius: 2, marginLeft: 2 }}>v1.0.5</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto", flexShrink: 1, minWidth: 0 }}>
          {[["dash","Dashboard"],["pos","Positions"],["stats","Statistics"],["hist","History"],["analytics","Analytics"],["chat","Chat"],["skills","Skills"],["agents","Agents ◇"],["server","⬡ Server"]].map(([id, label]) => {
            const on = tab === id;
            return (
              <button key={id} type="button" style={C.tab(on)} onClick={() => setTab(id)}
                onMouseEnter={e => { if (!on) { e.currentTarget.style.color = txt; e.currentTarget.style.background = hover; } }}
                onMouseLeave={e => { if (!on) { e.currentTarget.style.color = txt2; e.currentTarget.style.background = "transparent"; } }}>
                {label}
                {on && <span style={{ position: "absolute", left: 8, right: 8, bottom: -1, height: 2, background: accent, boxShadow: `0 0 8px ${accent}`, display: "block" }} />}
              </button>
            );
          })}
        </div>

        {/* Right cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0, marginLeft: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <span style={{ color: txt3, fontSize: 9, fontFamily: display, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>BTC</span>
            <span style={{ fontWeight: 700, color: btcCol, fontFamily: mono, fontSize: 13 }}>{btc.price ? "$" + btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "loading..."}</span>
            {btc.change != null && <span style={{ fontSize: 11, color: btc.change >= 0 ? grn : red }}>{btc.change >= 0 ? "▲" : "▼"} {btc.change >= 0 ? "+" : ""}{btc.change.toFixed(2)}%</span>}
          </div>
          <div style={{ width: 1, height: 18, background: bdr2 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: time.statusColor, animation: time.status === "OPEN" ? "pulse 1.8s ease-in-out infinite" : "none", flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: time.statusColor, fontFamily: display, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{time.status}</span>
          </div>
          <div style={{ width: 1, height: 18, background: bdr2 }} />
          <div style={{ fontSize: 11, color: txt2, textAlign: "right", lineHeight: 1.6, fontWeight: 500, fontFamily: mono }}>
            <div style={{ fontSize: 10, color: txt3 }}>IL <span style={{color: txt, fontWeight: 600}}>{time.il}</span></div>
            <div style={{ fontSize: 10, color: txt3 }}>NY <span style={{color: txt, fontWeight: 600}}>{time.ny}</span></div>
          </div>
        </div>
      </div>

      {/* Content wrapper — above grid overlay */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── DASHBOARD ── */}
      {tab === "dash" && <div style={C.page}>
        {(()=>{
          const NIS_RATE    = 3.7;
          const depositUSD  = parseFloat((parseFloat(depositNIS||0)/NIS_RATE).toFixed(2));
          // Account value = user-set broker balance + any deposits added via the deposit button
          const baseCapital = parseFloat((accountValue + totalDeposits).toFixed(2));
          function confirmDeposit() {
            if(depositUSD<=0) return;
            const next=parseFloat((totalDeposits+depositUSD).toFixed(2));
            setTotalDeposits(next);
            try{localStorage.setItem("dima_deposits",String(next));}catch{}
            setShowDeposit(false); setDepositNIS("2000");
          }
          return <>
            {/* Deposit modal */}
            {showDeposit&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.78)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowDeposit(false)}>
              <div style={{background:bg2,border:`1px solid ${bdr2}`,borderRadius:10,padding:24,width:300}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:700,color:txt,marginBottom:16}}>💰 Deposit ₪ → USD</div>
                <div style={{fontSize:10,color:txt3,marginBottom:8}}>Rate: ₪1 = ${(1/NIS_RATE).toFixed(3)}</div>
                <input type="number" value={depositNIS} onChange={e=>setDepositNIS(e.target.value)}
                  style={{...C.fi,marginBottom:8,fontSize:16,textAlign:"center"}} placeholder="₪ amount"/>
                <div style={{fontSize:14,color:grn,textAlign:"center",marginBottom:16,fontWeight:700}}>= ${depositUSD.toFixed(2)} USD</div>
                <div style={{display:"flex",gap:8}}>
                  <button type="button" onClick={()=>setShowDeposit(false)} style={{...C.btn(""),flex:1,marginBottom:0}}>Cancel</button>
                  <button type="button" onClick={confirmDeposit} style={{...C.btn("green"),flex:2,marginBottom:0}}>+ Add ${depositUSD.toFixed(2)}</button>
                </div>
              </div>
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:10}}>
              {/* Account card with deposit button */}
              <div style={C.stat}>
                <div style={C.sl}>Account Value</div>
                <div style={{fontSize:22,fontWeight:800,color:txt,fontFamily:mono,lineHeight:1,marginTop:6}}>${baseCapital.toLocaleString("en-US",{maximumFractionDigits:0})}</div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginTop:6,flexWrap:"wrap"}}>
                  <input
                    type="number"
                    value={accountValue}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setAccountValue(v);
                      try { localStorage.setItem('dima_account_value', String(v)); } catch {}
                      fetch('http://localhost:3000/api/trades/settings/account_value', {
                        method:'PUT', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ value: String(v) }),
                      }).catch(() => {});
                    }}
                    style={{width:80,fontSize:9,padding:"2px 5px",background:elevated,border:`1px solid ${bdr}`,color:txt2,borderRadius:3,fontFamily:mono}}
                  />
                  <button type="button" onClick={()=>setShowDeposit(true)} style={{fontSize:8,padding:"2px 7px",background:`rgba(20,241,149,0.08)`,border:`1px solid rgba(20,241,149,0.3)`,color:grn,borderRadius:3,cursor:"pointer",fontFamily:mono}}>+ Deposit ₪</button>
                </div>
                {/* sparkline */}
                <div style={{display:"flex",alignItems:"flex-end",gap:2,height:16,marginTop:9}}>
                  {[40,55,48,62,58,70,66,78,74,88].map((h,i) => (
                    <div key={i} style={{flex:1,height:`${h}%`,background:txt2,opacity:0.18+(i/10)*0.6,borderRadius:1}}/>
                  ))}
                </div>
              </div>
              {[
                ["Realized P&L",(stats.net>=0?"+":"")+"$"+Math.abs(stats.net).toFixed(2),(stats.net/11000*100).toFixed(2)+"% on $11K start",pnlCol,[50,45,55,48,60,52,64,58,70,66]],
                ["Unrealized P&L",(unrealizedTotal>=0?"+":"")+"$"+Math.abs(unrealizedTotal).toFixed(0),Object.keys(prices).length?"live":"loading prices...",unrCol,[55,50,58,54,62,56,60,64,58,62]],
                ["Win rate",stats.wr.toFixed(1)+"%",stats.wins+"W / "+stats.losses+"L · "+stats.total+" trades",amb,[60,58,64,62,66,64,68,65,70,68]],
                ["Profit factor",stats.pf.toFixed(2),"Target >1.5",pnlCol,[40,48,44,52,50,58,55,62,60,66]],
                ["ELO Rating", currentElo.toLocaleString(), eloRank.name + (eloToNext ? " · " + eloToNext + " to next" : " · MAX"), eloRank.color,[50,52,51,56,54,60,58,63,61,66]],
              ].map(([label,val,sub,col,spark])=>(
                <div key={label} style={C.stat}>
                  <div style={C.sl}>{label}</div>
                  <div style={{fontSize:22,fontWeight:800,color:col,fontFamily:mono,lineHeight:1,marginTop:6,textShadow:col===grn?"0 0 16px rgba(20,241,149,0.45)":col===red?"0 0 16px rgba(255,45,85,0.45)":col===amb?"0 0 16px rgba(255,184,0,0.4)":"0 0 16px rgba(255,107,0,0.5)"}}>{val}</div>
                  <div style={{fontSize:9,color:txt3,marginTop:4}}>{sub}</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:2,height:16,marginTop:9}}>
                    {spark.map((h,i) => (
                      <div key={i} style={{flex:1,height:`${h}%`,background:col,opacity:0.18+(i/10)*0.6,borderRadius:1}}/>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>;
        })()}

        {/* ── Market Sentiment + Quick Actions ── */}
        {(()=>{
          return (
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
              {/* Speedometer gauges */}
              <div style={{...C.card,display:"flex",gap:10,padding:"10px 14px",alignItems:"center",maxHeight:230,overflow:"hidden"}}>
                <SpeedometerGauge value={fearGreed?.score?Math.round(fearGreed.score):null} title="STOCK MARKET" gId="stock"/>
                <div style={{width:1,background:bdr,flexShrink:0}}/>
                <SpeedometerGauge value={fngCrypto?.value?parseInt(fngCrypto.value):null} title="₿ CRYPTO" gId="crypto"/>
              </div>

              {/* Quick Actions + API Key sidebar */}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={C.card}>
                  <div style={{fontSize:9,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>QUICK ACTIONS</div>
                  <button type="button" onClick={()=>setTab('pos')} style={{...C.btn("green"),marginBottom:6,fontSize:11,fontWeight:700}}>+ Add / Close Position</button>
                  <button type="button" onClick={()=>setTab('stats')} style={{...C.btn(""),marginBottom:6,fontSize:11}}>Statistics &amp; Rank</button>
                  <button type="button" onClick={()=>quickSend("What's hot in the market today? Top 3 momentum stocks with clear catalyst, volume confirmation, and 150 SMA setup. Filter out noise.")} style={{...C.btn(""),marginBottom:6,fontSize:11}}>Whats Hot ↗</button>
                  <button type="button" onClick={()=>quickSend("Give me my morning briefing. Analyze my open positions vs current market conditions and BTC price. What do I need to watch today?")} style={{...C.btn(""),marginBottom:6,fontSize:11}}>Morning Briefing ↗</button>
                  <button type="button" onClick={()=>generateTradingDiary(journalMonth)} disabled={diaryLoading} style={{...C.btn("green"),marginBottom:0,fontSize:11,fontWeight:700,opacity:diaryLoading?0.6:1}}>{diaryLoading?'Generating…':'Trading Diary (.docx)'}</button>
                </div>
                {/* Username */}
                <div style={C.card}>
                  <div style={{fontSize:9,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>👤 Name</div>
                  <input
                    value={username}
                    onChange={e => {
                      const v = e.target.value;
                      setUsername(v);
                      try { localStorage.setItem("dima_username", v); } catch {}
                      fetch('http://localhost:3000/api/trades/settings/username', {
                        method:'PUT', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ value: v }),
                      }).catch(() => {});
                    }}
                    placeholder="Your name"
                    style={{...C.fi, marginBottom: 0, fontSize: 11}}
                  />
                  <div style={{fontSize:9,color:txt3,marginTop:4}}>Shown in nav bar and system prompt</div>
                </div>
                {/* API Keys & Server Config — collapsible */}
                <div style={C.card}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setApiKeysOpen(o=>!o)}>
                    <div style={{fontSize:9,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em"}}>🔑 API Keys</div>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      {[
                        {label:"Anthropic", ok: serverConfig?.hasAnthropicKey || (!!apiKey && apiKey.length > 30 && !apiKey.includes('...'))},
                        {label:"Telegram",  ok: serverConfig?.hasTelegram},
                        {label:"NewsAPI",   ok: serverConfig?.hasNewsApi},
                        {label:"Finnhub",   ok: serverConfig?.hasFinnhub},
                      ].map(s=>(
                        <span key={s.label} style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:s.ok?"rgba(63,185,80,0.1)":"rgba(248,81,73,0.08)",color:s.ok?grn:txt3,border:`1px solid ${s.ok?"rgba(63,185,80,0.2)":"rgba(248,81,73,0.15)"}`}}>
                          {s.ok?"✓":"✗"} {s.label}
                        </span>
                      ))}
                      <span style={{fontSize:10,color:txt3,marginLeft:4}}>{apiKeysOpen?"▲":"▼"}</span>
                    </div>
                  </div>

                  {apiKeysOpen && <>
                    <div style={{marginTop:10}}>
                      {[
                        {key:"ANTHROPIC_API_KEY",  label:"Anthropic",       ph:"sk-ant-api03-...",    type:"password", req:true},
                        {key:"TELEGRAM_BOT_TOKEN", label:"Telegram Token",  ph:"1234567890:AAHxxx...", type:"password"},
                        {key:"TELEGRAM_CHAT_ID",   label:"Telegram Chat ID",ph:"123456789",            type:"text"},
                        {key:"NEWS_API_KEY",        label:"NewsAPI",         ph:"2b8dc48a...",          type:"password"},
                        {key:"FINNHUB_API_KEY",     label:"Finnhub",         ph:"d8as0bhr...",          type:"password"},
                      ].map(f=>(
                        <div key={f.key} style={{marginBottom:6}}>
                          <div style={{fontSize:8,color:txt3,marginBottom:2}}>{f.label}{f.req&&<span style={{color:red}}> *</span>}</div>
                          <input type={f.type} placeholder={f.ph} value={configInputs[f.key]}
                            onChange={e=>setConfigInputs(p=>({...p,[f.key]:e.target.value}))}
                            style={{...C.fi,marginBottom:0,fontSize:10,padding:"5px 8px"}}/>
                        </div>
                      ))}
                      <button type="button" onClick={saveServerConfig} disabled={configSaving}
                        style={{...C.btn(configSaved?"":"green"),marginTop:6,fontSize:10,fontWeight:700,opacity:configSaving?0.6:1}}>
                        {configSaving?"Saving…":configSaved?"✓ Saved":"Save Keys → .env"}
                      </button>
                      {(serverConfig?.hasAnthropicKey||apiKey)&&(
                        <button type="button" onClick={testApiKey} disabled={keyTesting}
                          style={{background:"none",border:`1px solid rgba(63,185,80,0.3)`,color:grn,borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:9,fontFamily:"inherit",width:"100%",marginTop:4}}>
                          {keyTesting?"⏳ Testing…":"⚡ Test Anthropic Key"}
                        </button>
                      )}
                      {keyTestResult&&<div style={{fontSize:9,color:keyTestResult.ok?grn:red,marginTop:3}}>{keyTestResult.msg}</div>}
                    </div>
                  </>}
                </div>
              </div>
            </div>
          );
        })()}

        <div style={C.g2}>
          <div>
            <div style={{...C.card, padding:"8px 12px"}}>
              <div style={{...C.sh, marginBottom:5}}>
                <span style={C.stit}>Open positions</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: txt3 }}>{positions.length} open</span>
                  <button type="button" onClick={refreshPrices} style={{ fontSize: 9, padding: "2px 8px", background: bg3, border: `1px solid ${bdr}`, color: priceLoading ? amb : txt3, borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }}>{priceLoading ? "updating..." : lastUpdated ? `↻ ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "↻ prices"}</button>
                </div>
              </div>
              <table style={C.tbl}>
                <thead><tr>{["Ticker","Shares","Entry","Stop","T1","Live $","Unreal P&L"].map(h => <th key={h} style={C.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {positions.length ? positions.map(p => {
                    const px = prices[p.ticker]?.price;
                    const ch = prices[p.ticker]?.change;
                    const unr = getUnrealized(p);
                    const up = unr == null ? true : unr >= 0;
                    return (
                      <tr key={p.id} style={{ background: up ? "rgba(20,241,149,0.018)" : "rgba(255,45,85,0.018)" }}
                        onMouseEnter={e => e.currentTarget.style.background = hover}
                        onMouseLeave={e => e.currentTarget.style.background = up ? "rgba(20,241,149,0.018)" : "rgba(255,45,85,0.018)"}>
                        <td style={C.td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ width: 3, height: 16, background: up ? grn : red, boxShadow: `0 0 6px ${up ? grn : red}`, flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: txt, fontFamily: display }}>{p.ticker}</span>
                            <span style={{ display: "inline-block", fontSize: 7, padding: "1px 3px", borderRadius: 2, fontWeight: 700, marginLeft: 1, background: `rgba(20,241,149,0.15)`, color: grn }}>L</span>
                          </div>
                        </td>
                        <td style={{ ...C.td, color: txt2 }}>{p.shares}</td>
                        <td style={C.td}>${p.entry.toFixed(2)}</td>
                        <td style={{ ...C.td, color: red }}>${p.stop.toFixed(2)}</td>
                        <td style={{ ...C.td, color: grn }}>${p.t1.toFixed(2)}</td>
                        <td style={{ ...C.td, color: px != null ? (ch >= 0 ? grn : red) : txt3 }}>
                          {px != null ? "$" + px.toFixed(2) : "—"}
                          {ch != null && <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.8 }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</span>}
                        </td>
                        <td style={{ ...C.td, color: unr != null ? (unr >= 0 ? grn : red) : txt3, fontWeight: unr != null ? 600 : 400 }}>
                          {unr != null ? (unr >= 0 ? "+" : "") + "$" + Math.abs(unr).toFixed(0) : "—"}
                        </td>
                      </tr>
                    );
                  }) : <tr><td colSpan={7} style={{ ...C.td, color: txt3, textAlign: "center", padding: 16 }}>No positions</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{...C.card, padding:"8px 12px"}}>
              <div style={{...C.sh, marginBottom:5}}><span style={C.stit}>BTC status</span></div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div><div style={C.sl}>Price</div><div style={{ fontSize: 15, fontWeight: 700, color: btcCol }}>{btc.price ? "$" + btc.price.toLocaleString() : "—"}</div></div>
                <div><div style={C.sl}>vs $79.5K rule</div><div style={{ fontSize: 10, fontWeight: 700, color: btcCol }}>{btc.price ? (btc.price >= 79500 ? "✓ ABOVE $79.5K" : "⚠ BELOW $79.5K") : "—"}</div></div>
                <div><div style={C.sl}>Miners</div><div style={{ fontSize: 10, fontWeight: 700, color: btcCol }}>{btc.price ? (btc.price >= 79500 ? "HOLD" : "REDUCE") : "—"}</div></div>
                <div><div style={C.sl}>Miner exposure</div><div style={{ fontSize: 10, fontWeight: 700, color: txt2 }}>{minerExposure > 0 ? "$" + minerExposure.toFixed(0) : "None"}</div></div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ ...C.card, textAlign: "center", border:`1px solid ${eloRank.color}55` }}>
              <img src={eloRank.img} alt={eloRank.name} style={{width:80,height:80,objectFit:"contain",marginBottom:4,filter:`drop-shadow(0 0 10px ${eloRank.color}99)`}}/>
              <div style={{ fontSize: 15, fontWeight: 800, color: eloRank.color, letterSpacing:"0.05em" }}>{eloRank.name.toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: eloRank.color, margin:"2px 0", fontFamily: display }}>{currentElo.toLocaleString()} <span style={{fontSize:10,fontWeight:400,color:txt3,fontFamily:mono}}>ELO</span></div>
              <div style={{ fontSize: 9, color: txt3 }}>{eloRank.desc}</div>
              {(()=>{
                // Use ELO bands — not old PF/WR system
                const nextEloRank = ELO_BANDS.find(b => b.min > currentElo);
                if (!nextEloRank) return <div style={{fontSize:9,color:eloRank.color,marginTop:6}}>MAX RANK</div>;
                const prevMin = eloRank.min;
                const span = nextEloRank.min - prevMin;
                const p2 = Math.max(0, Math.min(100, ((currentElo - prevMin) / span) * 100));
                return <div style={{ marginTop:8 }}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,fontSize:9,color:txt3,marginBottom:4}}>
                    Next:
                    <img src={nextEloRank.img} alt={nextEloRank.name} style={{width:14,height:14,objectFit:"contain"}}/>
                    <span style={{color:nextEloRank.color,fontWeight:600}}>{nextEloRank.name}</span>
                  </div>
                  <div style={C.pb}><div style={{ height:"100%", borderRadius:2, background:eloRank.color, width:p2.toFixed(0)+"%", transition:"width 0.5s" }}/></div>
                  <div style={{ fontSize:9, color:txt3, marginTop:3 }}>{eloToNext?.toLocaleString()} pts needed</div>
                </div>;
              })()}
            </div>
            {/* Quick Actions moved to Market Sentiment sidebar above */}
            {skillLog.length > 0 && <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Skill log</div>
              {skillLog.slice(0, 5).map((s, i) => (
                <div key={s.name + i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < 4 ? `1px solid ${bdr}` : "none", fontSize: 10 }}>
                  <span style={{ color: txt2 }}>{s.name}</span>
                  <span style={{ color: txt3, fontSize: 9 }}>{s.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>}
          </div>
        </div>
      </div>}

      {/* ── POSITIONS ── */}
      {tab === "pos" && <div style={C.page}>
        <div style={C.g2}>
          <div>
            <div style={C.card}>
              <div style={C.sh}>
                <span style={C.stit}>Open positions &mdash; click row for chart</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: txt3 }}>{positions.length} open</span>
                  <button type="button" onClick={refreshPrices} style={{ fontSize: 9, padding: "2px 8px", background: bg3, border: `1px solid ${bdr}`, color: priceLoading ? amb : txt3, borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }}>{priceLoading ? "updating..." : lastUpdated ? `↻ ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "↻ prices"}</button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={C.tbl}>
                  <thead><tr>{["Ticker","Sh","Entry","Stop","T1","Live $","Unreal","Health","Risk","Pattern","Notes",""].map(h => <th key={h} style={C.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {positions.length ? positions.map(p => {
                      const px = prices[p.ticker]?.price;
                      const ch = prices[p.ticker]?.change;
                      const unr = getUnrealized(p);
                      const h = getHealth(p);
                      const isExp = expandedPos === p.id;
                      const up = unr == null ? true : unr >= 0;
                      return (
                        <React.Fragment key={p.id}>
                          <tr style={{ cursor: "pointer", background: isExp ? bg3 : (up ? "rgba(20,241,149,0.018)" : "rgba(255,45,85,0.018)") }}
                            onClick={() => setExpandedPos(isExp ? null : p.id)}
                            onMouseEnter={e => e.currentTarget.style.background = hover}
                            onMouseLeave={e => e.currentTarget.style.background = isExp ? bg3 : (up ? "rgba(20,241,149,0.018)" : "rgba(255,45,85,0.018)")}>
                            <td style={C.td}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{ width: 3, height: 16, background: up ? grn : red, boxShadow: `0 0 6px ${up ? grn : red}`, flexShrink: 0 }} />
                                <span style={{ fontWeight: 700, fontSize: 13, color: txt, fontFamily: display }}>{p.ticker}</span>
                                {MINER_TICKERS.has(p.ticker) && <span style={{ display: "inline-block", fontSize: 7, padding: "1px 3px", borderRadius: 2, marginLeft: 1, background: "rgba(255,184,0,0.15)", color: amb }}>₿</span>}
                              </div>
                            </td>
                            <td style={{ ...C.td, color: txt2 }}>{p.shares}</td>
                            <td style={C.td}>${p.entry.toFixed(2)}</td>
                            <td style={{ ...C.td, color: red }}>${p.stop.toFixed(2)}</td>
                            <td style={{ ...C.td, color: grn }}>${p.t1.toFixed(2)}</td>
                            <td style={{ ...C.td, color: px != null ? (ch >= 0 ? grn : red) : txt3 }}>
                              {px != null ? "$" + px.toFixed(2) : "—"}
                              {ch != null && <span style={{ fontSize: 8, marginLeft: 2, opacity: 0.7 }}>{ch >= 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(1)}%</span>}
                            </td>
                            <td style={{ ...C.td, color: unr != null ? (unr >= 0 ? grn : red) : txt3, fontWeight: unr != null ? 600 : 400 }}>
                              {unr != null ? (unr >= 0 ? "+" : "") + "$" + Math.abs(unr).toFixed(0) : "—"}
                            </td>
                            <td style={C.td}>
                              {h != null ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <div style={{ width: 46, height: 4, background: "#1a1a26", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ width: `${h * 10}%`, height: "100%", background: healthColor(h), boxShadow: `0 0 6px ${healthColor(h)}`, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: 9, color: healthColor(h), fontWeight: 700 }}>{h}</span>
                                </div>
                              ) : "—"}
                            </td>
                            <td style={{ ...C.td, color: red }}>-${((p.entry - p.stop) * p.shares).toFixed(0)}</td>
                            <td style={C.td}>
                              {p.pattern ? (
                                <span style={{ fontSize: 9.5, color: accent2, border: `1px solid rgba(0,229,255,0.3)`, padding: "1px 6px", borderRadius: 2, background: "rgba(0,229,255,0.06)" }}>{p.pattern}</span>
                              ) : <span style={{ color: txt3 }}>—</span>}
                            </td>
                            <td style={{ ...C.td, color: txt3, fontSize: 10, maxWidth: 120 }}>{p.notes || "—"}</td>
                            <td style={C.td}>
                              <span style={{ color: txt3, fontSize: 10, marginRight: 6 }}>{isExp ? "▲" : "▼"}</span>
                              <button type="button" onClick={e => { e.stopPropagation(); setPositions(prev => prev.filter(x => x.id !== p.id)); }} style={{ background: "none", border: "none", color: txt3, cursor: "pointer", fontSize: 13 }}>×</button>
                            </td>
                          </tr>
                          {isExp && (
                            <tr>
                              <td colSpan={12} style={{ padding: "0 6px 12px", borderBottom: `1px solid ${bdr}` }}>
                                {p.rationale && <div style={{ fontSize: 10, color: txt2, padding: "8px 0 4px", fontStyle: "italic" }}>💭 Rationale: "{p.rationale}"</div>}
                                <TradingViewChart ticker={p.ticker} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    }) : <tr><td colSpan={12} style={{ ...C.td, color: txt3, textAlign: "center", padding: 16 }}>No open positions</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <div style={C.fp}>
              <div style={{ fontSize: 9, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>+ New position</div>
              <div style={C.fgr}>
                <div><label style={C.fl}>Ticker</label><input style={{ ...C.fi, textTransform: "uppercase" }} value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="NVDA" /></div>
                <div><label style={C.fl}>Shares</label><input style={C.fi} type="number" value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} placeholder="10" /></div>
                <div><label style={C.fl}>Entry $</label><input style={C.fi} type="number" step="0.01" value={form.entry} onChange={e => setForm(f => ({ ...f, entry: e.target.value }))} placeholder="207.63" /></div>
                <div><label style={C.fl}>Stop $</label><input style={C.fi} type="number" step="0.01" value={form.stop} onChange={e => setForm(f => ({ ...f, stop: e.target.value }))} placeholder="198.00" /></div>
                <div><label style={C.fl}>Target 1</label><input style={C.fi} type="number" step="0.01" value={form.t1} onChange={e => setForm(f => ({ ...f, t1: e.target.value }))} placeholder="216.00" /></div>
                <div><label style={C.fl}>Target 2</label><input style={C.fi} type="number" step="0.01" value={form.t2} onChange={e => setForm(f => ({ ...f, t2: e.target.value }))} placeholder="260.00" /></div>
              </div>
              {/* PATTERN — mandatory */}
              <div style={{ marginBottom: 5 }}>
                <label style={{ ...C.fl, color: !form.pattern ? red : txt3 }}>Pattern ★ required</label>
                <select
                  style={{ ...C.fi, marginBottom: 5, color: form.pattern ? txt : txt3, borderColor: !form.pattern ? "rgba(248,81,73,0.5)" : bdr2 }}
                  value={form.pattern}
                  onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}>
                  <option value="">&mdash; select pattern &mdash;</option>
                  {TRADE_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {/* RATIONALE — optional, feeds journal */}
              <div style={{ marginBottom: 5 }}>
                <label style={C.fl}>Why I'm taking this trade <span style={{ color: txt3 }}>(optional &mdash; goes to journal)</span></label>
                <textarea
                  style={{ ...C.fi, resize: "vertical", minHeight: 52, lineHeight: 1.5 }}
                  value={form.rationale}
                  onChange={e => setForm(f => ({ ...f, rationale: e.target.value }))}
                  placeholder="e.g. Price bounced from 150 SMA twice this week, volume spike on the bounce, sector ETF (XLK) still above its SMA — confluence of 3 factors..."
                />
              </div>
              <div style={{ marginBottom: 5 }}><label style={C.fl}>Notes</label><input style={C.fi} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="150 SMA bounce..." /></div>
              <Btn label={!form.pattern ? "Select a pattern to add ↗" : "Add position ↗"} variant="green" onClick={addPosition} />
            </div>
            <div style={{ ...C.fp, borderColor: "rgba(248,81,73,0.3)" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: red, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Close position</div>
              <div style={C.fgr3}>
                <div><label style={C.fl}>Ticker</label><input style={{ ...C.fi, textTransform: "uppercase" }} value={cf.ticker} onChange={e => setCf(f => ({ ...f, ticker: e.target.value }))} placeholder="NVDA" /></div>
                <div><label style={C.fl}>Exit $</label><input style={C.fi} type="number" step="0.01" value={cf.exit} onChange={e => setCf(f => ({ ...f, exit: e.target.value }))} placeholder="227.42" /></div>
                <div><label style={C.fl}>Shares (blank=all)</label><input style={C.fi} type="number" value={cf.shares} onChange={e => setCf(f => ({ ...f, shares: e.target.value }))} placeholder="all" /></div>
              </div>
              {/* ⚡ ELO — AUTO-DETECTION + execution bonus */}
              {(()=>{
                const pos = cf.ticker ? positions.find(p=>p.ticker===cf.ticker.toUpperCase()) : null;
                const exitPrice = parseFloat(cf.exit)||0;
                const shares = parseFloat(cf.shares)||(pos?.shares||0);

                // ── AUTO-DETECTION — fires from data, not from the user ──────────
                const rules = [];
                if (pos) {
                  // Rule 1: No stop defined
                  if (!pos.stop || pos.stop <= 0)
                    rules.push({id:'noStop', label:'No stop defined', desc:'Every trade must have a predefined stop'});

                  // Rule 2: Emotional pattern on the position
                  const emoPats = new Set(['Emotional Buy','FOMO Entry','Averaging Down','No Clear Reason','No Pattern','']);
                  if (emoPats.has(pos.pattern||''))
                    rules.push({id:'pattern', label:'Pattern: "'+( pos.pattern||'none')+'"', desc:'Entry not from an approved setup'});

                  // Rule 3: Exit below stop — held past stop (stop not respected)
                  if (exitPrice > 0 && pos.stop > 0 && exitPrice < pos.stop && exitPrice < pos.entry)
                    rules.push({id:'pastStop', label:'Exit $'+exitPrice.toFixed(2)+' is below stop $'+pos.stop.toFixed(2), desc:'You held past your stop — stop was not respected'});

                  // Rule 4: Position oversized — >15% account for regular, >9% for BTC miners
                  const MINERS = new Set(['IREN','CIFR','MARA','CLSK','RIOT','BTBT','HUT','MSTR']);
                  const maxPct = MINERS.has((cf.ticker||'').toUpperCase()) ? 0.09 : 0.15;
                  const posSize = (pos.shares * pos.entry) / ACCOUNT;
                  if (posSize > maxPct)
                    rules.push({id:'oversize', label:'Position size '+(posSize*100).toFixed(1)+'% > rule '+(maxPct*100)+'%', desc:'Position exceeded your sizing rules'});
                }

                const autoEmotional = rules.length > 0;

                // Preview ELO change
                let eloPreview = null;
                if (pos && exitPrice > 0) {
                  const fakeTrade = {entry:pos.entry, stop:pos.stop||0, exit:exitPrice,
                    pnl:(exitPrice-pos.entry)*shares, pattern:pos.pattern||'',
                    emotional:autoEmotional, execution:cfExec};
                  const chg = calculateTradeScore(fakeTrade);
                  eloPreview = chg;
                }

                return <div style={{background:bg3,borderRadius:6,padding:"8px 10px",marginBottom:8}}>
                  {/* Emotional verdict — auto, not manual */}
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:8,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5}}>
                      🤖 Emotional Trade &mdash; Auto Detected
                    </div>
                    {autoEmotional ? (
                      <div style={{background:"rgba(248,81,73,0.08)",border:"1px solid rgba(248,81,73,0.3)",borderRadius:5,padding:"8px 10px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:red,marginBottom:6}}>🔴 EMOTIONAL &mdash; &minus;150 ELO PENALTY</div>
                        {rules.map(r=>(
                          <div key={r.id} style={{fontSize:9,color:red,marginBottom:3}}>
                            ✗ <strong>{r.label}</strong><br/>
                            <span style={{color:"#ff8a8a",paddingLeft:12}}>{r.desc}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{background:"rgba(63,185,80,0.06)",border:"1px solid rgba(63,185,80,0.2)",borderRadius:5,padding:"6px 10px"}}>
                        <div style={{fontSize:10,color:grn}}>✅ Technical trade &mdash; no emotional flags detected</div>
                      </div>
                    )}
                  </div>

                  {/* Execution bonus — these you CAN control */}
                  <div>
                    <div style={{fontSize:8,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5}}>⚡ Execution Bonus (honest self-check)</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {[
                        ['followedPlan', '📋 Followed plan', '+10'],
                        ['perfectEntry', '🎯 Perfect entry', '+10'],
                        ['cleanExit',    '✅ Clean exit',    '+5'],
                      ].map(([key, label, pts])=>(
                        <label key={key} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:10,color:cfExec[key]?grn:txt3,userSelect:"none"}}>
                          <input type="checkbox" checked={cfExec[key]}
                            onChange={e=>setCfExec(p=>({...p,[key]:e.target.checked}))}
                            style={{accentColor:grn, width:13, height:13}}/>
                          {label} <span style={{color:grn,fontSize:9}}>{pts}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Live ELO preview */}
                  {eloPreview && <div style={{marginTop:8,padding:"5px 8px",background:bg2,borderRadius:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:9,color:txt3}}>ELO change</span>
                    <div style={{display:"flex",gap:8,fontSize:10,alignItems:"center"}}>
                      <span style={{color:txt3}}>R = {eloPreview.r}</span>
                      {autoEmotional && <span style={{color:red}}>−150 emo</span>}
                      {eloPreview.execBonus > 0 && <span style={{color:"#58a6ff"}}>+{eloPreview.execBonus} exec</span>}
                      <span style={{fontWeight:700,fontSize:12,color:eloPreview.total>0?grn:eloPreview.total<0?red:txt3}}>
                        {eloPreview.total>0?'+':''}{eloPreview.total} pts
                      </span>
                    </div>
                  </div>}
                </div>;
              })()}
              <Btn label="Close position" variant="red" onClick={closePosition} />
            </div>
          </div>
        </div>
      </div>}

      {/* ── STATS ── */}
      {tab === "stats" && <div style={C.page}>
        <div style={C.g2}>
          <div>
            {/* ── CALIBRATION + ELO RANK CARD ── */}
            <div style={{...C.rcard(eloRank.color), display:"flex", flexDirection:"column", alignItems:"center", padding:"28px 24px"}}>
              <img src={eloRank.img} alt={eloRank.name}
                   style={{width:140,height:140,objectFit:"contain",marginBottom:14,
                           filter:`drop-shadow(0 0 28px ${eloRank.color}cc) drop-shadow(0 0 10px ${eloRank.color}66)`}}/>
              <div style={{fontSize:52,fontWeight:900,color:eloRank.color,fontVariantNumeric:"tabular-nums",lineHeight:1,marginBottom:4,fontFamily:display}}>
                {currentElo.toLocaleString()}
                <span style={{fontSize:16,fontWeight:400,color:txt3,marginLeft:6,fontFamily:mono}}>ELO</span>
              </div>
              <div style={{fontSize:22,fontWeight:800,color:eloRank.color,letterSpacing:"0.15em",marginBottom:4}}>{eloRank.name.toUpperCase()}</div>
              <div style={{fontSize:12,color:txt2,marginBottom:8}}>{eloRank.desc}</div>

              {/* Calibration phase indicator */}
              {!calibration ? (
                <div style={{marginTop:12,width:"100%",background:"rgba(248,81,73,0.08)",border:"1px solid rgba(248,81,73,0.2)",borderRadius:6,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:10,color:red,fontWeight:700,marginBottom:6}}>⚠️ Not calibrated</div>
                  <div style={{fontSize:9,color:txt3,marginBottom:8}}>Run calibration to set your starting ELO based on {closed.length} trades</div>
                  <button type="button" onClick={runCalibration} style={{...C.btn("green"),marginBottom:0,fontSize:11,fontWeight:700}}>▶ Run Calibration</button>
                </div>
              ) : (
                <div style={{marginTop:10,width:"100%"}}>
                  {/* Calibration scores breakdown */}
                  <div style={{background:bg3,borderRadius:8,padding:"14px 16px",marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <span style={{fontSize:11,fontWeight:700,color:txt2,textTransform:"uppercase",letterSpacing:"0.1em"}}>Calibration Score</span>
                      <span style={{fontSize:22,fontWeight:800,color:eloRank.color}}>{calibration.finalScore}<span style={{fontSize:13,color:txt3}}>/100</span></span>
                    </div>
                    {[
                      {label:"Performance",  val:calibration.performance,  w:40, col:calibration.performance>=70?grn:calibration.performance>=50?amb:red},
                      {label:"Discipline",   val:calibration.discipline,   w:25, col:calibration.discipline>=80?grn:calibration.discipline>=60?amb:red},
                      {label:"Consistency",  val:calibration.consistency,  w:20, col:calibration.consistency>=70?grn:calibration.consistency>=50?amb:red},
                      {label:"Drawdown",     val:calibration.drawdown,     w:15, col:calibration.drawdown>=70?grn:calibration.drawdown>=50?amb:red},
                    ].map(s=>(
                      <div key={s.label} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:11,color:txt2,fontWeight:500}}>{s.label} <span style={{color:txt3,fontSize:9}}>×{s.w}%</span></span>
                          <span style={{fontSize:13,fontWeight:700,color:s.col}}>{s.val}</span>
                        </div>
                        <div style={{height:6,background:bdr,borderRadius:3}}>
                          <div style={{height:"100%",width:s.val+"%",background:s.col,borderRadius:3,transition:"width 0.5s"}}/>
                        </div>
                      </div>
                    ))}
                    <div style={{marginTop:10,display:"flex",justifyContent:"space-between",fontSize:11,color:txt3}}>
                      <span>Started at: <strong style={{color:txt}}>{calibration.startingElo.toLocaleString()} ELO</strong></span>
                      <span style={{color:getConfidence(calibration.tradesAnalyzed)==='Medium'?amb:getConfidence(calibration.tradesAnalyzed)==='High'?grn:txt3}}>
                        {calibration.confidence} confidence · {calibration.tradesAnalyzed} trades
                      </span>
                    </div>
                  </div>

                  {/* Live delta from new trades */}
                  {newTrades.length > 0 && <div style={{background:bg3,borderRadius:6,padding:"6px 10px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:9,color:txt3}}>Live ELO from {newTrades.length} new trade{newTrades.length!==1?"s":""}</span>
                    <span style={{fontSize:11,fontWeight:700,color:liveEloChanges>=0?grn:red}}>{liveEloChanges>=0?"+":""}{liveEloChanges}</span>
                  </div>}

                  {/* Progress to next rank */}
                  {eloToNext !== null && (()=>{
                    const nextB = ELO_BANDS.find(b=>b.min>currentElo);
                    const prevMin = eloRank.min;
                    const span = nextB.min - prevMin;
                    const p2 = Math.max(0,Math.min(100,((currentElo-prevMin)/span)*100));
                    return <div style={{marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,color:txt2,marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <img src={nextB.img} alt={nextB.name} style={{width:22,height:22,objectFit:"contain"}}/>
                          <span>Next: <strong style={{color:nextB.color}}>{nextB.name}</strong></span>
                        </div>
                        <span style={{color:txt3,fontSize:11}}>{eloToNext?.toLocaleString()} pts needed</span>
                      </div>
                      <div style={{height:8,background:bdr,borderRadius:4}}>
                        <div style={{height:"100%",borderRadius:4,background:eloRank.color,width:p2.toFixed(0)+"%",transition:"width 0.5s"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:txt3,marginTop:4}}>
                        <span>{currentElo.toLocaleString()}</span>
                        <span>{p2.toFixed(0)}%</span>
                        <span>{nextB.min.toLocaleString()}</span>
                      </div>
                    </div>;
                  })()}

                  {/* Promotion filter */}
                  <div style={{background:eloPromotion.eligible?"rgba(63,185,80,0.07)":"rgba(210,153,34,0.07)",border:`1px solid ${eloPromotion.eligible?"rgba(63,185,80,0.25)":"rgba(210,153,34,0.25)"}`,borderRadius:8,padding:"10px 14px",marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:700,color:eloPromotion.eligible?grn:amb}}>
                      {eloPromotion.eligible ? "✅ Eligible for promotion" : "⚠️ " + eloPromotion.reason}
                    </div>
                    {!eloPromotion.atMax && eloPromotion.technicalPct > 0 && <div style={{fontSize:11,color:txt3,marginTop:4}}>
                      Technical {eloPromotion.technicalPct?.toFixed(0)}% (need 70%) · Avg R {eloPromotion.avgR?.toFixed(2)} (need ≥0)
                    </div>}
                  </div>

                  <div style={{fontSize:10,color:txt3,textAlign:"center"}}>Calibrated {calibration.calibrationDate} · {calibration.tradesAnalyzed} trades analyzed</div>
                </div>
              )}
            </div>
            <div style={C.card}><div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Equity curve</div><div style={{ position: "relative", width: "100%", height: 160 }}><canvas ref={eqRef} /></div></div>
            <div style={C.card}><div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Win rate by pattern (live)</div><div style={{ position: "relative", width: "100%", height: 120 }}><canvas ref={ptRef} /></div></div>
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>By ticker</div>
              <table style={C.tbl}>
                <thead><tr>{["Ticker","Trades","WR","Net P&L"].map(h => <th key={h} style={C.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(tickerStats).sort((a, b) => b[1].pnl - a[1].pnl).map(([ticker, s]) => (
                    <tr key={ticker}>
                      <td style={{ ...C.td, fontWeight: 700, color: txt }}>{ticker}</td>
                      <td style={{ ...C.td, color: txt2 }}>{s.total}</td>
                      <td style={{ ...C.td, color: s.wins / s.total >= 0.5 ? grn : red }}>{(s.wins / s.total * 100).toFixed(0)}%</td>
                      <td style={{ ...C.td, color: s.pnl >= 0 ? grn : red, fontWeight: 600 }}>{s.pnl >= 0 ? "+" : ""}${s.pnl.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Key metrics</div>
              <div style={C.g2e}>
                {[
                  ["Net P&L", (stats.net >= 0 ? "+" : "") + "$" + Math.abs(stats.net).toFixed(2), pnlCol],
                  ["Return", (stats.net / ACCOUNT * 100).toFixed(2) + "%", pnlCol],
                  ["Win rate", stats.wr.toFixed(1) + "%", amb],
                  ["Profit factor", stats.pf.toFixed(2), pnlCol],
                  ["Avg win", "+$" + stats.aw.toFixed(0), grn],
                  ["Avg loss", "-$" + stats.al.toFixed(0), red],
                  ["Best trade", bestTrade ? (bestTrade.pnl > 0 ? "+" : "") + "$" + bestTrade.pnl.toFixed(0) + " " + bestTrade.ticker : "—", grn],
                  ["Worst trade", worstTrade ? "$" + worstTrade.pnl.toFixed(0) + " " + worstTrade.ticker : "—", red],
                  ["Streak", streak.cur + "× " + streak.type, streak.type === "W" ? grn : red],
                  ["Best streak", streak.best + "×", txt2],
                ].map(([label, val, col]) => (
                  <div key={label} style={C.csm}><div style={C.sl}>{label}</div><div style={{ fontSize: 13, fontWeight: 700, color: col }}>{val}</div></div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: txt3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, marginTop: 8 }}>Profit factor goal &mdash; target 2.0</div>
              <div style={C.pb}><div style={{ height: "100%", borderRadius: 2, background: stats.pf >= 1.5 ? grn : stats.pf >= 1.0 ? amb : red, width: Math.min(stats.pf / 3 * 100, 100).toFixed(0) + "%", transition: "width 0.5s" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: txt3, marginTop: 2 }}><span>0</span><span>1.5</span><span>2.0</span><span>3.0</span></div>
            </div>
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Rank Ladder &mdash; ELO</div>
              {ELO_BANDS.map((band, i) => {
                const eloIdx  = ELO_BANDS.findIndex(b => b.name === eloRank.name);
                const iC = i === eloIdx;           // current rank
                const iD = i < eloIdx;             // already achieved
                const borderCol = iC ? band.color : iD ? `${band.color}44` : bdr;
                return <div key={band.name} style={{
                  display:"flex", alignItems:"center", gap:8, padding:"6px 8px",
                  borderRadius:6, marginBottom:3,
                  border: iC ? `1.5px solid ${band.color}` : `1px solid ${borderCol}`,
                  background: iC ? `${band.color}0d` : 'transparent',
                  transition:"all 0.2s",
                }}>
                  <img src={band.img} alt={band.name}
                       style={{
                         width:32, height:32, objectFit:"contain", flexShrink:0,
                         opacity: iD || iC ? 1 : 0.3,
                         filter: iC
                           ? `drop-shadow(0 0 7px ${band.color}) drop-shadow(0 0 3px ${band.color})`
                           : iD ? `drop-shadow(0 0 2px ${band.color}66)` : 'grayscale(1) brightness(0.4)',
                       }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:600, color: iC ? band.color : iD ? txt2 : txt3 }}>
                      {band.name}
                    </div>
                    <div style={{ fontSize:8, color:txt3, marginTop:1 }}>
                      {band.min.toLocaleString()} – {band.max === Infinity ? '∞' : band.max.toLocaleString()} ELO
                    </div>
                  </div>
                  <div style={{textAlign:"right", flexShrink:0}}>
                    {iD && <span style={{fontSize:12, color:grn}}>✓</span>}
                    {iC && <span style={{fontSize:10, fontWeight:700, color:band.color}}>◉ {currentElo.toLocaleString()}</span>}
                    {!iD && !iC && band.min !== Infinity &&
                      <span style={{fontSize:9, color:txt3}}>{(band.min - currentElo).toLocaleString()}</span>}
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>}

      {/* ── HISTORY ── */}
      {tab === "hist" && <div style={C.page}>

        {/* ── Edit Trade Modal ── */}
        {editingTrade !== null && (()=>{
          const save = () => {
            const d = editTradeData;
            const entry = parseFloat(d.entry)||0;
            const exit  = parseFloat(d.exit)||0;
            const shares= parseFloat(d.shares)||0;
            const pnl   = parseFloat(d.pnl) || parseFloat(((exit-entry)*shares).toFixed(2));
            const updated = { ...closed[editingTrade], ...d, entry, exit, shares, pnl };
            const next = closed.map((t,i) => i===editingTrade ? updated : t);
            setClosed(next);
            try{localStorage.setItem("dima_c5",JSON.stringify(next));}catch{}
            setEditingTrade(null);
          };
          const fi = {...C.fi, marginBottom:6, fontSize:11};
          return <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.82)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setEditingTrade(null)}>
            <div style={{background:bg2,border:`1px solid ${bdr2}`,borderRadius:10,padding:24,width:460,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:14,fontWeight:700,color:txt,marginBottom:16}}>✏️ Edit Trade &mdash; {editTradeData.ticker}</div>
              <div style={C.fgr}>
                <div><span style={C.fl}>Ticker</span><input value={editTradeData.ticker||""} onChange={e=>setEditTradeData(p=>({...p,ticker:e.target.value.toUpperCase()}))} style={fi}/></div>
                <div><span style={C.fl}>Date</span><input type="date" value={editTradeData.date||""} onChange={e=>setEditTradeData(p=>({...p,date:e.target.value}))} style={fi}/></div>
              </div>
              <div style={C.fgr3}>
                <div><span style={C.fl}>Shares</span><input type="number" value={editTradeData.shares||""} onChange={e=>setEditTradeData(p=>({...p,shares:e.target.value}))} style={fi}/></div>
                <div><span style={C.fl}>Entry $</span><input type="number" value={editTradeData.entry||""} onChange={e=>setEditTradeData(p=>({...p,entry:e.target.value}))} style={fi}/></div>
                <div><span style={C.fl}>Exit $</span><input type="number" value={editTradeData.exit||""} onChange={e=>setEditTradeData(p=>({...p,exit:e.target.value}))} style={fi}/></div>
              </div>
              <div><span style={C.fl}>P&L $ (auto-calculated &mdash; override if needed)</span>
                <input type="number" value={editTradeData.pnl||""} onChange={e=>setEditTradeData(p=>({...p,pnl:e.target.value}))} style={fi} placeholder="Leave blank to auto-calc"/>
              </div>
              <div><span style={C.fl}>Pattern</span>
                <select value={editTradeData.pattern||""} onChange={e=>setEditTradeData(p=>({...p,pattern:e.target.value}))} style={{...C.fi,marginBottom:6}}>
                  <option value="">&mdash; select &mdash;</option>
                  {TRADE_PATTERNS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div><span style={C.fl}>Rationale (why I took it)</span><input value={editTradeData.rationale||""} onChange={e=>setEditTradeData(p=>({...p,rationale:e.target.value}))} style={fi}/></div>
              <div><span style={C.fl}>Notes</span><input value={editTradeData.notes||""} onChange={e=>setEditTradeData(p=>({...p,notes:e.target.value}))} style={fi}/></div>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button type="button" onClick={()=>setEditingTrade(null)} style={{...C.btn(""),flex:1,marginBottom:0}}>Cancel</button>
                <button type="button" onClick={()=>{if(confirm("Delete this trade?")){{const next=closed.filter((_,i)=>i!==editingTrade);setClosed(next);try{localStorage.setItem("dima_c5",JSON.stringify(next));}catch{}setEditingTrade(null);}}}} style={{...C.btn("red"),flex:1,marginBottom:0}}>🗑 Delete</button>
                <button type="button" onClick={save} style={{...C.btn("green"),flex:2,marginBottom:0}}>Save</button>
              </div>
            </div>
          </div>;
        })()}

        <div style={C.card}>
          <div style={C.sh}>
            <span style={C.stit}>Trade history &mdash; swing only</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <select value={histTicker} onChange={e => setHistTicker(e.target.value)} style={C.sel}>
                {histTickers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={histResult} onChange={e => setHistResult(e.target.value)} style={C.sel}>
                {["ALL","WIN","LOSS"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <span style={{ fontSize: 10, color: txt3 }}>{filteredHist.length} trades</span>
              <button type="button" onClick={() => { if (confirm("Reset to all 24 default trades?")) { setClosed(TRADES.map(t => ({ ...t }))); if (eqChart.current) { eqChart.current.destroy(); eqChart.current = null; } } }} style={{ fontSize: 9, padding: "2px 6px", background: bg3, border: `1px solid ${bdr}`, color: txt3, borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }}>↺ Reset</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={C.tbl}>
              <thead><tr>{["Date","Ticker","Pattern","Entry","Exit","P&L","R","ELO Δ","",""].map(h => <th key={h} style={C.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredHist.map((t, i) => {
                  const realIdx  = closed.indexOf(t);
                  const eloEntry = eloTimeline[realIdx];
                  const eloChg   = eloEntry?._elo ?? calculateEloChange(t);
                  const col      = t.pnl >= 0 ? grn : red;
                  const isEmo    = detectEmotional(t) || t.emotional;
                  const eloCol   = eloChg.total > 0 ? grn : eloChg.total < 0 ? red : txt3;
                  return <tr key={t.ticker + (t.date||'') + realIdx} style={{ background: isEmo ? "rgba(248,81,73,0.04)" : "transparent" }}>
                    <td style={{ ...C.td, color: txt3 }}>{t.date}</td>
                    <td style={C.td}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: txt }}>{t.ticker}</span>
                      {isEmo && <span style={{fontSize:8,marginLeft:3,color:red}} title="Emotional trade — ELO penalty applied">🔴</span>}
                    </td>
                    <td style={{ ...C.td, color: isEmo ? red : txt2, fontSize: 10 }}>
                      {t.pattern || "—"}
                    </td>
                    <td style={C.td}>${t.entry.toFixed(2)}</td>
                    <td style={C.td}>${t.exit.toFixed(2)}</td>
                    <td style={{ ...C.td, color: col, fontWeight: 600 }}>
                      {(t.pnl >= 0 ? "+" : "") + "$" + Math.abs(t.pnl).toFixed(2)}
                    </td>
                    {/* R multiple */}
                    <td style={{ ...C.td, color: eloChg.r >= 0 ? grn : red, fontWeight: 600, fontVariantNumeric:"tabular-nums" }}>
                      {eloChg.r >= 0 ? "+" : ""}{eloChg.r}R
                    </td>
                    {/* ELO change */}
                    <td style={{ ...C.td, minWidth: 60 }}>
                      <div style={{fontSize:11,fontWeight:700,color:eloCol}}>
                        {eloChg.total > 0 ? "+" : ""}{eloChg.total}
                      </div>
                      {isEmo && <div style={{fontSize:8,color:red}}>−150 emo</div>}
                      {eloChg.execScore > 0 && <div style={{fontSize:8,color:"#58a6ff"}}>+{eloChg.execScore} exec</div>}
                    </td>
                    <td style={C.td}>{t.pnl >= 0 ? "✅" : "❌"}</td>
                    <td style={C.td}>
                      <button type="button" onClick={()=>{setEditTradeData({...t});setEditingTrade(realIdx);}}
                        style={{background:"none",border:`1px solid ${bdr2}`,color:txt3,borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:10,fontFamily:"inherit"}}>✏️</button>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>}

      {/* ── CLAUDE AI CHAT ── */}
      {tab === "chat" && <div style={{...C.page, display:"flex", flexDirection:"column", height:"calc(100vh - 52px)"}}>
        {/* Quick actions */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,flexShrink:0}}>
          {[
            ["📈 Chart analysis","Analyze my current open positions against my 150 SMA system. Which ones are following the rules perfectly and which concern you?"],
            ["🔥 What's Hot","What's hot in the market today? Give me the top 3 stocks showing momentum across Reddit, news, and price action. Filter out garbage."],
            ["⏰ Market Hours","What time is it in Israel and New York right now? Is the US market open?"],
            ["🧠 Psychology Check","I want to add to a position. Ask me the emotional check questions before I do anything."],
            ["📓 Journal","Generate my monthly trading journal prompt for "+journalMonth],
          ].map(([label,prompt])=>(
            <button key={label} type="button" onClick={()=>{setChatInput(prompt);}} style={{padding:"5px 10px",background:elevated,border:`1px solid ${bdr}`,color:txt2,borderRadius:3,cursor:"pointer",fontFamily:mono,fontSize:10,transition:"all 0.15s"}}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.color = txt2; }}
            >{label}</button>
          ))}
          {chatMessages.length>0&&<button type="button" onClick={()=>setChatMessages([])} style={{padding:"5px 10px",background:"none",border:`1px solid rgba(248,81,73,0.3)`,color:red,borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontSize:10,marginLeft:"auto"}}>✕ Clear</button>}
        </div>

        {/* No API key warning */}
        {!apiKey&&<div style={{...C.card,borderColor:"rgba(255,45,85,0.35)",marginBottom:10,flexShrink:0}}>
          <span style={{fontSize:11,color:red}}>⚠️ No API key &mdash; go to Dashboard tab to set it</span>
          <button type="button" onClick={()=>setTab("dash")} style={{marginLeft:12,padding:"3px 10px",background:"none",border:`1px solid ${bdr2}`,color:txt2,borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"inherit"}}>→ Dashboard</button>
        </div>}

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",marginBottom:10,display:"flex",flexDirection:"column",gap:8,minHeight:0}}>
          {chatMessages.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:txt3}}>
            <div style={{fontSize:32,marginBottom:12}}>💬</div>
            <div style={{fontSize:13,color:txt2,marginBottom:6}}>Your trading assistant is ready</div>
            <div style={{fontSize:11}}>Ask about chart analysis, position sizing, market conditions, or use the quick actions above</div>
          </div>}
          {chatMessages.map((m,i)=>(
            <div key={m.ts||i} style={{display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start"}}>
              <div style={{
                maxWidth:"85%",padding:"10px 14px",borderRadius:m.role==="user"?"4px 4px 0 4px":"4px 4px 4px 0",
                background:m.role==="user"?`rgba(255,107,0,0.10)`:bg2,
                border:`1px solid ${m.role==="user"?"rgba(255,107,0,0.35)":bdr}`,
                fontSize:12,color:txt,lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word",
                fontFamily:mono,
                boxShadow:m.role==="user"?"0 0 12px rgba(255,107,0,0.12)":"none"
              }}>{m.content}</div>
              <span style={{fontSize:9,color:txt3,marginTop:2,marginLeft:m.role==="user"?0:4}}>{m.role==="user"?"You":"Claude"}</span>
            </div>
          ))}
          {chatLoading&&<div style={{display:"flex",alignItems:"center",gap:8,color:txt3,fontSize:11}}>
            <span style={{animation:"blink 1s ease-in-out infinite"}}>●</span> Claude is thinking&hellip;
          </div>}
          <div ref={chatEndRef}/>
        </div>

        {/* Input */}
        {/* Cost estimator */}
        {chatInput.trim() && !chatLoading && (()=>{
          const histTokens = chatMessages.reduce((s,m) => s + Math.ceil((m.content?.length||0)/4), 0);
          const inputTokens = Math.ceil(chatInput.length/4) + histTokens + 800; // +800 for system prompt
          const estCost = ((inputTokens/1000000)*3 + (600/1000000)*15).toFixed(4);
          return <div style={{fontSize:9,color:txt3,marginBottom:4,textAlign:"right"}}>
            ~${estCost} · ~{inputTokens.toLocaleString()} tokens input
          </div>;
        })()}
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          <textarea
            value={chatInput} onChange={e=>setChatInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChatMessage();}}}
            placeholder="Ask about your trades, chart setups, position sizing... (Enter to send, Shift+Enter for newline)"
            style={{...C.fi,marginBottom:0,flex:1,resize:"none",height:60,lineHeight:1.5}}
          />
          <button type="button" onClick={sendChatMessage} disabled={chatLoading||!chatInput.trim()}
            style={{...C.btn("green"),width:70,marginBottom:0,flexShrink:0,opacity:chatLoading||!chatInput.trim()?0.5:1}}>
            {chatLoading?"…":"Send"}
          </button>
        </div>
      </div>}

      {tab === "analytics" && <div style={C.page}>

        {/* ── SECTION 1: YOUR TRADE PATTERN ANALYSIS — from actual closed trades ── */}
        {(()=>{
          // Pattern performance matrix from your real closed trades
          const patMap = {};
          closed.forEach(t => {
            const p = t.pattern || "Untagged";
            if (!patMap[p]) patMap[p] = { wins:0, losses:0, pnl:0, totalR:0 };
            if (t.pnl > 0) patMap[p].wins++; else patMap[p].losses++;
            patMap[p].pnl += t.pnl;
            patMap[p].totalR += getTradeR(t);
          });
          const sorted = Object.entries(patMap)
            .map(([p,s]) => ({ pattern:p, ...s, total:s.wins+s.losses, wr:s.wins/(s.wins+s.losses) }))
            .sort((a,b) => b.pnl - a.pnl);

          // Monthly P&L breakdown
          const monthMap = {};
          closed.forEach(t => {
            const m = (t.date||'').slice(0,7);
            if (!m) return;
            if (!monthMap[m]) monthMap[m] = { pnl:0, trades:0, wins:0 };
            monthMap[m].pnl += t.pnl;
            monthMap[m].trades++;
            if (t.pnl > 0) monthMap[m].wins++;
          });
          const months = Object.entries(monthMap).sort(([a],[b]) => a < b ? 1 : -1);

          // Discipline: technical vs emotional trades
          const emoPats = new Set(['Emotional Buy','FOMO Entry','Averaging Down','No Clear Reason','No Pattern','']);
          const emoCount = closed.filter(t => emoPats.has(t.pattern||'')).length;
          const techPct = closed.length ? ((closed.length-emoCount)/closed.length*100).toFixed(0) : 0;

          return <>
            {/* Pattern Matrix */}
            <div style={{...C.card, marginBottom:10}}>
              <div style={{...C.sh, marginBottom:10}}>
                <span style={C.stit}>Pattern Performance Matrix</span>
                <span style={{fontSize:9,color:txt3}}>{closed.length} trades · live from history</span>
              </div>
              <table style={C.tbl}>
                <thead><tr>
                  {["Pattern","Trades","WR","Avg R","Net P&L"].map(h=><th key={h} style={C.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sorted.map(s => {
                    const wrCol = s.wr>=0.6?grn:s.wr>=0.5?amb:red;
                    const avgR = s.total > 0 ? (s.totalR/s.total).toFixed(2) : '—';
                    const rCol = parseFloat(avgR)>=0?grn:red;
                    const isEmo = emoPats.has(s.pattern);
                    return <tr key={s.pattern} style={{background:isEmo?"rgba(248,81,73,0.04)":"transparent"}}>
                      <td style={{...C.td,color:isEmo?red:txt,fontWeight:600}}>
                        {s.pattern} {isEmo&&'⚠️'}
                      </td>
                      <td style={{...C.td,color:txt2}}>{s.total}</td>
                      <td style={{...C.td,color:wrCol,fontWeight:600}}>{(s.wr*100).toFixed(0)}%</td>
                      <td style={{...C.td,color:rCol,fontWeight:600}}>{avgR}R</td>
                      <td style={{...C.td,color:s.pnl>=0?grn:red,fontWeight:600}}>{s.pnl>=0?'+':''}${s.pnl.toFixed(0)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>

            {/* Monthly P&L + Discipline row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              {/* Monthly */}
              <div style={C.card}>
                <div style={{...C.stit, marginBottom:8}}>Monthly P&L</div>
                {months.map(([m,s])=>{
                  const wr = s.trades>0?(s.wins/s.trades*100).toFixed(0):'0';
                  return <div key={m} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${bdr}`}}>
                    <div>
                      <span style={{fontSize:11,color:txt,fontWeight:600}}>{m}</span>
                      <span style={{fontSize:9,color:txt3,marginLeft:8}}>{s.trades} trades · {wr}% WR</span>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:s.pnl>=0?grn:red}}>
                      {s.pnl>=0?'+':''}${s.pnl.toFixed(0)}
                    </span>
                  </div>;
                })}
              </div>

              {/* Discipline scorecard */}
              <div style={C.card}>
                <div style={{...C.stit, marginBottom:10}}>Discipline Scorecard</div>
                {[
                  {label:"Technical trades", val:`${closed.length-emoCount} / ${closed.length}`, sub:`${techPct}%`, col:parseInt(techPct)>=80?grn:parseInt(techPct)>=60?amb:red},
                  {label:"Emotional trades", val:emoCount, sub:"−150 ELO each", col:emoCount===0?grn:red},
                  {label:"Avg R multiple", val:(closed.reduce((s,t)=>s+getTradeR(t),0)/Math.max(1,closed.length)).toFixed(2)+"R", sub:"target >1.0R", col:(closed.reduce((s,t)=>s+getTradeR(t),0)/Math.max(1,closed.length))>=1?grn:amb},
                  {label:"Best pattern", val:sorted[0]?.pattern||"—", sub:`${sorted[0]?.total||0} trades, ${(sorted[0]?.wr*100||0).toFixed(0)}% WR`, col:grn},
                  {label:"Worst pattern", val:sorted[sorted.length-1]?.pattern||"—", sub:`${sorted[sorted.length-1]?.total||0} trades`, col:red},
                ].map(r=>(
                  <div key={r.label} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:9,color:txt3}}>{r.label}</span>
                      <span style={{fontSize:11,fontWeight:700,color:r.col}}>{r.val}</span>
                    </div>
                    <div style={{fontSize:8,color:txt3}}>{r.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </>;
        })()}

        {/* ── SECTION 2: AGENT SIGNAL ANALYTICS — from backend ── */}
        <div style={C.card}>
          <div style={C.sh}>
            <div>
              <span style={C.stit}>Agent Signal Analytics</span>
              {agentStats && <span style={{ fontSize: 9, color: txt3, marginLeft: 8 }}>weights v{agentStats.weights?.version || 0} · {agentStats.totals?.signals || 0} signals tracked</span>}
            </div>
            <button type="button" onClick={fetchAgentStats} disabled={agentStatsLoading} style={{ fontSize: 9, padding: "3px 9px", background: bg3, border: `1px solid ${bdr2}`, color: agentStatsLoading ? txt3 : txt2, borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }}>
              {agentStatsLoading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
          {!agentStats ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: txt3, marginBottom: 6 }}>Backend not connected</div>
              <div style={{ fontSize: 10, color: txt3, fontFamily: "monospace" }}>Start the trading server · localhost:3000</div>
            </div>
          ) : agentStats.totals?.signals === 0 ? (
            <div style={{ padding: "12px", background: bg3, borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: txt2, fontWeight: 600, marginBottom: 6 }}>📡 Agent signals accumulating</div>
              <div style={{ fontSize: 11, color: txt3, lineHeight: 1.6 }}>
                This section tracks <strong style={{color:txt2}}>AI-generated signals</strong> from the CEO/Scout agents &mdash; separate from your manually entered trades.
                Signal win rate and weight adaptation begin after <strong style={{color:txt2}}>10+ resolved signals per setup type</strong> (~3 months of daily scans).
              </div>
              <div style={{ fontSize: 10, color: amb, marginTop: 8 }}>
                Current: {agentStats.recentSignals?.length || 0} signals tracked · {agentStats.recentSignals?.filter(s=>s.hitTarget||s.hitStop).length || 0} resolved
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {[
                ["Total signals", agentStats.totals?.signals ?? "—"],
                ["Resolved", (() => { const s = agentStats.recentSignals || []; const r = s.filter(x => x.hitTarget !== undefined || x.hitStop !== undefined); return r.length + " / " + s.length; })()],
                ["Signal win rate", (() => { const p = agentStats.performance; return p?.winRate != null ? p.winRate + "%" : "—"; })()],
                ["Weights version", "v" + (agentStats.weights?.version ?? 0)],
              ].map(([label, val]) => (
                <div key={label} style={{ background: bg3, borderRadius: 6, padding: "8px 10px", border: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 8, color: txt3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: txt }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {agentStats && (<>
          <div style={C.card}>
            <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>TA Signal Win Rates</div>
            {Object.keys(agentStats.taSignalMatrix || {}).filter(k => !k.includes("+")).length === 0 ? (
              <div style={{ fontSize: 11, color: txt3, padding: "8px 0" }}>No resolved TA signals yet &mdash; win rates will appear after signals hit targets or stops.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(agentStats.taSignalMatrix || {})
                  .filter(([k]) => !k.includes("+"))
                  .sort((a, b) => b[1].winRate - a[1].winRate)
                  .map(([signal, stat]) => {
                    const wr = stat.winRate;
                    const barColor = wr >= 60 ? grn : wr >= 45 ? amb : red;
                    return (
                      <div key={signal} style={{ display: "grid", gridTemplateColumns: "140px 1fr 60px 50px", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, color: txt2, fontFamily: "monospace" }}>{signal.replace(/_/g," ")}</span>
                        <div style={{ height: 6, background: bdr, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: wr + "%", background: barColor, borderRadius: 3, transition: "width 0.4s" }} />
                        </div>
                        <span style={{ fontSize: 10, color: barColor, fontWeight: 600, textAlign: "right" }}>{wr}%</span>
                        <span style={{ fontSize: 9, color: txt3, textAlign: "right" }}>{stat.wins}W/{stat.losses}L</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {Object.entries(agentStats.taSignalMatrix || {}).filter(([k]) => k.includes("+")).length > 0 && (
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Best Signal Combos</div>
              <table style={C.tbl}>
                <thead><tr>{["Combination","Win Rate","Sample","Verdict"].map(h => <th key={h} style={C.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(agentStats.taSignalMatrix || {})
                    .filter(([k]) => k.includes("+"))
                    .sort((a, b) => b[1].winRate - a[1].winRate)
                    .slice(0, 10)
                    .map(([combo, stat]) => {
                      const wr = stat.winRate;
                      const col = wr >= 60 ? grn : wr >= 45 ? amb : red;
                      const verdict = wr >= 65 ? "✅ Edge" : wr >= 50 ? "⚠️ Borderline" : "❌ Avoid";
                      return (
                        <tr key={combo}>
                          <td style={{ ...C.td, fontSize: 9, fontFamily: "monospace", color: txt2 }}>{combo.replace(/_/g," ")}</td>
                          <td style={{ ...C.td, color: col, fontWeight: 600 }}>{wr}%</td>
                          <td style={{ ...C.td, color: txt3 }}>{stat.total}</td>
                          <td style={{ ...C.td, color: col, fontSize: 10 }}>{verdict}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          <div style={C.card}>
            <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Setup Type Performance</div>
            {Object.keys(agentStats.signalAccuracy || {}).length === 0 ? (
              <div style={{ fontSize: 11, color: txt3 }}>No resolved signal data yet.</div>
            ) : (
              <table style={C.tbl}>
                <thead><tr>{["Setup","Win Rate","Wins","Total","Avg Score"].map(h => <th key={h} style={C.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(agentStats.signalAccuracy || {})
                    .sort((a, b) => b[1].winRate - a[1].winRate)
                    .map(([setup, stat]) => {
                      const col = stat.winRate >= 60 ? grn : stat.winRate >= 45 ? amb : red;
                      return (
                        <tr key={setup}>
                          <td style={{ ...C.td, fontFamily: "monospace", fontSize: 10 }}>{setup}</td>
                          <td style={{ ...C.td, color: col, fontWeight: 600 }}>{stat.winRate}%</td>
                          <td style={{ ...C.td, color: grn }}>{stat.wins}</td>
                          <td style={{ ...C.td, color: txt3 }}>{stat.total}</td>
                          <td style={{ ...C.td, color: txt2 }}>{stat.avgScore}pts</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>

          <div style={C.card}>
            <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              Adaptive Weights · v{agentStats.weights?.version || 0}
              {agentStats.weights?.lastAdapted && <span style={{ fontWeight: 400, marginLeft: 8 }}>last adapted {agentStats.weights.lastAdapted?.slice(0,10)}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
              {Object.entries(agentStats.weights?.current || {})
                .filter(([k]) => !k.startsWith("_"))
                .sort((a, b) => b[1] - a[1])
                .map(([key, val]) => {
                  const isTA = key.startsWith("TA_");
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: bg3, borderRadius: 4, border: `1px solid ${bdr}` }}>
                      <span style={{ fontSize: 9, color: isTA ? amb : txt2, fontFamily: "monospace" }}>{key.replace("TA_","")}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: txt }}>{val}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {(agentStats.weights?.changelog || []).length > 0 && (
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Weight Changelog</div>
              <table style={C.tbl}>
                <thead><tr>{["Signal","Old","New","Win Rate","Sample","Change"].map(h => <th key={h} style={C.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {(agentStats.weights.changelog || []).slice(0, 15).map((entry, i) => {
                    const up = entry.new > entry.old;
                    return (
                      <tr key={(entry.setup || entry.weightKey || '') + i}>
                        <td style={{ ...C.td, fontFamily: "monospace", fontSize: 9, color: txt2 }}>{entry.setup || entry.weightKey}</td>
                        <td style={{ ...C.td, color: txt3 }}>{entry.old}</td>
                        <td style={{ ...C.td, color: up ? grn : red, fontWeight: 600 }}>{entry.new}</td>
                        <td style={{ ...C.td, color: txt2 }}>{entry.winRate}</td>
                        <td style={{ ...C.td, color: txt3 }}>{entry.sample}</td>
                        <td style={{ ...C.td, color: up ? grn : red }}>{entry.direction}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ── SECTION 3: DYNAMIC UNIVERSE EXPANSION ── */}
        <div style={C.card}>
          <div style={{...C.sh, marginBottom: 12}}>
            <div>
              <span style={C.stit}>Dynamic Universe</span>
              <span style={{ fontSize: 9, color: txt3, marginLeft: 8 }}>
                Static: 202 tickers · Dynamic: {universeStatus?.count ?? '—'} added · Pool: {universeStatus?.candidatePool ?? '—'} candidates
              </span>
            </div>
            <button
              type="button"
              onClick={runUniverseScan}
              disabled={universeScanRunning}
              style={{ fontSize: 9, padding: "3px 9px", background: universeScanRunning ? bg3 : "rgba(63,185,80,0.1)", border: `1px solid ${universeScanRunning ? bdr2 : grn}`, color: universeScanRunning ? txt3 : grn, borderRadius: 4, cursor: universeScanRunning ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {universeScanRunning ? "Scanning… (~60s)" : "▶ Run Scan Now"}
            </button>
          </div>
          {!universeStatus ? (
            <div style={{ fontSize: 11, color: txt3 }}>Load the page to fetch universe status.</div>
          ) : (
            <>
              <div style={{ fontSize: 9, color: txt3, marginBottom: 8 }}>
                Last screened: {universeStatus.lastScreened ? new Date(universeStatus.lastScreened).toLocaleDateString() : "Never"} · Auto-runs every Sunday 2:00 AM ET · Criteria: price ≥ $5, avg vol ≥ 3M/day
              </div>
              {universeStatus.dynamicTickers?.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {universeStatus.dynamicTickers.map(t => (
                    <span key={t} style={{ fontSize: 9, padding: "2px 7px", background: "rgba(63,185,80,0.08)", border: `1px solid rgba(63,185,80,0.2)`, borderRadius: 4, color: grn, fontFamily: "monospace" }}>{t}</span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: txt3, fontStyle: "italic" }}>No dynamic tickers yet &mdash; click &ldquo;Run Scan Now&rdquo; to populate.</div>
              )}
              {universeStatus.recentHistory?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Recent scans</div>
                  {[...universeStatus.recentHistory].reverse().slice(0, 3).map((h, i) => (
                    <div key={h.date || i} style={{ fontSize: 10, color: txt2, padding: "4px 0", borderBottom: `1px solid ${bdr}` }}>
                      {h.date?.slice(0,10)} &mdash; +{h.added?.length ?? 0} added, -{h.removed?.length ?? 0} removed &rarr; {h.total} dynamic
                      {h.added?.length > 0 && <span style={{ color: grn, marginLeft: 6 }}>{h.added.join(", ")}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>}

      {/* ── SKILLS ── */}
      {tab === "skills" && <div style={C.page}>
        <div style={C.g2}>
          <div>
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Market scans</div>
              <Sk icon="🔥" label="What's hot" desc="Trending stocks, earnings, BTC, Reddit momentum" prompt="run whats hot skill" onSkill={logSkill} />
              <Sk icon="🏦" label="Smart money" desc="Sector ETF flows, institutional rotation, cycle" prompt="run smart money skill" onSkill={logSkill} />
              <Sk icon="⚡" label="Full scan" desc="Both skills combined in one run" prompt="run both whats hot and smart money skills" onSkill={logSkill} />
              <Sk icon="🔭" label="Stock scout" desc="Find stocks approaching 150 SMA entry zones" prompt="run stock scout skill find 150 SMA setups this week" onSkill={logSkill} />
            </div>
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Emergency</div>
              <Sk icon="🚨" label="BTC emergency" desc="BTC broke $79,500 — miner action plan" prompt="BTC just broke below 79500 what do I do with my miner positions" emg onSkill={logSkill} />
              <Sk icon="🛡️" label="Crash protocol" desc="Review all stops — hold vs exit" prompt="market is crashing review all my stops and tell me what to do" emg onSkill={logSkill} />
            </div>
          </div>

          <div>
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Analysis & journal</div>
              <Sk icon="🌅" label="Morning briefing" desc="Full context + flags for today's session" prompt={morningPrompt} onSkill={logSkill} />
              <Sk icon="📊" label="Statistics" desc="Win rate, equity curve, pattern breakdown" prompt="show my trading statistics and equity curve swing only" onSkill={logSkill} />
              <Sk icon="📋" label="Positions review" desc="All open trades, stops, targets" prompt="show all my open positions and current status with stops and targets" onSkill={logSkill} />
              <Sk icon="₿" label="BTC + miners" desc="Current BTC vs $79.5K rule" prompt="check BTC price and miner position status" onSkill={logSkill} />
              <Sk icon="🕐" label="Market hours" desc="Israel + NY time, market status" prompt="check market hours what time is it in Israel and New York is market open" onSkill={logSkill} />

              {/* Monthly journal with month picker */}
              <div style={{ borderTop: `1px solid ${bdr}`, marginTop: 8, paddingTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>📓 Monthly journal</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 9, color: txt3, whiteSpace: "nowrap" }}>Month:</label>
                  <input
                    type="month"
                    value={journalMonth}
                    onChange={e => setJournalMonth(e.target.value)}
                    style={{ ...C.fi, marginBottom: 0, flex: 1, fontSize: 11, padding: "4px 8px" }}
                  />
                </div>
                {(() => {
                  const [yr, mo] = journalMonth.split("-");
                  const mName = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
                  const count = closed.filter(t => t.date && t.date.startsWith(journalMonth)).length;
                  return (
                    <Sk
                      icon="📓"
                      label={`Journal: ${mName}`}
                      desc={count > 0 ? `${count} trades this month — with patterns & rationale` : "No trades recorded for this month"}
                      prompt={buildJournalPrompt(journalMonth)}
                    />
                  );
                })()}
                <div style={{ fontSize: 9, color: txt3, lineHeight: 1.6, padding: "6px 4px" }}>
                  Includes: all trades · patterns · your recorded rationale · emotional flag check · monthly P&L breakdown
                </div>

                {/* Trading Diary — Word document */}
                <div style={{marginTop:10,borderTop:`1px solid ${bdr}`,paddingTop:10}}>
                  <div style={{fontSize:9,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>📄 Trading Diary (.docx)</div>
                  <button
                    type="button"
                    onClick={()=>generateTradingDiary(journalMonth)}
                    disabled={diaryLoading}
                    style={{...C.btn("green"),fontSize:12,fontWeight:700,padding:"10px",opacity:diaryLoading?0.6:1,letterSpacing:"0.03em"}}>
                    {diaryLoading ? '⏳ Generating…' : '📄 Generate Word Document'}
                  </button>
                  <div style={{fontSize:9,color:txt3,marginTop:5,lineHeight:1.5}}>
                    Generates a complete .docx with ELO rank, positions, trade history, P&L summary and space for notes. A save dialog will appear.
                  </div>
                </div>
              </div>
            </div>

            {skillLog.length > 0 && <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Recent skill runs</div>
              {skillLog.map((s, i) => (
                <div key={s.name + i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < skillLog.length - 1 ? `1px solid ${bdr}` : "none", fontSize: 11 }}>
                  <span style={{ color: txt2 }}>{s.name}</span>
                  <span style={{ color: txt3, fontSize: 9 }}>{s.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>}
            <div style={{ ...C.card, background: bg3 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: txt3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Chrome MCP scanning</div>
              <p style={{ fontSize: 11, color: txt2, lineHeight: 1.7, margin: 0 }}>
                Click "What's Hot" then tell Claude to use Chrome MCP to open Reddit r/wallstreetbets and extract trending tickers from the top posts.
              </p>
            </div>
          </div>
        </div>
      </div>}

      {/* ── AGENTS ── */}
      {tab==="agents"&&<div style={C.page}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:txt,letterSpacing:"0.05em"}}>🤖 AGENT CONTROL ROOM</div>
            <div style={{fontSize:10,color:txt3,marginTop:2}}>CEO orchestrates Scout → What's Hot → Position Monitor → Synthesis</div>
          </div>
          <button
            type="button"
            onClick={runAgents}
            disabled={agentsRunning||!apiKey}
            style={{padding:"10px 22px",background:agentsRunning?`rgba(255,107,0,0.08)`:`rgba(255,107,0,0.15)`,border:`1px solid rgba(255,107,0,0.45)`,color:accent,borderRadius:3,cursor:agentsRunning?"not-allowed":"pointer",fontFamily:mono,fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8,opacity:apiKey?1:0.5,textShadow:"0 0 10px rgba(255,107,0,0.6)",boxShadow:"0 0 14px rgba(255,107,0,0.2)"}}>
            {agentsRunning ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Running&hellip;</> : "▶ Run Full Scan"}
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.openServerLogs?.() || fetch(`${BACKEND}/api/health`)}
            style={{padding:"10px 16px",background:"rgba(88,166,255,0.08)",border:`1px solid rgba(88,166,255,0.3)`,color:"#58a6ff",borderRadius:3,cursor:"pointer",fontFamily:mono,fontSize:12,fontWeight:600}}>
            🖥 Server Logs
          </button>
        </div>

        {/* Watchlist Panel */}
        <div style={{background:bg2,border:`1px solid ${bdr}`,borderRadius:8,padding:"10px 14px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.08em"}}>📋 Watchlist</span>
            {wlLoading&&<span style={{fontSize:9,color:amb,animation:"pulse 1s ease-in-out infinite"}}>● refreshing</span>}
            <span style={{fontSize:9,color:backendConn?grn:txt3,fontWeight:700}} title={backendConn?"Backend connected":"Backend offline — start node server.js"}>
              {backendConn?"⬤ backend live":"◯ backend offline"}
            </span>
            <span style={{fontSize:9,color:txt3,marginLeft:"auto"}}>{watchlist.length} tickers · auto-updates 60s</span>
            <button type="button" onClick={()=>setWatchlist(WL_ALL)} style={{padding:"2px 8px",background:bg3,border:`1px solid ${bdr}`,color:txt3,borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"inherit"}} title="Reset to full universe">⊕ Load All</button>
            <button type="button" onClick={refreshWatchPrices} disabled={wlLoading} style={{padding:"2px 8px",background:bg3,border:`1px solid ${bdr}`,color:txt3,borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>↻ Refresh</button>
          </div>
          <div style={{maxHeight:200,overflowY:"auto",marginBottom:8,paddingRight:2}}>
            {(()=>{
              const wlSet=new Set(watchlist);
              const allSectorTickers=new Set(Object.values(WL_SECTORS).flat());
              const custom=watchlist.filter(t=>!allSectorTickers.has(t));
              const chip=(ticker)=>{
                const p=watchPrices[ticker];
                const chgColor=p?(p.change>=0?grn:red):txt3;
                return <div key={ticker} style={{display:"inline-flex",alignItems:"center",gap:3,background:bg3,border:`1px solid ${bdr}`,borderRadius:4,padding:"2px 6px",marginRight:4,marginBottom:3,whiteSpace:"nowrap"}}>
                  <span style={{fontWeight:700,color:txt,fontSize:10}}>{ticker}</span>
                  {p?<><span style={{color:txt2,fontSize:10}}>${p.price.toFixed(2)}</span><span style={{color:chgColor,fontSize:9}}>{p.change>=0?"+":""}{p.change.toFixed(2)}%</span></>:<span style={{color:txt3,fontSize:9}}>&mdash;</span>}
                  <button type="button" onClick={()=>removeFromWatchlist(ticker)} style={{background:"none",border:"none",color:txt3,cursor:"pointer",fontSize:10,lineHeight:1,padding:"0 1px",marginLeft:1}}>×</button>
                </div>;
              };
              return <Fragment>
                {Object.entries(WL_SECTORS).map(([sector,tickers])=>{
                  const visible=tickers.filter(t=>wlSet.has(t));
                  if(!visible.length) return null;
                  return <div key={sector} style={{marginBottom:6}}>
                    <div style={{fontSize:8,color:txt3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{sector}</div>
                    <div>{visible.map(t=>chip(t))}</div>
                  </div>;
                })}
                {custom.length>0&&<div style={{marginBottom:4}}>
                  <div style={{fontSize:8,color:txt3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>Custom</div>
                  <div>{custom.map(t=>chip(t))}</div>
                </div>}
              </Fragment>;
            })()}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input ref={wlInputRef} type="text" placeholder="Add ticker (e.g. MSFT)" onKeyDown={e=>{if(e.key==="Enter")addToWatchlist();}}
              style={{...C.fi,marginBottom:0,flex:1,fontSize:10,padding:"4px 8px",textTransform:"uppercase"}}/>
            <button type="button" onClick={addToWatchlist} style={{padding:"4px 12px",background:bg3,border:`1px solid ${bdr}`,color:txt3,borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>+ Add</button>
          </div>
        </div>

        {/* Agent Status Cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:12}}>
          {[
            {key:"scout",    label:"Scout",      icon:"🔭", desc:"150 SMA setups"},
            {key:"hot",      label:"What's Hot", icon:"🔥", desc:"Momentum scanner"},
            {key:"position", label:"Positions",  icon:"📊", desc:"Position health"},
            {key:"stats",    label:"Stats",      icon:"📈", desc:"Edge + performance"},
            {key:"ceo",      label:"CEO Agent",  icon:"🧠", desc:"Synthesizes all"},
          ].map(({key,label,icon,desc})=>{
            const st=agentStatus[key];
            const col=st==="running"?amb:st==="done"?grn:st==="error"?red:txt3;
            const bg_=st==="running"?`rgba(255,184,0,0.08)`:st==="done"?`rgba(20,241,149,0.08)`:st==="error"?`rgba(255,45,85,0.08)`:bg2;
            const isStats=key==="stats";
            return <div key={key}
              onClick={isStats?()=>{setStatsPanel(p=>{const next=!p;if(next)fetchBackendStats();return next;});}:undefined}
              style={{background:isStats&&statsPanel?`rgba(0,229,255,0.08)`:bg_,border:`1px solid ${isStats&&statsPanel?accent2:st==="idle"?bdr:col}`,borderRadius:4,padding:"10px 12px",transition:"all 0.3s",cursor:isStats?"pointer":"default"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{fontSize:16}}>{icon}</span>
                <span style={{fontSize:11,fontWeight:700,color:isStats&&statsPanel?"#388bfd":col,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span>
                <span style={{marginLeft:"auto",fontSize:9,color:col,textTransform:"uppercase",fontWeight:600,padding:"1px 5px",borderRadius:3,background:`${col}22`}}>{st}</span>
              </div>
              <div style={{fontSize:9,color:txt3}}>{isStats?"click to view report":desc}</div>
              {st==="running"&&<div style={{height:2,background:bdr,borderRadius:1,marginTop:6,overflow:"hidden"}}>
                <div style={{height:"100%",background:amb,borderRadius:1,animation:"scanBar 1.5s ease-in-out infinite"}}/>
              </div>}
            </div>;
          })}
        </div>

        {/* Stats Panel */}
        {statsPanel&&<div style={{...C.card,marginBottom:12,border:"1px solid #388bfd44"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:11,fontWeight:700,color:"#388bfd",textTransform:"uppercase",letterSpacing:"0.1em"}}>📈 Performance Report</span>
            {statsLoading&&<span style={{fontSize:9,color:amb}}>loading…</span>}
            <button type="button" onClick={fetchBackendStats} style={{marginLeft:"auto",padding:"2px 8px",background:bg3,border:`1px solid ${bdr}`,color:txt3,borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>↻ Refresh</button>
            <button type="button" onClick={()=>setStatsPanel(false)} style={{padding:"2px 8px",background:bg3,border:`1px solid ${bdr}`,color:txt3,borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>✕ Close</button>
          </div>
          {!backendConn&&!statsData&&<div style={{fontSize:11,color:txt3,textAlign:"center",padding:"20px 0"}}>Backend offline &mdash; start <code style={{background:bg3,padding:"1px 4px",borderRadius:3}}>node server.js</code> to see live stats</div>}
          {statsData&&<Fragment>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:12}}>
              {[
                {label:"Win Rate",    val:`${statsData.performance?.winRate??0}%`,       col:statsData.performance?.winRate>=55?grn:red},
                {label:"Prof Factor", val:statsData.performance?.profitFactor??'—',       col:statsData.performance?.profitFactor>=1.5?grn:red},
                {label:"Avg Win",     val:`+${statsData.performance?.avgWin??0}%`,        col:grn},
                {label:"Avg Loss",    val:`-${statsData.performance?.avgLoss??0}%`,       col:red},
                {label:"Total Trades",val:statsData.performance?.total??0,               col:txt},
                {label:"Open",        val:statsData.performance?.openTrades??0,           col:amb},
              ].map(({label,val,col})=>(
                <div key={label} style={{background:bg3,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:15,fontWeight:700,color:col}}>{val}</div>
                  <div style={{fontSize:8,color:txt3,marginTop:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div style={{background:bg3,borderRadius:7,padding:"10px 12px"}}>
                <div style={{fontSize:10,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>🎯 Signal Accuracy by Setup</div>
                {Object.keys(statsData.signalAccuracy||{}).length===0&&<div style={{fontSize:10,color:txt3,fontStyle:"italic"}}>No resolved signals yet</div>}
                {Object.entries(statsData.signalAccuracy||{}).map(([setup,s])=>{
                  const wr=s.winRate; const barCol=wr>=65?grn:wr>=50?amb:red;
                  return <div key={setup} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:10,color:txt2}}>{setup.replace(/_/g,' ')}</span>
                      <span style={{fontSize:10,fontWeight:700,color:barCol}}>{wr}% ({s.wins}/{s.total})</span>
                    </div>
                    <div style={{height:4,background:bdr,borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${wr}%`,background:barCol,borderRadius:2,transition:"width 0.5s"}}/>
                    </div>
                  </div>;
                })}
              </div>
              <div style={{background:bg3,borderRadius:7,padding:"10px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <span style={{fontSize:10,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.08em"}}>⚖️ Adaptive Weights</span>
                  <span style={{fontSize:8,color:txt3,marginLeft:"auto"}}>v{statsData.weights?.version||0}</span>
                </div>
                {['SMA_BOUNCE','APPROACHING','ABOVE_TREND','BELOW_WATCH','MOMENTUM','VOLUME_SPIKE','MARKET_CAP','PRICE_ACTION'].map(k=>{
                  const val=statsData.weights?.current?.[k]??0;
                  const def={SMA_BOUNCE:40,APPROACHING:25,ABOVE_TREND:20,BELOW_WATCH:5,MOMENTUM:30,VOLUME_SPIKE:15,MARKET_CAP:10,PRICE_ACTION:5}[k]||0;
                  const diff=val-def; const diffCol=diff>0?grn:diff<0?red:txt3;
                  return <div key={k} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:9,color:txt3,width:90,flexShrink:0}}>{k.replace(/_/g,' ')}</span>
                    <div style={{flex:1,height:3,background:bdr,borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.min(val/50*100,100)}%`,background:"#388bfd",borderRadius:2}}/>
                    </div>
                    <span style={{fontSize:9,fontWeight:700,color:txt,width:20,textAlign:"right"}}>{val}</span>
                    {diff!==0&&<span style={{fontSize:8,color:diffCol}}>{diff>0?`+${diff}`:diff}</span>}
                  </div>;
                })}
                {statsData.weights?.lastAdapted&&<div style={{fontSize:8,color:txt3,marginTop:6}}>Last adapted: {new Date(statsData.weights.lastAdapted).toLocaleDateString()}</div>}
              </div>
            </div>
            {(statsData.recentSignals||[]).length>0&&<div style={{background:bg3,borderRadius:7,padding:"10px 12px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.08em"}}>📡 Recent Signals</div>
                <div style={{fontSize:9,color:txt3}}>{statsData.recentSignals.filter(s=>s.confirmed).length} confirmed · {statsData.recentSignals.length} total</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
                {(statsData.recentSignals||[]).slice(0,16).map((s,i)=>{
                  const outcome = s.hitTarget ? "✅" : s.hitStop ? "🛑" : s.confirmed ? "📌" : "⏳";
                  const isConfirmed = s.confirmed && !s.hitTarget && !s.hitStop;
                  return <div key={s.signalId || s.ticker + i} style={{background:bg2,borderRadius:5,padding:"5px 8px",border:isConfirmed?`1px solid rgba(63,185,80,0.3)`:`1px solid transparent`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:10,fontWeight:700,color:txt}}>{s.ticker}</span>
                      <span style={{fontSize:10}}>{outcome}</span>
                    </div>
                    <div style={{fontSize:8,color:txt3}}>{(s.setupType||'').replace(/_/g,' ')}</div>
                    <div style={{display:"flex",gap:4,alignItems:"center",marginTop:1}}>
                      <span style={{fontSize:8,color:amb}}>score {s.score}</span>
                      {isConfirmed&&<span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:"rgba(63,185,80,0.15)",color:grn}}>IN TRADE</span>}
                    </div>
                  </div>;
                })}
              </div>
            </div>}
            {(statsData.weights?.changelog||[]).length>0&&<div style={{background:bg3,borderRadius:7,padding:"10px 12px"}}>
              <div style={{fontSize:10,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>🔄 Weight Change Log</div>
              {(statsData.weights.changelog||[]).slice(0,6).map((c,i)=>(
                <div key={(c.weightKey||'')+i} style={{fontSize:10,color:txt2,marginBottom:3,display:"flex",gap:8}}>
                  <span style={{color:c.direction?.includes("↑")?grn:red}}>{c.direction}</span>
                  <span style={{color:txt3}}>{c.weightKey?.replace(/_/g,' ')}</span>
                  <span>{c.old}→<b style={{color:txt}}>{c.new}</b></span>
                  <span style={{color:txt3}}>({c.winRate} WR, {c.sample} signals)</span>
                </div>
              ))}
            </div>}
          </Fragment>}
        </div>}

        {/* CEO Report */}
        {agentReport&&<div style={{...C.card,marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:amb,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>🧠 CEO REPORT</div>
          {(agentReport.alerts||[]).length>0&&<div style={{background:"rgba(248,81,73,0.08)",border:"1px solid rgba(248,81,73,0.25)",borderRadius:7,padding:"8px 12px",marginBottom:10}}>
            {(agentReport.alerts||[]).map((a,i)=><div key={a.slice(0,20)+i} style={{fontSize:11,color:red,marginBottom:2}}>🚨 {a}</div>)}
          </div>}
          {agentReport.market_summary&&<div style={{fontSize:11,color:txt2,marginBottom:10,lineHeight:1.6}}>{agentReport.market_summary}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            {(agentReport.priority_trades||[]).length>0&&<div style={{background:"rgba(63,185,80,0.06)",border:"1px solid rgba(63,185,80,0.2)",borderRadius:7,padding:"10px 12px"}}>
              <div style={{fontSize:10,fontWeight:700,color:grn,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>🎯 Priority Trades</div>
              {(agentReport.priority_trades||[]).map((t,i)=>(
                <div key={t.ticker+i} style={{marginBottom:8,paddingBottom:8,borderBottom:i<(agentReport.priority_trades.length-1)?`1px solid ${bdr}`:"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:12,fontWeight:700,color:txt}}>{t.ticker}</span>
                    <span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:t.confidence==="high"?"rgba(63,185,80,0.2)":t.confidence==="medium"?"rgba(210,153,34,0.2)":"rgba(248,81,73,0.2)",color:t.confidence==="high"?grn:t.confidence==="medium"?amb:red,fontWeight:700}}>{t.confidence}</span>
                  </div>
                  <div style={{fontSize:9,color:txt3,marginBottom:3}}>{(t.setup||'').replace(/_/g,' ')} · score {t.score}</div>
                  <div style={{fontSize:10,color:txt2}}>{t.note}</div>
                  {t.entry>0&&<div style={{fontSize:9,color:txt3,marginTop:3}}>entry ${t.entry} · stop ${t.stop} · target ${t.target}</div>}
                </div>
              ))}
            </div>}
            <div style={{background:"rgba(100,180,255,0.05)",border:"1px solid rgba(100,180,255,0.2)",borderRadius:7,padding:"10px 12px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#64b4ff",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>⚡ Actions</div>
              {(agentReport.actions||["—"]).map((a,i)=><div key={a.slice(0,20)+i} style={{fontSize:11,color:txt2,marginBottom:3,paddingLeft:8,borderLeft:"2px solid #64b4ff"}}>· {a}</div>)}
            </div>
          </div>
          {agentReport._raw&&(()=>{const parts=agentReport._raw.split(/\}\s*\n/);const msg=parts.slice(1).join('\n').trim();return msg?<div style={{background:bg3,borderRadius:6,padding:"10px 14px",fontSize:12,color:txt2,lineHeight:1.7,borderLeft:`3px solid ${amb}`}}><span style={{fontSize:10,fontWeight:700,color:amb,display:"block",marginBottom:4}}>CEO TO {username.toUpperCase()}:</span>{msg}</div>:null;})()}
        </div>}

        {/* Performance Stats Card */}
        {statsForDisplay&&statsForDisplay.total>=3&&<div style={{...C.card,marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>📈 Performance Stats ({statsForDisplay.total} trades)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
            {[
              {label:"Win Rate",    val:(statsForDisplay.winRate*100).toFixed(0)+"%",      col:statsForDisplay.winRate>=0.6?grn:statsForDisplay.winRate>=0.5?amb:red},
              {label:"Profit Factor",val:statsForDisplay.profitFactor.toFixed(2),          col:statsForDisplay.profitFactor>=2?grn:statsForDisplay.profitFactor>=1.5?amb:red},
              {label:"Expectancy",  val:"$"+statsForDisplay.expectancy.toFixed(2),         col:statsForDisplay.expectancy>=0?grn:red},
              {label:"Max Drawdown",val:"-$"+statsForDisplay.maxDD.toFixed(0),             col:red},
            ].map(({label,val,col})=>(
              <div key={label} style={{textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:700,color:col}}>{val}</div>
                <div style={{fontSize:9,color:txt3,textTransform:"uppercase"}}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
            <span style={{fontSize:10,color:txt3,background:bg3,padding:"3px 8px",borderRadius:4}}>Recent WR: <span style={{color:statsForDisplay.recentWR>=0.6?grn:statsForDisplay.recentWR>=0.5?amb:red,fontWeight:700}}>{(statsForDisplay.recentWR*100).toFixed(0)}%</span></span>
            <span style={{fontSize:10,color:txt3,background:bg3,padding:"3px 8px",borderRadius:4}}>Recent PF: <span style={{color:statsForDisplay.recentPF>=1.5?grn:statsForDisplay.recentPF>=1?amb:red,fontWeight:700}}>{statsForDisplay.recentPF.toFixed(2)}</span></span>
            <span style={{fontSize:10,color:txt3,background:bg3,padding:"3px 8px",borderRadius:4}}>Edge: <span style={{color:statsForDisplay.edgeDeterioration?red:grn,fontWeight:700}}>{statsForDisplay.edgeDeterioration?"⚠️ Weakening":"✅ Steady"}</span></span>
            <span style={{fontSize:10,color:txt3,background:bg3,padding:"3px 8px",borderRadius:4}}>Confidence: <span style={{color:amb,fontWeight:700}}>{(statsForDisplay.confidence*100).toFixed(0)}%</span></span>
            {statsForDisplay.bestTicker&&<span style={{fontSize:10,color:txt3,background:bg3,padding:"3px 8px",borderRadius:4}}>Best: <span style={{color:grn,fontWeight:700}}>{statsForDisplay.bestTicker} (${statsForDisplay.bestTickerPnl.toFixed(0)})</span></span>}
          </div>
          {statsForDisplay.badTickers.length>0&&<div style={{fontSize:10,color:red,background:"rgba(248,81,73,0.07)",padding:"5px 10px",borderRadius:4}}>{'⚠️ Avoid (WR < 40%, ≥5 trades): '}{statsForDisplay.badTickers.join(", ")}</div>}
        </div>}

        {/* CEO stream (while running) */}
        {agentsRunning&&ceoStream&&<div style={{...C.card,marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:amb,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>🧠 CEO Thinking&hellip;</div>
          <pre style={{fontSize:11,color:txt2,whiteSpace:"pre-wrap",margin:0,fontFamily:"inherit",lineHeight:1.6}}>{ceoStream}</pre>
        </div>}

        {/* Live Signals / Candidates */}
        {liveSignals.length>0&&<div style={{...C.card,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:700,color:grn,textTransform:"uppercase",letterSpacing:"0.08em"}}>📡 Live Candidates</span>
            <span style={{fontSize:9,color:txt3}}>{liveSignals.length} signal{liveSignals.length!==1?"s":""}</span>
            <button type="button" onClick={()=>setLiveSignals([])} style={{marginLeft:"auto",padding:"2px 8px",background:bg3,border:`1px solid ${bdr}`,color:txt3,borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>✕ Clear</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {liveSignals.map((sig,i)=>{
              const taken=positions.some(p=>p.ticker===sig.ticker)||closed.some(p=>p.ticker===sig.ticker&&p.signalId===sig.signalId);
              const isAuto=sig.autoEntered;
              return (
                <div key={sig.ticker+i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:isAuto?"rgba(63,185,80,0.06)":bg3,borderRadius:5,border:`1px solid ${taken?"rgba(139,148,158,0.15)":isAuto?"rgba(63,185,80,0.35)":bdr}`}}>
                  <span style={{fontSize:9,color:txt3,minWidth:16,textAlign:"right"}}>{i+1}</span>
                  <span style={{fontWeight:700,color:taken?txt3:isAuto?grn:txt,fontSize:12,minWidth:52}}>{sig.ticker}</span>
                  <span style={{fontSize:8,color:txt3,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(sig.setupType||sig.setup||"—").replace("150SMA_","").replace(/_/g," ")}</span>
                  <span style={{fontSize:9,color:sig.score>=85?"#f0883e":sig.score>=75?amb:txt3,fontWeight:700,minWidth:28}}>{sig.score}pt</span>
                  {sig.entry>0&&<span style={{fontSize:8,color:txt3,whiteSpace:"nowrap"}}>${sig.entry?.toFixed(2)} → <span style={{color:"#58a6ff"}}>T${sig.target?.toFixed(2)||sig.t1?.toFixed(2)}</span> · <span style={{color:"#f85149"}}>S${sig.stop?.toFixed(2)}</span></span>}
                  {isAuto&&!taken&&<span style={{fontSize:8,color:grn,padding:"1px 5px",background:"rgba(63,185,80,0.15)",borderRadius:3,whiteSpace:"nowrap"}}>✓ auto</span>}
                  {taken
                    ?<span style={{fontSize:9,color:txt3,padding:"2px 7px",background:"rgba(72,79,88,0.3)",borderRadius:3,whiteSpace:"nowrap"}}>taken</span>
                    :<button type="button" onClick={()=>takeTradeFromSignal(sig)} style={{fontSize:9,padding:"3px 10px",background:"rgba(63,185,80,0.15)",border:"1px solid rgba(63,185,80,0.4)",borderRadius:4,color:grn,cursor:"pointer",fontFamily:"inherit",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>↗ Take</button>
                  }
                </div>
              );
            })}
          </div>
          <div style={{fontSize:8,color:txt3,marginTop:6}}>Ranked by score · ↗ Take pre-fills position form</div>
        </div>}

        {/* Activity Log */}
        {agentLog.length>0&&<div style={C.card}>
          <div style={{fontSize:10,fontWeight:700,color:txt3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Activity Log</div>
          <div style={{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
            {agentLog.map((e,i)=>{
              const col=e.agent==="CEO"?amb:e.agent==="scout"?grn:e.agent==="hot"?"#ff6a3d":e.agent==="position"?"#64b4ff":txt3;
              return <div key={e.agent+e.time+i} style={{display:"flex",gap:8,fontSize:10,lineHeight:1.5}}>
                <span style={{color:txt3,flexShrink:0,fontFamily:"monospace"}}>{e.time}</span>
                <span style={{color:col,flexShrink:0,fontWeight:700,minWidth:60}}>{e.agent}</span>
                <span style={{color:txt2}}>{e.text}</span>
              </div>;
            })}
          </div>
        </div>}

        {/* Empty state */}
        {!agentsRunning&&agentLog.length===0&&liveSignals.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:txt3}}>
          <div style={{fontSize:40,marginBottom:12}}>🤖</div>
          <div style={{fontSize:14,color:txt2,marginBottom:6}}>No scan results yet</div>
          <div style={{fontSize:11}}>Click ▶ Run Full Scan to start the agent system</div>
        </div>}

      </div>}


      {/* Brains tab removed */}
      {false&&(()=>{
        const SECTIONS = [
          {
            id:"ui", icon:"🖥️", title:"Dashboard & UI", color:grn,
            desc:"Personal tool improvements — what makes daily use better",
            items:[
              {id:"pat",    label:"Pattern field mandatory on position entry",                         done:true},
              {id:"rat",    label:"Rationale / 'why I took this trade' — optional, feeds journal",     done:true},
              {id:"ana",    label:"Analytics tab — pattern matrix, monthly P&L, discipline scorecard", done:true},
              {id:"jmo",    label:"Journal month picker — generate any past month",                    done:true},
              {id:"his",    label:"History tab shows Pattern + Rationale columns",                     done:true},
              {id:"fol",    label:"All files consolidated in Dimas Trading Fund OS folder",            done:true},
              {id:"mob",    label:"Mobile-responsive layout — check positions from phone"},
              {id:"csv",    label:"Export closed trades to CSV / Excel"},
              {id:"notif",  label:"Desktop notification when backend fires a high-confidence signal"},
              {id:"poslog", label:"Position change log — track every edit/partial close with timestamp"},
            ]
          },
          {
            id:"agents", icon:"⚙️", title:"Backend Agent Upgrades", color:amb,
            desc:"Sourced from Agent Brains analysis — ordered by impact vs effort",
            items:[
              {id:"news",    label:"Add NewsAPI key to .env — doubles WhatsHot data, activates 2× news weight",        effort:"TRIVIAL"},
              {id:"atr",     label:"Route ATR → CEO stop calculator: stop = entry − 1.5×ATR (not fixed 4%/6%)",       effort:"LOW"},
              {id:"regime",  label:"Regime gate in CEO — BEARISH requires score ≥80, RISK_OFF disables BUY signals",   effort:"LOW"},
              {id:"regsave", label:"Store market regime with each signal record — enables regime-split analytics",      effort:"LOW"},
              {id:"earn",    label:"Earnings filter in Scout — suppress signals within 3 days before earnings date",    effort:"LOW"},
              {id:"decay",   label:"WhatsHot time decay — posts <2h weight 3×, <6h 2×, older 0.5×",                   effort:"LOW"},
              {id:"upvote",  label:"WhatsHot upvote weighting — viral post (50K upvotes) > 10 ignored posts",         effort:"LOW"},
              {id:"sector",  label:"Sector confirmation in Scout — sector ETF must be above its 150 SMA",              effort:"MED"},
              {id:"intra",   label:"Intraday resolution at 12 PM ET — use day high/low to catch same-day target hits", effort:"MED"},
              {id:"atrval",  label:"ATR stop validation in Risk — warn if stop tighter than 1×ATR of that stock",     effort:"LOW"},
              {id:"highsig", label:"Score ≥100 exception — flag elite signals even when max positions are open",       effort:"LOW"},
              {id:"startup", label:"Delayed scan on server startup — closes the up-to-59min dead zone after boot",    effort:"LOW"},
            ]
          },
          {
            id:"migration", icon:"🏗️", title:"Migration: HTML → Proper Vite App", color:"#58a6ff",
            desc:"No database or auth needed — same backend, just a proper React build",
            items:[
              {id:"v1", label:"Phase 1 — Create Vite + React project in Dimas Trading Fund OS/app/"},
              {id:"v2", label:"Phase 2 — Paste component into App.jsx, fix imports (no CDN React)"},
              {id:"v3", label:"Phase 3 — Route Yahoo Finance through own backend (kill CORS proxy dependency)"},
              {id:"v4", label:"Phase 4 — Store trades in trades.json via backend endpoint (not localStorage)"},
              {id:"v5", label:"Phase 5 — npm run build → static dist/, open index.html in browser"},
              {id:"v6", label:"Phase 6 — Responsive CSS pass for phone/tablet access"},
            ]
          },
          {
            id:"future", icon:"🚀", title:"Future — If Going Public", color:txt3,
            desc:"Keep as future project. Not needed for personal use.",
            locked:true,
            items:[
              {id:"fauth",    label:"Authentication — Clerk or Auth.js (login, sessions, password reset)"},
              {id:"fdb",      label:"Database — PostgreSQL via Supabase (per-user isolated trade history)"},
              {id:"fstripe",  label:"Payments — Stripe subscriptions (monthly or one-time)"},
              {id:"fhost",    label:"Cloud hosting — Railway or Render (~$7/month to start)"},
              {id:"fdomain",  label:"Custom domain + SSL certificate"},
              {id:"fonboard", label:"User onboarding flow + documentation + demo account"},
            ]
          }
        ];

        const effortColor = e => e==="TRIVIAL"?grn:e==="LOW"?amb:e==="MED"?"#f0883e":red;

        return <div style={C.page}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:15,fontWeight:700,color:txt,marginBottom:4}}>🧠 Agent Brains &mdash; Build Roadmap</div>
            <div style={{fontSize:11,color:txt3}}>Checklist sourced from Agent Brains analysis · Checks saved automatically · Personal use focus</div>
          </div>

          {(()=>{
            const allPersonal = SECTIONS.filter(s=>!s.locked).flatMap(s=>[...s.items,...(customTasks[s.id]||[])]);
            const total = allPersonal.length;
            const done = allPersonal.filter(it=>it.done||brainChecks[it.id]).length;
            const pct = Math.round(done/total*100);
            return <div style={{...C.card,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:700,color:txt}}>Overall progress (personal)</span>
                <span style={{fontSize:13,fontWeight:700,color:grn}}>{done} / {total} &mdash; {pct}%</span>
              </div>
              <div style={{height:8,background:bdr,borderRadius:4}}>
                <div style={{height:"100%",width:pct+"%",background:pct>=80?grn:pct>=50?amb:red,borderRadius:4,transition:"width 0.4s"}}/>
              </div>
            </div>;
          })()}

          {SECTIONS.map(sec=>{
            const allItems=[...sec.items,...(customTasks[sec.id]||[])];
            const done = allItems.filter(it=>it.done||brainChecks[it.id]).length;
            const pct = allItems.length>0?Math.round(done/allItems.length*100):0;
            return <div key={sec.id} style={{...C.card,marginBottom:12,opacity:sec.locked?0.55:1}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>{sec.icon}</span>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:sec.color}}>{sec.title}</div>
                    <div style={{fontSize:10,color:txt3}}>{sec.desc}</div>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:sec.locked?txt3:sec.color}}>{done}/{sec.items.length}</div>
                  <div style={{height:4,width:80,background:bdr,borderRadius:2,marginTop:4}}>
                    <div style={{height:"100%",width:pct+"%",background:sec.locked?txt3:sec.color,borderRadius:2,transition:"width 0.4s"}}/>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {[...sec.items,...(customTasks[sec.id]||[])].map(it=>{
                  const isCustom = !!it.id.startsWith?.("custom_");
                  const checked = it.done || !!brainChecks[it.id];
                  return <div key={it.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 8px",borderRadius:6,background:checked?"rgba(63,185,80,0.05)":"transparent",border:checked?`1px solid rgba(63,185,80,0.15)`:`1px solid transparent`,transition:"all 0.15s"}}>
                    <div
                      onClick={()=>!sec.locked&&!it.done&&toggleCheck(it.id)}
                      style={{width:16,height:16,borderRadius:4,border:checked?`1.5px solid ${grn}`:`1.5px solid ${bdr2}`,background:checked?"rgba(63,185,80,0.2)":"transparent",flexShrink:0,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:grn,cursor:sec.locked||it.done?"default":"pointer"}}>
                      {checked?"✓":""}
                    </div>
                    <div style={{flex:1,cursor:sec.locked||it.done?"default":"pointer"}} onClick={()=>!sec.locked&&!it.done&&toggleCheck(it.id)}>
                      <span style={{fontSize:11,color:checked?txt3:txt,textDecoration:checked?"line-through":"none"}}>{it.label}</span>
                      {it.done&&<span style={{fontSize:9,marginLeft:6,padding:"1px 5px",borderRadius:3,background:"rgba(63,185,80,0.15)",color:grn,fontWeight:700}}>BUILT</span>}
                      {isCustom&&<span style={{fontSize:9,marginLeft:6,padding:"1px 5px",borderRadius:3,background:"rgba(88,166,255,0.1)",color:"#58a6ff",fontWeight:700}}>CUSTOM</span>}
                    </div>
                    {it.effort&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,border:`1px solid ${effortColor(it.effort)}33`,color:effortColor(it.effort),flexShrink:0,fontWeight:700}}>{it.effort}</span>}
                    {sec.locked&&<span style={{fontSize:9,color:txt3,flexShrink:0}}>🔒</span>}
                    {isCustom&&<button type="button" onClick={()=>deleteTask(sec.id,it.id)} style={{background:"none",border:"none",color:txt3,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1,flexShrink:0}} title="Delete">×</button>}
                  </div>;
                })}
                {!sec.locked&&<div style={{display:"flex",gap:6,marginTop:6,alignItems:"center"}}>
                  <input
                    value={taskInput[sec.id]||""}
                    onChange={e=>setTaskInput(prev=>({...prev,[sec.id]:e.target.value}))}
                    onKeyDown={e=>{if(e.key==="Enter")addTask(sec.id);}}
                    placeholder="+ Add task… (press Enter)"
                    style={{...C.fi,marginBottom:0,flex:1,fontSize:10,padding:"5px 8px",borderStyle:"dashed",color:txt3}}
                  />
                  <button
                    type="button"
                    onClick={()=>addTask(sec.id)}
                    disabled={!(taskInput[sec.id]||"").trim()}
                    style={{background:"none",border:`1px dashed ${bdr2}`,color:(taskInput[sec.id]||"").trim()?grn:txt3,borderRadius:5,padding:"5px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,flexShrink:0,transition:"color 0.15s"}}>
                    + Add
                  </button>
                </div>}
              </div>
            </div>;
          })}

          <div style={{...C.card,borderColor:"rgba(248,81,73,0.2)"}}>
            <div style={{fontSize:9,fontWeight:700,color:red,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>⚠️ Known System Blind Spots</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[
                ["Scout","Earnings-blind — 150SMA bounce 2 days pre-earnings = trap"],
                ["Scout","Universe static — never discovers new stocks automatically"],
                ["WhatsHot","No NewsAPI key → Reddit-only, news weight wasted"],
                ["WhatsHot","Upvotes ignored — viral post = same as 1-upvote post"],
                ["CEO","Market regime ignored — same BUY threshold in BULL and BEAR"],
                ["CEO","ATR computed but thrown away — stops are fixed %, not volatility-adjusted"],
                ["Risk","Daily loss cap only counts realized P&L — unrealized losses invisible"],
                ["Stats","Server must run at 4:05 PM — if off, zero learning that day"],
              ].map(([agent,text],i)=>(
                <div key={agent+i} style={{display:"flex",gap:8,padding:"7px 8px",background:bg3,borderRadius:6,border:`1px solid ${bdr}`}}>
                  <span style={{fontSize:9,fontWeight:700,color:amb,flexShrink:0,width:60}}>{agent}</span>
                  <span style={{fontSize:10,color:txt3,lineHeight:1.4}}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>;
      })()}


    {/* ── Trading Diary Loading Overlay ── */}
    {diaryLoading && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:99999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:bg3,border:`1px solid ${bdr2}`,borderRadius:4,padding:"40px 60px",textAlign:"center",maxWidth:400}}>
          <div style={{fontSize:40,marginBottom:16,animation:"spin 1.2s linear infinite",display:"inline-block"}}>📄</div>
          <div style={{fontSize:18,fontWeight:700,color:txt,marginBottom:8,fontFamily:display}}>Generating Trading Diary</div>
          <div style={{fontSize:12,color:txt2,marginBottom:24,fontFamily:mono}}>
            {apiKey ? 'Calling Claude AI for psychological analysis…' : 'Building your Word document…'}
          </div>
          <div style={{height:4,background:bdr,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",background:accent,borderRadius:2,animation:"scanBar 1.5s ease-in-out infinite"}}/>
          </div>
          <div style={{fontSize:10,color:txt3,marginTop:12}}>A save dialog will appear when ready</div>
        </div>
      </div>
    )}

    {/* ── Diary Result Toast ── */}
    {diaryResult && !diaryLoading && (
      <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:diaryResult.success?`rgba(20,241,149,0.15)`:`rgba(255,45,85,0.15)`,border:`1px solid ${diaryResult.success?grn:red}`,color:txt,borderRadius:4,padding:"12px 18px",fontSize:13,fontWeight:600,fontFamily:mono,boxShadow:`0 0 24px ${diaryResult.success?"rgba(20,241,149,0.3)":"rgba(255,45,85,0.3)"}`,maxWidth:360}}>
        {diaryResult.success
          ? `✅ Diary saved successfully`
          : `❌ ${diaryResult.reason === 'cancelled' ? 'Save cancelled' : diaryResult.error || 'Failed to generate'}`
        }
        {diaryResult.success && diaryResult.filePath && (
          <div style={{fontSize:10,opacity:0.8,marginTop:4,wordBreak:"break-all"}}>{diaryResult.filePath}</div>
        )}
      </div>
    )}

    {showTweet&&<TweetModal
      draft={tweetDraft}
      onTextChange={t=>setTweetDraft(d=>({...d,text:t}))}
      onClose={()=>{setShowTweet(false);setTweetDraft(null);}}
      onPost={publishTweet}
      posting={tweetPosting}
    />}
      {/* ── SERVER TAB ── */}
      {tab === "server" && <div style={{...C.page, gap:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,padding:"0 2px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:grn,boxShadow:`0 0 6px ${grn}`,display:"inline-block"}}/>
            <span style={{fontSize:11,fontWeight:700,color:txt2,textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:display}}>Backend Server Logs</span>
            <span style={{fontSize:9,color:txt3,border:`1px solid ${bdr}`,padding:"1px 6px",borderRadius:2}}>{serverLogs.length} lines</span>
          </div>
          <button type="button" onClick={()=>setServerLogs([])} style={{fontSize:9,padding:"3px 10px",background:elevated,border:`1px solid ${bdr2}`,color:txt3,borderRadius:3,cursor:"pointer",fontFamily:mono}}>Clear</button>
        </div>
        <div style={{flex:1,overflowY:"auto",background:bg,border:`1px solid ${bdr}`,borderRadius:4,padding:"8px 12px",fontFamily:mono,fontSize:11}}>
          {serverLogs.length === 0
            ? <div style={{color:txt3,fontSize:10,fontStyle:"italic",padding:"20px 0",textAlign:"center"}}>No logs yet &mdash; backend output appears here in real time.</div>
            : serverLogs.map((line, i) => {
                const isWarn = line.includes('ERROR') || line.includes('error') || line.startsWith('⚠');
                const isInfo = line.includes('INFO');
                const col = isWarn ? red : isInfo ? grn : txt2;
                return (
                  <div key={i} style={{padding:"2px 0",borderBottom:`1px solid rgba(255,255,255,0.02)`,color:col,lineHeight:1.6}}>
                    {line}
                  </div>
                );
              })
          }
          <div ref={serverLogEndRef}/>
        </div>
      </div>}

    </div>{/* end content wrapper */}
    </div>
  );
}