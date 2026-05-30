'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs   = require('fs');

// ── Keep userData on D: drive ────────────────────────────────────────────────
app.setPath('userData', path.join(__dirname, '..', '.electron-data'));

const BACKEND_PORT  = 3000;
const RENDERER_PORT = 4173;   // tiny file server for dist/

// ── Smart backend path ────────────────────────────────────────────────────────
const SIBLING_BACKEND = path.join(__dirname, '..', '..', 'backend', 'server.js');
const PACKED_BACKEND  = path.join(process.resourcesPath || '', 'backend', 'server.js');
const BACKEND_PATH    = fs.existsSync(SIBLING_BACKEND) ? SIBLING_BACKEND : PACKED_BACKEND;
const DIST_DIR        = path.join(__dirname, '..', 'dist');
const isDev           = process.env.ELECTRON_DEV === '1';

let backendProcess  = null;
let fileServer      = null;
let mainWindow      = null;

// ── MIME helper ───────────────────────────────────────────────────────────────
function mime(fp) {
  const m = { '.js':'application/javascript','.mjs':'application/javascript',
              '.css':'text/css','.html':'text/html','.png':'image/png',
              '.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json',
              '.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf' };
  return m[path.extname(fp).toLowerCase()] || 'application/octet-stream';
}

// ── Tiny static file server for dist/ ────────────────────────────────────────
function startFileServer() {
  fileServer = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/' || p === '') p = '/index.html';
    const fullPath = path.join(DIST_DIR, p);
    try {
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': mime(fullPath), 'Access-Control-Allow-Origin': '*' });
      res.end(content);
    } catch {
      // SPA fallback → index.html
      try {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(path.join(DIST_DIR, 'index.html')));
      } catch {
        res.writeHead(404); res.end('Not found');
      }
    }
  });
  fileServer.listen(RENDERER_PORT, '127.0.0.1', () => {
    console.log(`[main] File server → http://localhost:${RENDERER_PORT}`);
  });
}

// ── Kill any process already on port 3000 ────────────────────────────────────
function freePort() {
  try {
    const { execSync } = require('child_process');
    const out = execSync(`netstat -ano | findstr :${BACKEND_PORT}`, { encoding:'utf8', timeout:3000 });
    const m = out.match(/LISTENING\s+(\d+)/);
    if (m && m[1]) {
      execSync(`taskkill /F /PID ${m[1]}`, { timeout:3000 });
      console.log(`[main] Freed port ${BACKEND_PORT} (killed PID ${m[1]})`);
    }
  } catch {}
}

// ── Start backend with auto-respawn on crash ──────────────────────────────────
let _respawnEnabled  = true;   // disabled on intentional app quit
let _respawnAttempts = 0;
const MAX_RESPAWNS   = 5;      // stop after 5 consecutive crashes
const RESPAWN_DELAY  = 3000;   // 3 seconds between restart attempts

function startBackend() {
  if (!_respawnEnabled) return;
  freePort();
  console.log('[main] Starting backend:', BACKEND_PATH, `(attempt ${_respawnAttempts + 1})`);

  backendProcess = spawn('node', [BACKEND_PATH], {
    cwd:   path.dirname(BACKEND_PATH),
    env:   { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', d => process.stdout.write('[backend] ' + d));
  backendProcess.stderr.on('data', d => process.stderr.write('[backend] ' + d));

  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;
    if (!_respawnEnabled) return;  // intentional shutdown — don't respawn

    if (code === 0 || signal === 'SIGTERM') {
      console.log('[main] Backend stopped cleanly');
      return;
    }

    // Unexpected crash — auto-respawn
    _respawnAttempts++;
    if (_respawnAttempts > MAX_RESPAWNS) {
      console.error(`[main] Backend crashed ${MAX_RESPAWNS} times — stopping auto-respawn. Check logs.`);
      // Notify user via window if it exists
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(
          `console.error('[ELECTRON] Backend crashed too many times — restart the app')`
        ).catch(() => {});
      }
      return;
    }

    console.warn(`[main] ⚠️ Backend crashed (code=${code}) — restarting in ${RESPAWN_DELAY/1000}s (${_respawnAttempts}/${MAX_RESPAWNS})`);
    setTimeout(() => {
      if (_respawnEnabled) startBackend();
    }, RESPAWN_DELAY);
  });

  // Reset crash counter if backend runs successfully for 30s
  backendProcess.on('spawn', () => {
    setTimeout(() => { if (backendProcess) _respawnAttempts = 0; }, 30_000);
  });
}

