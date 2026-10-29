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

/** Lab 1 with two approved PCs, on seats A1 and A2. */
async function createLabWithTwoPcs() {
  const lab = await prisma.labRoom.create({ data: { name: 'Lab 1', rows: 5, seatsPerRow: 6 } });
  await prisma.seat.createMany({
    data: buildSeatMap({ rows: 5, seatsPerRow: 6 }).map((seat) => ({ labRoomId: lab.id, ...seat })),
  });
  const seats = await prisma.seat.findMany({
    where: { labRoomId: lab.id, code: { in: ['A1', 'A2'] } },
    orderBy: { code: 'asc' },
  });
  const [a1, a2] = seats as [(typeof seats)[number], (typeof seats)[number]];
  const first = await prisma.device.create({
    data: { hostname: 'LAB1-A1', mac: '00:1B:44:11:3A:B7', seatId: a1.id, approved: true },
  });
  const second = await prisma.device.create({
    data: { hostname: 'LAB1-A2', mac: '00:1B:44:11:3A:B8', seatId: a2.id, approved: true },
  });
  return { lab, a1, a2, first, second };
}

async function createStudent(username: string, fullName = 'Ayesha Khan') {
  return prisma.user.create({
    data: { role: 'student', username, passwordHash: 'argon2id-hash', fullName },
  });
}

describe('STU-01 seat logins', () => {
  it('records which student sat at which seat on which PC', async () => {
    const { a1, first } = await createLabWithTwoPcs();
    const student = await createStudent('S-1001');

    const login = await prisma.deviceLogin.create({
      data: { deviceId: first.id, seatId: a1.id, studentId: student.id },
    });

    expect(login.loggedInAt).toBeInstanceOf(Date);
    expect(login.loggedOutAt).toBeNull();
    expect(login.logoutReason).toBeNull();
  });

  it('refuses a second open login for the same student', async () => {
    const { a1, a2, first, second } = await createLabWithTwoPcs();
    const student = await createStudent('S-1001');
    await prisma.deviceLogin.create({
      data: { deviceId: first.id, seatId: a1.id, studentId: student.id },
    });

    expect(
      await errorCode(
        prisma.deviceLogin.create({
          data: { deviceId: second.id, seatId: a2.id, studentId: student.id },
        }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('refuses a second open login on the same PC', async () => {
    const { a1, first } = await createLabWithTwoPcs();
    const student = await createStudent('S-1001');
    const classmate = await createStudent('S-1002', 'Bilal Ahmed');
    await prisma.deviceLogin.create({
      data: { deviceId: first.id, seatId: a1.id, studentId: student.id },
    });

    expect(
      await errorCode(
        prisma.deviceLogin.create({
          data: { deviceId: first.id, seatId: a1.id, studentId: classmate.id },
        }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('lets a student log in again at another seat once the first login ended', async () => {
    const { a1, a2, first, second } = await createLabWithTwoPcs();
    const student = await createStudent('S-1001');
    const morning = await prisma.deviceLogin.create({
      data: { deviceId: first.id, seatId: a1.id, studentId: student.id },
    });

    await prisma.deviceLogin.update({
      where: { id: morning.id },
      data: { loggedOutAt: new Date(), logoutReason: 'class_end' },
    });
    const afternoon = await prisma.deviceLogin.create({
      data: { deviceId: second.id, seatId: a2.id, studentId: student.id },
    });

    expect(afternoon.seatId).toBe(a2.id);
    expect(await prisma.deviceLogin.count({ where: { studentId: student.id } })).toBe(2);
    const earlier = await prisma.deviceLogin.findUniqueOrThrow({ where: { id: morning.id } });
    expect(earlier.seatId).toBe(a1.id);
    expect(earlier.logoutReason).toBe('class_end');
  });

  it('lets two students sit at two PCs at the same time', async () => {
    const { a1, a2, first, second } = await createLabWithTwoPcs();
    const student = await createStudent('S-1001');
    const classmate = await createStudent('S-1002', 'Bilal Ahmed');

    await prisma.deviceLogin.create({
      data: { deviceId: first.id, seatId: a1.id, studentId: student.id },
    });
    await prisma.deviceLogin.create({
      data: { deviceId: second.id, seatId: a2.id, studentId: classmate.id },
    });

    expect(await prisma.deviceLogin.count({ where: { loggedOutAt: null } })).toBe(2);
  });

  it('keeps the seat history of a PC after it is unbound from its seat', async () => {
    const { a1, first } = await createLabWithTwoPcs();
    const student = await createStudent('S-1001');
    const login = await prisma.deviceLogin.create({
      data: { deviceId: first.id, seatId: a1.id, studentId: student.id },
    });
    await prisma.deviceLogin.update({
      where: { id: login.id },
      data: { loggedOutAt: new Date(), logoutReason: 'manual' },
    });

    await prisma.device.update({ where: { id: first.id }, data: { seatId: null } });

    const kept = await prisma.deviceLogin.findUniqueOrThrow({ where: { id: login.id } });
    expect(kept.seatId).toBe(a1.id);
    expect(kept.studentId).toBe(student.id);
  });

  it('records every way a login can end', async () => {
    const { a1, first } = await createLabWithTwoPcs();
    const reasons = ['manual', 'class_end', 'idle', 'admin'] as const;

    for (const [index, reason] of reasons.entries()) {
      const student = await createStudent(`S-20${index}`);
      const login = await prisma.deviceLogin.create({
        data: { deviceId: first.id, seatId: a1.id, studentId: student.id },
      });
      const ended = await prisma.deviceLogin.update({
        where: { id: login.id },
        data: { loggedOutAt: new Date(), logoutReason: reason },
      });
      expect(ended.logoutReason).toBe(reason);
    }
  });
});
