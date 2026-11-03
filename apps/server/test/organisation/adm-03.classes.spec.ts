import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ClassView } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { addStudent, buildClassesWorld, type ClassesWorld } from '../support/classes-world.js';

/**
 * ADM-03 (T-ADM-03): the admin creates and edits classes, each in a batch and
 * a lab, with a weekly schedule. The admin sees every class; a teacher sees
 * only the classes they teach, and a student none.
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

function as(token: string, method: 'get' | 'post' | 'patch', path: string) {
  return http()[method](path).set('Authorization', `Bearer ${token}`);
}

const asAdmin = (method: 'get' | 'post' | 'patch', path: string) =>
  as(world.adminToken, method, path);

const MISSING = '0190f5a0-0000-7000-8000-000000000999';
const SCHEDULE = { days: ['mon', 'tue', 'wed', 'thu'], start: '10:00', minutes: 90 };

function newClass(body: object = {}) {
  return asAdmin('post', '/api/classes').send({
    code: 'b-15',
    name: 'IELTS Preparation',
    batchId: world.batchId,
    labRoomId: world.labRoomId,
    ...body,
  });
}

describe('T-ADM-03 creating a class', () => {
  it('creates a class in a batch and a lab, with its schedule and teachers', async () => {
    const res = await newClass({ schedule: SCHEDULE, teacherIds: [world.sara.id] });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      code: 'B-15',
      name: 'IELTS Preparation',
      course: { id: world.courseId, name: 'Spoken English' },
      batch: { id: world.batchId, name: 'Fall 2026' },
      lab: { id: world.labRoomId, name: 'Lab 1' },
      schedule: SCHEDULE,
      teachers: [{ id: world.sara.id, fullName: 'Sara Iqbal' }],
      studentCount: 0,
      groupCount: 0,
    });
  });

  it('creates a class without a schedule or teachers yet', async () => {
    const res = await newClass();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ schedule: null, teachers: [] });
  });

  it('refuses a code another class has, whatever its case', async () => {
    const res = await newClass({ code: 'b-12' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CLASS_CODE_TAKEN');
  });

  it('refuses a batch or a lab that does not exist', async () => {
    const batch = await newClass({ batchId: MISSING });
    const lab = await newClass({ labRoomId: MISSING });

    expect(batch.status).toBe(422);
    expect(batch.body.error.code).toBe('BATCH_NOT_FOUND');
    expect(lab.status).toBe(422);
    expect(lab.body.error.code).toBe('LAB_NOT_FOUND');
  });

  it('refuses a teacher who is not a teacher, and creates nothing', async () => {
    const student = await addStudent(prisma, {
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      rollNo: '1',
    });

    const res = await newClass({ teacherIds: [world.sara.id, student] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TEACHER_NOT_FOUND');
    expect(await prisma.class.count()).toBe(2);
  });

  it('refuses a schedule that is not one', async () => {
    const res = await newClass({ schedule: { days: ['mon'], start: '25:00', minutes: 90 } });

    expect(res.status).toBe(400);
  });
});

describe('T-ADM-03 listing classes', () => {
  it('gives the admin every class, by code, with its counts', async () => {
    await addStudent(prisma, {
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      rollNo: '1',
      classId: world.classes.b12,
    });
    const left = await addStudent(prisma, {
      username: 'S-1002',
      fullName: 'Bilal Ahmed',
      rollNo: '2',
      classId: world.classes.b12,
    });
    await prisma.enrollment.update({
      where: { classId_studentId: { classId: world.classes.b12, studentId: left } },
      data: { status: 'left' },
    });
    await prisma.group.create({
      data: { classId: world.classes.b12, name: 'Team A', kind: 'manual' },
    });

    const res = await asAdmin('get', '/api/classes');

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: ClassView) => item.code)).toEqual(['B-12', 'B-13']);
    expect(res.body.items[0]).toMatchObject({
      teachers: [{ id: world.sara.id, fullName: 'Sara Iqbal' }],
      studentCount: 1,
      groupCount: 1,
    });
  });

  it('gives a teacher only the classes they teach', async () => {
    const res = await as(world.sara.token, 'get', '/api/classes');

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: ClassView) => item.code)).toEqual(['B-12']);
  });

  it('gives a teacher with no class an empty list', async () => {
    await prisma.classTeacher.deleteMany({ where: { teacherId: world.imran.id } });

    const res = await as(world.imran.token, 'get', '/api/classes');

    expect(res.body.items).toEqual([]);
  });
});

describe('T-ADM-03 one class', () => {
  it('shows the admin any class', async () => {
    const res = await asAdmin('get', `/api/classes/${world.classes.b13}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 'B-13', teachers: [{ fullName: 'Imran Ali' }] });
  });

  it('shows a teacher their own class', async () => {
    const res = await as(world.sara.token, 'get', `/api/classes/${world.classes.b12}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('B-12');
  });

  it('refuses a teacher another class, and one that does not exist, the same way', async () => {
    const other = await as(world.sara.token, 'get', `/api/classes/${world.classes.b13}`);
    const missing = await as(world.sara.token, 'get', `/api/classes/${MISSING}`);

    expect(other.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(missing.body).toEqual(other.body);
  });
});

describe('T-ADM-03 editing a class', () => {
  it('changes its name, schedule, batch and lab', async () => {
    const batch = await prisma.batch.create({
      data: { courseId: world.courseId, name: 'Spring 2027', startsOn: new Date('2027-02-01') },
    });
    const lab = await prisma.labRoom.create({ data: { name: 'Lab 2', rows: 4, seatsPerRow: 6 } });

    const res = await asAdmin('patch', `/api/classes/${world.classes.b12}`).send({
      name: 'Morning B (new)',
      schedule: SCHEDULE,
      batchId: batch.id,
      labRoomId: lab.id,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Morning B (new)',
      schedule: SCHEDULE,
      batch: { id: batch.id, name: 'Spring 2027' },
      lab: { id: lab.id, name: 'Lab 2' },
    });
  });

  it('changes its code, unless another class has it', async () => {
    const renamed = await asAdmin('patch', `/api/classes/${world.classes.b12}`).send({
      code: 'b-20',
    });
    const taken = await asAdmin('patch', `/api/classes/${world.classes.b13}`).send({
      code: 'B-20',
    });

    expect(renamed.body.code).toBe('B-20');
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('CLASS_CODE_TAKEN');
  });

  it('keeps its own code when that is sent again', async () => {
    const res = await asAdmin('patch', `/api/classes/${world.classes.b12}`).send({
      code: 'B-12',
      name: 'Morning B',
    });

    expect(res.status).toBe(200);
  });

  it('clears its schedule', async () => {
    await prisma.class.update({ where: { id: world.classes.b12 }, data: { schedule: SCHEDULE } });

    const res = await asAdmin('patch', `/api/classes/${world.classes.b12}`).send({
      schedule: null,
    });

    expect(res.body.schedule).toBeNull();
  });

  it('refuses a batch or lab that does not exist', async () => {
    const res = await asAdmin('patch', `/api/classes/${world.classes.b12}`).send({
      labRoomId: MISSING,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LAB_NOT_FOUND');
  });

  it('answers the admin 404 for a class that does not exist', async () => {
    const res = await asAdmin('patch', `/api/classes/${MISSING}`).send({ name: 'Anything' });

    expect(res.status).toBe(404);
  });

  it('is the admin’s alone, even for a teacher’s own class', async () => {
    const res = await as(world.sara.token, 'patch', `/api/classes/${world.classes.b12}`).send({
      name: 'Mine now',
    });

    expect(res.status).toBe(403);
  });

  it('refuses a teacher creating a class', async () => {
    const res = await as(world.sara.token, 'post', '/api/classes').send({
      code: 'B-15',
      name: 'IELTS Preparation',
      batchId: world.batchId,
      labRoomId: world.labRoomId,
    });

    expect(res.status).toBe(403);
  });
});
