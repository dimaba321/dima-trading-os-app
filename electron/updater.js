'use strict';
const { autoUpdater } = require('electron-updater');
const { ipcMain }     = require('electron');

let _win = null;

function send(event, data) {
  if (_win && !_win.isDestroyed()) _win.webContents.send(event, data);
}

function initAutoUpdater(mainWindow) {
  _win = mainWindow;

  autoUpdater.autoDownload         = false;  // user must click Update
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update',  ()    => send('update-checking'));
  autoUpdater.on('update-not-available', ()    => send('update-not-available'));
  autoUpdater.on('error',                (e)   => send('update-error', e.message));
  autoUpdater.on('update-available',     (info)=> send('update-available', { version: info.version }));
  autoUpdater.on('download-progress',    (p)   => send('update-progress',  { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded',    ()    => send('update-downloaded'));

  // Renderer: start download
  ipcMain.handle('start-update-download', () => autoUpdater.downloadUpdate());
  // Renderer: quit and install
  ipcMain.handle('install-update', () => autoUpdater.quitAndInstall(false, true));
  // Renderer: manual check
  ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
}

// Silent background check 8s after app loads
function checkSilently() {
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
}

module.exports = { initAutoUpdater, checkSilently };
