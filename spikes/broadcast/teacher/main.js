const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain } = require('electron');
const { loadConfig, mintToken } = require('../token');

// Chromium will not start an AudioContext before the window has been clicked,
// which would leave the microphone level meter flat. Electron is a desktop app,
// not a web page, so that gesture rule buys nothing here.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Single-PC testing aid: SPIKE_FAKE_MIC=1 swaps the microphone for Chromium's
// built-in 440 Hz tone, so the voice path can be exercised on one machine
// without a headset and without the speakers howling back into the mic.
if (process.env['SPIKE_FAKE_MIC'] === '1') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
}

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
      // Chromium stops animation frames in a window it thinks nobody can see,
      // which freezes the level meter. Both windows are on top on their own PC
      // in the real run, but not when both are tested on one machine.
      backgroundThrottling: false,
    },
  });

  // The spike is run from a terminal on two PCs with no devtools open, so
  // renderer logs are echoed to stdout.
  win.webContents.on('console-message', (details) => {
    console.log(`[renderer] ${details.message}`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
