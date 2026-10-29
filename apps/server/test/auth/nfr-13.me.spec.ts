import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { meResponseSchema } from '@lingualab/shared';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { ACCESS_TOKEN_MINUTES } from '../../src/auth/tokens.service.js';
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

function me(accessToken?: string) {
  const call = request(app.getHttpServer()).get('/api/me');
  return accessToken === undefined ? call : call.set('Authorization', `Bearer ${accessToken}`);
}

async function loginAs(username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return (res.body as { accessToken: string }).accessToken;
}

/** A student sitting at seat A1 of Lab 1, as device_logins records it. */
async function seatStudentAtA1(username: string): Promise<void> {
  const student = await prisma.user.findFirstOrThrow({ where: { username } });
  const lab = await prisma.labRoom.create({ data: { name: 'Lab 1', rows: 5, seatsPerRow: 6 } });
  const seat = await prisma.seat.create({
    data: { labRoomId: lab.id, code: 'A1', row: 'A', position: 1 },
  });
  const device = await prisma.device.create({
    data: { hostname: 'LAB1-A1', mac: '00:1B:44:11:3A:B7', seatId: seat.id, approved: true },
  });
  await prisma.deviceLogin.create({
    data: { deviceId: device.id, seatId: seat.id, studentId: student.id },
  });
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

describe('NFR-13 GET /api/me', () => {
  it('returns who is logged in, and no seat when they are not at a lab PC', async () => {
    const accessToken = await loginAs('S-1001');

    const res = await me(accessToken);

    expect(res.status).toBe(200);
    const body = meResponseSchema.parse(res.body);
    expect(body.user.username).toBe('S-1001');
    expect(body.user.fullName).toBe('Ayesha Khan');
    expect(body.user.role).toBe('student');
    expect(body.seat).toBeNull();
  });

  it('returns the seat the student is sitting at', async () => {
    await seatStudentAtA1('S-1001');
    const accessToken = await loginAs('S-1001');

    const res = await me(accessToken);

    expect(meResponseSchema.parse(res.body).seat).toEqual({
      seatCode: 'A1',
      labRoomName: 'Lab 1',
    });
  });

  it('forgets the seat once that login has ended', async () => {
    await seatStudentAtA1('S-1001');
    await prisma.deviceLogin.updateMany({
      data: { loggedOutAt: context.clock.now(), logoutReason: 'manual' },
    });
    const accessToken = await loginAs('S-1001');

    const res = await me(accessToken);

    expect(meResponseSchema.parse(res.body).seat).toBeNull();
  });

  it('never sends back a password hash', async () => {
    const accessToken = await loginAs('S-1001');

    const res = await me(accessToken);

    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/i);
  });

  it('refuses a request with no token', async () => {
    const res = await me();

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a token that is not a token', async () => {
    expect((await me('not-a-token')).status).toBe(401);
  });

  it('refuses an access token once its fifteen minutes are up', async () => {
    const accessToken = await loginAs('S-1001');

    context.clock.advanceMinutes(ACCESS_TOKEN_MINUTES + 1);
    const res = await me(accessToken);

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_TOKEN');
  });

  it('refuses the token of an account deactivated since it logged in', async () => {
    const accessToken = await loginAs('S-1001');
    await prisma.user.updateMany({ where: { username: 'S-1001' }, data: { status: 'inactive' } });

    const res = await me(accessToken);

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('lets a first-login account see itself, so the app can ask for a new password', async () => {
    await createAccount(prisma, {
      username: 'S-1002',
      role: 'student',
      fullName: 'Bilal Ahmed',
      mustChangePassword: true,
    });
    const accessToken = await loginAs('S-1002');

    const res = await me(accessToken);

    expect(res.status).toBe(200);
    expect(meResponseSchema.parse(res.body).user.mustChangePassword).toBe(true);
  });
});
