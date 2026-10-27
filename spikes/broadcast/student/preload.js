const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spike', {
  getSession: () => ipcRenderer.invoke('spike:session'),
});
