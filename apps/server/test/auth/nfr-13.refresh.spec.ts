import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { refreshResponseSchema } from '@lingualab/shared';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { STUDENT_REFRESH_MINUTES } from '../../src/auth/tokens.service.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;

function refresh(refreshToken: unknown) {
  return request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });
}

async function loginAs(username: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return res.body as { accessToken: string; refreshToken: string };
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
  await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher', fullName: 'Sara Iqbal' });
});

afterAll(async () => {
  await app.close();
});

describe('NFR-13 POST /api/auth/refresh', () => {
  it('returns a fresh access token and a fresh refresh token', async () => {
    const tokens = await loginAs('S-1001');

    context.clock.advanceMinutes(10);
    const res = await refresh(tokens.refreshToken);

    expect(res.status).toBe(200);
    const body = refreshResponseSchema.parse(res.body);
    expect(body.accessToken).not.toBe(tokens.accessToken);
    expect(body.refreshToken).not.toBe(tokens.refreshToken);
  });

  it('retires the token it was given, so a copied one is good only once', async () => {
    const tokens = await loginAs('S-1001');

    const first = await refresh(tokens.refreshToken);
    const again = await refresh(tokens.refreshToken);

    expect(first.status).toBe(200);
    expect(again.status).toBe(401);
    expect((again.body as { error: { code: string } }).error.code).toBe('INVALID_TOKEN');
  });

  it('keeps the retired token as a revoked row rather than deleting it', async () => {
    const tokens = await loginAs('S-1001');

    await refresh(tokens.refreshToken);

    const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.revokedAt).toEqual(context.clock.now());
    expect(rows[1]?.revokedAt).toBeNull();
  });

  it('lets the new token be used in turn', async () => {
    const tokens = await loginAs('S-1001');

    const second = (await refresh(tokens.refreshToken)).body as { refreshToken: string };
    const third = await refresh(second.refreshToken);

    expect(third.status).toBe(200);
  });

  it('moves a student token thirty minutes further each time it is used', async () => {
    const tokens = await loginAs('S-1001');

    context.clock.advanceMinutes(20);
    await refresh(tokens.refreshToken);

    const current = await prisma.refreshToken.findFirstOrThrow({ where: { revokedAt: null } });
    expect(current.expiresAt.getTime() - context.clock.now().getTime()).toBe(
      STUDENT_REFRESH_MINUTES * 60_000,
    );
  });

  it('refuses a student token left unused for thirty minutes', async () => {
    const tokens = await loginAs('S-1001');

    context.clock.advanceMinutes(STUDENT_REFRESH_MINUTES);
    const res = await refresh(tokens.refreshToken);

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_TOKEN');
  });

  it('still accepts a staff token a day later', async () => {
    const tokens = await loginAs('sara.iqbal');

    context.clock.advanceDays(1);

    expect((await refresh(tokens.refreshToken)).status).toBe(200);
  });

  it('refuses a staff token after seven days', async () => {
    const tokens = await loginAs('sara.iqbal');

    context.clock.advanceDays(7);

    expect((await refresh(tokens.refreshToken)).status).toBe(401);
  });

  it('refuses a token it never issued', async () => {
    await loginAs('S-1001');

    const res = await refresh('a-token-nobody-issued');

    expect(res.status).toBe(401);
  });

  it('refuses to refresh an account that has been deactivated', async () => {
    const tokens = await loginAs('S-1001');
    await prisma.user.updateMany({ where: { username: 'S-1001' }, data: { status: 'inactive' } });

    const res = await refresh(tokens.refreshToken);

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('refuses a request with no token at all', async () => {
    expect((await refresh(undefined)).status).toBe(400);
    expect((await refresh('')).status).toBe(400);
  });

  it('never sends back a password or a hash', async () => {
    const tokens = await loginAs('S-1001');

    const res = await refresh(tokens.refreshToken);

    const text = JSON.stringify(res.body);
    expect(text).not.toContain(TEST_PASSWORD);
    expect(text).not.toMatch(/argon2/i);
  });
});
