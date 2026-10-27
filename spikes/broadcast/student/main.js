const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { loadConfig, mintToken } = require('../token');

let config;

// Where config.json might live, best guess first. The portable build unpacks
// itself into a temp folder, so the .exe's own directory is NOT the USB drive —
// electron-builder passes the real one in PORTABLE_EXECUTABLE_DIR.
function configDirs() {
  const dirs = [];
  const portableDir = process.env['PORTABLE_EXECUTABLE_DIR'];
  if (portableDir) dirs.push(portableDir);
  dirs.push(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'));
  dirs.push(process.cwd());
  return [...new Set(dirs)];
}

// A double-clicked .exe has no terminal, so a startup failure has to leave a
// file behind or the user sees nothing but a dialog they cannot copy from.
function reportStartupError(message) {
  const target = configDirs()[0];
  const logPath = path.join(target, 'student-spike-error.log');
  try {
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n\n${message}\n`);
  } catch {
    // Read-only drive; the dialog is still shown.
  }
  dialog.showErrorBox('Broadcast spike — student', `${message}\n\nAlso written to:\n${logPath}`);
}

ipcMain.handle('spike:session', async () => ({
  url: config.livekitWsUrl,
  room: config.roomName,
  token: await mintToken(config, 'student'),
}));

app.whenReady().then(() => {
  try {
    config = loadConfig(configDirs());
  } catch (err) {
    reportStartupError(err.message);
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
  win.webContents.on('console-message', (details) => {
    console.log(`[renderer] ${details.message}`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
