'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  choosePath: () => ipcRenderer.invoke('choose-data-path'),
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
});
