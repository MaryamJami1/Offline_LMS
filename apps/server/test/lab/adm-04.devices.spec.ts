import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { DeviceView, RegisterDeviceResponse } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { DeviceKeyService } from '../../src/auth/device-key.service.js';
import { resetDatabase } from '../db/database.js';
import { createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { addStudent, buildClassesWorld, type ClassesWorld } from '../support/classes-world.js';

/**
 * ADM-04 (T-ADM-04): a lab PC registers itself and waits; the admin approves
 * it and binds it to a seat, renames, retires or resets it. The device key is
 * handed to the PC when it registers and is accepted only once the admin has
 * approved the PC (docs/docs/06-security-and-data.md, Device trust).
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let world: ClassesWorld;
let keys: DeviceKeyService;
let seats: Record<string, string>;

const NOW = new Date('2026-11-04T09:00:00.000Z');
const MAC = 'aa:bb:cc:00:11:22';

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
  keys = app.get(DeviceKeyService);
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(NOW);
  world = await buildClassesWorld(app, prisma);
  await prisma.seat.createMany({
    data: ['A1', 'A2'].map((code, index) => ({
      labRoomId: world.labRoomId,
      code,
      row: 'A',
      position: index + 1,
    })),
  });
  seats = {};
  for (const seat of await prisma.seat.findMany()) {
    seats[seat.code] = seat.id;
  }
});

afterAll(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

function register(body: object = {}, deviceKey?: string) {
  const req = http()
    .post('/api/devices/register')
    .set('X-Forwarded-For', '192.168.10.101')
    .send({
      hostname: 'LAB1-A1',
      mac: 'AA-BB-CC-00-11-22',
      osVersion: 'Windows 11 23H2',
      appVersion: '1.0.0',
      ...body,
    });
  return deviceKey === undefined ? req : req.set('X-Device-Key', deviceKey);
}

function asAdmin(method: 'get' | 'patch', path: string) {
  return http()[method](path).set('Authorization', `Bearer ${world.adminToken}`);
}

function act(id: string, body: object) {
  return asAdmin('patch', `/api/devices/${id}`).send(body);
}

/** Registers the PC and returns its id and key. */
async function registered(body: object = {}): Promise<{ id: string; key: string }> {
  const res = await register(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const answer = res.body as RegisterDeviceResponse;
  return { id: answer.deviceId, key: answer.deviceKey as string };
}

/** Registers the PC and has the admin approve it at A1. */
async function approved(): Promise<{ id: string; key: string }> {
  const pc = await registered();
  expect((await act(pc.id, { action: 'approve', seatId: seats['A1'] })).status).toBe(200);
  return pc;
}

describe('T-ADM-04 a PC registers itself', () => {
  it('needs no login, waits for the admin, and gets its key once', async () => {
    const res = await register();

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({
      deviceId: expect.any(String),
      status: 'waiting',
      deviceKey: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(await prisma.device.findUniqueOrThrow({ where: { mac: MAC } })).toMatchObject({
      hostname: 'LAB1-A1',
      ip: '192.168.10.101',
      osVersion: 'Windows 11 23H2',
      appVersion: '1.0.0',
      approved: false,
      seatId: null,
      lastSeenAt: NOW,
    });
  });

  it('keeps only a hash of the key', async () => {
    const pc = await registered();

    const device = await prisma.device.findUniqueOrThrow({ where: { id: pc.id } });
    expect(device.deviceKeyHash).toBe(keys.hash(pc.key));
    expect(JSON.stringify(device)).not.toContain(pc.key);
  });

  it('has a key that is refused until the admin approves the PC', async () => {
    const pc = await registered();

    expect(await keys.resolveDevice(pc.key)).toBeNull();
    await act(pc.id, { action: 'approve' });
    expect(await keys.resolveDevice(pc.key)).toBe(pc.id);
  });

  it('checks in when it starts again with its key, without a new key', async () => {
    const pc = await approved();
    context.clock.set(new Date('2026-11-05T08:00:00.000Z'));

    const res = await register({ appVersion: '1.1.0' }, pc.key).set(
      'X-Forwarded-For',
      '192.168.10.150',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deviceId: pc.id, status: 'approved', deviceKey: null });
    expect(await prisma.device.findUniqueOrThrow({ where: { id: pc.id } })).toMatchObject({
      appVersion: '1.1.0',
      ip: '192.168.10.150',
      lastSeenAt: new Date('2026-11-05T08:00:00.000Z'),
      seatId: seats['A1'],
    });
    expect(await keys.resolveDevice(pc.key)).toBe(pc.id);
  });

  it('gives a waiting PC that lost its key a new one, and the old one stops working', async () => {
    const first = await registered();

    const again = await register();

    expect(again.status).toBe(201);
    const second = again.body as RegisterDeviceResponse;
    expect(second.deviceId).toBe(first.id);
    expect(second.deviceKey).not.toBe(first.key);
    await act(first.id, { action: 'approve' });
    expect(await keys.resolveDevice(first.key)).toBeNull();
    expect(await keys.resolveDevice(second.deviceKey as string)).toBe(first.id);
  });

  it('refuses an approved PC that comes without its key, so a copied MAC cannot take its place', async () => {
    const pc = await approved();

    for (const key of [undefined, 'not-the-key']) {
      const res = await register({ hostname: 'INTRUDER' }, key);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DEVICE_ALREADY_REGISTERED');
    }
    expect(await keys.resolveDevice(pc.key)).toBe(pc.id);
    expect(await prisma.device.findUniqueOrThrow({ where: { id: pc.id } })).toMatchObject({
      hostname: 'LAB1-A1',
    });
  });

  it('refuses a retired PC', async () => {
    const pc = await approved();
    await act(pc.id, { action: 'retire' });

    const res = await register();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_RETIRED');
  });

  it('refuses a new PC once 100 are waiting, but still lets those check in', async () => {
    await prisma.device.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        hostname: `PC-${index}`,
        mac: `02:00:00:00:00:${index.toString(16).padStart(2, '0')}`,
      })),
    });

    const fresh = await register();
    const waiting = await register({ hostname: 'PC-7', mac: '02:00:00:00:00:07' });

    expect(fresh.status).toBe(429);
    expect(fresh.body.error.code).toBe('TOO_MANY_WAITING');
    expect(waiting.status).toBe(201);
  });

  it('refuses a body that is not a registration', async () => {
    const res = await register({ mac: 'not-a-mac' });

    expect(res.status).toBe(400);
  });
});

