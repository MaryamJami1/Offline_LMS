import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connect } from 'node:tls';
import type { PeerCertificate } from 'node:tls';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const execFileAsync = promisify(execFile);

const composeFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'infra',
  'docker-compose.yml',
);

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://lingualab:lingualab@localhost:5432/lingualab';
const LIVEKIT_URL = process.env['LIVEKIT_URL'] ?? 'http://localhost:7880';

const START_THE_STACK =
  'The real services are not running. Start them with:\n' +
  '  docker compose -f infra/docker-compose.yml up -d';

interface ComposeProcess {
  Service: string;
  State: string;
}

interface ComposeConfig {
  services: Record<string, { environment?: Record<string, string> } | undefined>;
}

async function composePs(): Promise<ComposeProcess[]> {
  const { stdout } = await execFileAsync('docker', [
    'compose',
    '-f',
    composeFile,
    'ps',
    '--format',
    'json',
  ]);
  // One JSON object per line.
  return stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ComposeProcess);
}

// Read from the running stack's own settings rather than hard-coded, so the test
// follows LAN_IP in infra/.env.
async function labAddress(): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'compose',
    '-f',
    composeFile,
    'config',
    '--format',
    'json',
  ]);
  const config = JSON.parse(stdout) as ComposeConfig;
  const lanIp = config.services['caddy']?.environment?.['LAN_IP'];
  if (!lanIp) throw new Error('infra/docker-compose.yml does not give Caddy a LAN_IP');
  return lanIp;
}

// No servername is set: a lab PC reaching the server by IP sends no SNI, because
// TLS forbids an IP literal there. Caddy must still present a certificate.
function certificateWithoutSni(host: string, port: number): Promise<PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert);
    });
    socket.setTimeout(5000, () =>
      socket.destroy(new Error(`TLS handshake to ${host}:${port} timed out`)),
    );
    socket.on('error', reject);
  });
}

describe('NFR-12 the Docker stack is up', () => {
  it('runs postgres, livekit and caddy', async () => {
    const running = (await composePs())
      .filter((p) => p.State === 'running')
      .map((p) => p.Service)
      .sort();

    expect(running, START_THE_STACK).toEqual(['caddy', 'livekit', 'postgres']);
  });

  it('answers a real query on PostgreSQL 16', async () => {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query<{ one: number; version: string }>(
        'SELECT 1::int AS one, current_setting($1) AS version',
        ['server_version'],
      );

      expect(result.rows[0]?.one).toBe(1);
      expect(result.rows[0]?.version).toMatch(/^16\./);
    } finally {
      await client.end();
    }
  });

  it('answers on the LiveKit signalling port', async () => {
    const res = await fetch(LIVEKIT_URL, { signal: AbortSignal.timeout(5000) });

    expect(res.ok, START_THE_STACK).toBe(true);
  });
});

describe('NFR-13 Caddy serves the lab over HTTPS', () => {
  it('redirects plain HTTP to HTTPS', async () => {
    const lanIp = await labAddress();

    const res = await fetch(`http://${lanIp}/`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });

    expect(res.status, START_THE_STACK).toBe(308);
    expect(res.headers.get('location')).toBe(`https://${lanIp}/`);
  });

  it('completes a TLS handshake for a client that reaches it by IP, so sends no SNI', async () => {
    const lanIp = await labAddress();

    const cert = await certificateWithoutSni(lanIp, 443);

    expect(cert.issuer?.CN).toMatch(/Caddy/i);
  });

  it('presents a certificate valid for the lab address', async () => {
    const lanIp = await labAddress();

    const cert = await certificateWithoutSni(lanIp, 443);

    expect(cert.subjectaltname ?? '').toContain(lanIp);
  });
});

describe('NFR-12 GET /api/health against the real services', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports the database as ok, not merely as a known value', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.database, START_THE_STACK).toBe('ok');
  });

  it('reports LiveKit as ok, not merely as a known value', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.livekit, START_THE_STACK).toBe('ok');
  });

  it('reports real disk space, not the zeroed fallback', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.disk.total).toBeGreaterThan(0);
    expect(res.body.disk.free).toBeGreaterThan(0);
  });
});
