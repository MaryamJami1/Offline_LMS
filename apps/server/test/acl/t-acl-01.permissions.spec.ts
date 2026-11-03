import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import {
  ROLE4,
  buildPermissionsWorld,
  type PermissionsWorld,
  type Role4,
} from '../support/permissions-world.js';

/**
 * T-ACL-01: every row of the permissions table in
 * docs/docs/06-security-and-data.md, tried as the admin, the teacher of the
 * class, another teacher, and a student.
 *
 * A row whose endpoint has not been built yet is marked `todo` and expects
 * 404. That is not a skipped test: the day the endpoint appears, the row turns
 * red and whoever built it has to switch the row on, so the table cannot
 * quietly fall behind the API. The expectations are already written down, so
 * switching a row on is deleting one word.
 */

const PERMISSIONS_DOC = new URL('../../../../docs/docs/06-security-and-data.md', import.meta.url);

const NOT_BUILT = 404;

interface Row {
  /** The row of the permissions table this endpoint belongs to, word for word. */
  row: string;
  method: 'get' | 'post' | 'patch' | 'put';
  /** Built from the world, so ids are real. */
  path: (world: PermissionsWorld) => string;
  body?: object;
  expected: Record<Role4, number>;
  todo?: true;
}

const ALL_FOUR = (status: number): Record<Role4, number> => ({
  admin: status,
  teacherOwn: status,
  teacherOther: status,
  student: status,
});

const STAFF_ONLY: Record<Role4, number> = {
  admin: 200,
  teacherOwn: 200,
  teacherOther: 200,
  student: 403,
};

const ADMIN_ONLY: Record<Role4, number> = {
  admin: 200,
  teacherOwn: 403,
  teacherOther: 403,
  student: 403,
};

/** Only the teacher of that class, which is not the admin's to do. */
const OWN_CLASS_TEACHER: Record<Role4, number> = {
  admin: 403,
  teacherOwn: 200,
  teacherOther: 403,
  student: 403,
};

const ADMIN_OR_OWN_CLASS_TEACHER: Record<Role4, number> = {
  admin: 200,
  teacherOwn: 200,
  teacherOther: 403,
  student: 403,
};

const rows: Row[] = [
  // Already built: these rows run for real today.
  {
    row: 'See marks and progress',
    method: 'get',
    path: () => '/api/me',
    expected: ALL_FOUR(200),
  },
  {
    row: 'See marks and progress',
    method: 'post',
    path: () => '/api/auth/logout',
    body: { refreshToken: 'not-a-token-of-ours' },
    expected: ALL_FOUR(204),
  },
  {
    row: 'See marks and progress',
    method: 'post',
    path: () => '/api/auth/change-password',
    // Every role reaches the handler; what refuses them is the password, not
    // their role, which is the point of running it here.
    body: { currentPassword: 'not-the-password', newPassword: 'Karachi-2026-lab' },
    expected: ALL_FOUR(401),
  },

  {
    row: 'Create, edit, deactivate users; set first passwords',
    method: 'get',
    path: () => '/api/users',
    expected: ADMIN_ONLY,
  },
  {
    row: 'Create, edit, deactivate users; set first passwords',
    method: 'post',
    path: () => '/api/users',
    body: { username: 'S-9001', role: 'student', fullName: 'New Student' },
    expected: { ...ADMIN_ONLY, admin: 201 },
  },
  {
    row: 'Create, edit, deactivate users; set first passwords',
    method: 'get',
    path: (world) => `/api/users/${world.ids.otherStudent}`,
    expected: ADMIN_ONLY,
  },
  {
    row: 'Create, edit, deactivate users; set first passwords',
    method: 'patch',
    path: (world) => `/api/users/${world.ids.otherStudent}`,
    body: { phone: '0300-1234567' },
    expected: ADMIN_ONLY,
  },
  {
    row: 'Create, edit, deactivate users; set first passwords',
    method: 'post',
    path: (world) => `/api/users/${world.ids.otherStudent}/unlock`,
    expected: ADMIN_ONLY,
  },
  {
    row: 'Import students',
    method: 'post',
    path: () => '/api/users/import',
    // No file is attached: the admin reaches the import and is refused for
    // that (400), everyone else is refused for who they are.
    expected: { ...ADMIN_ONLY, admin: 400 },
  },

  {
    row: "Reset a student's password",
    method: 'post',
    path: (world) => `/api/users/${world.ids.resetOwnStudent}/reset-password`,
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
  },
  {
    row: "Reset a student's password",
    method: 'post',
    // The other teacher's student: the first teacher is refused, and the
    // other teacher, whose class it is, is not.
    path: (world) => `/api/users/${world.ids.resetOtherStudent}/reset-password`,
    expected: { admin: 200, teacherOwn: 403, teacherOther: 200, student: 403 },
  },
  {
    row: "Reset a student's password",
    method: 'post',
    // A staff account is the admin's alone to reset.
    path: (world) => `/api/users/${world.ids.resetTeacher}/reset-password`,
    expected: ADMIN_ONLY,
  },

  // Not built yet. Each expects 404 until its endpoint exists.
  {
    row: 'Manage courses, batches, classes, enrolments',
    method: 'post',
    path: () => '/api/courses',
    body: { name: 'Business English' },
    expected: ADMIN_ONLY,
    todo: true,
  },
  {
    row: 'Manage courses, batches, classes, enrolments',
    method: 'get',
    path: () => '/api/classes',
    // The teachers' list is filtered to their own classes, not refused.
    expected: STAFF_ONLY,
    todo: true,
  },
  {
    row: 'Make groups',
    method: 'post',
    path: (world) => `/api/classes/${world.ids.ownClass}/groups`,
    body: { kind: 'pair' },
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
    todo: true,
  },
  {
    row: 'Manage labs, seats, approve PCs',
    method: 'get',
    path: () => '/api/labs',
    expected: ADMIN_ONLY,
    todo: true,
  },
  {
    row: 'Manage labs, seats, approve PCs',
    method: 'get',
    path: () => '/api/devices',
    expected: ADMIN_ONLY,
    todo: true,
  },
  {
    row: 'Start and end a class; use lab controls',
    method: 'post',
    path: () => '/api/sessions',
    body: { classId: 'the own class, filled in when the row is switched on' },
    expected: OWN_CLASS_TEACHER,
    todo: true,
  },
  {
    row: 'Create and edit lessons',
    method: 'post',
    path: () => '/api/lessons',
    body: { module: 'speaking', title: 'Introductions' },
    expected: STAFF_ONLY,
    todo: true,
  },
  {
    row: 'Publish lessons; assign work',
    method: 'post',
    path: () => '/api/assignments',
    body: { classId: 'the own class, filled in when the row is switched on' },
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
    todo: true,
  },
  {
    row: 'See lessons',
    method: 'get',
    path: () => '/api/lessons',
    // A student's list holds only what is assigned to them; nobody is refused.
    expected: ALL_FOUR(200),
    todo: true,
  },
  {
    row: 'Submit answers and recordings',
    method: 'post',
    path: () => '/api/assignments/the-assignment/submissions',
    expected: { admin: 403, teacherOwn: 403, teacherOther: 403, student: 200 },
    todo: true,
  },
  {
    row: 'Mark work, give feedback',
    method: 'post',
    path: () => '/api/submissions/the-submission/grade',
    expected: OWN_CLASS_TEACHER,
    todo: true,
  },
  {
    row: 'See marks and progress',
    method: 'get',
    path: (world) => `/api/students/${world.ids.student}/progress`,
    expected: { admin: 200, teacherOwn: 200, teacherOther: 403, student: 200 },
    todo: true,
  },
  {
    row: 'Reports and exports',
    method: 'get',
    path: () => '/api/reports/attendance',
    expected: STAFF_ONLY,
    todo: true,
  },
  {
    row: 'Settings (including branding), backups, restore, audit log',
    method: 'patch',
    path: () => '/api/settings',
    body: { softwareName: 'Lab' },
    expected: ADMIN_ONLY,
    todo: true,
  },
  {
    row: 'Settings (including branding), backups, restore, audit log',
    method: 'get',
    path: () => '/api/backups',
    expected: ADMIN_ONLY,
    todo: true,
  },
  {
    row: 'Settings (including branding), backups, restore, audit log',
    method: 'get',
    path: () => '/api/audit-logs',
    expected: ADMIN_ONLY,
    todo: true,
  },
];

