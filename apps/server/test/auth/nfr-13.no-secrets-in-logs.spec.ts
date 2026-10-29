import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Logger } from '@nestjs/common';
import type { ArgumentsHost, INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { ErrorFilter } from '../../src/common/error.filter.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';

const NEW_PASSWORD = 'Karachi-2026-lab';

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;

/**
 * Everything the server prints while a block of work runs. The console logger
 * writes straight to these streams, so this is the log as the lab server's
 * operator would see it.
 */
async function printedWhile(work: () => Promise<void>): Promise<string> {
  const streams = [process.stdout, process.stderr];
  const originals = streams.map((stream) => stream.write.bind(stream));
  const captured: string[] = [];

  for (const stream of streams) {
    stream.write = ((chunk: unknown) => {
      captured.push(String(chunk));
      return true;
    }) as typeof stream.write;
  }

  try {
    await work();
  } finally {
    streams.forEach((stream, index) => {
      stream.write = originals[index] as typeof stream.write;
    });
  }

  return captured.join('');
}

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-10-29T09:00:00.000Z'));
  await createAccount(prisma, { username: 'S-1001', role: 'student', fullName: 'Ayesha Khan' });
});

afterAll(async () => {
  await app.close();
});

describe('NFR-13 nothing secret reaches the log', () => {
  it('prints no password, token or hash across a whole round of logins', async () => {
    let tokens = { accessToken: '', refreshToken: '' };

    const printed = await printedWhile(async () => {
      const server = app.getHttpServer();

      const login = await request(server)
        .post('/api/auth/login')
        .send({ username: 'S-1001', password: TEST_PASSWORD });
      tokens = login.body as typeof tokens;

      // A wrong password, a refresh, a logout, a password change and a body
      // that does not even parse: every way in which a secret is handled.
      await request(server)
        .post('/api/auth/login')
        .send({ username: 'S-1001', password: 'wrong-password-here' });
      const rotated = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });
      await request(server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ refreshToken: (rotated.body as { refreshToken: string }).refreshToken });
      await request(server)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
      await request(server)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });
    });

    const stored = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
    for (const secret of [
      TEST_PASSWORD,
      NEW_PASSWORD,
      'wrong-password-here',
      tokens.accessToken,
      tokens.refreshToken,
      stored.passwordHash,
    ]) {
      expect(secret).not.toBe('');
      expect(printed).not.toContain(secret);
    }
    expect(printed).not.toMatch(/argon2/i);
  });

  it('logs only the message when something unexpected goes wrong, never the request', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json }) }),
        getRequest: () => ({
          path: '/api/auth/login',
          headers: { authorization: 'Bearer an-access-token' },
          body: { username: 'S-1001', password: TEST_PASSWORD },
        }),
      }),
    } as unknown as ArgumentsHost;

    new ErrorFilter().catch(new Error('connect ECONNREFUSED 127.0.0.1:5432'), host);

    const text = JSON.stringify(logged.mock.calls);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(text).toContain('ECONNREFUSED');
    expect(text).not.toContain(TEST_PASSWORD);
    expect(text).not.toContain('an-access-token');
    logged.mockRestore();
  });

  it('tells the caller nothing about the failure beyond that it failed', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json }) }),
        getRequest: () => ({ body: { password: TEST_PASSWORD } }),
      }),
    } as unknown as ArgumentsHost;

    new ErrorFilter().catch(new Error(`bad password ${TEST_PASSWORD}`), host);

    expect(JSON.stringify(json.mock.calls)).not.toContain(TEST_PASSWORD);
    vi.restoreAllMocks();
  });
});
