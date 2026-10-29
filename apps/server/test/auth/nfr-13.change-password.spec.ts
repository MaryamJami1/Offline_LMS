import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { PASSWORD_MINIMUM_LENGTH, loginResponseSchema } from '@lingualab/shared';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
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

async function loginAs(
  username: string,
  password = TEST_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password });
  expect(res.status).toBe(200);
  return res.body as { accessToken: string; refreshToken: string };
}

function changePassword(accessToken: string | undefined, body: object) {
  const call = request(app.getHttpServer()).post('/api/auth/change-password');
  if (accessToken !== undefined) {
    call.set('Authorization', `Bearer ${accessToken}`);
  }
  return call.send(body);
}

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-10-29T09:00:00.000Z'));
  await createAccount(prisma, {
    username: 'S-1001',
    role: 'student',
    fullName: 'Ayesha Khan',
    mustChangePassword: true,
  });
});

afterAll(async () => {
  await app.close();
});

describe('NFR-13 POST /api/auth/change-password', () => {
  it('changes the password and hands back a fresh pair of tokens', async () => {
    const tokens = await loginAs('S-1001');

    const res = await changePassword(tokens.accessToken, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(res.status).toBe(200);
    const body = loginResponseSchema.parse(res.body);
    expect(body.user.mustChangePassword).toBe(false);
    expect(body.refreshToken).not.toBe(tokens.refreshToken);
  });

  it('stores the new password as a fresh Argon2id hash', async () => {
    const tokens = await loginAs('S-1001');
    const before = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });

    await changePassword(tokens.accessToken, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const after = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(after.passwordHash).not.toContain(NEW_PASSWORD);
    expect(after.mustChangePassword).toBe(false);
  });

  it('lets the account log in with the new password, and not the old one', async () => {
    const tokens = await loginAs('S-1001');
    await changePassword(tokens.accessToken, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const withOld = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'S-1001', password: TEST_PASSWORD });
    const withNew = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'S-1001', password: NEW_PASSWORD });

    expect(withOld.status).toBe(401);
    expect(withNew.status).toBe(200);
  });

  it('ends every other login of that account', async () => {
    const atHome = await loginAs('S-1001');
    const atTheLab = await loginAs('S-1001');

    await changePassword(atTheLab.accessToken, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: atHome.refreshToken });
    expect(res.status).toBe(401);
  });

  it('refuses a wrong current password', async () => {
    const tokens = await loginAs('S-1001');

    const res = await changePassword(tokens.accessToken, {
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    });

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
    const after = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
    expect(after.mustChangePassword).toBe(true);
  });

  it('refuses a new password under eight characters', async () => {
    expect(PASSWORD_MINIMUM_LENGTH).toBe(8);
    const tokens = await loginAs('S-1001');

    const res = await changePassword(tokens.accessToken, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'short12',
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('never echoes either password back, however it fails', async () => {
    const tokens = await loginAs('S-1001');

    const tooShort = await changePassword(tokens.accessToken, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'short12',
    });
    const wrongCurrent = await changePassword(tokens.accessToken, {
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    });

    for (const res of [tooShort, wrongCurrent]) {
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(TEST_PASSWORD);
      expect(text).not.toContain(NEW_PASSWORD);
      expect(text).not.toContain('short12');
    }
  });

  it('refuses a request from nobody', async () => {
    const res = await changePassword(undefined, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(res.status).toBe(401);
  });
});