// ── Health check loop ─────────────────────────────────────────────────────────
async function waitForBackend(retries = 30, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`http://localhost:${BACKEND_PORT}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) { console.log('[main] Backend ready ✓'); return; }
    } catch {}
    await new Promise(r => setTimeout(r, delay));
  }
  console.warn('[main] Backend did not respond in time — opening app anyway');
}

// ── Splash screen ─────────────────────────────────────────────────────────────
let splashWindow = null;
function createSplash() {
  splashWindow = new BrowserWindow({
    width:  420,
    height: 470,
    frame:       false,
    transparent: true,          // removes solid background so corners are truly clear
    resizable:   false,
    alwaysOnTop: true,
    hasShadow:   true,
    icon: path.join(__dirname, '..', 'public', 'dima_trading_os_icon_256.png'),
    webPreferences: { contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

// ── First-run check ───────────────────────────────────────────────────────────
function isFirstRun() {
  const settingsFile = path.join(app.getPath('userData'), 'setup.json');
  return !fs.existsSync(settingsFile);
}

function markSetupComplete(data = {}) {
  const settingsFile = path.join(app.getPath('userData'), 'setup.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ ...data, setupDate: new Date().toISOString() }), 'utf8');
}

// ── Main window ───────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0d1117',
    show: false,   // hidden until ready-to-show
    icon: path.join(__dirname, '..', 'public', 'dima_trading_os_icon_256.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    autoHideMenuBar: true,
  });

  const url = isDev
    ? `http://localhost:5173`
    : `http://localhost:${RENDERER_PORT}`;

  console.log('[main] Loading:', url);
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      closeSplash();
      mainWindow.show();
      mainWindow.focus();
    }, 600);  // brief pause so splash doesn't flash off instantly
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();
  if (!isDev) startFileServer();
  startBackend();
  await waitForBackend();

  // First-run setup on clean install (no personal data mode)
  if (isFirstRun() && !isDev) {
    closeSplash();
    const setupWin = new BrowserWindow({
      width: 440, height: 560, resizable: false, frame: false,
      transparent: false,
      backgroundColor: '#0d1117',
      icon: path.join(__dirname, '..', 'public', 'dima_trading_os_icon_256.png'),
      webPreferences: { contextIsolation: true },
    });
    setupWin.loadFile(path.join(__dirname, 'firstrun.html'));

    // Poll for setup completion via URL hash
    const checkSetup = setInterval(async () => {
      try {
        const url = setupWin.webContents.getURL();
        const hash = decodeURIComponent(url.split('#')[1] || '');
        if (!hash) return;
        const data = JSON.parse(hash);
        if (data.setup) {
          clearInterval(checkSetup);
          markSetupComplete(data);

          // Save initial config to backend
          const saves = [];
          if (data.apikey) {
            saves.push(fetch(`http://localhost:${BACKEND_PORT}/api/trades/settings/api_key_hint`, {
              method:'PUT', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ value: data.apikey }),
            }));
          }
          if (data.username) {
            saves.push(fetch(`http://localhost:${BACKEND_PORT}/api/trades/settings/username`, {
              method:'PUT', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ value: data.username }),
            }));
          }
          await Promise.all(saves.map(p => p.catch(() => {})));

          setupWin.close();
          createWindow();
        }
      } catch {}
    }, 500);
  } else {
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  _respawnEnabled = false;   // stop auto-respawn before killing
  if (backendProcess) { console.log('[main] Killing backend'); backendProcess.kill('SIGTERM'); }
  if (fileServer)     { fileServer.close(); }
});

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
ipcMain.handle('get-version',   ()       => app.getVersion());
ipcMain.handle('backend-status', () => ({
  running: backendProcess !== null && !backendProcess.killed,
  port: BACKEND_PORT,
}));

