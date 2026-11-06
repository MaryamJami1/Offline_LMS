// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CONFIG_FILE_NAME, parseConfig } from './main/config.js';

/**
 * STU-06 and 07 (Installing the student app): what the lab PC installer must
 * do, checked against its electron-builder settings and its NSIS script.
 *
 * Running the installer itself needs Windows and an administrator, so that is
 * checked by hand on a lab PC (notes/stu-06-installer-check.md). These tests
 * hold the parts that must agree with the app: the file name and shape of the
 * config file, auto-start for every account, and an update that keeps the
 * server address.
 */

const file = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const builderSchema = z.object({
  productName: z.string(),
  files: z.array(z.string()),
  win: z.object({ artifactName: z.string() }),
  nsis: z.object({
    oneClick: z.boolean(),
    perMachine: z.boolean(),
    runAfterFinish: z.boolean(),
    allowToChangeInstallationDirectory: z.boolean(),
    include: z.string(),
  }),
});

const builder = builderSchema.parse(JSON.parse(file('../electron-builder.json')));
const script = file('../build/installer.nsh');
const pkg = z
  .object({ dependencies: z.record(z.string(), z.string()).optional() })
  .parse(JSON.parse(file('../package.json')));

describe('STU-06 the lab PC installer', () => {
  it('installs for every Windows account, as the administrator, and asks for the server', () => {
    expect(builder.nsis).toMatchObject({
      oneClick: false,
      perMachine: true,
      allowToChangeInstallationDirectory: false,
      include: 'build/installer.nsh',
    });
    expect(script).toContain('!macro customPageAfterChangeDir');
  });

  it('does not start the kiosk at the end, which would lock the administrator out', () => {
    expect(builder.nsis.runAfterFinish).toBe(false);
  });

  it('is named as the installation guide says', () => {
    expect(builder.win.artifactName).toBe('LinguaLab-Student-Setup-${version}.${ext}');
  });

  it('writes the config file next to the app, in the shape the app reads', () => {
    expect(script).toContain(`$INSTDIR\\${CONFIG_FILE_NAME}`);
    const written = /FileWrite \$0 '(.*)\$\\r\$\\n'/.exec(script)?.[1] ?? '';
    expect(written).toContain('$ServerUrl');

    const config = written.replace('$ServerUrl', 'https://192.168.10.2');

    expect(parseConfig(config)).toEqual({ serverUrl: 'https://192.168.10.2' });
  });

  it('takes the server on the command line for a silent install', () => {
    expect(script).toContain('${GetOptions} $R0 "/SERVER=" $ServerUrl');
  });

  it('keeps the server address when the app is updated', () => {
    // The old version's files, config included, are removed before the new
    // ones are copied, so the config is put aside first and put back after.
    expect(script).toMatch(
      /!macro customInit[\s\S]*CopyFiles \/SILENT "\$INSTDIR\\lingualab\.config\.json" "\$PLUGINSDIR\\previous\.config\.json"/,
    );
    expect(script).toMatch(
      /!macro customInstall[\s\S]*CopyFiles \/SILENT "\$PLUGINSDIR\\previous\.config\.json" "\$INSTDIR\\lingualab\.config\.json"/,
    );
  });

  it('starts the app with Windows for every account, and stops only on a real uninstall', () => {
    const run = 'HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "LinguaLab Student"';
    expect(script).toContain(`WriteRegStr ${run} '"$INSTDIR\\\${APP_EXECUTABLE_FILENAME}"'`);
    expect(script).toMatch(
      new RegExp(
        `!macro customUnInstall[\\s\\S]*\\$\\{IfNot\\} \\$\\{isUpdated\\}[\\s\\S]*DeleteRegValue ${run.replace(/\\/g, '\\\\')}`,
      ),
    );
  });

  it('adds the lab root certificate and the firewall rule', () => {
    expect(script).toContain('certutil.exe" -f -addstore Root');
    expect(script).toContain('advfirewall firewall add rule name="LinguaLab Student"');
  });

  it('ships only the built app, with nothing left to install at runtime', () => {
    expect(builder.files).toEqual(['dist/**/*', 'package.json']);
    // Vite bundles the main process, the preload and the screens, so the
    // installed app needs no node_modules.
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
