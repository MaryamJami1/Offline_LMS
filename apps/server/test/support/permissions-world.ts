import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { TEST_PASSWORD, createAccount } from './auth-app.js';

/**
 * The smallest institute the permissions table can be tried against: one
 * admin, two teachers who each teach a class of their own, and a student in
 * the first teacher's class. Everything T-ACL-01 asks is a question about
 * these four (docs/docs/06-security-and-data.md, Roles and permissions).
 */
export interface PermissionsWorld {
  /** An access token per fixture, ready for the Authorization header. */
  tokens: Record<Role4, string>;
  ids: {
    admin: string;
    teacherOwn: string;
    teacherOther: string;
    student: string;
    otherStudent: string;
    ownClass: string;
    otherClass: string;
    course: string;
    batch: string;
    labRoom: string;
    /**
     * Accounts that exist only to have their passwords reset. A reset makes
     * an account change its password before anything else, so resetting a
     * fixture that logs in would turn later rows into tests of that instead.
     * Their usernames sit far from S-1001 so a test that adds the next student
     * to this world does not collide with them.
     */
    resetOwnStudent: string;
    resetOtherStudent: string;
    resetTeacher: string;
  };
  codes: { ownClass: string; otherClass: string };
}

/** The four accounts every row of the table is tried as. */
export type Role4 = 'admin' | 'teacherOwn' | 'teacherOther' | 'student';

export const ROLE4: Role4[] = ['admin', 'teacherOwn', 'teacherOther', 'student'];

export async function buildPermissionsWorld(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<PermissionsWorld> {
  const admin = await createAccount(prisma, {
    username: 'admin',
    role: 'admin',
    fullName: 'Nadia Hussain',
  });
  const teacherOwn = await createAccount(prisma, {
    username: 'sara.iqbal',
    role: 'teacher',
    fullName: 'Sara Iqbal',
  });
  const teacherOther = await createAccount(prisma, {
    username: 'imran.ali',
    role: 'teacher',
    fullName: 'Imran Ali',
  });
  const student = await createAccount(prisma, {
    username: 'S-1001',
    role: 'student',
    fullName: 'Ayesha Khan',
  });
  const otherStudent = await createAccount(prisma, {
    username: 'S-1002',
    role: 'student',
    fullName: 'Bilal Ahmed',
  });

  const resetOwnStudent = await createAccount(prisma, {
    username: 'S-2001',
    role: 'student',
    fullName: 'Hina Raza',
  });
  const resetOtherStudent = await createAccount(prisma, {
    username: 'S-2002',
    role: 'student',
    fullName: 'Usman Tariq',
  });
  const resetTeacher = await createAccount(prisma, {
    username: 'zainab.malik',
    role: 'teacher',
    fullName: 'Zainab Malik',
  });

  const labRoom = await prisma.labRoom.create({
    data: { name: 'Lab 1', rows: 5, seatsPerRow: 6 },
  });
  const course = await prisma.course.create({ data: { name: 'Spoken English' } });
  const batch = await prisma.batch.create({
    data: { courseId: course.id, name: 'Fall 2026', startsOn: new Date('2026-09-01') },
  });
  const ownClass = await prisma.class.create({
    data: { batchId: batch.id, code: 'B-12', name: 'Morning', labRoomId: labRoom.id },
  });
  const otherClass = await prisma.class.create({
    data: { batchId: batch.id, code: 'B-13', name: 'Evening', labRoomId: labRoom.id },
  });

  await prisma.classTeacher.createMany({
    data: [
      { classId: ownClass.id, teacherId: teacherOwn.id },
      { classId: otherClass.id, teacherId: teacherOther.id },
    ],
  });
  await prisma.enrollment.createMany({
    data: [
      { classId: ownClass.id, studentId: student.id, enrolledOn: new Date('2026-09-01') },
      { classId: otherClass.id, studentId: otherStudent.id, enrolledOn: new Date('2026-09-01') },
      { classId: ownClass.id, studentId: resetOwnStudent.id, enrolledOn: new Date('2026-09-01') },
      {
        classId: otherClass.id,
        studentId: resetOtherStudent.id,
        enrolledOn: new Date('2026-09-01'),
      },
    ],
  });

  const usernames: Record<Role4, string> = {
    admin: admin.username,
    teacherOwn: teacherOwn.username,
    teacherOther: teacherOther.username,
    student: student.username,
  };
  const tokens = {} as Record<Role4, string>;
  for (const role of ROLE4) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: usernames[role], password: TEST_PASSWORD });
    if (res.status !== 200) {
      throw new Error(`the ${role} fixture could not log in: ${res.status}`);
    }
    tokens[role] = (res.body as { accessToken: string }).accessToken;
  }

  return {
    tokens,
    ids: {
      admin: admin.id,
      teacherOwn: teacherOwn.id,
      teacherOther: teacherOther.id,
      student: student.id,
      otherStudent: otherStudent.id,
      ownClass: ownClass.id,
      otherClass: otherClass.id,
      course: course.id,
      batch: batch.id,
      labRoom: labRoom.id,
      resetOwnStudent: resetOwnStudent.id,
      resetOtherStudent: resetOtherStudent.id,
      resetTeacher: resetTeacher.id,
    },
    codes: { ownClass: ownClass.code, otherClass: otherClass.code },
  };
}
