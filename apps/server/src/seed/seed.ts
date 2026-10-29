import { DEFAULT_SETTINGS, buildSeatMap } from '@lingualab/shared';
import type { PrismaClient } from '../generated/prisma/index.js';
import { hashPassword } from '../auth/password.js';

/**
 * The first password every seeded account gets. The admin changes it at first
 * login, and `SEED_PASSWORD` overrides it on a real install.
 */
export const DEFAULT_SEED_PASSWORD = 'Lab-2026';

const LAB = { name: 'Lab 1', rows: 5, seatsPerRow: 6 } as const;

const COURSE = { name: 'Spoken English', description: 'Everyday speaking and listening' } as const;

const BATCH = { name: 'Fall 2026', startsOn: new Date('2026-09-01T00:00:00Z') } as const;

const TEACHERS = [
  { username: 'sara.iqbal', fullName: 'Sara Iqbal', subjects: ['Speaking', 'Listening'] },
  { username: 'imran.ali', fullName: 'Imran Ali', subjects: ['Reading', 'Writing'] },
] as const;

const CLASSES = [
  {
    code: 'B-12',
    name: 'Morning B',
    teacher: 'sara.iqbal',
    schedule: { days: ['Mon', 'Wed', 'Fri'], startTime: '09:00', minutes: 90 },
  },
  {
    code: 'B-13',
    name: 'Evening A',
    teacher: 'imran.ali',
    schedule: { days: ['Tue', 'Thu'], startTime: '17:00', minutes: 90 },
  },
] as const;

/** Thirty students, S-1001 upwards: fifteen in each class. */
const STUDENT_NAMES = [
  'Ayesha Khan',
  'Bilal Ahmed',
  'Fatima Noor',
  'Hassan Raza',
  'Zainab Malik',
  'Usman Tariq',
  'Hira Shah',
  'Ali Hamza',
  'Maryam Siddiqui',
  'Ahmed Javed',
  'Sana Aslam',
  'Faisal Mehmood',
  'Noor Fatima',
  'Hamza Sheikh',
  'Iqra Bashir',
  'Danish Qureshi',
  'Rabia Yousaf',
  'Saad Anwar',
  'Amna Rashid',
  'Talha Nawaz',
  'Mehwish Akram',
  'Owais Farooq',
  'Kiran Shahzad',
  'Zohaib Hussain',
  'Nimra Abbas',
  'Shahbaz Alam',
  'Laiba Munir',
  'Arslan Waheed',
  'Sadia Pervaiz',
  'Junaid Baig',
] as const;

export interface SeedOptions {
  /** First password for every seeded account. */
  password?: string;
}

export interface SeedSummary {
  admins: number;
  teachers: number;
  students: number;
  classes: number;
  seats: number;
  settings: number;
}

function studentId(index: number): string {
  return `S-${1001 + index}`;
}

/**
 * Fills a fresh database with the starting data from docs/docs/03-database.md:
 * one admin, two teachers, two classes of fifteen students, Lab 1 with its
 * 30-seat map, and the default settings.
 *
 * Safe to run again: accounts, classes, seats and settings are matched on their
 * natural keys, and a password the user has already changed is left alone.
 */
