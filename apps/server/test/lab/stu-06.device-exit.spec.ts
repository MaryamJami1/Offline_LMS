import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { EXIT_PIN_LOCK_MINUTES, EXIT_PIN_TRIES } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { storeExitPin } from '../../src/settings/exit-pin.js';
import { resetDatabase } from '../db/database.js';
import { createAccount, createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { labPc, type LabPc } from '../support/lab-pc.js';

/**
 * STU-06 (T-STU-06, the server's side): the student app closes only when the
 * server says the admin PIN is right. The PIN never leaves the server, so a
 * lab PC cannot try PINs offline; five wrong tries lock that PC out for
 * fifteen minutes, and every try is in the audit log with the PC.
 */

const PIN = '204816';
const WRONG = '000000';
const NOW = new Date('2026-11-06T09:00:00.000Z');

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let pc: LabPc;

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(NOW);
  const admin = await createAccount(prisma, { username: 'admin', role: 'admin' });
  await storeExitPin(prisma, { pin: PIN, updatedBy: admin.id, changedAt: null });
  pc = await labPc(prisma, 'exit-a');
});

afterAll(async () => {
  await app.close();
});

/** `null` sends no key at all. */
function exit(pin: string, deviceKey: string | null = pc.key) {
  const req = request(app.getHttpServer())
    .post('/api/devices/exit')
    .set('X-Forwarded-For', '192.168.10.101')
    .send({ pin });
  return deviceKey === null ? req : req.set('X-Device-Key', deviceKey);
}

async function wrongTimes(times: number, deviceKey = pc.key): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await exit(WRONG, deviceKey);
  }
}

describe('STU-06 POST /api/devices/exit', () => {
  it('lets the app close with the right PIN, with no login', async () => {
    expect((await exit(PIN)).status).toBe(204);
  });

  it('refuses a wrong PIN and says how many tries are left', async () => {
    const res = await exit(WRONG);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EXIT_PIN_WRONG');
    expect(res.body.error.details).toEqual({ triesLeft: EXIT_PIN_TRIES - 1 });
  });

  it('refuses a PIN that is not six digits before checking it', async () => {
    const res = await exit('1234');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(
      (await prisma.device.findUniqueOrThrow({ where: { id: pc.deviceId } })).exitPinFailures,
    ).toBe(0);
  });

  it('answers only an approved lab PC, the same way whatever is wrong with the key', async () => {
    const waitingKey = 'key-of-a-pc-still-waiting';
    await prisma.device.create({
      data: {
        hostname: 'LAB1-NEW',
        mac: '02:00:00:00:00:99',
        deviceKeyHash: createHash('sha256').update(waitingKey).digest('hex'),
        approved: false,
      },
    });

    for (const key of [null, 'not-a-key-of-ours', waitingKey]) {
      const res = await exit(PIN, key);
      expect(res.status, String(key)).toBe(403);
      expect(res.body.error.code).toBe('DEVICE_NOT_APPROVED');
    }
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it(`locks the PC out after ${EXIT_PIN_TRIES} wrong PINs, and then refuses even the right one`, async () => {
    await wrongTimes(EXIT_PIN_TRIES - 1);
    const last = await exit(WRONG);

    expect(last.status).toBe(403);
    expect(last.body.error.code).toBe('EXIT_PIN_LOCKED');
    const unlocksAt = new Date(NOW.getTime() + EXIT_PIN_LOCK_MINUTES * 60_000).toISOString();
    expect(last.body.error.details).toEqual({ unlocksAt });

    const right = await exit(PIN);
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('EXIT_PIN_LOCKED');
  });

  it(`opens again after ${EXIT_PIN_LOCK_MINUTES} minutes, with every try back`, async () => {
    await wrongTimes(EXIT_PIN_TRIES);

    context.clock.advanceMinutes(EXIT_PIN_LOCK_MINUTES - 1);
    expect((await exit(PIN)).body.error.code).toBe('EXIT_PIN_LOCKED');

    context.clock.advanceMinutes(1);
    expect((await exit(WRONG)).body.error.details).toEqual({ triesLeft: EXIT_PIN_TRIES - 1 });
    expect((await exit(PIN)).status).toBe(204);
  });

  it('starts counting again after the right PIN', async () => {
    await wrongTimes(EXIT_PIN_TRIES - 1);
    expect((await exit(PIN)).status).toBe(204);

    expect((await exit(WRONG)).body.error.details).toEqual({ triesLeft: EXIT_PIN_TRIES - 1 });
  });

  it('locks out only the PC the wrong PINs came from', async () => {
    const other = await labPc(prisma, 'exit-b');
    await wrongTimes(EXIT_PIN_TRIES);

    expect((await exit(PIN, other.key)).status).toBe(204);
  });

  it('refuses every PIN while none has been set', async () => {
    await prisma.setting.deleteMany();

    const res = await exit(PIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EXIT_PIN_WRONG');
  });
});

describe('STU-06 every try at the exit PIN is in the audit log', () => {
  it('records a right PIN against the PC, with nobody logged in', async () => {
    await exit(PIN);

    expect(await prisma.auditLog.findMany()).toEqual([
      expect.objectContaining({
        actorId: null,
        action: 'device.exit',
        entity: 'device',
        entityId: pc.deviceId,
        ip: '192.168.10.101',
      }),
    ]);
  });

  it('records a wrong PIN and the lockout it causes, never the PIN', async () => {
    await wrongTimes(EXIT_PIN_TRIES);
    await exit(PIN);

    const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(entries.map((entry) => entry.action)).toEqual([
      ...Array<string>(EXIT_PIN_TRIES - 1).fill('device.exit_pin_wrong'),
      'device.exit_locked',
    ]);
    expect(JSON.stringify(entries)).not.toContain(WRONG);
    expect(JSON.stringify(entries)).not.toContain(PIN);
  });
});
