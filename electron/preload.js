'use strict';
const { contextBridge, ipcRenderer, shell } = require('electron');

// Expose a safe, limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion:      ()      => ipcRenderer.invoke('get-version'),
  backendStatus:   ()      => ipcRenderer.invoke('backend-status'),

  // Open URLs in default system browser (not Electron window)
  openExternal:    (url)   => ipcRenderer.invoke('open-external', url),

  // Dev helper
  log:             (...a)  => ipcRenderer.send('log', ...a),

  // Trading Diary — generates .docx + native save dialog
  generateDiary: (payload) => ipcRenderer.invoke('generate-diary', payload),

  // Server logs
  openServerLogs:  () => ipcRenderer.invoke('open-server-logs'),
  getLogHistory:   () => ipcRenderer.invoke('get-log-history'),
  onServerLog:     (cb) => ipcRenderer.on('log', (_, line) => cb(line)),

  // Auto-updater
  checkForUpdates:       () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload:   () => ipcRenderer.invoke('start-update-download'),
  installUpdate:         () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable:     (cb) => ipcRenderer.on('update-available',     (_, d) => cb(d)),
  onUpdateProgress:      (cb) => ipcRenderer.on('update-progress',      (_, d) => cb(d)),
  onUpdateDownloaded:    (cb) => ipcRenderer.on('update-downloaded',     ()    => cb()),
  onUpdateNotAvailable:  (cb) => ipcRenderer.on('update-not-available',  ()    => cb()),
  onUpdateError:         (cb) => ipcRenderer.on('update-error',          (_, e) => cb(e)),

  // Auto-update
  checkForUpdates:   () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),

  // Detect we're in Electron
  isElectron: true,
});
