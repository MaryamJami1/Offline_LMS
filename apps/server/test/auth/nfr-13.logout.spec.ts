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

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function loginAs(username: string): Promise<Tokens> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return res.body as Tokens;
}

function logout(tokens: Partial<Tokens>) {
  const call = request(app.getHttpServer()).post('/api/auth/logout');
  if (tokens.accessToken !== undefined) {
    call.set('Authorization', `Bearer ${tokens.accessToken}`);
  }
  return call.send({ refreshToken: tokens.refreshToken });
}

function refresh(refreshToken: string) {
  return request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });
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

describe('NFR-13 POST /api/auth/logout', () => {
  it('ends the login', async () => {
    const tokens = await loginAs('S-1001');

    const res = await logout(tokens);

    expect(res.status).toBe(204);
    const stored = await prisma.refreshToken.findFirstOrThrow();
    expect(stored.revokedAt).toEqual(context.clock.now());
  });

  it('leaves the refresh token useless afterwards', async () => {
    const tokens = await loginAs('S-1001');

    await logout(tokens);
    const res = await refresh(tokens.refreshToken);

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_TOKEN');
  });

  it('frees the seat the student was sitting at', async () => {
    const student = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
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
    const tokens = await loginAs('S-1001');

    await logout(tokens);

    const login = await prisma.deviceLogin.findFirstOrThrow();
    expect(login.loggedOutAt).toEqual(context.clock.now());
    expect(login.logoutReason).toBe('manual');
  });

  it('can be called twice without complaining', async () => {
    const tokens = await loginAs('S-1001');

    const first = await logout(tokens);
    const again = await logout(tokens);

    expect(first.status).toBe(204);
    expect(again.status).toBe(204);
  });

  it('says nothing about a refresh token it never issued', async () => {
    const tokens = await loginAs('S-1001');

    const res = await logout({ ...tokens, refreshToken: 'a-token-nobody-issued' });

    expect(res.status).toBe(204);
  });

  it('refuses to end somebody else’s login', async () => {
    await createAccount(prisma, { username: 'S-1002', role: 'student', fullName: 'Bilal Ahmed' });
    const mine = await loginAs('S-1001');
    const theirs = await loginAs('S-1002');

    const res = await logout({ accessToken: mine.accessToken, refreshToken: theirs.refreshToken });

    expect(res.status).toBe(403);
    expect((await refresh(theirs.refreshToken)).status).toBe(200);
  });

  it('refuses a request from nobody', async () => {
    const tokens = await loginAs('S-1001');

    const res = await logout({ refreshToken: tokens.refreshToken });

    expect(res.status).toBe(401);
  });
});
