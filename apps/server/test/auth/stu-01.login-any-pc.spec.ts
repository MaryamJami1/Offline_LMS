import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { DeviceMeResponse, LoginResponse } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';

/**
 * STU-01 (T-STU-01a, T-STU-01b): a student logs in at any approved lab PC with
 * their student ID and password, and the seat they used is recorded in
 * device_logins. A student is logged in at one PC at a time and a PC holds one
 * student at a time: the newer login takes over, and the older one is ended
 * for real, its refresh tokens with it.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let labRoomId: string;

const NOW = new Date('2026-11-05T09:00:00.000Z');

interface Pc {
  id: string;
  seatId: string;
  key: string;
}

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(NOW);
  labRoomId = (await prisma.labRoom.create({ data: { name: 'Lab 1', rows: 5, seatsPerRow: 6 } }))
    .id;
  await createAccount(prisma, { username: 'S-1001', role: 'student', fullName: 'Ayesha Khan' });
  await createAccount(prisma, { username: 'S-1002', role: 'student', fullName: 'Bilal Ahmed' });
  await createAccount(prisma, { username: 'sara.iqbal', role: 'teacher', fullName: 'Sara Iqbal' });
});

afterAll(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

let pcCount = 0;

/** A lab PC at `seat`, approved unless told otherwise. */
async function pc(
  seat: string | null,
  options: { approved?: boolean; retired?: boolean } = {},
): Promise<Pc> {
  pcCount += 1;
  const key = `device-key-${pcCount}-0123456789abcdef`;
  const seatId =
    seat === null
      ? null
      : (
          await prisma.seat.create({
            data: { labRoomId, code: seat, row: seat.slice(0, 1), position: Number(seat.slice(1)) },
          })
        ).id;
  const device = await prisma.device.create({
    data: {
      hostname: `LAB1-${seat ?? 'NONE'}-${pcCount}`,
      mac: `02:00:00:00:00:${pcCount.toString(16).padStart(2, '0')}`,
      seatId,
      approved: options.approved ?? true,
      retiredAt: options.retired === true ? NOW : null,
      deviceKeyHash: createHash('sha256').update(key).digest('hex'),
    },
  });
  return { id: device.id, seatId: seatId ?? '', key };
}

function login(username: string, key?: string, password = TEST_PASSWORD) {
  const call = http().post('/api/auth/login');
  if (key !== undefined) {
    call.set('X-Device-Key', key);
  }
  return call.send({ username, password });
}

async function loggedIn(username: string, at: Pc): Promise<LoginResponse> {
  const res = await login(username, at.key);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as LoginResponse;
}

function refresh(refreshToken: string, key?: string) {
  const call = http().post('/api/auth/refresh');
  if (key !== undefined) {
    call.set('X-Device-Key', key);
  }
  return call.send({ refreshToken });
}

function openLogins() {
  return prisma.deviceLogin.findMany({ where: { loggedOutAt: null } });
}

