import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { refreshResponseSchema } from '@lingualab/shared';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { REFRESH_GRACE_SECONDS, STUDENT_REFRESH_MINUTES } from '../../src/auth/tokens.service.js';
import { UNIQUE_VIOLATION, errorCode, resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';

/**
 * The lab network drops a reply now and then, and the app retries the refresh
 * it has already had answered. Without a grace window that retry looks exactly
 * like a stolen token being replayed, and a student is thrown out of class mid
 * lesson. Inside the window, and only from the PC the token was issued to, the
 * retry is answered with a fresh pair instead (NFR-13).
 */

const DEVICE_KEY = 'lab1-a1-device-key-0123456789abcdef';
const OTHER_DEVICE_KEY = 'lab1-a2-device-key-0123456789abcdef';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;

function refresh(refreshToken: string, deviceKey?: string) {
  const call = request(app.getHttpServer()).post('/api/auth/refresh');
  if (deviceKey !== undefined) {
    call.set('X-Device-Key', deviceKey);
  }
  return call.send({ refreshToken });
}

async function loginAs(username: string): Promise<Tokens> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return res.body as Tokens;
}

async function createDevice(options: {
  key: string;
  hostname: string;
  mac: string;
  approved?: boolean;
}): Promise<string> {
  const device = await prisma.device.create({
    data: {
      hostname: options.hostname,
      mac: options.mac,
      approved: options.approved ?? true,
      deviceKeyHash: createHash('sha256').update(options.key).digest('hex'),
    },
  });
  return device.id;
}

/**
 * A login as STU-01 will leave it once it records the PC: the student's
 * refresh token belongs to the lab PC they are sitting at.
 */
async function loginAtDevice(username: string, deviceId: string): Promise<Tokens> {
  const tokens = await loginAs(username);
  await prisma.refreshToken.updateMany({
    where: { user: { username }, revokedAt: null },
    data: { deviceId },
  });
  return tokens;
}

async function liveTokenCount(): Promise<number> {
  return prisma.refreshToken.count({ where: { revokedAt: null } });
}

/** The moment the token that has been rotated away was revoked. */
async function rotatedAt(): Promise<Date> {
  const rotated = await prisma.refreshToken.findFirstOrThrow({
    where: { revokedAt: { not: null } },
  });
  if (rotated.revokedAt === null) {
    throw new Error('the rotated token has no revokedAt');
  }
  return rotated.revokedAt;
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

describe('NFR-13 a refresh token retried after a lost answer', () => {
  it('answers a retry from the same PC inside the window with a working pair', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    const lost = (await refresh(first.refreshToken, DEVICE_KEY)).body as Tokens;
    context.clock.advanceSeconds(5);

    const retry = await refresh(first.refreshToken, DEVICE_KEY);

    expect(retry.status).toBe(200);
    const body = refreshResponseSchema.parse(retry.body);
    expect(body.refreshToken).not.toBe(first.refreshToken);
    expect(body.refreshToken).not.toBe(lost.refreshToken);
  });

  it('hands back a pair that works in turn', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    context.clock.advanceSeconds(5);

    const granted = (await refresh(first.refreshToken, DEVICE_KEY)).body as Tokens;

    expect((await refresh(granted.refreshToken, DEVICE_KEY)).status).toBe(200);
  });

  /**
   * The answer the app did not get and the retry it sent may have crossed on
   * the wire, so after a retry either token may be the one the app kept. Both
   * work from that PC until the window closes, which is the price of keeping
   * nothing replayable in the database: the server cannot hand back a token it
   * only stores the hash of, so it issues another one instead.
   */
  it('still answers the replacement it had to retire, while the window is open', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    const crossed = (await refresh(first.refreshToken, DEVICE_KEY)).body as Tokens;
    context.clock.advanceSeconds(5);
    await refresh(first.refreshToken, DEVICE_KEY);

    expect((await refresh(crossed.refreshToken, DEVICE_KEY)).status).toBe(200);
  });

  it('closes that window too, twenty seconds on', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    const crossed = (await refresh(first.refreshToken, DEVICE_KEY)).body as Tokens;
    context.clock.advanceSeconds(5);
    await refresh(first.refreshToken, DEVICE_KEY);

    context.clock.advanceSeconds(REFRESH_GRACE_SECONDS + 1);

    expect((await refresh(crossed.refreshToken, DEVICE_KEY)).status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('gives a student the usual thirty minutes, not the old deadline', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    context.clock.advanceMinutes(10);
    await refresh(first.refreshToken, DEVICE_KEY);
    context.clock.advanceSeconds(5);

    await refresh(first.refreshToken, DEVICE_KEY);

    const live = await prisma.refreshToken.findFirstOrThrow({ where: { revokedAt: null } });
    expect(live.expiresAt.getTime() - context.clock.now().getTime()).toBe(
      STUDENT_REFRESH_MINUTES * 60_000,
    );
  });

  it('closes the window twenty seconds after the token was rotated', async () => {
    expect(REFRESH_GRACE_SECONDS).toBe(20);
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    const revokedAt = await rotatedAt();

    context.clock.set(new Date(revokedAt.getTime() + REFRESH_GRACE_SECONDS * 1000));

    expect((await refresh(first.refreshToken, DEVICE_KEY)).status).toBe(200);
  });

  it('is one millisecond too late just after that', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    const revokedAt = await rotatedAt();

    context.clock.set(new Date(revokedAt.getTime() + REFRESH_GRACE_SECONDS * 1000 + 1));

    expect((await refresh(first.refreshToken, DEVICE_KEY)).status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('records which token replaced which', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);

    await refresh(first.refreshToken, DEVICE_KEY);

    const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.replacedById).toBe(rows[1]?.id);
    expect(rows[1]?.replacedById).toBeNull();
  });

  it('never lets two tokens claim the same replacement', async () => {
    const student = await prisma.user.findFirstOrThrow({ where: { username: 'S-1001' } });
    const expiresAt = new Date('2026-10-29T09:30:00.000Z');
    const child = await prisma.refreshToken.create({
      data: { userId: student.id, tokenHash: 'child', expiresAt },
    });
    await prisma.refreshToken.create({
      data: { userId: student.id, tokenHash: 'first', expiresAt, replacedById: child.id },
    });

    const second = prisma.refreshToken.create({
      data: { userId: student.id, tokenHash: 'second', expiresAt, replacedById: child.id },
    });

    expect(await errorCode(second)).toBe(UNIQUE_VIOLATION);
  });
});