// ── Trading Diary Generator ───────────────────────────────────────────────────
ipcMain.handle('generate-diary', async (_, payload) => {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  } = require('docx');

  const { positions, closed, stats, eloRank, currentElo, calibration, month, apiKey, chatHistory = [] } = payload;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };

  function cell(text, opts = {}) {
    return new TableCell({
      borders,
      width: { size: opts.width || 1500, type: WidthType.DXA },
      shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({
          text: String(text),
          bold: opts.bold || false,
          size: opts.size || 18,
          color: opts.color || '000000',
          font: 'Arial',
        })],
      })],
    });
  }

  function hdr(text) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text, bold: true, size: 26, font: 'Arial', color: '1a1a2e' })],
      spacing: { before: 300, after: 100 },
    });
  }

  function p(text, opts = {}) {
    return new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: opts.before || 60, after: opts.after || 60 },
      children: [new TextRun({ text, size: opts.size || 20, bold: opts.bold || false, font: 'Arial', color: opts.color || '000000' })],
    });
  }

  // Filter trades for selected month
  const monthTrades = month
    ? closed.filter(t => t.date && t.date.startsWith(month))
    : closed;

  const wins   = monthTrades.filter(t => t.pnl > 0);
  const losses = monthTrades.filter(t => t.pnl <= 0);
  const netPnl = monthTrades.reduce((s, t) => s + t.pnl, 0);
  const winRate = monthTrades.length ? (wins.length / monthTrades.length * 100).toFixed(1) : 0;
  const pf = losses.length && wins.length
    ? (wins.reduce((s,t)=>s+t.pnl,0) / Math.abs(losses.reduce((s,t)=>s+t.pnl,0))).toFixed(2)
    : '—';

  const monthLabel = month
    ? new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })
    : 'All Time';

  // ── Build document ─────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [

        // Title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: 'TRADING DIARY', bold: true, size: 52, font: 'Arial', color: '0d1117' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: monthLabel, size: 32, font: 'Arial', color: '3fb950' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 400 },
          children: [new TextRun({ text: `Generated ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}`, size: 20, font: 'Arial', color: '666666', italics: true })],
        }),

        // ── ELO Rank ────────────────────────────────────────────────────────
        hdr('ELO Rank & Calibration'),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2340, 2340, 2340, 2340],
          rows: [
            new TableRow({ children: [
              cell('ELO Rating', { bold:true, shade:'1a1a2e', color:'ffffff', width:2340 }),
              cell('Rank',       { bold:true, shade:'1a1a2e', color:'ffffff', width:2340 }),
              cell('Calibration Score', { bold:true, shade:'1a1a2e', color:'ffffff', width:2340 }),
              cell('Confidence', { bold:true, shade:'1a1a2e', color:'ffffff', width:2340 }),
            ]}),
            new TableRow({ children: [
              cell(currentElo?.toLocaleString() || '—', { bold:true, center:true, size:24, width:2340 }),
              cell(eloRank?.name || '—', { center:true, width:2340 }),
              cell(calibration ? `${calibration.finalScore}/100` : 'Not calibrated', { center:true, width:2340 }),
              cell(calibration?.confidence || '—', { center:true, width:2340 }),
            ]}),
          ],
        }),

        ...(calibration ? [
          p(''),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2340, 2340, 2340, 2340],
            rows: [
              new TableRow({ children: [
                cell('Performance ×40%', { shade:'f5f5f5', bold:true, width:2340 }),
                cell('Discipline ×25%',  { shade:'f5f5f5', bold:true, width:2340 }),
                cell('Consistency ×20%', { shade:'f5f5f5', bold:true, width:2340 }),
                cell('Drawdown ×15%',    { shade:'f5f5f5', bold:true, width:2340 }),
              ]}),
              new TableRow({ children: [
                cell(calibration.performance, { center:true, width:2340 }),
                cell(calibration.discipline,  { center:true, width:2340 }),
                cell(calibration.consistency, { center:true, width:2340 }),
                cell(calibration.drawdown,    { center:true, width:2340 }),
              ]}),
            ],
          }),
        ] : []),

        // ── Performance Summary ──────────────────────────────────────────────
        hdr(`Performance Summary — ${monthLabel}`),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1560, 1560, 1560, 1560, 1560, 1560],
          rows: [
            new TableRow({ children: [
              cell('Trades',   { bold:true, shade:'1a1a2e', color:'ffffff', width:1560 }),
              cell('Net P&L',  { bold:true, shade:'1a1a2e', color:'ffffff', width:1560 }),
              cell('Win Rate', { bold:true, shade:'1a1a2e', color:'ffffff', width:1560 }),
              cell('P. Factor',{ bold:true, shade:'1a1a2e', color:'ffffff', width:1560 }),
              cell('Wins',     { bold:true, shade:'1a1a2e', color:'ffffff', width:1560 }),
              cell('Losses',   { bold:true, shade:'1a1a2e', color:'ffffff', width:1560 }),
            ]}),
            new TableRow({ children: [
              cell(monthTrades.length, { center:true, bold:true, width:1560 }),
              cell((netPnl>=0?'+':'')+'$'+Math.abs(netPnl).toFixed(2), {
                center:true, bold:true, width:1560,
                color: netPnl >= 0 ? '238636' : 'f85149',
              }),
              cell(winRate+'%',  { center:true, width:1560 }),
              cell(pf,           { center:true, width:1560 }),
              cell(wins.length,  { center:true, color:'238636', width:1560 }),
              cell(losses.length,{ center:true, color:'f85149', width:1560 }),
            ]}),
          ],
        }),

        // ── Open Positions ───────────────────────────────────────────────────
        hdr('Open Positions'),
        ...(positions.length === 0 ? [p('No open positions.')] : [
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [1000, 700, 1000, 1000, 1000, 2000, 1660],
            rows: [
              new TableRow({ children: [
                cell('Ticker',  { bold:true, shade:'1a1a2e', color:'ffffff', width:1000 }),
                cell('Shares',  { bold:true, shade:'1a1a2e', color:'ffffff', width:700 }),
                cell('Entry',   { bold:true, shade:'1a1a2e', color:'ffffff', width:1000 }),
                cell('Stop',    { bold:true, shade:'1a1a2e', color:'ffffff', width:1000 }),
                cell('Target',  { bold:true, shade:'1a1a2e', color:'ffffff', width:1000 }),
                cell('Pattern', { bold:true, shade:'1a1a2e', color:'ffffff', width:2000 }),
                cell('Notes',   { bold:true, shade:'1a1a2e', color:'ffffff', width:1660 }),
              ]}),
              ...positions.map(pos => new TableRow({ children: [
                cell(pos.ticker,       { bold:true, width:1000 }),
                cell(pos.shares,       { center:true, width:700 }),
                cell('$'+pos.entry,    { center:true, width:1000 }),
                cell('$'+(pos.stop||'—'), { center:true, color:'f85149', width:1000 }),
                cell('$'+(pos.t1||'—'),   { center:true, color:'238636', width:1000 }),
                cell(pos.pattern||'—', { width:2000 }),
                cell(pos.notes||'—',   { width:1660 }),
              ]})),
            ],
          }),
        ]),

        // ── Trade History ────────────────────────────────────────────────────
        hdr(`Trade History — ${monthLabel}`),
        ...(monthTrades.length === 0 ? [p('No trades for this period.')] : [
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [900, 700, 900, 900, 1000, 1800, 1700, 460],
            rows: [
              new TableRow({ children: [
                cell('Date',    { bold:true, shade:'1a1a2e', color:'ffffff', width:900 }),
                cell('Ticker',  { bold:true, shade:'1a1a2e', color:'ffffff', width:700 }),
                cell('Entry',   { bold:true, shade:'1a1a2e', color:'ffffff', width:900 }),
                cell('Exit',    { bold:true, shade:'1a1a2e', color:'ffffff', width:900 }),
                cell('P&L',     { bold:true, shade:'1a1a2e', color:'ffffff', width:1000 }),
                cell('Pattern', { bold:true, shade:'1a1a2e', color:'ffffff', width:1800 }),
                cell('Notes',   { bold:true, shade:'1a1a2e', color:'ffffff', width:1700 }),
                cell('W/L',     { bold:true, shade:'1a1a2e', color:'ffffff', width:460 }),
              ]}),
              ...monthTrades.map((t, i) => new TableRow({
                shading: i % 2 === 0 ? undefined : { fill: 'f9f9f9', type: ShadingType.CLEAR },
                children: [
                  cell(t.date||'—',            { width:900 }),
                  cell(t.ticker,               { bold:true, width:700 }),
                  cell('$'+t.entry?.toFixed(2),{ center:true, width:900 }),
                  cell('$'+t.exit?.toFixed(2), { center:true, width:900 }),
                  cell((t.pnl>=0?'+':'')+'$'+Math.abs(t.pnl).toFixed(2), {
                    bold:true, center:true, width:1000,
                    color: t.pnl >= 0 ? '238636' : 'f85149',
                  }),
                  cell(t.pattern||'—',         { width:1800 }),
                  cell(t.notes||t.rationale||'—', { width:1700 }),
                  cell(t.pnl >= 0 ? '✓' : '✗', {
                    center:true, bold:true, width:460,
                    color: t.pnl >= 0 ? '238636' : 'f85149',
                  }),
                ],
              })),
            ],
          }),
        ]),

        // ── Chat Conversations Log ────────────────────────────────────────────
        ...(chatHistory.length > 0 ? [
          hdr('Chat Conversations — App History'),
          p(`${chatHistory.length} messages from the in-app AI chat — ${monthLabel} only:`, { color:'555555', size:18 }),
          p(''),
          ...chatHistory.slice(0, 30).flatMap(m => [
            new Paragraph({
              spacing: { before: 100, after: 20 },
              children: [
                // Timestamp (if available)
                ...(m.ts ? [new TextRun({ text: `[${m.ts}]  `, size: 16, font: 'Arial', color: '999999', italics: true })] : []),
                new TextRun({
                  text: m.role === 'user' ? 'YOU: ' : 'CLAUDE: ',
                  bold: true, size: 18, font: 'Arial',
                  color: m.role === 'user' ? '1a6b3c' : '0d5aa7',
                }),
                new TextRun({
                  text: m.content.slice(0, 600) + (m.content.length > 600 ? '…' : ''),
                  size: 18, font: 'Arial', color: '333333',
                }),
              ],
            }),
          ]),
          p(''),
        ] : []),

        // ── AI Psychological Analysis ─────────────────────────────────────────
        ...(await (async () => {
          const EMOTIONAL_PATTERNS = new Set(['Emotional Buy','FOMO Entry','Averaging Down','No Clear Reason','No Pattern','','Revenge Trade']);
          const emoPats = ['Emotional Buy','FOMO Entry','Averaging Down','No Clear Reason','No Pattern',''];

          const tradeSummary = monthTrades.map(t => {
            const isEmo = t.emotional || emoPats.includes(t.pattern||'');
            const risk = (t.entry && t.stop) ? Math.abs(t.entry - t.stop) : null;
            const rMultiple = (risk && risk > 0) ? ((t.exit - t.entry) / risk).toFixed(2) : 'N/A';
            return `${t.date} | ${t.ticker} | ${t.pnl >= 0 ? 'WIN' : 'LOSS'} $${t.pnl?.toFixed(2)} | R=${rMultiple} | Pattern: ${t.pattern||'None'} | Type: ${isEmo ? 'EMOTIONAL' : 'TECHNICAL'}${t.rationale ? ` | Rationale: "${t.rationale}"` : ''}`;
          }).join('\n');

          const emoCount   = monthTrades.filter(t => t.emotional || emoPats.includes(t.pattern||'')).length;
          const techCount  = monthTrades.length - emoCount;
          const techWins   = monthTrades.filter(t => !emoPats.includes(t.pattern||'') && !t.emotional && t.pnl > 0).length;
          const techTotal  = monthTrades.filter(t => !emoPats.includes(t.pattern||'') && !t.emotional).length;
          const emoWins    = monthTrades.filter(t => (emoPats.includes(t.pattern||'') || t.emotional) && t.pnl > 0).length;

          if (!apiKey || monthTrades.length === 0) {
            return [
              hdr('Psychological Analysis'),
              p(`Technical trades: ${techCount} | Emotional trades: ${emoCount}`, { bold: true }),
              p(`Technical win rate: ${techTotal > 0 ? (techWins/techTotal*100).toFixed(0) : 0}% | Emotional win rate: ${emoCount > 0 ? (emoWins/emoCount*100).toFixed(0) : 0}%`),
              p('(Add your Anthropic API key in the Dashboard tab to get AI-generated conclusions in future diaries)', { color: '999999' }),
            ];
          }

          // Format chat history for the prompt — only include substantive exchanges
          const chatSummary = chatHistory.length > 0
            ? '\n\nCHAT CONVERSATIONS FROM THE APP (filtered to ' + monthLabel + '):\n' +
              chatHistory.map(m =>
                `[${m.ts ? m.ts + ' | ' : ''}${m.role === 'user' ? 'TRADER' : 'AI'}]: ${m.content}`
              ).join('\n')
            : '';

          const hasChatHistory = chatHistory.length > 0;

          const prompt = `You are a professional trading psychologist reviewing a trader's diary for ${monthLabel}.

TRADE DATA (${monthTrades.length} trades):
${tradeSummary}

STATISTICS:
- Technical trades: ${techCount} (win rate: ${techTotal > 0 ? (techWins/techTotal*100).toFixed(0) : 0}%)
- Emotional trades: ${emoCount} (win rate: ${emoCount > 0 ? (emoWins/emoCount*100).toFixed(0) : 0}%)
- Net P&L: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}
- Overall win rate: ${winRate}%
- ELO rank: ${eloRank?.name || 'Unknown'} (${currentElo} ELO)${chatSummary}

Write a BRUTALLY HONEST psychological analysis. Be direct, no fluff.${hasChatHistory ? ' Use the chat conversations to understand how the trader THINKS — their reasoning, doubts, and questions reveal as much as the trades themselves.' : ''}

Cover these 6 points as separate paragraphs:

1. TECHNICAL vs EMOTIONAL BREAKDOWN — what does the ${techCount} technical / ${emoCount} emotional split say about discipline?
2. WHAT TRIGGERS THE EMOTIONAL TRADES — specific patterns (FOMO? revenge? chasing? impatience?)${hasChatHistory ? ' Back this up with evidence from the chat conversations.' : ''}
3. STRONGEST SETUPS — which patterns deliver real edge, with numbers
4. WEAKEST PATTERNS — what to cut or fix immediately
5. ONE CRITICAL CHANGE for next period — the single highest-impact improvement
6. HONEST VERDICT — one sentence: is this trader building real edge or running on luck?${hasChatHistory ? '\n\nAlso: at the end, add a short paragraph called "WHAT THE CONVERSATIONS REVEAL" — based on the chat history, what does this trader say vs what they actually do? Any gaps between their stated plan and their behavior?' : ''}

Format: plain text paragraphs, no bullet points, no markdown headers. Write like a mentor who earns trust by telling the truth. Max 450 words.`;

          try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 600,
                messages: [{ role: 'user', content: prompt }],
              }),
              signal: AbortSignal.timeout(30000),
            });

            const aiData = await resp.json();
            const analysis = aiData.content?.[0]?.text || 'Analysis unavailable.';

            // Split AI response into paragraphs for the doc
            const paragraphs = analysis.split('\n\n').filter(Boolean).map(para =>
              p(para.trim(), { size: 20, before: 100, after: 100 })
            );

            return [
              hdr('Psychological Analysis — AI Assessment'),
              p(`Technical: ${techCount} trades (${techTotal > 0 ? (techWins/techTotal*100).toFixed(0) : 0}% WR)  |  Emotional: ${emoCount} trades (${emoCount > 0 ? (emoWins/emoCount*100).toFixed(0) : 0}% WR)`, { bold: true, size: 22, before: 0, after: 100 }),
              ...paragraphs,
              p('— Analysis generated by Claude AI —', { color: 'aaaaaa', size: 16, center: true, before: 100 }),
            ];
          } catch(err) {
            return [
              hdr('Psychological Analysis'),
              p(`Technical: ${techCount} trades | Emotional: ${emoCount} trades`, { bold: true }),
              p(`AI analysis failed: ${err.message}`, { color: 'f85149' }),
            ];
          }
        })()),

        // ── Lessons & Notes ──────────────────────────────────────────────────
        hdr('Lessons & Notes'),
        p('Write your key takeaways from this period:'),
        p('1. _______________________________________________'),
        p('2. _______________________________________________'),
        p('3. _______________________________________________'),
        p(''),
        p('What to improve next period:'),
        p('• ________________________________________________'),
        p('• ________________________________________________'),
        p(''),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 0 },
          children: [new TextRun({ text: '— DIMA TRADING OS —', size: 18, font: 'Arial', color: 'aaaaaa', italics: true })],
        }),
      ],
    }],
  });

  // ── Save dialog ────────────────────────────────────────────────────────────
  const defaultName = `Trading_Diary_${month || 'AllTime'}.docx`;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title:       'Save Trading Diary',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters:     [{ name: 'Word Document', extensions: ['docx'] }],
  });

  if (canceled || !filePath) return { success: false, reason: 'cancelled' };

  // ── Write file ─────────────────────────────────────────────────────────────
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return { success: true, filePath };
});
