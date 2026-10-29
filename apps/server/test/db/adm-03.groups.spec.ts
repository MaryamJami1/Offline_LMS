import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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

async function createTaughtClass() {
  const labRoom = await prisma.labRoom.create({
    data: { name: 'Lab 1', rows: 5, seatsPerRow: 6 },
  });
  const course = await prisma.course.create({ data: { name: 'Spoken English' } });
  const batch = await prisma.batch.create({
    data: { courseId: course.id, name: 'Fall 2026', startsOn: new Date('2026-09-01') },
  });
  const taught = await prisma.class.create({
    data: { batchId: batch.id, code: 'B-12', name: 'Morning B', labRoomId: labRoom.id },
  });
  const teacher = await prisma.user.create({
    data: {
      role: 'teacher',
      username: 'sara.iqbal',
      passwordHash: 'argon2id-hash',
      fullName: 'Sara Iqbal',
    },
  });
  return { labRoom, taught, teacher };
}

async function createStudent(username: string, fullName = 'Ayesha Khan') {
  return prisma.user.create({
    data: { role: 'student', username, passwordHash: 'argon2id-hash', fullName },
  });
}

describe('ADM-03 groups', () => {
  it('keeps a class group with its members', async () => {
    const { taught } = await createTaughtClass();
    const first = await createStudent('S-1001');
    const second = await createStudent('S-1002', 'Bilal Ahmed');

    const group = await prisma.group.create({
      data: {
        classId: taught.id,
        name: 'Pair 1',
        kind: 'pair',
        members: { create: [{ studentId: first.id }, { studentId: second.id }] },
      },
      include: { members: true },
    });

    expect(group.sessionId).toBeNull();
    expect(group.members).toHaveLength(2);
  });

  it('records how a group was made', async () => {
    const { taught } = await createTaughtClass();

    const random = await prisma.group.create({
      data: { classId: taught.id, name: 'Group 1', kind: 'random' },
    });
    const manual = await prisma.group.create({
      data: { classId: taught.id, name: 'Group 2', kind: 'manual' },
    });

    expect(random.kind).toBe('random');
    expect(manual.kind).toBe('manual');
  });

  it('refuses the same student twice in one group', async () => {
    const { taught } = await createTaughtClass();
    const student = await createStudent('S-1001');
    const group = await prisma.group.create({
      data: { classId: taught.id, name: 'Pair 1', kind: 'pair' },
    });
    await prisma.groupMember.create({ data: { groupId: group.id, studentId: student.id } });

    expect(
      await errorCode(
        prisma.groupMember.create({ data: { groupId: group.id, studentId: student.id } }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('lets a student be in two groups of the same class', async () => {
    const { taught } = await createTaughtClass();
    const student = await createStudent('S-1001');
    const pair = await prisma.group.create({
      data: { classId: taught.id, name: 'Pair 1', kind: 'pair' },
    });
    const four = await prisma.group.create({
      data: { classId: taught.id, name: 'Group 1', kind: 'random' },
    });

    await prisma.groupMember.createMany({
      data: [
        { groupId: pair.id, studentId: student.id },
        { groupId: four.id, studentId: student.id },
      ],
    });

    expect(await prisma.groupMember.count({ where: { studentId: student.id } })).toBe(2);
  });

  it('drops a group made for one class session when that session is deleted', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });
    const forThisClass = await prisma.group.create({
      data: { classId: taught.id, sessionId: session.id, name: 'Pair 1', kind: 'pair' },
    });
    const lasting = await prisma.group.create({
      data: { classId: taught.id, name: 'Reading group', kind: 'manual' },
    });

    await prisma.classSession.delete({ where: { id: session.id } });

    expect(await prisma.group.findUnique({ where: { id: forThisClass.id } })).toBeNull();
    expect(await prisma.group.findUnique({ where: { id: lasting.id } })).not.toBeNull();
  });
});
