import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { PERMISSIONS, accessOf, type Action, type PermissionRow } from '@lingualab/shared';
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
  /** The row of the permissions table this endpoint belongs to, by its key in packages/shared. */
  action: Action;
  /** A read that teachers need beyond what the row lets them manage; the comment says why. */
  readByTeachers?: true;
  method: 'get' | 'post' | 'patch' | 'put';
  /** Built from the world, so ids are real. */
  path: (world: PermissionsWorld) => string;
  /** Built from the world when it needs ids. */
  body?: object | ((world: PermissionsWorld) => object);
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
    action: 'seeProgress',
    method: 'get',
    path: () => '/api/me',
    expected: ALL_FOUR(200),
  },
  {
    action: 'seeProgress',
    method: 'post',
    path: () => '/api/auth/logout',
    body: { refreshToken: 'not-a-token-of-ours' },
    expected: ALL_FOUR(204),
  },
  {
    action: 'seeProgress',
    method: 'post',
    path: () => '/api/auth/change-password',
    // Every role reaches the handler; what refuses them is the password, not
    // their role, which is the point of running it here.
    body: { currentPassword: 'not-the-password', newPassword: 'Karachi-2026-lab' },
    expected: ALL_FOUR(401),
  },

  {
    action: 'manageUsers',
    method: 'get',
    path: () => '/api/users',
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageUsers',
    method: 'post',
    path: () => '/api/users',
    body: { username: 'S-9001', role: 'student', fullName: 'New Student' },
    expected: { ...ADMIN_ONLY, admin: 201 },
  },
  {
    action: 'manageUsers',
    method: 'get',
    path: (world) => `/api/users/${world.ids.otherStudent}`,
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageUsers',
    method: 'patch',
    path: (world) => `/api/users/${world.ids.otherStudent}`,
    body: { phone: '0300-1234567' },
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageUsers',
    method: 'post',
    path: (world) => `/api/users/${world.ids.otherStudent}/unlock`,
    expected: ADMIN_ONLY,
  },
  {
    action: 'importStudents',
    method: 'post',
    path: () => '/api/users/import',
    // No file is attached: the admin reaches the import and is refused for
    // that (400), everyone else is refused for who they are.
    expected: { ...ADMIN_ONLY, admin: 400 },
  },

  {
    action: 'resetStudentPassword',
    method: 'post',
    path: (world) => `/api/users/${world.ids.resetOwnStudent}/reset-password`,
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
  },
  {
    action: 'resetStudentPassword',
    method: 'post',
    // The other teacher's student: the first teacher is refused, and the
    // other teacher, whose class it is, is not.
    path: (world) => `/api/users/${world.ids.resetOtherStudent}/reset-password`,
    expected: { admin: 200, teacherOwn: 403, teacherOther: 200, student: 403 },
  },
  {
    action: 'resetStudentPassword',
    method: 'post',
    // A staff account is the admin's alone to reset.
    path: (world) => `/api/users/${world.ids.resetTeacher}/reset-password`,
    expected: ADMIN_ONLY,
  },

  // Organisation (ADM-03). Every change here leaves the world as it was, so
  // the rows after it still see the classes the world was built with.
  {
    action: 'manageOrganisation',
    method: 'get',
    path: () => '/api/courses',
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageOrganisation',
    method: 'post',
    path: () => '/api/courses',
    body: { name: 'Business English' },
    expected: { ...ADMIN_ONLY, admin: 201 },
  },
  {
    action: 'manageOrganisation',
    method: 'patch',
    path: (world) => `/api/courses/${world.ids.course}`,
    body: { name: 'Spoken English' },
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageOrganisation',
    method: 'get',
    path: () => '/api/batches',
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageOrganisation',
    method: 'post',
    path: () => '/api/batches',
    body: (world) => ({ courseId: world.ids.course, name: 'Spring 2027', startsOn: '2027-02-01' }),
    expected: { ...ADMIN_ONLY, admin: 201 },
  },
  {
    action: 'manageOrganisation',
    method: 'patch',
    path: (world) => `/api/batches/${world.ids.batch}`,
    body: { name: 'Fall 2026' },
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageOrganisation',
    readByTeachers: true,
    method: 'get',
    path: () => '/api/classes',
    // The teachers' list is filtered to their own classes, not refused.
    expected: STAFF_ONLY,
  },
  {
    action: 'manageOrganisation',
    method: 'post',
    path: () => '/api/classes',
    body: (world) => ({
      code: 'B-30',
      name: 'Weekend',
      batchId: world.ids.batch,
      labRoomId: world.ids.labRoom,
    }),
    expected: { ...ADMIN_ONLY, admin: 201 },
  },
  {
    action: 'manageOrganisation',
    readByTeachers: true,
    method: 'get',
    // Reading a class is not managing it: its own teacher may.
    path: (world) => `/api/classes/${world.ids.ownClass}`,
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
  },
  {
    action: 'manageOrganisation',
    method: 'patch',
    path: (world) => `/api/classes/${world.ids.ownClass}`,
    body: { name: 'Morning' },
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageOrganisation',
    readByTeachers: true,
    method: 'get',
    path: (world) => `/api/classes/${world.ids.ownClass}/students`,
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
  },
  {
    action: 'manageOrganisation',
    method: 'put',
    path: (world) => `/api/classes/${world.ids.otherClass}/teachers`,
    body: (world) => ({ teacherIds: [world.ids.teacherOther] }),
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageOrganisation',
    method: 'put',
    path: (world) => `/api/classes/${world.ids.otherClass}/students`,
    body: (world) => ({ studentIds: [world.ids.otherStudent, world.ids.resetOtherStudent] }),
    expected: ADMIN_ONLY,
  },
  {
    action: 'makeGroups',
    method: 'post',
    path: (world) => `/api/classes/${world.ids.ownClass}/groups`,
    body: { kind: 'pair' },
    expected: { admin: 201, teacherOwn: 201, teacherOther: 403, student: 403 },
  },
  {
    action: 'makeGroups',
    method: 'get',
    path: (world) => `/api/classes/${world.ids.ownClass}/groups`,
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
  },

  // Labs and PCs (ADM-04). The PC row renames it to the name it already has.
  {
    action: 'manageLabs',
    method: 'get',
    path: () => '/api/labs',
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageLabs',
    method: 'post',
    path: () => '/api/labs',
    body: { name: 'Lab 2', rows: 2, seatsPerRow: 3 },
    expected: { ...ADMIN_ONLY, admin: 201 },
  },
  {
    action: 'manageLabs',
    method: 'patch',
    path: (world) => `/api/labs/${world.ids.labRoom}`,
    body: { name: 'Lab 1' },
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageLabs',
    readByTeachers: true,
    method: 'get',
    // Seeing the seats is not managing them: every teacher's console needs
    // the room, with names shown only for their own students.
    path: (world) => `/api/labs/${world.ids.labRoom}/seats`,
    expected: STAFF_ONLY,
  },
  {
    action: 'manageLabs',
    method: 'get',
    path: () => '/api/devices',
    expected: ADMIN_ONLY,
  },
  {
    action: 'manageLabs',
    method: 'patch',
    path: (world) => `/api/devices/${world.ids.device}`,
    body: { action: 'rename', hostname: 'LAB1-A1' },
    expected: ADMIN_ONLY,
  },

  // Not built yet. Each expects 404 until its endpoint exists.
  {
    action: 'runClass',
    method: 'post',
    path: () => '/api/sessions',
    body: { classId: 'the own class, filled in when the row is switched on' },
    expected: OWN_CLASS_TEACHER,
    todo: true,
  },
  {
    action: 'editLessons',
    method: 'post',
    path: () => '/api/lessons',
    body: { module: 'speaking', title: 'Introductions' },
    expected: STAFF_ONLY,
    todo: true,
  },
  {
    action: 'publishLessons',
    method: 'post',
    path: () => '/api/assignments',
    body: { classId: 'the own class, filled in when the row is switched on' },
    expected: ADMIN_OR_OWN_CLASS_TEACHER,
    todo: true,
  },
  {
    action: 'seeLessons',
    method: 'get',
    path: () => '/api/lessons',
    // A student's list holds only what is assigned to them; nobody is refused.
    expected: ALL_FOUR(200),
    todo: true,
  },
  {
    action: 'submitWork',
    method: 'post',
    path: () => '/api/assignments/the-assignment/submissions',
    expected: { admin: 403, teacherOwn: 403, teacherOther: 403, student: 200 },
    todo: true,
  },
  {
    action: 'markWork',
    method: 'post',
    path: () => '/api/submissions/the-submission/grade',
    expected: OWN_CLASS_TEACHER,
    todo: true,
  },
  {
    action: 'seeProgress',
    method: 'get',
    path: (world) => `/api/students/${world.ids.student}/progress`,
    expected: { admin: 200, teacherOwn: 200, teacherOther: 403, student: 200 },
    todo: true,
  },
  {
    action: 'reports',
    method: 'get',
    path: () => '/api/reports/attendance',
    expected: STAFF_ONLY,
    todo: true,
  },
  {
    action: 'manageSettings',
    method: 'patch',
    path: () => '/api/settings',
    body: { softwareName: 'Lab' },
    expected: ADMIN_ONLY,
    todo: true,
  },
  {
    // Also answered with no login at all, for the login screens: see t-acl-01.guards.spec.ts.
    action: 'seeBranding',
    method: 'get',
    path: () => '/api/settings/branding',
    expected: ALL_FOUR(200),
  },
  {
    action: 'manageSettings',
    method: 'get',
    path: () => '/api/backups',
    expected: ADMIN_ONLY,
    todo: true,
  },
  {
    action: 'manageSettings',
    method: 'get',
    path: () => '/api/audit-logs',
    expected: ADMIN_ONLY,
    todo: true,
  },
];

