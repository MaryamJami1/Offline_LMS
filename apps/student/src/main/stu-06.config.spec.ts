// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { CONFIG_FILE_NAME, ConfigError, configPath, parseConfig, runOptions } from './config.js';

/**
 * STU-06: the student app finds the server through a config file next to the
 * app, which the installer writes into Program Files, where a student cannot
 * change it. Only a development run, never an installed app, may point at
 * another file or turn kiosk mode off, so a student cannot set an environment
 * variable to escape (docs/docs/06-security-and-data.md).
 */

const EXE_DIR = 'C:\\Program Files\\LinguaLab Student';

describe('STU-06 where the config file is', () => {
  it('sits next to the app', () => {
    expect(configPath({ packaged: true, exeDir: EXE_DIR, env: {} })).toBe(
      join(EXE_DIR, CONFIG_FILE_NAME),
    );
    expect(CONFIG_FILE_NAME).toBe('lingualab.config.json');
  });

  it('can be another file in a development run', () => {
    expect(
      configPath({ packaged: false, exeDir: EXE_DIR, env: { LINGUALAB_CONFIG: 'D:\\dev.json' } }),
    ).toBe('D:\\dev.json');
  });

  it('cannot be moved by an environment variable in an installed app', () => {
    expect(
      configPath({ packaged: true, exeDir: EXE_DIR, env: { LINGUALAB_CONFIG: 'D:\\evil.json' } }),
    ).toBe(join(EXE_DIR, CONFIG_FILE_NAME));
  });
});

describe('STU-06 what the config file says', () => {
  it('names the server, without a trailing slash', () => {
    expect(parseConfig('{ "serverUrl": "https://192.168.10.2/" }')).toEqual({
      serverUrl: 'https://192.168.10.2',
    });
    expect(parseConfig('{ "serverUrl": "http://192.168.10.48:3000" }')).toEqual({
      serverUrl: 'http://192.168.10.48:3000',
    });
  });

  it('refuses a file that is not JSON, or names no server', () => {
    for (const text of ['', 'not json', '{}', '{ "serverUrl": 42 }']) {
      expect(() => parseConfig(text), text).toThrow(ConfigError);
    }
  });

  it('refuses an address that is not a web server of ours', () => {
    for (const serverUrl of [
      'ftp://192.168.10.2',
      'file:///C:/x',
      'https://192.168.10.2/api',
      'nonsense',
    ]) {
      expect(() => parseConfig(JSON.stringify({ serverUrl })), serverUrl).toThrow(ConfigError);
    }
  });

  it('says what is wrong in words the admin can act on', () => {
    expect(() => parseConfig('{}')).toThrow(/lingualab\.config\.json/);
  });
});

describe('STU-06 kiosk mode', () => {
  it('is always on in an installed app', () => {
    expect(runOptions({ packaged: true, env: { LINGUALAB_KIOSK: '0' } })).toEqual({
      kiosk: true,
      rendererUrl: null,
    });
  });

  it('may be turned off, and the screens served by Vite, in a development run', () => {
    expect(
      runOptions({
        packaged: false,
        env: { LINGUALAB_KIOSK: '0', LINGUALAB_RENDERER_URL: 'http://localhost:5174' },
      }),
    ).toEqual({ kiosk: false, rendererUrl: 'http://localhost:5174' });
    expect(runOptions({ packaged: false, env: {} })).toEqual({ kiosk: true, rendererUrl: null });
  });
});
