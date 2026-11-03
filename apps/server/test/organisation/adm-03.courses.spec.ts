import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { buildClassesWorld, type ClassesWorld } from '../support/classes-world.js';

/**
 * ADM-03 (T-ADM-03): the admin creates and renames courses and batches. A
 * batch belongs to one course and never ends before it starts. Courses and
 * batches are the admin's alone.
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

describe('T-ADM-03 courses', () => {
  it('creates a course', async () => {
    const res = await asAdmin('post', '/api/courses').send({
      name: 'IELTS Preparation',
      description: 'Band 6.5 and above',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'IELTS Preparation',
      description: 'Band 6.5 and above',
    });
  });

  it('lists courses by name', async () => {
    await asAdmin('post', '/api/courses').send({ name: 'Business English' });

    const res = await asAdmin('get', '/api/courses');

    expect(res.status).toBe(200);
    expect(res.body.items.map((course: { name: string }) => course.name)).toEqual([
      'Business English',
      'Spoken English',
    ]);
  });

  it('renames a course and clears its description', async () => {
    await prisma.course.update({ where: { id: world.courseId }, data: { description: 'Old' } });

    const res = await asAdmin('patch', `/api/courses/${world.courseId}`).send({
      name: 'Spoken English Plus',
      description: null,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: world.courseId,
      name: 'Spoken English Plus',
      description: null,
    });
  });

  it('answers 404 for a course that does not exist', async () => {
    const res = await asAdmin('patch', `/api/courses/${MISSING}`).send({ name: 'Anything' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses a course without a name', async () => {
    const res = await asAdmin('post', '/api/courses').send({ name: '  ' });

    expect(res.status).toBe(400);
  });
});

describe('T-ADM-03 batches', () => {
  it('creates a batch of a course', async () => {
    const res = await asAdmin('post', '/api/batches').send({
      courseId: world.courseId,
      name: 'Spring 2027',
      startsOn: '2027-02-01',
      endsOn: '2027-05-31',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      courseId: world.courseId,
      courseName: 'Spoken English',
      name: 'Spring 2027',
      startsOn: '2027-02-01',
      endsOn: '2027-05-31',
    });
  });

  it('lists batches, newest first, and those of one course when asked', async () => {
    const other = await prisma.course.create({ data: { name: 'Business English' } });
    await asAdmin('post', '/api/batches').send({
      courseId: world.courseId,
      name: 'Spring 2027',
      startsOn: '2027-02-01',
    });
    await asAdmin('post', '/api/batches').send({
      courseId: other.id,
      name: 'Evening 2026',
      startsOn: '2026-10-01',
    });

    const all = await asAdmin('get', '/api/batches');
    const one = await asAdmin('get', `/api/batches?courseId=${other.id}`);

    expect(all.body.items.map((batch: { name: string }) => batch.name)).toEqual([
      'Spring 2027',
      'Evening 2026',
      'Fall 2026',
    ]);
    expect(one.body.items.map((batch: { name: string }) => batch.name)).toEqual(['Evening 2026']);
  });

  it('refuses a batch of a course that does not exist', async () => {
    const res = await asAdmin('post', '/api/batches').send({
      courseId: MISSING,
      name: 'Spring 2027',
      startsOn: '2027-02-01',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COURSE_NOT_FOUND');
  });

  it('refuses a batch that ends before it starts', async () => {
    const res = await asAdmin('post', '/api/batches').send({
      courseId: world.courseId,
      name: 'Spring 2027',
      startsOn: '2027-02-01',
      endsOn: '2027-01-31',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BATCH_ENDS_BEFORE_START');
  });

  it('renames a batch and moves its dates', async () => {
    const res = await asAdmin('patch', `/api/batches/${world.batchId}`).send({
      name: 'Fall 2026 (extended)',
      endsOn: '2027-01-15',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Fall 2026 (extended)',
      startsOn: '2026-09-01',
      endsOn: '2027-01-15',
    });
  });

  it('checks a changed date against the date it keeps', async () => {
    const res = await asAdmin('patch', `/api/batches/${world.batchId}`).send({
      endsOn: '2026-08-31',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BATCH_ENDS_BEFORE_START');
    expect(await prisma.batch.findUniqueOrThrow({ where: { id: world.batchId } })).toMatchObject({
      endsOn: null,
    });
  });

  it('answers 404 for a batch that does not exist', async () => {
    const res = await asAdmin('patch', `/api/batches/${MISSING}`).send({ name: 'Anything' });

    expect(res.status).toBe(404);
  });
});

describe('T-ADM-03 courses and batches are the admin’s alone', () => {
  it('refuses a teacher every course and batch call', async () => {
    const calls = [
      as(world.sara.token, 'get', '/api/courses'),
      as(world.sara.token, 'post', '/api/courses').send({ name: 'Business English' }),
      as(world.sara.token, 'patch', `/api/courses/${world.courseId}`).send({ name: 'X' }),
      as(world.sara.token, 'get', '/api/batches'),
      as(world.sara.token, 'patch', `/api/batches/${world.batchId}`).send({ name: 'X' }),
    ];

    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
    }
    expect(await prisma.course.count()).toBe(1);
  });
});
