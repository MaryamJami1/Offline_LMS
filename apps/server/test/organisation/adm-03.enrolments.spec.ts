import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ClassStudent } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAccount, createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { addStudent, buildClassesWorld, type ClassesWorld } from '../support/classes-world.js';

/**
 * ADM-03 (T-ADM-03): the admin assigns teachers and students to a class, and
 * the class list (`GET /classes/:id/students`, teacher screen T-09) shows the
 * students in it. A student taken out of a class is marked as having left,
 * not deleted, so their work in it stays.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let world: ClassesWorld;

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-11-03T09:00:00.000Z'));
  world = await buildClassesWorld(app, prisma);
});

afterAll(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

function as(token: string, method: 'get' | 'put', path: string) {
  return http()[method](path).set('Authorization', `Bearer ${token}`);
}

const asAdmin = (method: 'get' | 'put', path: string) => as(world.adminToken, method, path);

const MISSING = '0190f5a0-0000-7000-8000-000000000999';

function enrolment(classId: string, studentId: string) {
  return prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
}

describe('T-ADM-03 assigning teachers', () => {
  it('sets the teachers of a class, replacing the ones it had', async () => {
    const res = await asAdmin('put', `/api/classes/${world.classes.b12}/teachers`).send({
      teacherIds: [world.imran.id],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.teachers).toEqual([{ id: world.imran.id, fullName: 'Imran Ali' }]);
    expect(
      await prisma.classTeacher.findMany({ where: { classId: world.classes.b12 } }),
    ).toMatchObject([{ teacherId: world.imran.id }]);
  });

  it('gives a class more than one teacher, listed by name', async () => {
    const res = await asAdmin('put', `/api/classes/${world.classes.b12}/teachers`).send({
      teacherIds: [world.sara.id, world.imran.id],
    });

    expect(res.body.teachers.map((teacher: { fullName: string }) => teacher.fullName)).toEqual([
      'Imran Ali',
      'Sara Iqbal',
    ]);
  });

  it('lets the new teacher see the class and the old one no longer', async () => {
    await asAdmin('put', `/api/classes/${world.classes.b12}/teachers`).send({
      teacherIds: [world.imran.id],
    });

    expect((await as(world.imran.token, 'get', `/api/classes/${world.classes.b12}`)).status).toBe(
      200,
    );
    expect((await as(world.sara.token, 'get', `/api/classes/${world.classes.b12}`)).status).toBe(
      403,
    );
  });

  it('refuses an account that is not a teacher, and changes nothing', async () => {
    const res = await asAdmin('put', `/api/classes/${world.classes.b12}/teachers`).send({
      teacherIds: [world.adminId],
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TEACHER_NOT_FOUND');
    expect(
      await prisma.classTeacher.findMany({ where: { classId: world.classes.b12 } }),
    ).toMatchObject([{ teacherId: world.sara.id }]);
  });

  it('answers 404 for a class that does not exist', async () => {
    const res = await asAdmin('put', `/api/classes/${MISSING}/teachers`).send({ teacherIds: [] });

    expect(res.status).toBe(404);
  });

  it('is the admin’s alone', async () => {
    const res = await as(
      world.sara.token,
      'put',
      `/api/classes/${world.classes.b12}/teachers`,
    ).send({ teacherIds: [world.sara.id, world.imran.id] });

    expect(res.status).toBe(403);
  });
});

describe('T-ADM-03 assigning students', () => {
  let ayesha: string;
  let bilal: string;
  let hina: string;

  beforeEach(async () => {
    ayesha = await addStudent(prisma, {
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      rollNo: '1',
      classId: world.classes.b12,
    });
    bilal = await addStudent(prisma, {
      username: 'S-1002',
      fullName: 'Bilal Ahmed',
      rollNo: '2',
      classId: world.classes.b12,
    });
    hina = await addStudent(prisma, { username: 'S-1003', fullName: 'Hina Raza', rollNo: '3' });
  });

  it('enrols new students from today and answers with the class list', async () => {
    const res = await asAdmin('put', `/api/classes/${world.classes.b12}/students`).send({
      studentIds: [ayesha, bilal, hina],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((student: ClassStudent) => student.username)).toEqual([
      'S-1001',
      'S-1002',
      'S-1003',
    ]);
    expect(await enrolment(world.classes.b12, hina)).toMatchObject({
      status: 'active',
      enrolledOn: new Date('2026-11-03'),
    });
  });

  it('marks a student left out as having left, rather than deleting them', async () => {
    const res = await asAdmin('put', `/api/classes/${world.classes.b12}/students`).send({
      studentIds: [ayesha],
    });

    expect(res.body.items.map((student: ClassStudent) => student.username)).toEqual(['S-1001']);
    expect(await enrolment(world.classes.b12, bilal)).toMatchObject({ status: 'left' });
  });

  it('brings back a student who had left, keeping the day they first joined', async () => {
    await asAdmin('put', `/api/classes/${world.classes.b12}/students`).send({
      studentIds: [ayesha],
    });

    await asAdmin('put', `/api/classes/${world.classes.b12}/students`).send({
      studentIds: [ayesha, bilal],
    });

    expect(await enrolment(world.classes.b12, bilal)).toMatchObject({
      status: 'active',
      enrolledOn: new Date('2026-09-01'),
    });
  });

  it('takes a student who leaves out of the class’s groups', async () => {
    const group = await prisma.group.create({
      data: {
        classId: world.classes.b12,
        name: 'Team A',
        kind: 'manual',
        members: { create: [{ studentId: ayesha }, { studentId: bilal }] },
      },
    });

    await asAdmin('put', `/api/classes/${world.classes.b12}/students`).send({
      studentIds: [ayesha],
    });

    expect(await prisma.groupMember.findMany({ where: { groupId: group.id } })).toMatchObject([
      { studentId: ayesha },
    ]);
  });

  it('leaves the student’s other classes alone', async () => {
    await prisma.enrollment.create({
      data: { classId: world.classes.b13, studentId: bilal, enrolledOn: new Date('2026-09-01') },
    });

    await asAdmin('put', `/api/classes/${world.classes.b12}/students`).send({ studentIds: [] });

    expect(await enrolment(world.classes.b13, bilal)).toMatchObject({ status: 'active' });
  });

  it('refuses an account that is not a student, and changes nothing', async () => {
    const res = await asAdmin('put', `/api/classes/${world.classes.b12}/students`).send({
      studentIds: [hina, world.sara.id],
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STUDENT_NOT_FOUND');
    expect(await enrolment(world.classes.b12, hina)).toBeNull();
  });

  it('answers 404 for a class that does not exist', async () => {
    const res = await asAdmin('put', `/api/classes/${MISSING}/students`).send({ studentIds: [] });

    expect(res.status).toBe(404);
  });

  it('is the admin’s alone, even for a teacher’s own class', async () => {
    const res = await as(
      world.sara.token,
      'put',
      `/api/classes/${world.classes.b12}/students`,
    ).send({ studentIds: [ayesha, bilal, hina] });

    expect(res.status).toBe(403);
    expect(await enrolment(world.classes.b12, hina)).toBeNull();
  });
});

describe('T-ADM-03 the class list', () => {
  beforeEach(async () => {
    await addStudent(prisma, {
      username: 'S-1010',
      fullName: 'Usman Tariq',
      rollNo: '10',
      classId: world.classes.b12,
    });
    await addStudent(prisma, {
      username: 'S-1002',
      fullName: 'Bilal Ahmed',
      rollNo: '2',
      classId: world.classes.b12,
    });
    const left = await addStudent(prisma, {
      username: 'S-1003',
      fullName: 'Hina Raza',
      rollNo: '3',
      classId: world.classes.b12,
    });
    await prisma.enrollment.update({
      where: { classId_studentId: { classId: world.classes.b12, studentId: left } },
      data: { status: 'left' },
    });
    await addStudent(prisma, {
      username: 'S-1004',
      fullName: 'Zara Malik',
      rollNo: '4',
      classId: world.classes.b13,
    });
  });

  it('lists the students in the class, by roll number as a number', async () => {
    const res = await asAdmin('get', `/api/classes/${world.classes.b12}/students`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {
        id: expect.any(String),
        username: 'S-1002',
        fullName: 'Bilal Ahmed',
        rollNo: '2',
        status: 'active',
      },
      {
        id: expect.any(String),
        username: 'S-1010',
        fullName: 'Usman Tariq',
        rollNo: '10',
        status: 'active',
      },
    ]);
  });

  it('shows a teacher the list of their own class', async () => {
    const res = await as(world.sara.token, 'get', `/api/classes/${world.classes.b12}/students`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it('refuses a teacher the list of another class', async () => {
    const res = await as(world.imran.token, 'get', `/api/classes/${world.classes.b12}/students`);

    expect(res.status).toBe(403);
  });

  it('puts students without a roll number last, by name', async () => {
    for (const [username, fullName] of [
      ['S-1020', 'Zainab Noor'],
      ['S-1021', 'Asad Butt'],
    ]) {
      const student = await createAccount(prisma, {
        username: username as string,
        role: 'student',
        fullName: fullName as string,
      });
      await prisma.enrollment.create({
        data: {
          classId: world.classes.b12,
          studentId: student.id,
          enrolledOn: new Date('2026-09-01'),
        },
      });
    }

    const res = await asAdmin('get', `/api/classes/${world.classes.b12}/students`);

    expect(
      res.body.items.map((student: ClassStudent) => [student.rollNo, student.fullName]),
    ).toEqual([
      ['2', 'Bilal Ahmed'],
      ['10', 'Usman Tariq'],
      [null, 'Asad Butt'],
      [null, 'Zainab Noor'],
    ]);
  });

  it('shows an account that was deactivated as inactive, so the teacher knows why it cannot log in', async () => {
    await prisma.user.update({ where: { username: 'S-1002' }, data: { status: 'inactive' } });

    const res = await asAdmin('get', `/api/classes/${world.classes.b12}/students`);

    expect(res.body.items[0]).toMatchObject({ username: 'S-1002', status: 'inactive' });
  });
});
