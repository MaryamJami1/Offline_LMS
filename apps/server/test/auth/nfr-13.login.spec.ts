import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { loginResponseSchema } from '@lingualab/shared';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { STAFF_REFRESH_DAYS, STUDENT_REFRESH_MINUTES } from '../../src/auth/tokens.service.js';
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

function login(body: object) {
  return request(app.getHttpServer()).post('/api/auth/login').send(body);
}

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-10-29T09:00:00.000Z'));
});

afterAll(async () => {
  await app.close();
});

describe('NFR-13 POST /api/auth/login', () => {
  it('returns an access token, a refresh token and who logged in', async () => {
    const teacher = await createAccount(prisma, {
      username: 'sara.iqbal',
      role: 'teacher',
      fullName: 'Sara Iqbal',
    });

    const res = await login({ username: teacher.username, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const body = loginResponseSchema.parse(res.body);
    expect(body.user).toEqual({
      id: teacher.id,
      username: 'sara.iqbal',
      fullName: 'Sara Iqbal',
      role: 'teacher',
      mustChangePassword: false,
    });
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.refreshToken.length).toBeGreaterThanOrEqual(43);
  });

  it('never sends back the password or its hash', async () => {
    await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher' });

    const res = await login({ username: 'sara.iqbal', password: TEST_PASSWORD });

    const text = JSON.stringify(res.body);
    expect(text).not.toContain(TEST_PASSWORD);
    expect(text).not.toMatch(/argon2/i);
    expect(text).not.toMatch(/passwordHash/i);
  });

  it('keeps only the hash of the refresh token it handed out', async () => {
    await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher' });

    const res = await login({ username: 'sara.iqbal', password: TEST_PASSWORD });

    const stored = await prisma.refreshToken.findFirstOrThrow();
    const refreshToken = (res.body as { refreshToken: string }).refreshToken;
    expect(stored.tokenHash).not.toBe(refreshToken);
    expect(stored.tokenHash).toBe(createHash('sha256').update(refreshToken).digest('hex'));
    expect(stored.revokedAt).toBeNull();
  });

  it('gives staff seven days and a student thirty minutes', async () => {
    await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher' });
    await createAccount(prisma, { username: 'S-1001', role: 'student' });

    await login({ username: 'sara.iqbal', password: TEST_PASSWORD });
    await login({ username: 'S-1001', password: TEST_PASSWORD });

    const [staff, student] = await Promise.all([
      prisma.refreshToken.findFirstOrThrow({ where: { user: { role: 'teacher' } } }),
      prisma.refreshToken.findFirstOrThrow({ where: { user: { role: 'student' } } }),
    ]);
    const now = context.clock.now().getTime();
    expect(staff.expiresAt.getTime() - now).toBe(STAFF_REFRESH_DAYS * 24 * 60 * 60_000);
    expect(student.expiresAt.getTime() - now).toBe(STUDENT_REFRESH_MINUTES * 60_000);
  });

  it('records when the account last logged in', async () => {
    const teacher = await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher' });

    await login({ username: 'sara.iqbal', password: TEST_PASSWORD });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(after.lastLoginAt).toEqual(context.clock.now());
  });

  it('tells a first-login account that it must change its password', async () => {
    await createAccount(prisma, {
      username: 'S-1001',
      role: 'student',
      mustChangePassword: true,
    });

    const res = await login({ username: 'S-1001', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect((res.body as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(
      true,
    );
  });

  it('accepts a student ID typed in the wrong case', async () => {
    await createAccount(prisma, { username: 'S-1001', role: 'student' });

    const res = await login({ username: 's-1001', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('refuses a wrong password, saying no more than that', async () => {
    await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher' });

    const res = await login({ username: 'sara.iqbal', password: 'not-the-password' });

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('answers an unknown account exactly as it answers a wrong password', async () => {
    await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher' });

    const unknown = await login({ username: 'nobody.here', password: TEST_PASSWORD });
    const wrong = await login({ username: 'sara.iqbal', password: 'not-the-password' });

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('hands out nothing when the password is wrong', async () => {
    await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher' });

    await login({ username: 'sara.iqbal', password: 'not-the-password' });

    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('refuses a deactivated account before it checks the password', async () => {
    await createAccount(prisma, {
      username: 'left.the.institute',
      role: 'teacher',
      status: 'inactive',
    });

    const res = await login({ username: 'left.the.institute', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('refuses a request that is missing fields, without echoing the password', async () => {
    const res = await login({ username: 'sara.iqbal' });

    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(res.body)).not.toContain(TEST_PASSWORD);
  });

  it('refuses an empty username', async () => {
    const res = await login({ username: '', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });
});