describe('T-STU-01a a student logs in at an approved PC', () => {
  it('records the seat, and tells the app where the student sits', async () => {
    const a1 = await pc('A1');

    const res = await login('S-1001', a1.key);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.seat).toEqual({ seatCode: 'A1', labRoomName: 'Lab 1' });
    const student = await prisma.user.findUniqueOrThrow({ where: { username: 'S-1001' } });
    expect(await openLogins()).toMatchObject([
      { deviceId: a1.id, seatId: a1.seatId, studentId: student.id, loggedInAt: NOW },
    ]);
  });

  it('logs in at any seat: there is no seat of their own', async () => {
    const a1 = await pc('A1');
    const c4 = await pc('C4');

    await loggedIn('S-1001', c4);
    await loggedIn('S-1002', a1);

    expect((await openLogins()).map((row) => row.seatId).sort()).toEqual(
      [a1.seatId, c4.seatId].sort(),
    );
  });

  it('ties the refresh token to the PC, and counts the PC as seen', async () => {
    const a1 = await pc('A1');

    await loggedIn('S-1001', a1);

    expect(await prisma.refreshToken.findFirstOrThrow()).toMatchObject({ deviceId: a1.id });
    expect(await prisma.device.findUniqueOrThrow({ where: { id: a1.id } })).toMatchObject({
      lastSeenAt: NOW,
    });
  });

  it('shows the seat on /me', async () => {
    const a1 = await pc('A1');
    const tokens = await loggedIn('S-1001', a1);

    const me = await http().get('/api/me').set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(me.body.seat).toEqual({ seatCode: 'A1', labRoomName: 'Lab 1' });
  });

  it('refuses a login with no key, an unknown key, a waiting PC or a retired one, all alike', async () => {
    const waiting = await pc('A2', { approved: false });
    const retired = await pc('A3', { approved: false, retired: true });

    const answers = await Promise.all([
      login('S-1001'),
      login('S-1001', 'a-key-nobody-was-given'),
      login('S-1001', waiting.key),
      login('S-1001', retired.key),
    ]);

    for (const res of answers) {
      expect(res.status).toBe(403);
      expect(res.body.error).toEqual(answers[0]?.body.error);
      expect(res.body.error.code).toBe('DEVICE_NOT_APPROVED');
    }
    expect(await prisma.deviceLogin.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('checks the password first, so a wrong one at a strange PC is still a wrong password', async () => {
    const res = await login('S-1001', undefined, 'not-the-password');

    expect(res.status).toBe(401);
    expect(await prisma.user.findUniqueOrThrow({ where: { username: 'S-1001' } })).toMatchObject({
      failedLoginAttempts: 1,
    });
  });

  it('refuses an approved PC that is not bound to a seat yet', async () => {
    const loose = await pc(null);

    const res = await login('S-1001', loose.key);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DEVICE_NOT_SEATED');
    expect(await prisma.deviceLogin.count()).toBe(0);
  });

  it('lets staff log in without a PC, and never gives them a seat', async () => {
    const a1 = await pc('A1');

    const anywhere = await login('sara.iqbal');
    const atALabPc = await login('sara.iqbal', a1.key);

    expect(anywhere.status).toBe(200);
    expect(anywhere.body.seat).toBeNull();
    expect(atALabPc.status).toBe(200);
    expect(atALabPc.body.seat).toBeNull();
    expect(await prisma.deviceLogin.count()).toBe(0);
    expect(await prisma.refreshToken.count({ where: { deviceId: { not: null } } })).toBe(0);
  });
});

describe('T-STU-01b one login per student, one student per PC', () => {
  it('ends the login on the first PC when the student logs in at a second, and frees that seat', async () => {
    const a1 = await pc('A1');
    const b2 = await pc('B2');
    const first = await loggedIn('S-1001', a1);
    context.clock.set(new Date(NOW.getTime() + 60_000));

    const second = await loggedIn('S-1001', b2);

    expect(second.seat).toEqual({ seatCode: 'B2', labRoomName: 'Lab 1' });
    expect(await prisma.deviceLogin.findFirstOrThrow({ where: { deviceId: a1.id } })).toMatchObject(
      { loggedOutAt: new Date(NOW.getTime() + 60_000), logoutReason: 'replaced' },
    );
    expect((await openLogins()).map((row) => row.deviceId)).toEqual([b2.id]);
    expect((await refresh(first.refreshToken, a1.key)).status).toBe(401);
  });

  it('keeps the new login when the first PC tries its old token, which is no theft', async () => {
    const a1 = await pc('A1');
    const b2 = await pc('B2');
    const first = await loggedIn('S-1001', a1);
    const second = await loggedIn('S-1001', b2);

    await refresh(first.refreshToken, a1.key);

    const carriesOn = await refresh(second.refreshToken, b2.key);
    expect(carriesOn.status).toBe(200);
    expect(await openLogins()).toHaveLength(1);
  });

  it('ends the login of a student who walked away when another sits down at the PC', async () => {
    const a1 = await pc('A1');
    const left = await loggedIn('S-1001', a1);

    await loggedIn('S-1002', a1);

    const rows = await prisma.deviceLogin.findMany({
      include: { student: true },
      orderBy: { loggedInAt: 'asc' },
    });
    expect(rows.map((row) => [row.student.username, row.logoutReason])).toEqual([
      ['S-1001', 'replaced'],
      ['S-1002', null],
    ]);
    expect((await refresh(left.refreshToken, a1.key)).status).toBe(401);
  });

  it('lets a student log in again at the same PC, ending the login before', async () => {
    const a1 = await pc('A1');
    const before = await loggedIn('S-1001', a1);

    await loggedIn('S-1001', a1);

    expect(await openLogins()).toHaveLength(1);
    expect((await refresh(before.refreshToken, a1.key)).status).toBe(401);
  });

  it('seats thirty students at random seats, and again after they all move', async () => {
    const seats: Pc[] = [];
    for (const row of ['A', 'B', 'C', 'D', 'E']) {
      for (let position = 1; position <= 6; position += 1) {
        seats.push(await pc(`${row}${position}`));
      }
    }
    const usernames: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      const username = `S-${2001 + index}`;
      await createAccount(prisma, { username, role: 'student' });
      usernames.push(username);
    }
    const shuffled = (list: Pc[]) =>
      list
        .map((seat) => ({ seat, order: Math.random() }))
        .sort((a, b) => a.order - b.order)
        .map(({ seat }) => seat);

    for (const round of [shuffled(seats), shuffled(seats)]) {
      for (const [index, username] of usernames.entries()) {
        await loggedIn(username, round[index] as Pc);
      }
      const open = await openLogins();
      expect(open).toHaveLength(30);
      expect(new Set(open.map((row) => row.studentId)).size).toBe(30);
      expect(new Set(open.map((row) => row.deviceId)).size).toBe(30);
    }
  }, 60_000);
});

describe('STU-01 the login screen asks the PC where it is', () => {
  it('tells an approved PC its name and seat, without anyone logged in', async () => {
    const a1 = await pc('A1');

    const res = await http().get('/api/devices/me').set('X-Device-Key', a1.key);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body as DeviceMeResponse).toEqual({
      deviceId: a1.id,
      hostname: expect.stringMatching(/^LAB1-A1/),
      seat: { seatCode: 'A1', labRoomName: 'Lab 1' },
    });
    expect(await prisma.device.findUniqueOrThrow({ where: { id: a1.id } })).toMatchObject({
      lastSeenAt: NOW,
    });
  });

  it('answers an approved PC with no seat yet with no seat', async () => {
    const loose = await pc(null);

    const res = await http().get('/api/devices/me').set('X-Device-Key', loose.key);

    expect(res.status).toBe(200);
    expect(res.body.seat).toBeNull();
  });

  it('refuses a PC that is not approved, or no key at all', async () => {
    const waiting = await pc('A2', { approved: false });

    for (const call of [
      () => http().get('/api/devices/me').set('X-Device-Key', waiting.key),
      () => http().get('/api/devices/me'),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEVICE_NOT_APPROVED');
    }
  });
});

describe('STU-01 changing the password at the seat', () => {
  it('keeps the seat and ties the new tokens to the PC when the PC key is sent', async () => {
    const a1 = await pc('A1');
    const tokens = await loggedIn('S-1001', a1);

    const res = await http()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .set('X-Device-Key', a1.key)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Karachi-2026-new' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.seat).toEqual({ seatCode: 'A1', labRoomName: 'Lab 1' });
    expect(await openLogins()).toMatchObject([{ deviceId: a1.id }]);
    expect(
      await prisma.refreshToken.findFirstOrThrow({ where: { revokedAt: null } }),
    ).toMatchObject({ deviceId: a1.id });
  });

  for (const [label, otherPc] of [
    ['with no key', false],
    ['with another PC’s key', true],
  ] as const) {
    it(`frees the seat when the change comes ${label}`, async () => {
      const a1 = await pc('A1');
      const b2 = await pc('B2');
      const tokens = await loggedIn('S-1001', a1);

      const call = http()
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      if (otherPc) {
        call.set('X-Device-Key', b2.key);
      }
      const res = await call.send({
        currentPassword: TEST_PASSWORD,
        newPassword: 'Karachi-2026-new',
      });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.seat).toBeNull();
      expect(await openLogins()).toEqual([]);
      expect(await prisma.deviceLogin.findFirstOrThrow()).toMatchObject({
        logoutReason: 'revoked',
      });
      expect(
        await prisma.refreshToken.findFirstOrThrow({ where: { revokedAt: null } }),
      ).toMatchObject({ deviceId: null });
    });
  }
});

describe('STU-01 a replayed token frees the seat too', () => {
  it('ends the student’s login at the PC, not only their tokens', async () => {
    const a1 = await pc('A1');
    const tokens = await loggedIn('S-1001', a1);
    const rotated = await refresh(tokens.refreshToken, a1.key);
    expect(rotated.status).toBe(200);
    context.clock.set(new Date(NOW.getTime() + 5 * 60_000));

    // The rotated-away token again, long after any retry window: theft.
    await refresh(tokens.refreshToken, a1.key);

    expect(await openLogins()).toEqual([]);
    expect(await prisma.deviceLogin.findFirstOrThrow()).toMatchObject({
      loggedOutAt: new Date(NOW.getTime() + 5 * 60_000),
      logoutReason: 'revoked',
    });
  });
});
