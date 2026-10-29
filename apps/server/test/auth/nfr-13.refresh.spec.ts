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

/**
 * Rotation alone is not enough. If a refresh token is used a second time, one
 * of two things has happened: it was copied off a lab PC and the thief is
 * using it, or the app is replaying a token it should have thrown away. Either
 * way the server can no longer tell which holder is the real one, so it ends
 * every login of that account and the person logs in again.
 */
describe('NFR-13 a refresh token used twice', () => {
  it('ends the login that replaced it, not only the replayed token', async () => {
    const first = await loginAs('S-1001');
    const second = (await refresh(first.refreshToken)).body as { refreshToken: string };

    const replay = await refresh(first.refreshToken);
    const afterwards = await refresh(second.refreshToken);

    expect(replay.status).toBe(401);
    expect(afterwards.status).toBe(401);
    expect((afterwards.body as { error: { code: string } }).error.code).toBe('INVALID_TOKEN');
  });

  it('ends every other login of that account, not only the chain replayed', async () => {
    const laptop = await loginAs('sara.iqbal');
    const desktop = await loginAs('sara.iqbal');
    await refresh(laptop.refreshToken);

    await refresh(laptop.refreshToken);

    expect((await refresh(desktop.refreshToken)).status).toBe(401);
    const live = await prisma.refreshToken.findMany({ where: { revokedAt: null } });
    expect(live).toHaveLength(0);
  });

  it('leaves every other account logged in', async () => {
    const teacher = await loginAs('sara.iqbal');
    const student = await loginAs('S-1001');
    await refresh(teacher.refreshToken);

    await refresh(teacher.refreshToken);

    expect((await refresh(student.refreshToken)).status).toBe(200);
  });

  it('says no more than any other dead token would', async () => {
    const tokens = await loginAs('S-1001');
    await refresh(tokens.refreshToken);

    const replay = await refresh(tokens.refreshToken);

    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({
      error: {
        code: 'INVALID_TOKEN',
        message: 'This login has ended. Please log in again.',
        details: {},
      },
    });
  });

  it('counts a token revoked by logging out as a replay as well', async () => {
    const tokens = await loginAs('sara.iqbal');
    const other = await loginAs('sara.iqbal');
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken });

    await refresh(tokens.refreshToken);

    expect((await refresh(other.refreshToken)).status).toBe(401);
  });

  it('does not treat a token that merely ran out of time as a replay', async () => {
    const stale = await loginAs('sara.iqbal');
    context.clock.advanceDays(6);
    const current = await loginAs('sara.iqbal');
    context.clock.advanceDays(2);

    expect((await refresh(stale.refreshToken)).status).toBe(401);
    expect((await refresh(current.refreshToken)).status).toBe(200);
  });
});
