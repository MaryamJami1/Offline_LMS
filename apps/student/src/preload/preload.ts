import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type ShellState, type StudentBridge } from '../bridge.js';

/**
 * The only thing the screens can reach: `window.lingualab`. A sandboxed
 * preload may load nothing but Electron, so the build bundles this into one
 * CommonJS file (vite.preload.config.ts).
 */
const bridge: StudentBridge = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState(listener) {
    const forward = (_event: unknown, state: ShellState) => listener(state);
    ipcRenderer.on(IPC.state, forward);
    return () => ipcRenderer.removeListener(IPC.state, forward);
  },
  onExitRequested(listener) {
    const forward = () => listener();
    ipcRenderer.on(IPC.exitRequested, forward);
    return () => ipcRenderer.removeListener(IPC.exitRequested, forward);
  },
  branding: () => ipcRenderer.invoke(IPC.branding),
  login: (username, password) => ipcRenderer.invoke(IPC.login, username, password),
  changePassword: (current, next) => ipcRenderer.invoke(IPC.changePassword, current, next),
  logout: () => ipcRenderer.invoke(IPC.logout),
  exit: (pin) => ipcRenderer.invoke(IPC.exit, pin),
};

contextBridge.exposeInMainWorld('lingualab', bridge);
