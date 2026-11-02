import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ImportResponse } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { buildUsersWorld, loginAs, type UsersWorld } from '../support/users-world.js';
import { buildXlsx } from '../support/xlsx.js';

/**
 * T-ADM-02 (ADM-02): importing students from Excel or CSV creates the valid
 * rows, reports the bad ones with their row numbers, and never creates the
 * same student twice.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let world: UsersWorld;

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-11-02T09:00:00.000Z'));
  world = await buildUsersWorld(app, prisma);
});

afterAll(async () => {
  await app.close();
});

const CLASS_LIST = [
  ['name', 'class', 'phone'],
  ['Ayesha Khan', 'B-12', '0300-1234567'],
  ['Bilal Ahmed', 'b-12', null],
  ['Fatima Noor', 'B-13', '0321-7654321'],
];

function upload(file: Buffer, filename: string, token = world.adminToken) {
  return request(app.getHttpServer())
    .post('/api/users/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', file, filename);
}

async function imported(file: Buffer, filename = 'students.xlsx'): Promise<ImportResponse> {
  const res = await upload(file, filename);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ImportResponse;
}

function csv(lines: string[]): Buffer {
  return Buffer.from(`${lines.join('\r\n')}\r\n`);
}

describe('T-ADM-02 importing valid rows', () => {
  it('creates a student for every row of a workbook, enrolled in their class', async () => {
    const result = await imported(buildXlsx(CLASS_LIST));

    expect(result.counts).toEqual({ rows: 3, created: 3, rejected: 0 });
    expect(result.errors).toEqual([]);
    expect(
      result.created.map(({ row, username, fullName, classCode }) => ({
        row,
        username,
        fullName,
        classCode,
      })),
    ).toEqual([
      { row: 2, username: 'S-1001', fullName: 'Ayesha Khan', classCode: 'B-12' },
      { row: 3, username: 'S-1002', fullName: 'Bilal Ahmed', classCode: 'B-12' },
      { row: 4, username: 'S-1003', fullName: 'Fatima Noor', classCode: 'B-13' },
    ]);

    const students = await prisma.user.findMany({
      where: { role: 'student' },
      include: { enrollments: true, studentProfile: true },
      orderBy: { username: 'asc' },
    });
    expect(students.map((student) => student.enrollments[0]?.classId)).toEqual([
      world.classes.b12,
      world.classes.b12,
      world.classes.b13,
    ]);
    expect(students.map((student) => student.phone)).toEqual([
      '0300-1234567',
      null,
      '0321-7654321',
    ]);
    expect(students.map((student) => student.studentProfile?.rollNo)).toEqual(['1', '2', '1']);
    expect(students.every((student) => student.mustChangePassword)).toBe(true);
  });

  it('gives each student their own first password, which logs them in', async () => {
    const result = await imported(buildXlsx(CLASS_LIST));

    const passwords = result.created.map((row) => row.password);
    expect(new Set(passwords).size).toBe(3);
    for (const row of result.created) {
      await expect(loginAs(app, row.username, row.password)).resolves.toBeTypeOf('string');
    }
  });

  it('imports a CSV file the same way', async () => {
    const result = await imported(
      csv(['name,class,phone', 'Ayesha Khan,B-12,0300-1234567', '"Khan, Bilal",B-13,']),
      'students.csv',
    );

    expect(result.created.map((row) => row.fullName)).toEqual(['Ayesha Khan', 'Khan, Bilal']);
  });

  it('carries on from the highest student ID there is', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${world.adminToken}`)
      .send({ role: 'student', fullName: 'Someone Else', username: 'S-1200' });

    const result = await imported(buildXlsx(CLASS_LIST));

    expect(result.created.map((row) => row.username)).toEqual(['S-1201', 'S-1202', 'S-1203']);
  });

  it('writes one audit entry for each student created', async () => {
    const result = await imported(buildXlsx(CLASS_LIST));

    const entries = await prisma.auditLog.findMany({ where: { action: 'user.created' } });
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.actorId === world.adminId)).toBe(true);
    expect(entries.map((entry) => entry.details)).toContainEqual({
      username: 'S-1001',
      role: 'student',
      source: 'import',
    });
    expect(JSON.stringify(entries)).not.toContain(result.created[0]?.password);
  });
});

describe('T-ADM-02 reporting bad rows', () => {
  it('reports each bad row by its row number and still creates the good ones', async () => {
    const result = await imported(
      buildXlsx([
        ['name', 'class', 'phone'],
        ['Ayesha Khan', 'B-12', null],
        [null, 'B-12', null],
        ['Bilal Ahmed', 'B-99', null],
        [],
        ['Fatima Noor', 'B-13', 'call me'],
        ['Hassan Raza', 'B-13', null],
      ]),
    );

    expect(result.created.map((row) => row.row)).toEqual([2, 7]);
    expect(result.errors.map(({ row, field, code }) => ({ row, field, code }))).toEqual([
      { row: 3, field: 'name', code: 'NAME_REQUIRED' },
      { row: 4, field: 'class', code: 'CLASS_NOT_FOUND' },
      { row: 6, field: 'phone', code: 'PHONE_INVALID' },
    ]);
    expect(result.counts).toEqual({ rows: 5, created: 2, rejected: 3 });
  });
});

describe('T-ADM-02 never creating duplicates', () => {
  it('creates nothing the second time the same file is imported', async () => {
    const file = buildXlsx(CLASS_LIST);
    await imported(file);

    const again = await imported(file);

    expect(again.created).toEqual([]);
    expect(again.errors).toMatchObject([
      { row: 2, code: 'ALREADY_EXISTS', existingUsername: 'S-1001' },
      { row: 3, code: 'ALREADY_EXISTS', existingUsername: 'S-1002' },
      { row: 4, code: 'ALREADY_EXISTS', existingUsername: 'S-1003' },
    ]);
    expect(await prisma.user.count({ where: { role: 'student' } })).toBe(3);
  });

  it('finds a student added by hand, by name and phone', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${world.adminToken}`)
      .send({
        role: 'student',
        fullName: 'ayesha  khan',
        phone: '0300 1234567',
        classCode: 'B-13',
      });

    const result = await imported(buildXlsx(CLASS_LIST));

    expect(result.errors).toMatchObject([
      { row: 2, code: 'ALREADY_EXISTS', existingUsername: 'S-1001' },
    ]);
    expect(result.created).toHaveLength(2);
  });

  it('reports a student who is twice in the file once', async () => {
    const result = await imported(
      buildXlsx([
        ['name', 'class', 'phone'],
        ['Ayesha Khan', 'B-12', '0300-1234567'],
        ['AYESHA KHAN', 'B-12', '03001234567'],
      ]),
    );

    expect(result.created).toHaveLength(1);
    expect(result.errors).toMatchObject([{ row: 3, code: 'DUPLICATE_IN_FILE', duplicateOfRow: 2 }]);
  });

  it('creates each student once when the same file is sent twice at the same moment', async () => {
    const file = buildXlsx(CLASS_LIST);

    const [first, second] = await Promise.all([upload(file, 'a.xlsx'), upload(file, 'b.xlsx')]);

    expect([first.status, second.status]).toEqual([200, 200]);
    const createdTotal =
      (first.body as ImportResponse).counts.created +
      (second.body as ImportResponse).counts.created;
    expect(createdTotal).toBe(3);
    expect(await prisma.user.count({ where: { role: 'student' } })).toBe(3);
  });
});

describe('T-ADM-02 refusing a whole file', () => {
  async function refusal(res: request.Response) {
    return {
      status: res.status,
      code: res.body.error?.code,
      reason: res.body.error?.details?.reason,
    };
  }

  it('refuses a request with no file', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users/import')
      .set('Authorization', `Bearer ${world.adminToken}`)
      .send({});

    expect(await refusal(res)).toEqual({
      status: 400,
      code: 'IMPORT_FILE_INVALID',
      reason: 'no_file',
    });
  });

  it('refuses a file that is not a spreadsheet', async () => {
    const res = await upload(Buffer.from('%PDF-1.7'), 'students.pdf');

    expect(await refusal(res)).toEqual({
      status: 400,
      code: 'IMPORT_FILE_INVALID',
      reason: 'unsupported_type',
    });
  });

  it('refuses a file without the columns and says which are missing', async () => {
    const res = await upload(csv(['name,phone', 'Ayesha Khan,0300-1234567']), 'students.csv');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ reason: 'missing_columns', missing: ['class'] });
    expect(await prisma.user.count({ where: { role: 'student' } })).toBe(0);
  });

  it('refuses a file over 2 MB before reading it', async () => {
    const res = await upload(Buffer.alloc(2 * 1024 * 1024 + 10, 0x61), 'students.csv');

    expect(await refusal(res)).toEqual({
      status: 400,
      code: 'IMPORT_FILE_INVALID',
      reason: 'too_large',
    });
  });

  it('refuses a teacher', async () => {
    const res = await upload(buildXlsx(CLASS_LIST), 'students.xlsx', world.teacherToken);

    expect(res.status).toBe(403);
    expect(await prisma.user.count({ where: { role: 'student' } })).toBe(0);
  });
});
