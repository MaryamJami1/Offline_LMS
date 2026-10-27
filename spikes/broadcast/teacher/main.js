const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain } = require('electron');
const { loadConfig, mintToken } = require('../token');

let config;

ipcMain.handle('spike:session', async () => ({
  url: config.livekitWsUrl,
  room: config.roomName,
  token: await mintToken(config, 'teacher'),
}));

// desktopCapturer is main-process only since Electron 17, so the renderer asks
// for the source id over IPC and then opens the stream itself.
ipcMain.handle('spike:screen-source', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  if (sources.length === 0) throw new Error('No screen sources available');
  return sources[0].id;
});

app.whenReady().then(() => {
  try {
    config = loadConfig();
  } catch (err) {
    dialog.showErrorBox('Broadcast spike — teacher', err.message);
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 960,
    height: 680,
    title: 'Broadcast spike — teacher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // The spike is run from a terminal on two PCs with no devtools open, so
  // renderer logs are echoed to stdout.
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[renderer] ${message}`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