export async function seed(prisma: PrismaClient, options: SeedOptions = {}): Promise<SeedSummary> {
  const password = options.password ?? process.env['SEED_PASSWORD'] ?? DEFAULT_SEED_PASSWORD;
  // Every seeded account starts with the same first password, so it is hashed
  // once instead of thirty-three times.
  const passwordHash = await hashPassword(password);

  // Every row is written with createMany and skipDuplicates: nothing already in
  // the database is touched, which is both what "run it again" has to mean and
  // what keeps the seed to a handful of queries instead of a hundred.
  await prisma.user.createMany({
    data: [
      { role: 'admin', username: 'admin', passwordHash, fullName: 'Institute Admin' },
      ...TEACHERS.map((teacher) => ({
        role: 'teacher' as const,
        username: teacher.username,
        passwordHash,
        fullName: teacher.fullName,
      })),
      ...STUDENT_NAMES.map((fullName, index) => ({
        role: 'student' as const,
        username: studentId(index),
        passwordHash,
        fullName,
      })),
    ],
    skipDuplicates: true,
  });

  const accounts = new Map(
    (
      await prisma.user.findMany({
        where: {
          username: {
            in: [
              'admin',
              ...TEACHERS.map((teacher) => teacher.username),
              ...STUDENT_NAMES.map((_, index) => studentId(index)),
            ],
          },
        },
        select: { id: true, username: true },
      })
    ).map((user) => [user.username, user.id]),
  );

  const idOf = (username: string): string => {
    const id = accounts.get(username);
    if (id === undefined) {
      throw new Error(`Seed could not find the account ${username}`);
    }
    return id;
  };

  const admin = { id: idOf('admin') };

  await prisma.teacherProfile.createMany({
    data: TEACHERS.map((teacher) => ({
      userId: idOf(teacher.username),
      subjects: [...teacher.subjects],
    })),
    skipDuplicates: true,
  });

  const existingLab = await prisma.labRoom.findFirst({ where: { name: LAB.name } });
  const lab =
    existingLab ??
    (await prisma.labRoom.create({
      data: { name: LAB.name, rows: LAB.rows, seatsPerRow: LAB.seatsPerRow },
    }));

  await prisma.seat.createMany({
    data: buildSeatMap({ rows: LAB.rows, seatsPerRow: LAB.seatsPerRow }).map((seat) => ({
      labRoomId: lab.id,
      ...seat,
    })),
    skipDuplicates: true,
  });

  const existingCourse = await prisma.course.findFirst({ where: { name: COURSE.name } });
  const course = existingCourse ?? (await prisma.course.create({ data: { ...COURSE } }));

  const existingBatch = await prisma.batch.findFirst({
    where: { courseId: course.id, name: BATCH.name },
  });
  const batch =
    existingBatch ??
    (await prisma.batch.create({
      data: { courseId: course.id, name: BATCH.name, startsOn: BATCH.startsOn },
    }));

  await prisma.class.createMany({
    data: CLASSES.map((taught) => ({
      batchId: batch.id,
      code: taught.code,
      name: taught.name,
      labRoomId: lab.id,
      schedule: taught.schedule,
    })),
    skipDuplicates: true,
  });

  const classes = new Map(
    (
      await prisma.class.findMany({
        where: { code: { in: CLASSES.map((taught) => taught.code) } },
        select: { id: true, code: true },
      })
    ).map((taught) => [taught.code, taught.id]),
  );

  await prisma.classTeacher.createMany({
    data: CLASSES.map((taught) => ({
      classId: classes.get(taught.code) as string,
      teacherId: idOf(taught.teacher),
    })),
    skipDuplicates: true,
  });

  // Students are split evenly across the classes, in student ID order.
  const perClass = STUDENT_NAMES.length / CLASSES.length;

  await prisma.studentProfile.createMany({
    data: STUDENT_NAMES.map((_, index) => ({
      userId: idOf(studentId(index)),
      rollNo: String((index % perClass) + 1),
      joinedOn: BATCH.startsOn,
    })),
    skipDuplicates: true,
  });

  await prisma.enrollment.createMany({
    data: STUDENT_NAMES.map((_, index) => ({
      classId: classes.get(CLASSES[Math.floor(index / perClass)]?.code as string) as string,
      studentId: idOf(studentId(index)),
      enrolledOn: BATCH.startsOn,
    })),
    skipDuplicates: true,
  });

  await prisma.setting.createMany({
    data: Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
      key,
      value: value as never,
      updatedBy: admin.id,
    })),
    skipDuplicates: true,
  });

  return {
    admins: await prisma.user.count({ where: { role: 'admin' } }),
    teachers: await prisma.user.count({ where: { role: 'teacher' } }),
    students: await prisma.user.count({ where: { role: 'student' } }),
    classes: await prisma.class.count(),
    seats: await prisma.seat.count(),
    settings: await prisma.setting.count(),
  };
}
