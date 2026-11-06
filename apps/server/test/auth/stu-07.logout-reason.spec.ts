import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';
import { postLogin } from '../support/lab-pc.js';

/**
 * STU-07: the student app logs out by hand or after 30 idle minutes, and the
 * seat's history says which (`device_logins.logout_reason`). End class is the
 * server's own to record with LAB-03, so the app cannot send it.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function login(): Promise<Tokens> {
  const res = await postLogin(app, { username: 'S-1001', password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return res.body as Tokens;
}

function logout(tokens: Tokens, extra: object = {}) {
  return request(app.getHttpServer())
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${tokens.accessToken}`)
    .send({ refreshToken: tokens.refreshToken, ...extra });
}

async function reasonRecorded(): Promise<string | null> {
  return (await prisma.deviceLogin.findFirstOrThrow()).logoutReason;
}

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-11-06T09:00:00.000Z'));
  await createAccount(prisma, { username: 'S-1001', role: 'student', fullName: 'Ayesha Khan' });
});

afterAll(async () => {
  await app.close();
});

describe('STU-07 the reason a student logged out', () => {
  it('is manual when the app gives none', async () => {
    expect((await logout(await login())).status).toBe(204);
    expect(await reasonRecorded()).toBe('manual');
  });

  it('is manual when the student pressed Log out', async () => {
    await logout(await login(), { reason: 'manual' });
    expect(await reasonRecorded()).toBe('manual');
  });

  it('is idle after 30 minutes without input', async () => {
    expect((await logout(await login(), { reason: 'idle' })).status).toBe(204);
    expect(await reasonRecorded()).toBe('idle');
  });

  it('cannot be End class, which only the server records', async () => {
    const tokens = await login();

    const res = await logout(tokens, { reason: 'class_end' });

    expect(res.status).toBe(400);
    expect((await prisma.deviceLogin.findFirstOrThrow()).loggedOutAt).toBeNull();
  });
});
