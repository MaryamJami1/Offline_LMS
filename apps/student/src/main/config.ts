import { join } from 'node:path';
import { z } from 'zod';

/**
 * Where the student app finds the server (STU-06; 07, Installing the student
 * app). The installer writes this file next to the app in Program Files, which
 * a student's standard Windows account cannot change.
 */
export const CONFIG_FILE_NAME = 'lingualab.config.json';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface StudentConfig {
  /** The lab server, like https://192.168.10.2, with no path and no trailing slash. */
  serverUrl: string;
}

type Env = Record<string, string | undefined>;

/**
 * The config file next to the app. Only a development run may point
 * elsewhere: an installed app ignores the variable, so a student cannot set it
 * to send the app to a server of their own.
 */
export function configPath(options: { packaged: boolean; exeDir: string; env: Env }): string {
  const override = options.env['LINGUALAB_CONFIG'];
  if (!options.packaged && override !== undefined && override !== '') {
    return override;
  }
  return join(options.exeDir, CONFIG_FILE_NAME);
}

const serverUrlSchema = z.string().transform((text, context) => {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    context.addIssue({ code: 'custom', message: 'is not an address' });
    return z.NEVER;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    context.addIssue({ code: 'custom', message: 'must start with https:// or http://' });
    return z.NEVER;
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    context.addIssue({ code: 'custom', message: 'must be the server alone, with no path' });
    return z.NEVER;
  }
  return url.origin;
});

const configSchema = z.object({ serverUrl: serverUrlSchema });

export function parseConfig(text: string): StudentConfig {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConfigError(`${CONFIG_FILE_NAME} is not valid JSON. Reinstall the student app.`);
  }
  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || 'serverUrl';
    throw new ConfigError(
      `${CONFIG_FILE_NAME}: "${where}" ${issue?.message ?? 'is missing'}. It should look like { "serverUrl": "https://192.168.10.2" }.`,
    );
  }
  return parsed.data;
}

export interface RunOptions {
  /** Kiosk window that only the admin PIN closes. */
  kiosk: boolean;
  /** Vite's dev server for the screens, or null for the built files. */
  rendererUrl: string | null;
}

/** An installed app is always in kiosk mode; only a development run may say otherwise. */
export function runOptions(options: { packaged: boolean; env: Env }): RunOptions {
  if (options.packaged) {
    return { kiosk: true, rendererUrl: null };
  }
  const rendererUrl = options.env['LINGUALAB_RENDERER_URL'];
  return {
    kiosk: options.env['LINGUALAB_KIOSK'] !== '0',
    rendererUrl: rendererUrl === undefined || rendererUrl === '' ? null : rendererUrl,
  };
}
