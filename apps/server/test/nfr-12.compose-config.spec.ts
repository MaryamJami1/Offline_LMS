import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const infraDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'infra');
const composeFile = join(infraDir, 'docker-compose.yml');

// Passed to compose explicitly instead of being read from infra/.env, so this
// test says the same thing on a developer laptop and in CI.
const settings = {
  LAN_IP: '192.168.10.2',
  POSTGRES_USER: 'lingualab',
  POSTGRES_PASSWORD: 'test-only-password',
  POSTGRES_DB: 'lingualab',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'test-only-secret-at-least-32-characters',
} as const;

interface ComposeService {
  image?: string;
  command?: string[];
  environment?: Record<string, string>;
  extra_hosts?: string[] | Record<string, string>;
}

interface ComposeConfig {
  services: Record<string, ComposeService | undefined>;
}

// infra/.env is git-ignored and absent in CI, so every call points --env-file at
// an empty file: interpolation then comes only from the environment below.
let emptyEnvFile: string;

async function resolveCompose(env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync(
    'docker',
    ['compose', '--env-file', emptyEnvFile, '-f', composeFile, 'config', '--format', 'json'],
    { env },
  );
  return stdout;
}

describe('NFR-12 infra/docker-compose.yml resolves safely', () => {
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lingualab-compose-'));
    emptyEnvFile = join(dir, 'empty.env');
    await writeFile(emptyEnvFile, '');
  });

  it('refuses to resolve when the database password is missing', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...settings };
    delete env['POSTGRES_PASSWORD'];

    await expect(resolveCompose(env)).rejects.toThrow(/POSTGRES_PASSWORD/);
  });

  it('refuses to resolve when the LiveKit secret is missing', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...settings };
    delete env['LIVEKIT_API_SECRET'];

    await expect(resolveCompose(env)).rejects.toThrow(/LIVEKIT_API_SECRET/);
  });

  it('refuses to resolve when the LAN address is missing', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...settings };
    delete env['LAN_IP'];

    await expect(resolveCompose(env)).rejects.toThrow(/LAN_IP/);
  });

  it('gives LiveKit its keys through the environment', async () => {
    const config = JSON.parse(
      await resolveCompose({ ...process.env, ...settings }),
    ) as ComposeConfig;

    expect(config.services['livekit']?.environment?.['LIVEKIT_KEYS']).toBe(
      `${settings.LIVEKIT_API_KEY}: ${settings.LIVEKIT_API_SECRET}`,
    );
  });

  it('tells LiveKit the LAN address to advertise', async () => {
    const config = JSON.parse(
      await resolveCompose({ ...process.env, ...settings }),
    ) as ComposeConfig;

    expect(config.services['livekit']?.command).toEqual(
      expect.arrayContaining(['--node-ip', settings.LAN_IP]),
    );
  });

  it('gives Caddy the LAN address its site block reads', async () => {
    const config = JSON.parse(
      await resolveCompose({ ...process.env, ...settings }),
    ) as ComposeConfig;

    expect(config.services['caddy']?.environment?.['LAN_IP']).toBe(settings.LAN_IP);
  });
});

describe('NFR-12 infra/livekit.yaml', () => {
  it('holds no ${VAR} placeholders, which livekit-server does not expand', async () => {
    const yaml = await readFile(join(infraDir, 'livekit.yaml'), 'utf8');
    const settings = yaml
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    expect(settings).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/);
  });
});

describe('NFR-12 infra/Caddyfile upstreams', () => {
  it('proxies to the other containers, never to the proxy container itself', async () => {
    const caddyfile = await readFile(join(infraDir, 'Caddyfile'), 'utf8');

    expect(caddyfile).not.toMatch(/reverse_proxy\s+localhost:/);
    expect(caddyfile).toMatch(/reverse_proxy\s+livekit:7880/);
    expect(caddyfile).toMatch(/reverse_proxy\s+server:3000/);
  });
});
