import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from '../../src/auth/auth.service.js';
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

function login(password: string, username = 'S-1001') {
  return request(app.getHttpServer()).post('/api/auth/login').send({ username, password });
}

async function failLogin(times: number): Promise<number[]> {
  const codes: number[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) {
    const res = await login('not-the-password');
    codes.push(res.status);
  }
  return codes;
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

describe('T-SEC-01 five wrong passwords lock the account for ten minutes', () => {
  it('locks the account on the fifth wrong password', async () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);

    const codes = await failLogin(MAX_FAILED_ATTEMPTS);

    expect(codes.slice(0, 4)).toEqual([401, 401, 401, 401]);
    const locked = await login('not-the-password');
    expect(locked.status).toBe(403);
    expect((locked.body as { error: { code: string } }).error.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses the right password while the account is locked', async () => {
    await failLogin(MAX_FAILED_ATTEMPTS);

    const res = await login(TEST_PASSWORD);

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('ACCOUNT_LOCKED');
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('says when the account unlocks, so the login screen can tell the student', async () => {
    expect(LOCK_MINUTES).toBe(10);
    await failLogin(MAX_FAILED_ATTEMPTS);

    const res = await login(TEST_PASSWORD);

    const details = (res.body as { error: { details: { unlocksAt?: string } } }).error.details;
    const unlocksAt = new Date(details.unlocksAt as string);
    expect(unlocksAt.getTime() - context.clock.now().getTime()).toBe(LOCK_MINUTES * 60_000);
  });

  it('still refuses one minute before the ten minutes are up', async () => {
    await failLogin(MAX_FAILED_ATTEMPTS);

    context.clock.advanceMinutes(LOCK_MINUTES - 1);

    expect((await login(TEST_PASSWORD)).status).toBe(403);
  });

  it('lets the student in again once the ten minutes have passed', async () => {
    await failLogin(MAX_FAILED_ATTEMPTS);

    context.clock.advanceMinutes(LOCK_MINUTES);
    const res = await login(TEST_PASSWORD);

    expect(res.status).toBe(200);
    const after = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginAttempts).toBe(0);
  });

  it('starts counting again after a lock has passed, rather than locking at once', async () => {
    await failLogin(MAX_FAILED_ATTEMPTS);
    context.clock.advanceMinutes(LOCK_MINUTES);

    const codes = await failLogin(1);

    expect(codes).toEqual([401]);
    const after = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
    expect(after.failedLoginAttempts).toBe(1);
  });

  it('forgives four wrong passwords when the fifth try is right', async () => {
    await failLogin(MAX_FAILED_ATTEMPTS - 1);

    const res = await login(TEST_PASSWORD);

    expect(res.status).toBe(200);
    const after = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
    expect(after.failedLoginAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it('counts attempts per account, so one student cannot lock another out', async () => {
    await createAccount(prisma, { username: 'S-1002', role: 'student', fullName: 'Bilal Ahmed' });

    await failLogin(MAX_FAILED_ATTEMPTS);

    expect((await login(TEST_PASSWORD, 'S-1002')).status).toBe(200);
  });

  it('counts attempts against the account whichever case the ID is typed in', async () => {
    await failLogin(MAX_FAILED_ATTEMPTS - 1);

    const res = await login('not-the-password', 's-1001');

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('ACCOUNT_LOCKED');
  });

  it('keeps no attempt count for a username that does not exist', async () => {
    const res = await login('not-the-password', 'nobody.here');

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('leaves the count of a deactivated account alone, since it cannot log in at all', async () => {
    await createAccount(prisma, {
      username: 'left.the.institute',
      role: 'teacher',
      status: 'inactive',
    });

    const res = await login('not-the-password', 'left.the.institute');

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('ACCOUNT_INACTIVE');
    const after = await prisma.user.findFirstOrThrow({ where: { username: 'left.the.institute' } });
    expect(after.failedLoginAttempts).toBe(0);
  });
});
