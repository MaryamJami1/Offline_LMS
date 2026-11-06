import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { exitPinStatusSchema } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { EXIT_PIN_KEY, storeExitPin } from '../../src/settings/exit-pin.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';
import { labPc } from '../support/lab-pc.js';
import { loginAs } from '../support/users-world.js';

/**
 * ADM-07 and STU-06: the admin PIN that closes the student app is a setting.
 * The seed stores a first PIN that the admin must change; until they do, the
 * dashboard says so. Changing it needs the admin's own password typed again,
 * is in the audit log, and the PIN is only ever stored hashed.
 */

const SEEDED_PIN = '135790';
const NEW_PIN = '204816';
const NOW = new Date('2026-11-06T09:00:00.000Z');

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let adminId: string;
let adminToken: string;

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(NOW);
  adminId = (await createAccount(prisma, { username: 'admin', role: 'admin' })).id;
  await storeExitPin(prisma, { pin: SEEDED_PIN, updatedBy: adminId, changedAt: null });
  adminToken = await loginAs(app, 'admin');
});

afterAll(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

function status() {
  return http().get('/api/settings/exit-pin').set('Authorization', `Bearer ${adminToken}`);
}

function change(body: object) {
  return http()
    .put('/api/settings/exit-pin')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Forwarded-For', '192.168.10.2')
    .send(body);
}

describe('ADM-07 GET /api/settings/exit-pin', () => {
  it('says the seeded PIN must still be changed', async () => {
    const res = await status();

    expect(res.status).toBe(200);
    expect(exitPinStatusSchema.parse(res.body)).toEqual({ mustChange: true, changedAt: null });
  });

  it('says it must be set when there is none at all', async () => {
    await prisma.setting.deleteMany();

    expect((await status()).body).toEqual({ mustChange: true, changedAt: null });
  });
});

describe('ADM-07 PUT /api/settings/exit-pin', () => {
  it('changes the PIN and says when', async () => {
    const res = await change({ currentPassword: TEST_PASSWORD, pin: NEW_PIN });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mustChange: false, changedAt: NOW.toISOString() });
    expect((await status()).body).toEqual({ mustChange: false, changedAt: NOW.toISOString() });
  });

  it('makes the new PIN the one that closes the student app, and the old one stop', async () => {
    const pc = await labPc(prisma, 'pin-change');
    await change({ currentPassword: TEST_PASSWORD, pin: NEW_PIN });

    const exit = (pin: string) =>
      http().post('/api/devices/exit').set('X-Device-Key', pc.key).send({ pin });
    expect((await exit(SEEDED_PIN)).status).toBe(403);
    expect((await exit(NEW_PIN)).status).toBe(204);
  });

  it('refuses without the admin password, and keeps the old PIN', async () => {
    const res = await change({ currentPassword: 'not-the-password', pin: NEW_PIN });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await status()).body.mustChange).toBe(true);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('refuses a PIN that is not six digits', async () => {
    for (const pin of ['1234', '1234567', 'abcdef']) {
      const res = await change({ currentPassword: TEST_PASSWORD, pin });
      expect(res.status, pin).toBe(400);
    }
  });

  it('stores only a hash of the PIN', async () => {
    await change({ currentPassword: TEST_PASSWORD, pin: NEW_PIN });

    const stored = await prisma.setting.findUniqueOrThrow({ where: { key: EXIT_PIN_KEY } });
    expect(JSON.stringify(stored.value)).not.toContain(NEW_PIN);
    expect(stored.updatedBy).toBe(adminId);
  });

  it('writes the change to the audit log, never the PIN', async () => {
    await change({ currentPassword: TEST_PASSWORD, pin: NEW_PIN });

    const entries = await prisma.auditLog.findMany();
    expect(entries).toEqual([
      expect.objectContaining({
        actorId: adminId,
        action: 'settings.exit_pin_changed',
        entity: 'setting',
        entityId: null,
        ip: '192.168.10.2',
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain(NEW_PIN);
  });
});
