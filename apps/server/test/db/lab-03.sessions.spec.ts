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
  await prisma.classTeacher.create({ data: { classId: taught.id, teacherId: teacher.id } });
  return { labRoom, taught, teacher };
}

async function createStudent(username: string, fullName = 'Ayesha Khan') {
  return prisma.user.create({
    data: { role: 'student', username, passwordHash: 'argon2id-hash', fullName },
  });
}

describe('LAB-03 class sessions', () => {
  it('opens a session for a class, taught by one teacher in one lab', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();

    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });

    expect(session.status).toBe('open');
    expect(session.startedAt).toBeInstanceOf(Date);
    expect(session.endedAt).toBeNull();
  });

  it('closes a session at End class without deleting it', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });

    const closed = await prisma.classSession.update({
      where: { id: session.id },
      data: { status: 'closed', endedAt: new Date() },
    });

    expect(closed.status).toBe('closed');
    expect(closed.endedAt).toBeInstanceOf(Date);
  });
});

describe('LAB-03 attendance', () => {
  it('marks a present student at the seat they logged in at', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });
    const student = await createStudent('S-1001');
    const seat = await prisma.seat.create({
      data: { labRoomId: labRoom.id, code: 'A1', row: 'A', position: 1 },
    });

    const row = await prisma.attendance.create({
      data: {
        sessionId: session.id,
        studentId: student.id,
        status: 'present',
        seatId: seat.id,
        firstSeenAt: new Date(),
      },
    });

    expect(row.status).toBe('present');
    expect(row.seatId).toBe(seat.id);
  });

  it('marks an absent student with no seat', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });
    const student = await createStudent('S-1001');

    const row = await prisma.attendance.create({
      data: { sessionId: session.id, studentId: student.id, status: 'absent' },
    });

    expect(row.seatId).toBeNull();
    expect(row.firstSeenAt).toBeNull();
  });

  it('keeps one attendance row per student per session', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });
    const student = await createStudent('S-1001');
    await prisma.attendance.create({
      data: { sessionId: session.id, studentId: student.id, status: 'absent' },
    });

    expect(
      await errorCode(
        prisma.attendance.create({
          data: { sessionId: session.id, studentId: student.id, status: 'present' },
        }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('turns an absent student late when they log in during the class', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });
    const student = await createStudent('S-1001');
    await prisma.attendance.create({
      data: { sessionId: session.id, studentId: student.id, status: 'absent' },
    });

    const late = await prisma.attendance.update({
      where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
      data: { status: 'late', firstSeenAt: new Date() },
    });

    expect(late.status).toBe('late');
  });
});

describe('LAB-03 session events', () => {
  it('logs a lab command with its targets and payload', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });

    const event = await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        actorId: teacher.id,
        type: 'broadcast.start',
        targets: ['A1', 'A2', 'B1'],
        payload: { quality: '1080p15' },
      },
    });

    expect(event.targets).toEqual(['A1', 'A2', 'B1']);
    expect(event.payload).toEqual({ quality: '1080p15' });
    expect(event.createdAt).toBeInstanceOf(Date);
  });

  it('logs a command that went to every logged-in seat', async () => {
    const { labRoom, taught, teacher } = await createTaughtClass();
    const session = await prisma.classSession.create({
      data: { classId: taught.id, labRoomId: labRoom.id, teacherId: teacher.id },
    });

    const event = await prisma.sessionEvent.create({
      data: { sessionId: session.id, actorId: teacher.id, type: 'lock' },
    });

    expect(event.targets).toEqual([]);
    expect(event.payload).toEqual({});
  });
});
