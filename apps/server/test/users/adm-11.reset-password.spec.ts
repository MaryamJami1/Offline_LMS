import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ResetPasswordResponse } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';
import { buildUsersWorld, loginAs, type UsersWorld } from '../support/users-world.js';

/**
 * ADM-11 (T-ADM-11): a teacher resets the password of a student in their own
 * class; resetting a student of another class or a staff account is refused
 * (403). The admin may reset anyone's. The new password is made up by the
 * server, shown once, and must be changed at the next login, and every reset
 * is in the audit log.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let world: UsersWorld;

/** Ayesha is in B-12, which the teacher teaches; Bilal is in B-13, which they do not. */
let own: { id: string; username: string };
let other: { id: string; username: string };

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  context.clock.set(new Date('2026-11-03T09:00:00.000Z'));
  world = await buildUsersWorld(app, prisma);
  own = await createAccount(prisma, {
    username: 'S-1001',
    role: 'student',
    fullName: 'Ayesha Khan',
  });
  other = await createAccount(prisma, {
    username: 'S-1002',
    role: 'student',
    fullName: 'Bilal Ahmed',
  });
  await prisma.enrollment.createMany({
    data: [
      { classId: world.classes.b12, studentId: own.id, enrolledOn: new Date('2026-09-01') },
      { classId: world.classes.b13, studentId: other.id, enrolledOn: new Date('2026-09-01') },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

function reset(token: string, id: string) {
  return http().post(`/api/users/${id}/reset-password`).set('Authorization', `Bearer ${token}`);
}

async function canLogIn(username: string, password: string): Promise<boolean> {
  const res = await http().post('/api/auth/login').send({ username, password });
  return res.status === 200;
}

describe('T-ADM-11 a teacher resets a student of their own class', () => {
  it('answers with a new first-login password, once', async () => {
    const res = await reset(world.teacherToken, own.id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      id: own.id,
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      generatedPassword: expect.stringMatching(/^[A-Za-z2-9]{10}$/),
    });
  });

  it('replaces the old password, and the student must change the new one', async () => {
    const res = await reset(world.teacherToken, own.id);
    const { generatedPassword } = res.body as ResetPasswordResponse;

    expect(await canLogIn('S-1001', TEST_PASSWORD)).toBe(false);
    const login = await http()
      .post('/api/auth/login')
      .send({ username: 'S-1001', password: generatedPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('makes a different password each time', async () => {
    const first = (await reset(world.teacherToken, own.id)).body as ResetPasswordResponse;
    const second = (await reset(world.teacherToken, own.id)).body as ResetPasswordResponse;

    expect(first.generatedPassword).not.toBe(second.generatedPassword);
  });

  it('lifts a lockout, since the student forgot the password that caused it', async () => {
    await prisma.user.update({
      where: { id: own.id },
      data: { failedLoginAttempts: 5, lockedUntil: new Date('2026-11-03T09:10:00.000Z') },
    });

    const res = await reset(world.teacherToken, own.id);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    expect(await canLogIn('S-1001', (res.body as ResetPasswordResponse).generatedPassword)).toBe(
      true,
    );
  });

  it('ends the logins the old password opened and frees the seat', async () => {
    const seat = await prisma.seat.create({
      data: { labRoomId: world.labRoomId, code: 'A1', row: 'A', position: 1 },
    });
    const device = await prisma.device.create({
      data: { hostname: 'LAB1-A1', mac: '00:11:22:33:44:55', seatId: seat.id, approved: true },
    });
    await prisma.deviceLogin.create({
      data: { deviceId: device.id, seatId: seat.id, studentId: own.id },
    });
    const login = await http()
      .post('/api/auth/login')
      .send({ username: 'S-1001', password: TEST_PASSWORD });
    const refreshToken = login.body.refreshToken as string;

    await reset(world.teacherToken, own.id);

    const refresh = await http().post('/api/auth/refresh').send({ refreshToken });
    expect(refresh.status).not.toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: own.id, revokedAt: null } })).toBe(0);
    expect(await prisma.deviceLogin.findFirst({ where: { studentId: own.id } })).toMatchObject({
      logoutReason: 'admin',
      loggedOutAt: new Date('2026-11-03T09:00:00.000Z'),
    });
  });
});

describe('T-ADM-11 what a teacher may not reset', () => {
  async function expectRefused(id: string, username: string) {
    const res = await reset(world.teacherToken, id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await canLogIn(username, TEST_PASSWORD)).toBe(true);
  }

  it('refuses a student of another class', async () => {
    await expectRefused(other.id, 'S-1002');
  });

  it('refuses a student who has left their class', async () => {
    await prisma.enrollment.update({
      where: { classId_studentId: { classId: world.classes.b12, studentId: own.id } },
      data: { status: 'left' },
    });

    await expectRefused(own.id, 'S-1001');
  });

  it('refuses another teacher', async () => {
    const colleague = await createAccount(prisma, { username: 'imran.ali', role: 'teacher' });

    await expectRefused(colleague.id, 'imran.ali');
  });

  it('refuses the admin', async () => {
    await expectRefused(world.adminId, 'admin');
  });

  it('refuses their own account, which is changed with the current password instead', async () => {
    await expectRefused(world.teacherId, 'sara.iqbal');
  });

  it('refuses an account that does not exist the same way, so ids reveal nothing', async () => {
    const res = await reset(world.teacherToken, '0190f5a0-0000-7000-8000-000000000999');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a student, even for their own account', async () => {
    const token = await loginAs(app, 'S-1001');

    const res = await reset(token, own.id);

    expect(res.status).toBe(403);
    expect(await canLogIn('S-1001', TEST_PASSWORD)).toBe(true);
  });

  it('writes nothing to the audit log when refused', async () => {
    await reset(world.teacherToken, other.id);

    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe('T-ADM-11 the admin resets anyone', () => {
  it('resets a student of any class', async () => {
    const res = await reset(world.adminToken, other.id);

    expect(res.status).toBe(200);
    expect(await canLogIn('S-1002', (res.body as ResetPasswordResponse).generatedPassword)).toBe(
      true,
    );
  });

  it('resets a teacher', async () => {
    const res = await reset(world.adminToken, world.teacherId);

    expect(res.status).toBe(200);
    expect(await canLogIn('sara.iqbal', TEST_PASSWORD)).toBe(false);
  });

  it('refuses an account that does not exist', async () => {
    const res = await reset(world.adminToken, '0190f5a0-0000-7000-8000-000000000999');

    expect(res.status).toBe(403);
  });

  it('refuses an id that is not an id', async () => {
    const res = await reset(world.adminToken, 'S-1001');

    expect(res.status).toBe(400);
  });
});

describe('T-ADM-11 every reset is in the audit log', () => {
  it('records who reset whose password, from where, without the password', async () => {
    const res = await reset(world.teacherToken, own.id).set('X-Forwarded-For', '192.168.10.31');
    const { generatedPassword } = res.body as ResetPasswordResponse;

    const entries = await prisma.auditLog.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: world.teacherId,
      action: 'user.password_reset',
      entity: 'user',
      entityId: own.id,
      ip: '192.168.10.31',
      details: { username: 'S-1001', role: 'student' },
    });
    expect(JSON.stringify(entries)).not.toContain(generatedPassword);
  });

  it('records the admin resets too', async () => {
    await reset(world.adminToken, world.teacherId);

    expect(await prisma.auditLog.findFirstOrThrow()).toMatchObject({
      actorId: world.adminId,
      action: 'user.password_reset',
      entityId: world.teacherId,
      details: { username: 'sara.iqbal', role: 'teacher' },
    });
  });

  it('keeps the old password when the entry cannot be written, so no reset goes unlogged', async () => {
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('disk full'));

    const res = await reset(world.teacherToken, own.id);

    expect(res.status).toBe(500);
    expect(await canLogIn('S-1001', TEST_PASSWORD)).toBe(true);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({
      mustChangePassword: false,
    });
  });
});
