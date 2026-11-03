import { createHash } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/**
 * Students log in only at an approved lab PC that is bound to a seat (STU-01).
 * Specs about something else still need students to log in, so this gives
 * each student account a PC of its own in a lab of its own, and the key to
 * send. One PC per student keeps them from taking each other's seat, which a
 * shared PC would do.
 */

export const TEST_LAB_NAME = 'Test lab';

/** Seat codes run T1, T2, …, in the order the PCs are made. */
async function testLab(prisma: PrismaClient): Promise<string> {
  const found = await prisma.labRoom.findFirst({ where: { name: TEST_LAB_NAME } });
  if (found !== null) {
    return found.id;
  }
  const lab = await prisma.labRoom.create({
    data: { name: TEST_LAB_NAME, rows: 1, seatsPerRow: 20 },
  });
  return lab.id;
}

function keyFor(name: string): string {
  return `test-pc-key-for-${name.toLowerCase()}`;
}

/** A locally administered MAC address, made from the name so it is the same every time. */
function macFor(name: string): string {
  const hex = createHash('sha256').update(name.toLowerCase()).digest('hex').slice(0, 10);
  return ['02', ...(hex.match(/.{2}/g) ?? [])].join(':');
}

export interface LabPc {
  deviceId: string;
  seatId: string;
  seatCode: string;
  key: string;
}

/** An approved, seated PC named after `name`, made the first time it is asked for. */
export async function labPc(prisma: PrismaClient, name: string): Promise<LabPc> {
  const key = keyFor(name);
  const mac = macFor(name);
  const existing = await prisma.device.findUnique({ where: { mac }, include: { seat: true } });
  if (existing !== null && existing.seat !== null) {
    return { deviceId: existing.id, seatId: existing.seat.id, seatCode: existing.seat.code, key };
  }

  const labRoomId = await testLab(prisma);
  const position = (await prisma.seat.count({ where: { labRoomId } })) + 1;
  const seat = await prisma.seat.create({
    data: { labRoomId, code: `T${position}`, row: 'T', position },
  });
  const device = await prisma.device.create({
    data: {
      hostname: `TEST-${position}`,
      mac,
      seatId: seat.id,
      approved: true,
      deviceKeyHash: createHash('sha256').update(key).digest('hex'),
    },
  });
  return { deviceId: device.id, seatId: seat.id, seatCode: seat.code, key };
}

/**
 * The device key a login as `username` should send: the key of the student's
 * own PC, or none for staff, who do not log in at a lab PC.
 */
export async function loginKeyFor(
  prisma: PrismaClient,
  username: string,
): Promise<string | undefined> {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });
  if (user?.role !== 'student') {
    return undefined;
  }
  return (await labPc(prisma, username)).key;
}

/**
 * `POST /api/auth/login` as a test would send it: a student from their own
 * lab PC, staff from anywhere.
 */
export async function postLogin(app: INestApplication, body: object): Promise<request.Response> {
  const prisma = app.get(PrismaService) as PrismaClient;
  const username = (body as { username?: unknown }).username;
  const key = typeof username === 'string' ? await loginKeyFor(prisma, username) : undefined;
  const call = request(app.getHttpServer()).post('/api/auth/login');
  if (key !== undefined) {
    call.set('X-Device-Key', key);
  }
  return call.send(body);
}