describe('T-ADM-04 the admin approves and binds PCs', () => {
  it('approves a PC at a seat', async () => {
    const pc = await registered();

    const res = await act(pc.id, { action: 'approve', seatId: seats['A1'] });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      id: pc.id,
      hostname: 'LAB1-A1',
      mac: MAC,
      ip: '192.168.10.101',
      osVersion: 'Windows 11 23H2',
      appVersion: '1.0.0',
      status: 'online',
      lastSeenAt: NOW.toISOString(),
      seat: { id: seats['A1'], code: 'A1', labId: world.labRoomId, labName: 'Lab 1' },
      // Set by the database's own clock, not the test's.
      createdAt: expect.any(String),
    });
  });

  it('moves a PC to another seat, or takes it off its seat', async () => {
    const pc = await approved();

    const moved = await act(pc.id, { action: 'bind', seatId: seats['A2'] });
    const off = await act(pc.id, { action: 'bind', seatId: null });

    expect(moved.body.seat.code).toBe('A2');
    expect(off.body.seat).toBeNull();
  });

  it('refuses a seat another PC is bound to', async () => {
    await approved();
    const other = await registered({ hostname: 'LAB1-A2', mac: 'aa:bb:cc:00:11:33' });

    const res = await act(other.id, { action: 'approve', seatId: seats['A1'] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEAT_TAKEN');
    expect(await keys.resolveDevice(other.key)).toBeNull();
  });

  it('refuses a seat that does not exist', async () => {
    const pc = await registered();

    const res = await act(pc.id, {
      action: 'bind',
      seatId: '0190f5a0-0000-7000-8000-000000000999',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SEAT_NOT_FOUND');
  });

  it('renames a PC', async () => {
    const pc = await approved();

    const res = await act(pc.id, { action: 'rename', hostname: 'LAB1-A1-NEW' });

    expect(res.body.hostname).toBe('LAB1-A1-NEW');
  });

  it('answers 404 for a PC that does not exist', async () => {
    const res = await act('0190f5a0-0000-7000-8000-000000000999', { action: 'retire' });

    expect(res.status).toBe(404);
  });
});

describe('T-ADM-04 retiring and resetting a PC', () => {
  async function seated(pc: { id: string }) {
    const student = await addStudent(prisma, {
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      rollNo: '1',
    });
    await prisma.deviceLogin.create({
      data: { deviceId: pc.id, seatId: seats['A1'] as string, studentId: student },
    });
    await prisma.refreshToken.create({
      data: {
        userId: student,
        deviceId: pc.id,
        tokenHash: 'hash-of-a-token',
        expiresAt: new Date('2026-11-11T09:00:00.000Z'),
      },
    });
  }

  it('retires a PC: off its seat, its key dead, its logins ended, its history kept', async () => {
    const pc = await approved();
    await seated(pc);

    const res = await act(pc.id, { action: 'retire' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'retired', seat: null });
    expect(await keys.resolveDevice(pc.key)).toBeNull();
    expect(await prisma.deviceLogin.findFirstOrThrow()).toMatchObject({
      loggedOutAt: NOW,
      logoutReason: 'admin',
    });
    expect(
      await prisma.refreshToken.findFirstOrThrow({ where: { deviceId: pc.id } }),
    ).toMatchObject({ revokedAt: NOW });
  });

  it('cannot approve a retired PC, or put it on a seat', async () => {
    const pc = await approved();
    await act(pc.id, { action: 'retire' });

    for (const body of [{ action: 'approve' }, { action: 'bind', seatId: seats['A2'] }]) {
      const res = await act(pc.id, body);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DEVICE_RETIRED');
    }
  });

  it('resets a reinstalled PC to wait again with no key, keeping its seat', async () => {
    const pc = await approved();
    await seated(pc);

    const res = await act(pc.id, { action: 'reset' });

    expect(res.body).toMatchObject({ status: 'waiting', seat: { code: 'A1' } });
    expect(await keys.resolveDevice(pc.key)).toBeNull();
    expect(await prisma.deviceLogin.findFirstOrThrow()).toMatchObject({ logoutReason: 'admin' });
  });

  it('lets a reset PC register for a new key, which works once approved again', async () => {
    const pc = await approved();
    await act(pc.id, { action: 'reset' });

    const res = await register();
    await act(pc.id, { action: 'approve' });

    expect(res.status).toBe(201);
    expect(await keys.resolveDevice(res.body.deviceKey as string)).toBe(pc.id);
  });

  it('refuses to approve a reset PC before it has registered again', async () => {
    const pc = await approved();
    await act(pc.id, { action: 'reset' });

    const res = await act(pc.id, { action: 'approve' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WAITING_FOR_PC');
  });

  it('brings a retired PC back through a reset', async () => {
    const pc = await approved();
    await act(pc.id, { action: 'retire' });

    const reset = await act(pc.id, { action: 'reset' });
    const again = await register();

    expect(reset.body.status).toBe('waiting');
    expect(again.status).toBe(201);
  });
});

describe('T-ADM-04 the list of PCs', () => {
  it('lists every PC by host name, and those of one status when asked', async () => {
    await approved();
    await registered({ hostname: 'LAB1-A2', mac: 'aa:bb:cc:00:11:33' });

    const all = await asAdmin('get', '/api/devices');
    const waiting = await asAdmin('get', '/api/devices?status=waiting');

    expect(all.status).toBe(200);
    expect(all.body.items.map((pc: DeviceView) => [pc.hostname, pc.status])).toEqual([
      ['LAB1-A1', 'online'],
      ['LAB1-A2', 'waiting'],
    ]);
    expect(waiting.body.items.map((pc: DeviceView) => pc.hostname)).toEqual(['LAB1-A2']);
  });

  it('is the admin’s alone', async () => {
    const pc = await registered();

    const list = await http()
      .get('/api/devices')
      .set('Authorization', `Bearer ${world.sara.token}`);
    const approve = await http()
      .patch(`/api/devices/${pc.id}`)
      .set('Authorization', `Bearer ${world.sara.token}`)
      .send({ action: 'approve' });

    expect(list.status).toBe(403);
    expect(approve.status).toBe(403);
    expect(await keys.resolveDevice(pc.key)).toBeNull();
  });
});
