import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildSeatMap } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { UNIQUE_VIOLATION, createTestPrisma, errorCode, resetDatabase } from './database.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createLab(name: string, rows = 5, seatsPerRow = 6) {
  const lab = await prisma.labRoom.create({ data: { name, rows, seatsPerRow } });
  await prisma.seat.createMany({
    data: buildSeatMap({ rows, seatsPerRow }).map((seat) => ({ labRoomId: lab.id, ...seat })),
  });
  return lab;
}

describe('ADM-04 labs and seat maps', () => {
  it('stores Lab 1 as 5 rows of 6 seats', async () => {
    const lab = await createLab('Lab 1');

    expect(lab.rows).toBe(5);
    expect(lab.seatsPerRow).toBe(6);
    expect(await prisma.seat.count({ where: { labRoomId: lab.id } })).toBe(30);
  });

  it('starts a new lab with an empty layout, ready for pairs and gaps', async () => {
    const lab = await prisma.labRoom.create({ data: { name: 'Lab 2', rows: 1, seatsPerRow: 2 } });

    expect(lab.layout).toEqual({});
  });

  it('keeps the pairs and gaps of a seat layout', async () => {
    const lab = await prisma.labRoom.create({
      data: {
        name: 'Lab 3',
        rows: 1,
        seatsPerRow: 4,
        layout: { pairs: [['A1', 'A2']], gaps: ['A3'] },
      },
    });

    expect(lab.layout).toEqual({ pairs: [['A1', 'A2']], gaps: ['A3'] });
  });

  it('refuses two seats with the same code in one lab', async () => {
    const lab = await createLab('Lab 1');

    expect(
      await errorCode(
        prisma.seat.create({ data: { labRoomId: lab.id, code: 'A1', row: 'A', position: 1 } }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('allows the same seat code in a second lab', async () => {
    await createLab('Lab 1');
    const second = await prisma.labRoom.create({
      data: { name: 'Lab 2', rows: 1, seatsPerRow: 1 },
    });

    const seat = await prisma.seat.create({
      data: { labRoomId: second.id, code: 'A1', row: 'A', position: 1 },
    });

    expect(seat.code).toBe('A1');
    expect(await prisma.seat.count({ where: { code: 'A1' } })).toBe(2);
  });
});

describe('ADM-04 lab PCs', () => {
  it('registers a PC with only its hostname and MAC, waiting for approval', async () => {
    const device = await prisma.device.create({
      data: { hostname: 'LAB1-A1', mac: '00:1B:44:11:3A:B7' },
    });

    expect(device.approved).toBe(false);
    expect(device.seatId).toBeNull();
    expect(device.deviceKeyHash).toBeNull();
    expect(device.lastSeenAt).toBeNull();
  });

  it('refuses a second PC with the same MAC address', async () => {
    await prisma.device.create({ data: { hostname: 'LAB1-A1', mac: '00:1B:44:11:3A:B7' } });

    expect(
      await errorCode(
        prisma.device.create({ data: { hostname: 'LAB1-A2', mac: '00:1B:44:11:3A:B7' } }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('binds an approved PC to one seat, with its key and address', async () => {
    const lab = await createLab('Lab 1');
    const seat = await prisma.seat.findFirstOrThrow({ where: { labRoomId: lab.id, code: 'A1' } });

    const device = await prisma.device.create({
      data: {
        hostname: 'LAB1-A1',
        mac: '00:1B:44:11:3A:B7',
        seatId: seat.id,
        ip: '192.168.10.31',
        osVersion: 'Windows 11 Pro 23H2',
        appVersion: '0.1.0',
        deviceKeyHash: 'argon2id-hash',
        approved: true,
      },
    });

    expect(device.seatId).toBe(seat.id);
    expect(device.ip).toBe('192.168.10.31');
    expect(device.approved).toBe(true);
  });

  it('refuses a second PC on the same seat', async () => {
    const lab = await createLab('Lab 1');
    const seat = await prisma.seat.findFirstOrThrow({ where: { labRoomId: lab.id, code: 'A1' } });
    await prisma.device.create({
      data: { hostname: 'LAB1-A1', mac: '00:1B:44:11:3A:B7', seatId: seat.id, approved: true },
    });

    expect(
      await errorCode(
        prisma.device.create({
          data: { hostname: 'LAB1-A1-spare', mac: '00:1B:44:11:3A:B8', seatId: seat.id },
        }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });
});
