import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { createAccount } from './auth-app.js';
import { loginAs } from './users-world.js';

/**
 * What the organisation endpoints (ADM-03) are tried against: an admin, Sara
 * who teaches B-12, Imran who teaches B-13, one course with one batch, and
 * Lab 1. Students are added by each test, so a list holds what the test says.
 */
export interface ClassesWorld {
  adminId: string;
  adminToken: string;
  sara: { id: string; token: string };
  imran: { id: string; token: string };
  courseId: string;
  batchId: string;
  labRoomId: string;
  classes: { b12: string; b13: string };
}

export async function buildClassesWorld(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<ClassesWorld> {
  const admin = await createAccount(prisma, {
    username: 'admin',
    role: 'admin',
    fullName: 'Nadia Hussain',
  });
  const sara = await createAccount(prisma, {
    username: 'sara.iqbal',
    role: 'teacher',
    fullName: 'Sara Iqbal',
  });
  const imran = await createAccount(prisma, {
    username: 'imran.ali',
    role: 'teacher',
    fullName: 'Imran Ali',
  });

  const labRoom = await prisma.labRoom.create({ data: { name: 'Lab 1', rows: 5, seatsPerRow: 6 } });
  const course = await prisma.course.create({ data: { name: 'Spoken English' } });
  const batch = await prisma.batch.create({
    data: { courseId: course.id, name: 'Fall 2026', startsOn: new Date('2026-09-01') },
  });
  const b12 = await prisma.class.create({
    data: { batchId: batch.id, code: 'B-12', name: 'Morning B', labRoomId: labRoom.id },
  });
  const b13 = await prisma.class.create({
    data: { batchId: batch.id, code: 'B-13', name: 'Evening A', labRoomId: labRoom.id },
  });
  await prisma.classTeacher.createMany({
    data: [
      { classId: b12.id, teacherId: sara.id },
      { classId: b13.id, teacherId: imran.id },
    ],
  });

  return {
    adminId: admin.id,
    adminToken: await loginAs(app, 'admin'),
    sara: { id: sara.id, token: await loginAs(app, 'sara.iqbal') },
    imran: { id: imran.id, token: await loginAs(app, 'imran.ali') },
    courseId: course.id,
    batchId: batch.id,
    labRoomId: labRoom.id,
    classes: { b12: b12.id, b13: b13.id },
  };
}

/** A student with a roll number, enrolled in the class given, if any. */
export async function addStudent(
  prisma: PrismaClient,
  options: { username: string; fullName: string; rollNo: string; classId?: string },
): Promise<string> {
  const student = await createAccount(prisma, {
    username: options.username,
    role: 'student',
    fullName: options.fullName,
  });
  await prisma.studentProfile.create({
    data: { userId: student.id, rollNo: options.rollNo, joinedOn: new Date('2026-09-01') },
  });
  if (options.classId !== undefined) {
    await prisma.enrollment.create({
      data: { classId: options.classId, studentId: student.id, enrolledOn: new Date('2026-09-01') },
    });
  }
  return student.id;
}
