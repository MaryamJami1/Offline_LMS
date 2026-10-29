// Covers ADM-01 (accounts and first passwords), ADM-03 (course, batch, classes
// and enrolments), ADM-04 (Lab 1 and its seat map) and ADM-07 (default settings,
// software name "Lab").
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SETTING_KEYS } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { verifyPassword } from '../../src/auth/password.js';
import { DEFAULT_SEED_PASSWORD, seed } from '../../src/seed/seed.js';
import { createTestPrisma, resetDatabase } from './database.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seed(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Seed: people', () => {
  it('creates one admin, two teachers and thirty students', async () => {
    expect(await prisma.user.count({ where: { role: 'admin' } })).toBe(1);
    expect(await prisma.user.count({ where: { role: 'teacher' } })).toBe(2);
    expect(await prisma.user.count({ where: { role: 'student' } })).toBe(30);
  });

  it('numbers students S-1001 to S-1030, each with a profile', async () => {
    const students = await prisma.user.findMany({
      where: { role: 'student' },
      orderBy: { username: 'asc' },
      include: { studentProfile: true },
    });

    expect(students[0]?.username).toBe('S-1001');
    expect(students[29]?.username).toBe('S-1030');
    expect(students.every((student) => student.studentProfile !== null)).toBe(true);
    expect(students.every((student) => student.fullName.trim().length > 0)).toBe(true);
  });

  it('gives each teacher a profile with their subjects', async () => {
    const teachers = await prisma.user.findMany({
      where: { role: 'teacher' },
      include: { teacherProfile: true },
    });

    expect(teachers).toHaveLength(2);
    expect(teachers.every((teacher) => (teacher.teacherProfile?.subjects.length ?? 0) > 0)).toBe(
      true,
    );
  });

  it('sets a first password that works and must be changed at first login', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

    expect(admin.mustChangePassword).toBe(true);
    expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(admin.passwordHash, DEFAULT_SEED_PASSWORD)).toBe(true);
  });

  it('never stores a password in plain text', async () => {
    const users = await prisma.user.findMany();

    expect(users.every((user) => !user.passwordHash.includes(DEFAULT_SEED_PASSWORD))).toBe(true);
  });
});

describe('Seed: classes', () => {
  it('creates two classes in one batch of one course', async () => {
    expect(await prisma.course.count()).toBe(1);
    expect(await prisma.batch.count()).toBe(1);

    const classes = await prisma.class.findMany({ orderBy: { code: 'asc' } });
    expect(classes).toHaveLength(2);
    expect(classes.map((taught) => taught.code)).toEqual(['B-12', 'B-13']);
  });

  it('gives every class a teacher, a lab and a timetable', async () => {
    const classes = await prisma.class.findMany({ include: { teachers: true, labRoom: true } });

    for (const taught of classes) {
      expect(taught.teachers).toHaveLength(1);
      expect(taught.labRoom.name).toBe('Lab 1');
      expect(taught.schedule).not.toEqual({});
    }
  });

  it('enrols fifteen active students in each class', async () => {
    const classes = await prisma.class.findMany({ orderBy: { code: 'asc' } });

    for (const taught of classes) {
      expect(
        await prisma.enrollment.count({ where: { classId: taught.id, status: 'active' } }),
      ).toBe(15);
    }
    expect(await prisma.enrollment.count()).toBe(30);
  });

  it('puts every student in exactly one class', async () => {
    const students = await prisma.user.findMany({
      where: { role: 'student' },
      include: { enrollments: true },
    });

    expect(students.every((student) => student.enrollments.length === 1)).toBe(true);
  });
});

describe('Seed: lab', () => {
  it('creates Lab 1 with a 30-seat map, A1 to E6', async () => {
    const lab = await prisma.labRoom.findFirstOrThrow({ where: { name: 'Lab 1' } });
    const seats = await prisma.seat.findMany({
      where: { labRoomId: lab.id },
      orderBy: [{ row: 'asc' }, { position: 'asc' }],
    });

    expect(lab.rows).toBe(5);
    expect(lab.seatsPerRow).toBe(6);
    expect(seats).toHaveLength(30);
    expect(seats[0]?.code).toBe('A1');
    expect(seats[29]?.code).toBe('E6');
  });

  it('leaves the lab PCs to register themselves', async () => {
    expect(await prisma.device.count()).toBe(0);
    expect(await prisma.deviceLogin.count()).toBe(0);
  });
});

describe('Seed: settings', () => {
  it('defaults the software name to Lab', async () => {
    const name = await prisma.setting.findUniqueOrThrow({
      where: { key: SETTING_KEYS.softwareName },
    });

    expect(name.value).toBe('Lab');
  });

  it('writes every default setting, attributed to the admin', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    const settings = await prisma.setting.findMany();

    expect(settings.map((setting) => setting.key).sort()).toEqual(
      Object.values(SETTING_KEYS).sort(),
    );
    expect(settings.every((setting) => setting.updatedBy === admin.id)).toBe(true);
  });
});

describe('Seed: running it again', () => {
  it('changes nothing the second time', async () => {
    const before = {
      users: await prisma.user.count(),
      classes: await prisma.class.count(),
      enrollments: await prisma.enrollment.count(),
      seats: await prisma.seat.count(),
      settings: await prisma.setting.count(),
    };

    await seed(prisma);

    expect({
      users: await prisma.user.count(),
      classes: await prisma.class.count(),
      enrollments: await prisma.enrollment.count(),
      seats: await prisma.seat.count(),
      settings: await prisma.setting.count(),
    }).toEqual(before);
  });

  it('keeps a password the admin has already changed', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: 'already-changed', mustChangePassword: false },
    });

    await seed(prisma);

    const after = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect(after.passwordHash).toBe('already-changed');
    expect(after.mustChangePassword).toBe(false);
  });
});
