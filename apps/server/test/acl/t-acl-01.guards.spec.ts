import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';
import { AclProbeModule } from '../support/acl-probe.module.js';
import {
  ROLE4,
  buildPermissionsWorld,
  type PermissionsWorld,
  type Role4,
} from '../support/permissions-world.js';
import { postLogin } from '../support/lab-pc.js';

/**
 * T-ACL-01, the mechanism: the server denies by default, each route's roles
 * are checked on the server, and ownership is checked against the record.
 * Also NFR-13's last open end — an account that must change its password is
 * refused on a route outside the allowlist, which could not be shown until a
 * route outside it existed.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let world: PermissionsWorld;

function get(path: string, token?: string) {
  const call = request(app.getHttpServer()).get(path);
  return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
}

function as(role: Role4, path: string) {
  return get(path, world.tokens[role]);
}

function errorCodeOf(body: unknown): string {
  return (body as { error: { code: string } }).error.code;
}

beforeAll(async () => {
  context = await createAuthTestApp({ imports: [AclProbeModule] });
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-11-02T09:00:00.000Z'));
  world = await buildPermissionsWorld(app, prisma);
});

afterAll(async () => {
  await app.close();
});

describe('T-ACL-01 the server denies by default', () => {
  it('refuses a route to nobody, without the route having to say so', async () => {
    const res = await get('/api/probe/any');

    expect(res.status).toBe(401);
    expect(errorCodeOf(res.body)).toBe('UNAUTHENTICATED');
  });

  it('answers a route that is deliberately public', async () => {
    expect((await get('/api/probe/open')).status).toBe(200);
  });

  it('keeps the health check open to the lab network', async () => {
    expect((await get('/api/health')).status).toBe(200);
  });

  it('shows the branding to the login screens, before anyone logs in', async () => {
    expect((await get('/api/settings/branding')).status).toBe(200);
  });

  it('lets a lab PC ask to close the student app by its device key, with no login (STU-06)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/devices/exit')
      .send({ pin: '204816' });

    // Refused for having no approved device key, not for having no login.
    expect(res.status).toBe(403);
    expect(errorCodeOf(res.body)).toBe('DEVICE_NOT_APPROVED');
  });

  it('lets anybody log in', async () => {
    const res = await postLogin(app, { username: 'S-1001', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('lets every logged-in account through a route that names no role', async () => {
    for (const role of ROLE4) {
      expect((await as(role, '/api/probe/any')).status).toBe(200);
    }
  });

  it('still lets every account see itself', async () => {
    for (const role of ROLE4) {
      expect((await as(role, '/api/me')).status).toBe(200);
    }
  });
});

describe('T-ACL-01 the role a route names is checked on the server', () => {
  it('lets only the admin into an admin route', async () => {
    expect((await as('admin', '/api/probe/admin')).status).toBe(200);

    for (const role of ['teacherOwn', 'teacherOther', 'student'] as Role4[]) {
      const res = await as(role, '/api/probe/admin');
      expect(res.status).toBe(403);
      expect(errorCodeOf(res.body)).toBe('FORBIDDEN');
    }
  });

  it('lets staff into a staff route and keeps students out', async () => {
    for (const role of ['admin', 'teacherOwn', 'teacherOther'] as Role4[]) {
      expect((await as(role, '/api/probe/staff')).status).toBe(200);
    }

    expect((await as('student', '/api/probe/staff')).status).toBe(403);
  });

  it('says nothing about which role would have been allowed', async () => {
    const res = await as('student', '/api/probe/admin');

    expect(JSON.stringify(res.body)).not.toMatch(/admin|teacher/i);
  });
});

describe('T-ACL-01 a teacher acts only on their own classes', () => {
  it('lets a teacher act on a class they teach', async () => {
    expect((await as('teacherOwn', `/api/probe/classes/${world.ids.ownClass}`)).status).toBe(200);
  });

  it("refuses a teacher another teacher's class", async () => {
    const res = await as('teacherOwn', `/api/probe/classes/${world.ids.otherClass}`);

    expect(res.status).toBe(403);
    expect(errorCodeOf(res.body)).toBe('FORBIDDEN');
  });

  it('lets the admin act on any class', async () => {
    expect((await as('admin', `/api/probe/classes/${world.ids.ownClass}`)).status).toBe(200);
    expect((await as('admin', `/api/probe/classes/${world.ids.otherClass}`)).status).toBe(200);
  });

  it('refuses a class that does not exist the same way as one that is not yours', async () => {
    const missing = '01999999-9999-7999-8999-999999999999';

    const res = await as('teacherOwn', `/api/probe/classes/${missing}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      (await as('teacherOwn', `/api/probe/classes/${world.ids.otherClass}`)).body,
    );
  });

  it('shows a teacher their own classes in a list, and no others', async () => {
    const own = await as('teacherOwn', '/api/probe/classes');
    const other = await as('teacherOther', '/api/probe/classes');

    expect(own.body).toEqual({ codes: [world.codes.ownClass] });
    expect(other.body).toEqual({ codes: [world.codes.otherClass] });
  });

  it('shows the admin every class and the student only the class they are in', async () => {
    expect((await as('admin', '/api/probe/classes')).body).toEqual({
      codes: [world.codes.ownClass, world.codes.otherClass],
    });
    expect((await as('student', '/api/probe/classes')).body).toEqual({
      codes: [world.codes.ownClass],
    });
  });

  it('refuses a wrong class exactly as it refuses a wrong role', async () => {
    const wrongRole = await as('student', '/api/probe/admin');
    const wrongClass = await as('teacherOwn', `/api/probe/classes/${world.ids.otherClass}`);

    expect(wrongClass.status).toBe(wrongRole.status);
    expect(wrongClass.body).toEqual(wrongRole.body);
  });
});

describe('T-ACL-01 a record that is not there refuses like one that is not yours', () => {
  const missing = '01999999-9999-7999-8999-999999999999';

  it('refuses a student the class check, whatever the route forgot to say', async () => {
    const res = await as('student', `/api/probe/open-classes/${world.ids.ownClass}`);

    expect(res.status).toBe(403);
    expect(errorCodeOf(res.body)).toBe('FORBIDDEN');
  });

  it('refuses the admin a class that does not exist', async () => {
    const res = await as('admin', `/api/probe/classes/${missing}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual((await as('student', '/api/probe/admin')).body);
  });

  it('refuses the admin a student who does not exist', async () => {
    expect((await as('admin', `/api/probe/students/${missing}`)).status).toBe(403);
  });

  it('refuses the admin a student id that belongs to a teacher', async () => {
    expect((await as('admin', `/api/probe/students/${world.ids.teacherOwn}`)).status).toBe(403);
  });
});

describe('T-ACL-01 a student sees only their own data', () => {
  it('lets a student read their own record', async () => {
    expect((await as('student', `/api/probe/students/${world.ids.student}`)).status).toBe(200);
  });

  it("refuses a student another student's record", async () => {
    const res = await as('student', `/api/probe/students/${world.ids.otherStudent}`);

    expect(res.status).toBe(403);
    expect(errorCodeOf(res.body)).toBe('FORBIDDEN');
  });

  it('lets a teacher read a student of their own class', async () => {
    expect((await as('teacherOwn', `/api/probe/students/${world.ids.student}`)).status).toBe(200);
  });

  it('refuses a teacher a student who is not in their classes', async () => {
    expect((await as('teacherOther', `/api/probe/students/${world.ids.student}`)).status).toBe(403);
  });

  it('lets the admin read any student', async () => {
    for (const id of [world.ids.student, world.ids.otherStudent]) {
      expect((await as('admin', `/api/probe/students/${id}`)).status).toBe(200);
    }
  });
});

describe('NFR-13 an account that must change its password is held to the allowlist', () => {
  it('is refused on a route outside it, by the server', async () => {
    await createAccount(prisma, {
      username: 'S-1003',
      role: 'student',
      fullName: 'Hira Shah',
      mustChangePassword: true,
    });
    const login = await postLogin(app, { username: 'S-1003', password: TEST_PASSWORD });
    const token = (login.body as { accessToken: string }).accessToken;

    const res = await get('/api/probe/any', token);

    expect(res.status).toBe(403);
    expect(errorCodeOf(res.body)).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await get('/api/me', token)).status).toBe(200);
  });
});
