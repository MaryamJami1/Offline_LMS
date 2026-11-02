import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { TEST_PASSWORD, createAccount } from './auth-app.js';

/**
 * What the account endpoints are tried against: an admin, a teacher, and two
 * classes with no students yet, so student IDs start from S-1001.
 */
export interface UsersWorld {
  adminId: string;
  adminToken: string;
  teacherId: string;
  teacherToken: string;
  classes: { b12: string; b13: string };
  labRoomId: string;
}

export async function loginAs(
  app: INestApplication,
  username: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error(`${username} could not log in: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { accessToken: string }).accessToken;
}

export async function buildUsersWorld(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<UsersWorld> {
  const admin = await createAccount(prisma, {
    username: 'admin',
    role: 'admin',
    fullName: 'Nadia Hussain',
  });
  const teacher = await createAccount(prisma, {
    username: 'sara.iqbal',
    role: 'teacher',
    fullName: 'Sara Iqbal',
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
  await prisma.classTeacher.create({ data: { classId: b12.id, teacherId: teacher.id } });

  return {
    adminId: admin.id,
    adminToken: await loginAs(app, 'admin'),
    teacherId: teacher.id,
    teacherToken: await loginAs(app, 'sara.iqbal'),
    classes: { b12: b12.id, b13: b13.id },
    labRoomId: labRoom.id,
  };
}
