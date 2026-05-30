'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

// ── Start backend ─────────────────────────────────────────────────────────────
function startBackend() {
  freePort();   // ensure port is free before spawning
  console.log('[main] Starting backend:', BACKEND_PATH);
  backendProcess = spawn('node', [BACKEND_PATH], {
    cwd:   path.dirname(BACKEND_PATH),
    env:   { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendProcess.stdout.on('data', d => process.stdout.write('[backend] ' + d));
  backendProcess.stderr.on('data', d => process.stderr.write('[backend] ' + d));
  backendProcess.on('exit', code => { console.log(`[main] Backend exited (${code})`); backendProcess = null; });
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
  createSplash();              // Show splash immediately
  if (!isDev) startFileServer();
  startBackend();
  await waitForBackend();
  createWindow();              // Load app in background, splash closes on ready

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
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