describe('NFR-13 a replay the grace window does not cover', () => {
  it('treats a second retry of the same token as theft', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    context.clock.advanceSeconds(5);
    await refresh(first.refreshToken, DEVICE_KEY);

    const again = await refresh(first.refreshToken, DEVICE_KEY);

    expect(again.status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('treats a replay whose replacement has been used as theft', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    const second = (await refresh(first.refreshToken, DEVICE_KEY)).body as Tokens;
    await refresh(second.refreshToken, DEVICE_KEY);

    const replay = await refresh(first.refreshToken, DEVICE_KEY);

    expect(replay.status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('treats a retry from another PC as theft, inside the window or not', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    await createDevice({ key: OTHER_DEVICE_KEY, hostname: 'LAB1-A2', mac: 'AA:02' });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    context.clock.advanceSeconds(5);

    const elsewhere = await refresh(first.refreshToken, OTHER_DEVICE_KEY);

    expect(elsewhere.status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('never covers a token revoked by logging out', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const laptop = await loginAtDevice('sara.iqbal', deviceId);
    const desktop = await loginAs('sara.iqbal');
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .send({ refreshToken: laptop.refreshToken });
    context.clock.advanceSeconds(5);

    const retry = await refresh(laptop.refreshToken, DEVICE_KEY);

    expect(retry.status).toBe(401);
    expect((await refresh(desktop.refreshToken)).status).toBe(401);
  });

  it('does not cover a PC the admin has not approved', async () => {
    const deviceId = await createDevice({
      key: DEVICE_KEY,
      hostname: 'LAB1-A1',
      mac: 'AA:01',
      approved: false,
    });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    context.clock.advanceSeconds(5);

    const retry = await refresh(first.refreshToken, DEVICE_KEY);

    expect(retry.status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('does not cover a retry that brings no device key of its own', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    context.clock.advanceSeconds(5);

    const bare = await refresh(first.refreshToken);

    expect(bare.status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('does not cover an account deactivated since it logged in', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const first = await loginAtDevice('S-1001', deviceId);
    await refresh(first.refreshToken, DEVICE_KEY);
    await prisma.user.updateMany({ where: { username: 'S-1001' }, data: { status: 'inactive' } });
    context.clock.advanceSeconds(5);

    const retry = await refresh(first.refreshToken, DEVICE_KEY);

    expect(retry.status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('does not cover a token with no PC of its own, until STU-01 records one', async () => {
    const first = await loginAs('S-1001');
    await refresh(first.refreshToken);
    context.clock.advanceSeconds(5);

    const retry = await refresh(first.refreshToken);

    expect(retry.status).toBe(401);
    expect(await liveTokenCount()).toBe(0);
  });

  it('leaves every other account logged in', async () => {
    const deviceId = await createDevice({ key: DEVICE_KEY, hostname: 'LAB1-A1', mac: 'AA:01' });
    const student = await loginAtDevice('S-1001', deviceId);
    const teacher = await loginAs('sara.iqbal');
    await refresh(student.refreshToken, DEVICE_KEY);
    context.clock.advanceMinutes(5);

    await refresh(student.refreshToken, DEVICE_KEY);

    expect((await refresh(teacher.refreshToken)).status).toBe(200);
  });
});
