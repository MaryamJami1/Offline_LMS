// The student app in development: the screens on Vite's dev server with hot
// reload, the main process and preload built once, and Electron in an
// ordinary window you can close. LINGUALAB_KIOSK=1 tries kiosk mode instead;
// the exit PIN then closes it as on a lab PC. The server address comes from
// lingualab.config.dev.json unless LINGUALAB_CONFIG names another file.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import electron from 'electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const inRoot = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

await build({ configFile: inRoot('vite.main.config.ts'), root, logLevel: 'warn' });
await build({ configFile: inRoot('vite.preload.config.ts'), root, logLevel: 'warn' });
// No `root` here: it would override the config's src/renderer, and the
// screens' index.html would not be found (a blank window).
const screens = await createServer({ configFile: inRoot('vite.renderer.config.ts') });
await screens.listen();
const rendererUrl = screens.resolvedUrls?.local[0];
if (rendererUrl === undefined) {
  throw new Error('Vite did not say where the screens are');
}

const child = spawn(String(electron), ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    LINGUALAB_KIOSK: process.env.LINGUALAB_KIOSK ?? '0',
    LINGUALAB_RENDERER_URL: rendererUrl,
    LINGUALAB_CONFIG: process.env.LINGUALAB_CONFIG ?? inRoot('lingualab.config.dev.json'),
  },
});
child.on('exit', async (code) => {
  await screens.close();
  process.exit(code ?? 0);
});
