import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { LabSeat, LabView } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { addStudent, buildClassesWorld, type ClassesWorld } from '../support/classes-world.js';

/**
 * ADM-04 (T-ADM-04): the admin creates labs and their seat maps (rows, seats
 * per row, pairs and aisles) and changes them, and the seat map shows each
 * seat's PC and who is logged in there now. A teacher sees every seat but the
 * names only of students in their own classes.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let world: ClassesWorld;

const NOW = new Date('2026-11-04T09:00:00.000Z');

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(NOW);
  world = await buildClassesWorld(app, prisma);
});

afterAll(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

function as(token: string, method: 'get' | 'post' | 'patch', path: string) {
  return http()[method](path).set('Authorization', `Bearer ${token}`);
}

const asAdmin = (method: 'get' | 'post' | 'patch', path: string) =>
  as(world.adminToken, method, path);

const MISSING = '0190f5a0-0000-7000-8000-000000000999';

async function newLab(body: object = {}): Promise<LabView> {
  const res = await asAdmin('post', '/api/labs').send({
    name: 'Lab 2',
    rows: 2,
    seatsPerRow: 3,
    ...body,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as LabView;
}

function seatCodes(labId: string) {
  return prisma.seat
    .findMany({ where: { labRoomId: labId }, orderBy: [{ row: 'asc' }, { position: 'asc' }] })
    .then((seats) => seats.map((seat) => seat.code));
}

describe('T-ADM-04 creating a lab', () => {
  it('creates the lab and every seat in it, row A first', async () => {
    const lab = await newLab({ layout: { pairs: true, aisles: [2] } });

    expect(lab).toEqual({
      id: expect.any(String),
      name: 'Lab 2',
      rows: 2,
      seatsPerRow: 3,
      layout: { pairs: true, aisles: [2] },
      seatCount: 6,
      pcCount: 0,
    });
    expect(await seatCodes(lab.id)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  });

  it('refuses an aisle after the last seat of a row, where there is no walkway', async () => {
    const res = await asAdmin('post', '/api/labs').send({
      name: 'Lab 2',
      rows: 2,
      seatsPerRow: 3,
      layout: { pairs: false, aisles: [3] },
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('AISLE_OUTSIDE_ROW');
    expect(await prisma.labRoom.count()).toBe(1);
  });

  it('lists the labs by name, with how many seats and bound PCs each has', async () => {
    await prisma.seat.createMany({
      data: [
        { labRoomId: world.labRoomId, code: 'A1', row: 'A', position: 1 },
        { labRoomId: world.labRoomId, code: 'A2', row: 'A', position: 2 },
      ],
    });
    const seat = await prisma.seat.findFirstOrThrow({ where: { code: 'A1' } });
    await prisma.device.create({
      data: { hostname: 'LAB1-A1', mac: 'aa:bb:cc:00:00:01', seatId: seat.id, approved: true },
    });
    await newLab({ name: 'Language Lab 0' });

    const res = await asAdmin('get', '/api/labs');

    expect(res.status).toBe(200);
    expect(res.body.items.map((lab: LabView) => [lab.name, lab.seatCount, lab.pcCount])).toEqual([
      ['Lab 1', 2, 1],
      ['Language Lab 0', 6, 0],
    ]);
  });

  it('is the admin’s alone', async () => {
    const res = await as(world.sara.token, 'post', '/api/labs').send({
      name: 'Lab 2',
      rows: 2,
      seatsPerRow: 3,
    });

    expect(res.status).toBe(403);
  });
});

describe('T-ADM-04 changing a lab', () => {
  it('renames it and changes its layout', async () => {
    const lab = await newLab();

    const res = await asAdmin('patch', `/api/labs/${lab.id}`).send({
      name: 'Lab 2 (upstairs)',
      layout: { pairs: true, aisles: [1] },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Lab 2 (upstairs)',
      layout: { pairs: true, aisles: [1] },
    });
  });

  it('adds the seats of a new row and a wider row', async () => {
    const lab = await newLab();

    const res = await asAdmin('patch', `/api/labs/${lab.id}`).send({ rows: 3, seatsPerRow: 4 });

    expect(res.body).toMatchObject({ rows: 3, seatsPerRow: 4, seatCount: 12 });
    expect(await seatCodes(lab.id)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'B1',
      'B2',
      'B3',
      'B4',
      'C1',
      'C2',
      'C3',
      'C4',
    ]);
  });

  it('removes seats nobody has used', async () => {
    const lab = await newLab();

    const res = await asAdmin('patch', `/api/labs/${lab.id}`).send({ rows: 1, seatsPerRow: 2 });

    expect(res.status).toBe(200);
    expect(await seatCodes(lab.id)).toEqual(['A1', 'A2']);
  });

  it('keeps a seat with a PC on it, and changes nothing', async () => {
    const lab = await newLab();
    const seat = await prisma.seat.findFirstOrThrow({ where: { labRoomId: lab.id, code: 'B3' } });
    await prisma.device.create({
      data: { hostname: 'LAB2-B3', mac: 'aa:bb:cc:00:00:02', seatId: seat.id, approved: true },
    });

    const res = await asAdmin('patch', `/api/labs/${lab.id}`).send({ rows: 1, name: 'Renamed' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEAT_IN_USE');
    expect(res.body.error.details).toEqual({ seats: ['B3'] });
    expect(await prisma.labRoom.findUniqueOrThrow({ where: { id: lab.id } })).toMatchObject({
      name: 'Lab 2',
      rows: 2,
    });
  });

  it('keeps a seat someone has logged in at, so the history of who sat where stays', async () => {
    const lab = await newLab();
    const seat = await prisma.seat.findFirstOrThrow({ where: { labRoomId: lab.id, code: 'A3' } });
    const device = await prisma.device.create({
      data: { hostname: 'LAB2-A3', mac: 'aa:bb:cc:00:00:03', approved: true },
    });
    const student = await addStudent(prisma, {
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      rollNo: '1',
    });
    await prisma.deviceLogin.create({
      data: {
        deviceId: device.id,
        seatId: seat.id,
        studentId: student,
        loggedOutAt: new Date('2026-11-01T10:00:00.000Z'),
        logoutReason: 'manual',
      },
    });

    const res = await asAdmin('patch', `/api/labs/${lab.id}`).send({ seatsPerRow: 2 });

    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ seats: ['A3'] });
  });

  it('refuses an aisle outside the new width', async () => {
    const lab = await newLab({ layout: { pairs: false, aisles: [2] } });

    const res = await asAdmin('patch', `/api/labs/${lab.id}`).send({ seatsPerRow: 2 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('AISLE_OUTSIDE_ROW');
  });

  it('answers 404 for a lab that does not exist', async () => {
    const res = await asAdmin('patch', `/api/labs/${MISSING}`).send({ name: 'Anything' });

    expect(res.status).toBe(404);
  });
});

describe('T-ADM-04 the seat map', () => {
  let lab: LabView;
  let ayesha: string;
  let zara: string;

  /** A1: PC online with Ayesha (B-12); A2: PC online with Zara (B-13); A3: PC offline; B1: PC waiting; the rest empty. */
  beforeEach(async () => {
    lab = await newLab({ layout: { pairs: true, aisles: [] } });
    const seat = async (code: string) =>
      (await prisma.seat.findFirstOrThrow({ where: { labRoomId: lab.id, code } })).id;
    ayesha = await addStudent(prisma, {
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      rollNo: '1',
      classId: world.classes.b12,
    });
    zara = await addStudent(prisma, {
      username: 'S-1002',
      fullName: 'Zara Malik',
      rollNo: '1',
      classId: world.classes.b13,
    });

    const a1 = await prisma.device.create({
      data: {
        hostname: 'LAB2-A1',
        mac: 'aa:bb:cc:00:00:11',
        seatId: await seat('A1'),
        approved: true,
        ip: '192.168.10.101',
        appVersion: '1.0.0',
        lastSeenAt: new Date(NOW.getTime() - 30_000),
      },
    });
    const a2 = await prisma.device.create({
      data: {
        hostname: 'LAB2-A2',
        mac: 'aa:bb:cc:00:00:12',
        seatId: await seat('A2'),
        approved: true,
        lastSeenAt: new Date(NOW.getTime() - 60_000),
      },
    });
    await prisma.device.create({
      data: {
        hostname: 'LAB2-A3',
        mac: 'aa:bb:cc:00:00:13',
        seatId: await seat('A3'),
        approved: true,
        lastSeenAt: new Date('2026-11-03T16:42:00.000Z'),
      },
    });
    await prisma.device.create({
      data: { hostname: 'LAB2-B1', mac: 'aa:bb:cc:00:00:14', seatId: await seat('B1') },
    });
    await prisma.deviceLogin.createMany({
      data: [
        { deviceId: a1.id, seatId: await seat('A1'), studentId: ayesha },
        { deviceId: a2.id, seatId: await seat('A2'), studentId: zara },
      ],
    });
  });

  it('shows the admin every seat, its PC and who is logged in', async () => {
    const res = await asAdmin('get', `/api/labs/${lab.id}/seats`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.lab).toMatchObject({ id: lab.id, name: 'Lab 2', layout: { pairs: true } });
    const seats = res.body.seats as LabSeat[];
    expect(seats.map((seat) => seat.code)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    expect(seats[0]).toEqual({
      id: expect.any(String),
      code: 'A1',
      row: 'A',
      position: 1,
      device: {
        id: expect.any(String),
        hostname: 'LAB2-A1',
        ip: '192.168.10.101',
        appVersion: '1.0.0',
        status: 'online',
        lastSeenAt: '2026-11-04T08:59:30.000Z',
      },
      occupied: true,
      student: { id: ayesha, username: 'S-1001', fullName: 'Ayesha Khan' },
    });
    expect(seats.map((seat) => seat.device?.status ?? null)).toEqual([
      'online',
      'online',
      'offline',
      'waiting',
      null,
      null,
    ]);
    expect(seats[1]?.student?.fullName).toBe('Zara Malik');
    expect(seats[4]).toMatchObject({ device: null, occupied: false, student: null });
  });

  it('counts a PC as offline once it has not been seen for two minutes', async () => {
    context.clock.set(new Date(NOW.getTime() + 2 * 60_000));

    const res = await asAdmin('get', `/api/labs/${lab.id}/seats`);

    expect(res.body.seats[0].device.status).toBe('offline');
  });

  it('shows a teacher the names of their own students only', async () => {
    const res = await as(world.sara.token, 'get', `/api/labs/${lab.id}/seats`);

    expect(res.status).toBe(200);
    const [a1, a2] = res.body.seats as LabSeat[];
    expect(a1).toMatchObject({ occupied: true, student: { fullName: 'Ayesha Khan' } });
    expect(a2).toMatchObject({ occupied: true, student: null });
  });

  it('does not count a student who has left the teacher’s class as theirs', async () => {
    await prisma.enrollment.update({
      where: { classId_studentId: { classId: world.classes.b12, studentId: ayesha } },
      data: { status: 'left' },
    });

    const res = await as(world.sara.token, 'get', `/api/labs/${lab.id}/seats`);

    expect(res.body.seats[0]).toMatchObject({ occupied: true, student: null });
  });

  it('shows a seat as free once the student has logged out', async () => {
    await prisma.deviceLogin.updateMany({
      where: { studentId: ayesha },
      data: { loggedOutAt: NOW, logoutReason: 'manual' },
    });

    const res = await asAdmin('get', `/api/labs/${lab.id}/seats`);

    expect(res.body.seats[0]).toMatchObject({ occupied: false, student: null });
  });

  it('answers 404 for a lab that does not exist', async () => {
    const res = await as(world.sara.token, 'get', `/api/labs/${MISSING}/seats`);

    expect(res.status).toBe(404);
  });
});
