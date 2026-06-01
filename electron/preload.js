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

  // Server log window
  openServerLogs: () => ipcRenderer.invoke('open-server-logs'),

  // Detect we're in Electron
  isElectron: true,
});
