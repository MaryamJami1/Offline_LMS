const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { loadConfig, mintToken } = require('../token');

let config;

ipcMain.handle('spike:session', async () => ({
  url: config.livekitWsUrl,
  room: config.roomName,
  token: await mintToken(config, 'student'),
}));

app.whenReady().then(() => {
  try {
    config = loadConfig();
  } catch (err) {
    dialog.showErrorBox('Broadcast spike — student', err.message);
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    fullscreen: true,
    backgroundColor: '#000000',
    title: 'Broadcast spike — student',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // The real student app is a locked kiosk; the spike stays escapable.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      app.quit();
    }
  });

  // The spike is run from a terminal on two PCs with no devtools open, so
  // renderer logs are echoed to stdout.
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[renderer] ${message}`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