/** The permissions table, every cell, as the document has it. */
function documentedTable(): PermissionRow[] {
  const lines = readFileSync(PERMISSIONS_DOC, 'utf8')
    .split('\n')
    .map((line) => line.trimEnd());
  const start = lines.findIndex((line) => line.startsWith('| Action'));
  const end = lines.findIndex((line, index) => index > start + 1 && !line.startsWith('|'));
  return lines.slice(start + 2, end).map((line) => {
    const [row = '', admin = '', teacher = '', student = ''] = line
      .split('|')
      .slice(1, 5)
      .map((cell) => cell.trim());
    return { row, admin, teacher, student };
  });
}

/** The first column of the permissions table, as the document has it. */
function documentedRows(): string[] {
  return documentedTable().map((entry) => entry.row);
}

/** The table's cell for one of the four accounts tried here. */
function cellFor(action: Action, role: Role4): string {
  const entry = PERMISSIONS[action];
  return role === 'admin' ? entry.admin : role === 'student' ? entry.student : entry.teacher;
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
    const covered = new Set<string>(rows.map((row) => PERMISSIONS[row.action].row));

    expect(documentedRows().filter((row) => !covered.has(row))).toEqual([]);
  });

  it('names a row the document has, for every row here', () => {
    const documented = new Set(documentedRows());

    expect(
      [...new Set(rows.map((row) => PERMISSIONS[row.action].row))].filter(
        (row) => !documented.has(row),
      ),
    ).toEqual([]);
  });

  it('is the table in packages/shared, cell for cell, so the apps hide what the server refuses', () => {
    expect(Object.values(PERMISSIONS)).toEqual(documentedTable());
  });

  it('refuses every account the shared table says No to, on every endpoint', () => {
    const disagreements = rows.flatMap((row) =>
      ROLE4.filter((role) => accessOf(cellFor(row.action, role)) === 'none')
        // A teacher reads some of what only the admin manages (the class
        // list filtered to their own, the seat map): those rows say so.
        .filter((role) => !(row.readByTeachers === true && role.startsWith('teacher')))
        .filter((role) => row.expected[role] !== 403)
        .map((role) => `${row.method.toUpperCase()} ${PERMISSIONS[row.action].row}: ${role}`),
    );

    expect(disagreements).toEqual([]);
  });

  it('never refuses an account the shared table says Yes or All to', () => {
    const disagreements = rows.flatMap((row) =>
      ROLE4.filter((role) => accessOf(cellFor(row.action, role)) === 'all')
        .filter((role) => row.expected[role] === 403)
        .map((role) => `${row.method.toUpperCase()} ${PERMISSIONS[row.action].row}: ${role}`),
    );

    expect(disagreements).toEqual([]);
  });
});

for (const row of rows) {
  const label = `${row.method.toUpperCase()} ${row.path({ ids: {}, codes: {} } as PermissionsWorld)}`;

  describe(`T-ACL-01 ${PERMISSIONS[row.action].row} — ${label}`, () => {
    for (const role of ROLE4) {
      const wanted = row.expected[role];

      it(`answers ${role} with ${row.todo === true ? `${NOT_BUILT} until it is built` : wanted}`, async () => {
        const res = await request(app.getHttpServer())
          [row.method](row.path(world))
          .set('Authorization', `Bearer ${world.tokens[role]}`)
          .send(typeof row.body === 'function' ? row.body(world) : (row.body ?? {}));

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
