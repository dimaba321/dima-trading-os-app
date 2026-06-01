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

  // Auto-update
  checkForUpdates:   () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),

  // Detect we're in Electron
  isElectron: true,
});
