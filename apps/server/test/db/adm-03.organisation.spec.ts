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

async function createTeacher(username: string, fullName = 'Sara Iqbal') {
  return prisma.user.create({
    data: { role: 'teacher', username, passwordHash: 'argon2id-hash', fullName },
  });
}

async function createStudent(username: string, fullName = 'Ayesha Khan') {
  return prisma.user.create({
    data: { role: 'student', username, passwordHash: 'argon2id-hash', fullName },
  });
}

async function createClass(code: string) {
  const lab = await prisma.labRoom.findFirst();
  const labRoom =
    lab ?? (await prisma.labRoom.create({ data: { name: 'Lab 1', rows: 5, seatsPerRow: 6 } }));
  const course = await prisma.course.create({
    data: { name: 'Spoken English', description: 'Everyday speaking and listening' },
  });
  const batch = await prisma.batch.create({
    data: { courseId: course.id, name: 'Fall 2026', startsOn: new Date('2026-09-01') },
  });
  return prisma.class.create({
    data: {
      batchId: batch.id,
      code,
      name: 'Morning B',
      labRoomId: labRoom.id,
      schedule: { days: ['Mon', 'Wed'], startTime: '09:00', minutes: 90 },
    },
  });
}

describe('ADM-03 courses, batches and classes', () => {
  it('stores a course, its batch and a class in the lab', async () => {
    const created = await createClass('B-12');

    const found = await prisma.class.findUniqueOrThrow({
      where: { code: 'B-12' },
      include: { batch: { include: { course: true } }, labRoom: true },
    });

    expect(found.id).toBe(created.id);
    expect(found.batch.course.name).toBe('Spoken English');
    expect(found.batch.endsOn).toBeNull();
    expect(found.labRoom.name).toBe('Lab 1');
    expect(found.schedule).toEqual({ days: ['Mon', 'Wed'], startTime: '09:00', minutes: 90 });
  });

  it('refuses a second class with the same code', async () => {
    await createClass('B-12');

    expect(await errorCode(createClass('B-12'))).toBe(UNIQUE_VIOLATION);
  });
});

describe('ADM-03 class teachers', () => {
  it('lets a class have more than one teacher', async () => {
    const taught = await createClass('B-12');
    const first = await createTeacher('sara.iqbal');
    const second = await createTeacher('imran.ali', 'Imran Ali');

    await prisma.classTeacher.createMany({
      data: [
        { classId: taught.id, teacherId: first.id },
        { classId: taught.id, teacherId: second.id },
      ],
    });

    expect(await prisma.classTeacher.count({ where: { classId: taught.id } })).toBe(2);
  });

  it('refuses the same teacher twice on one class', async () => {
    const taught = await createClass('B-12');
    const teacher = await createTeacher('sara.iqbal');
    await prisma.classTeacher.create({ data: { classId: taught.id, teacherId: teacher.id } });

    expect(
      await errorCode(
        prisma.classTeacher.create({ data: { classId: taught.id, teacherId: teacher.id } }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });
});

describe('ADM-03 enrolments', () => {
  it('enrols a student in a class as active', async () => {
    const taught = await createClass('B-12');
    const student = await createStudent('S-1001');

    const enrolment = await prisma.enrollment.create({
      data: { classId: taught.id, studentId: student.id, enrolledOn: new Date('2026-09-01') },
    });

    expect(enrolment.status).toBe('active');
  });

  it('refuses the same student twice in one class', async () => {
    const taught = await createClass('B-12');
    const student = await createStudent('S-1001');
    await prisma.enrollment.create({
      data: { classId: taught.id, studentId: student.id, enrolledOn: new Date('2026-09-01') },
    });

    expect(
      await errorCode(
        prisma.enrollment.create({
          data: { classId: taught.id, studentId: student.id, enrolledOn: new Date('2026-09-02') },
        }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('allows one student in two classes', async () => {
    const morning = await createClass('B-12');
    const evening = await createClass('B-13');
    const student = await createStudent('S-1001');

    await prisma.enrollment.createMany({
      data: [
        { classId: morning.id, studentId: student.id, enrolledOn: new Date('2026-09-01') },
        { classId: evening.id, studentId: student.id, enrolledOn: new Date('2026-09-01') },
      ],
    });

    expect(await prisma.enrollment.count({ where: { studentId: student.id } })).toBe(2);
  });

  it('marks a student who leaves instead of removing the enrolment', async () => {
    const taught = await createClass('B-12');
    const student = await createStudent('S-1001');
    await prisma.enrollment.create({
      data: { classId: taught.id, studentId: student.id, enrolledOn: new Date('2026-09-01') },
    });

    const left = await prisma.enrollment.update({
      where: { classId_studentId: { classId: taught.id, studentId: student.id } },
      data: { status: 'left' },
    });

    expect(left.status).toBe('left');
    expect(await prisma.enrollment.count()).toBe(1);
  });
});