/** The first column of the permissions table, as the document has it. */
function documentedRows(): string[] {
  const lines = readFileSync(PERMISSIONS_DOC, 'utf8')
    .split('\n')
    .map((line) => line.trimEnd());
  const start = lines.findIndex((line) => line.startsWith('| Action'));
  const end = lines.findIndex((line, index) => index > start + 1 && !line.startsWith('|'));
  return lines.slice(start + 2, end).map((line) => line.split('|')[1]?.trim() ?? '');
}

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let world: PermissionsWorld;

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-11-02T09:00:00.000Z'));
  world = await buildPermissionsWorld(app, prisma);
});

afterAll(async () => {
  await app.close();
});

describe('T-ACL-01 the permissions table', () => {
  it('was read from the document at all', () => {
    const documented = documentedRows();

    // Without this, a parse that found nothing would leave the two tests below
    // passing by saying nothing at all.
    expect(documented.length).toBeGreaterThan(10);
    expect(documented).toContain('Make groups');
    expect(documented).toContain('Start and end a class; use lab controls');
    expect(documented.every((row) => row.length > 0)).toBe(true);
  });

  it('covers every row the document has', () => {
    const covered = new Set(rows.map((row) => row.row));

    expect(documentedRows().filter((row) => !covered.has(row))).toEqual([]);
  });

  it('names a row the document has, for every row here', () => {
    const documented = new Set(documentedRows());

    expect([...new Set(rows.map((row) => row.row))].filter((row) => !documented.has(row))).toEqual(
      [],
    );
  });
});

for (const row of rows) {
  const label = `${row.method.toUpperCase()} ${row.path({ ids: {}, codes: {} } as PermissionsWorld)}`;

  describe(`T-ACL-01 ${row.row} — ${label}`, () => {
    for (const role of ROLE4) {
      const wanted = row.expected[role];

      it(`answers ${role} with ${row.todo === true ? `${NOT_BUILT} until it is built` : wanted}`, async () => {
        const res = await request(app.getHttpServer())
          [row.method](row.path(world))
          .set('Authorization', `Bearer ${world.tokens[role]}`)
          .send(row.body ?? {});

        if (row.todo === true) {
          expect(
            res.status,
            `${label} answered ${res.status}: it exists now, so switch this row on by deleting its todo and checking the expected ${wanted} for ${role}`,
          ).toBe(NOT_BUILT);
          return;
        }
        expect(res.status).toBe(wanted);
      });
    }
  });
}
