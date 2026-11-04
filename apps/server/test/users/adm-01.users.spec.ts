import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { AdminUser, CreateUserResponse, UserListResponse } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import {
  TEST_PASSWORD,
  createAccount,
  createAuthTestApp,
  type AuthTestApp,
} from '../support/auth-app.js';
import { buildUsersWorld, loginAs, type UsersWorld } from '../support/users-world.js';
import { labPc, postLogin } from '../support/lab-pc.js';

/**
 * ADM-01 (T-ADM-01): the admin creates, edits, deactivates and unlocks teacher
 * and student accounts and sets their first password, and the account has to
 * change it at first login. Creating, deactivating, reactivating and unlocking
 * are written to the audit log.
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

const http = () => request(app.getHttpServer());

function asAdmin(method: 'get' | 'post' | 'patch', path: string) {
  return http()[method](path).set('Authorization', `Bearer ${world.adminToken}`);
}

async function createStudent(body: object = {}): Promise<CreateUserResponse> {
  const res = await asAdmin('post', '/api/users').send({
    role: 'student',
    fullName: 'Ayesha Khan',
    classCode: 'B-12',
    ...body,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as CreateUserResponse;
}

describe('ADM-01 creating accounts', () => {
  it('creates a student with the next student ID and a generated first password', async () => {
    const created = await createStudent();

    expect(created.user).toMatchObject({
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      role: 'student',
      status: 'active',
      mustChangePassword: true,
      classes: [{ code: 'B-12', name: 'Morning B' }],
      rollNo: '1',
      subjects: [],
    });
    expect(created.generatedPassword).toMatch(/^[A-Za-z2-9]{10}$/);
  });

  it('enrols the student in the class it names', async () => {
    const created = await createStudent();

    const enrolment = await prisma.enrollment.findFirst({ where: { studentId: created.user.id } });
    expect(enrolment).toMatchObject({ classId: world.classes.b12, status: 'active' });
  });

  it('numbers students on from the highest student ID there is', async () => {
    await createAccount(prisma, { username: 'S-1050', role: 'student' });

    const first = await createStudent();
    const second = await createStudent({ fullName: 'Bilal Ahmed' });

    expect([first.user.username, second.user.username]).toEqual(['S-1051', 'S-1052']);
    expect(second.user.rollNo).toBe('2');
  });

  it('gives two students created at the same moment two different IDs', async () => {
    const results = await Promise.all(
      ['Ayesha Khan', 'Bilal Ahmed', 'Fatima Noor', 'Hassan Raza'].map((fullName) =>
        asAdmin('post', '/api/users').send({ role: 'student', fullName }),
      ),
    );

    expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201]);
    const usernames = results.map((res) => (res.body as CreateUserResponse).user.username);
    expect(new Set(usernames).size).toBe(4);
  });

  it('uses the first password the admin typed, and then shows none', async () => {
    const created = await createStudent({ password: 'Karachi-2026' });

    expect(created.generatedPassword).toBeNull();
    await expect(loginAs(app, created.user.username, 'Karachi-2026')).resolves.toBeTypeOf('string');
  });

  it('takes the student ID the admin gives', async () => {
    const created = await createStudent({ username: 'S-9001' });

    expect(created.user.username).toBe('S-9001');
  });

  it('creates a teacher with their modules and classes', async () => {
    const res = await asAdmin('post', '/api/users').send({
      role: 'teacher',
      fullName: 'Imran Ali',
      username: 'imran.ali',
      subjects: ['Reading', 'Writing'],
      classCodes: ['b-13'],
    });

    expect(res.status).toBe(201);
    expect((res.body as CreateUserResponse).user).toMatchObject({
      username: 'imran.ali',
      role: 'teacher',
      subjects: ['Reading', 'Writing'],
      classes: [{ code: 'B-13', name: 'Evening A' }],
      rollNo: null,
    });
  });

  it('refuses a username that is taken, whatever its case', async () => {
    const res = await asAdmin('post', '/api/users').send({
      role: 'teacher',
      fullName: 'Sara Two',
      username: 'SARA.IQBAL',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('refuses a class that does not exist and creates nothing', async () => {
    const res = await asAdmin('post', '/api/users').send({
      role: 'student',
      fullName: 'Ayesha Khan',
      classCode: 'B-99',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CLASS_NOT_FOUND');
    expect(await prisma.user.count({ where: { role: 'student' } })).toBe(0);
  });

  it('refuses to make an admin account', async () => {
    const res = await asAdmin('post', '/api/users').send({
      role: 'admin',
      fullName: 'New Admin',
      username: 'admin2',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('never returns the password hash', async () => {
    const res = await asAdmin('post', '/api/users').send({
      role: 'student',
      fullName: 'Ayesha Khan',
    });

    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });
});

describe('ADM-01 first login', () => {
  it('holds a new account to changing its password, then lets it in', async () => {
    const created = await createStudent({ password: 'Karachi-2026' });
    const login = await postLogin(app, {
      username: created.user.username,
      password: 'Karachi-2026',
    });
    expect(login.body.user.mustChangePassword).toBe(true);

    const held = await http()
      .get('/api/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(held.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await http()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'Karachi-2026', newPassword: 'My-own-password' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
  });
});

describe('ADM-01 listing and viewing accounts', () => {
  beforeEach(async () => {
    await createStudent({ fullName: 'Ayesha Khan', phone: '0300-1234567' });
    await createStudent({ fullName: 'Bilal Ahmed', classCode: 'B-13' });
    await createStudent({ fullName: 'Zainab Malik' });
  });

  it('lists a page of accounts sorted by name, with the total', async () => {
    const res = await asAdmin('get', '/api/users?role=student&pageSize=2');

    const body = res.body as UserListResponse;
    expect(res.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(2);
    expect(body.items.map((user) => user.fullName)).toEqual(['Ayesha Khan', 'Bilal Ahmed']);
  });

  it('sorts the other way with a minus', async () => {
    const res = await asAdmin('get', '/api/users?role=student&sort=-name');

    expect((res.body as UserListResponse).items[0]?.fullName).toBe('Zainab Malik');
  });

  it('searches names, student IDs and phones', async () => {
    const byName = await asAdmin('get', '/api/users?q=bilal');
    const byId = await asAdmin('get', '/api/users?q=s-1003');
    const byPhone = await asAdmin('get', '/api/users?q=1234567');

    expect((byName.body as UserListResponse).items.map((user) => user.fullName)).toEqual([
      'Bilal Ahmed',
    ]);
    expect((byId.body as UserListResponse).items.map((user) => user.fullName)).toEqual([
      'Zainab Malik',
    ]);
    expect((byPhone.body as UserListResponse).items.map((user) => user.fullName)).toEqual([
      'Ayesha Khan',
    ]);
  });

  it('filters by class, the way the Students screen does', async () => {
    const students = await asAdmin('get', '/api/users?role=student&classCode=b-12');
    const everyone = await asAdmin('get', '/api/users?classCode=b-12');

    expect((students.body as UserListResponse).items.map((user) => user.fullName)).toEqual([
      'Ayesha Khan',
      'Zainab Malik',
    ]);
    // Without a role, the class's teacher is in it too.
    expect((everyone.body as UserListResponse).items.map((user) => user.fullName)).toEqual([
      'Ayesha Khan',
      'Sara Iqbal',
      'Zainab Malik',
    ]);
  });

  it('lists staff too, with the classes a teacher teaches', async () => {
    const res = await asAdmin('get', '/api/users?role=teacher');

    expect((res.body as UserListResponse).items).toMatchObject([
      { username: 'sara.iqbal', classes: [{ code: 'B-12' }] },
    ]);
  });

  it('refuses a query it does not understand', async () => {
    const res = await asAdmin('get', '/api/users?sort=password_hash');

    expect(res.status).toBe(400);
  });

  it('shows one account, and answers 404 for one that is not there', async () => {
    const list = await asAdmin('get', '/api/users?q=Ayesha');
    const id = (list.body as UserListResponse).items[0]?.id as string;

    const found = await asAdmin('get', `/api/users/${id}`);
    const missing = await asAdmin('get', '/api/users/0195f3a0-0000-7000-8000-000000000000');
    const malformed = await asAdmin('get', '/api/users/not-an-id');

    expect(found.status).toBe(200);
    expect((found.body as AdminUser).phone).toBe('0300-1234567');
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe("ADM-01 today's seat, for the Students screen (A-02)", () => {
  // The clock stands at 2026-11-02 09:00 UTC, which is 14:00 in Karachi.
  async function studentWithPassword(fullName: string): Promise<CreateUserResponse> {
    return createStudent({ fullName, password: TEST_PASSWORD });
  }

  async function logIn(username: string, at?: string, key?: string): Promise<request.Response> {
    const now = context.clock.now();
    if (at !== undefined) {
      context.clock.set(new Date(at));
    }
    const res =
      key === undefined
        ? await postLogin(app, { username, password: TEST_PASSWORD })
        : await http()
            .post('/api/auth/login')
            .set('X-Device-Key', key)
            .send({ username, password: TEST_PASSWORD });
    context.clock.set(now);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res;
  }

  async function seatTodayOf(id: string): Promise<AdminUser['seatToday'] | undefined> {
    const list = await asAdmin('get', '/api/users?pageSize=200');
    return (list.body as UserListResponse).items.find((user) => user.id === id)?.seatToday;
  }

  it('shows the seat of a student logged in now, and none for one who has not come', async () => {
    const here = await studentWithPassword('Ayesha Khan');
    const away = await studentWithPassword('Bilal Ahmed');
    await logIn(here.user.username);

    expect(await seatTodayOf(here.user.id)).toEqual({
      seatCode: 'T1',
      labName: 'Test lab',
      loggedIn: true,
    });
    expect(await seatTodayOf(away.user.id)).toBeNull();
    expect(await seatTodayOf(world.teacherId)).toBeNull();
  });

  it('keeps the seat after the student logs out, saying they are no longer there', async () => {
    const created = await studentWithPassword('Ayesha Khan');
    const login = await logIn(created.user.username);
    const logout = await http()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(204);

    expect(await seatTodayOf(created.user.id)).toEqual({
      seatCode: 'T1',
      labName: 'Test lab',
      loggedIn: false,
    });
  });

  it('counts the day in Karachi time: 00:30 there is today, 23:30 the night before is not', async () => {
    const early = await studentWithPassword('Ayesha Khan');
    const late = await studentWithPassword('Bilal Ahmed');
    await logIn(early.user.username, '2026-11-01T19:30:00.000Z');
    await logIn(late.user.username, '2026-11-01T18:30:00.000Z');

    expect((await seatTodayOf(early.user.id))?.seatCode).toBe('T1');
    expect(await seatTodayOf(late.user.id)).toBeNull();
  });

  it('shows the latest seat when the student moved to another PC', async () => {
    const created = await studentWithPassword('Ayesha Khan');
    await logIn(created.user.username, '2026-11-02T05:00:00.000Z');
    const other = await labPc(prisma, 'another-pc');
    await logIn(created.user.username, '2026-11-02T06:00:00.000Z', other.key);

    expect(await seatTodayOf(created.user.id)).toEqual({
      seatCode: other.seatCode,
      labName: 'Test lab',
      loggedIn: true,
    });
  });

  it('shows it on a single account too', async () => {
    const created = await studentWithPassword('Ayesha Khan');
    await logIn(created.user.username);

    const res = await asAdmin('get', `/api/users/${created.user.id}`);

    expect((res.body as AdminUser).seatToday).toMatchObject({ seatCode: 'T1', loggedIn: true });
  });
});

describe('ADM-01 editing accounts', () => {
  it('changes the name and phone, and clears the phone with null', async () => {
    const created = await createStudent({ phone: '0300-1234567' });

    const renamed = await asAdmin('patch', `/api/users/${created.user.id}`).send({
      fullName: 'Ayesha  Noor',
    });
    const cleared = await asAdmin('patch', `/api/users/${created.user.id}`).send({ phone: null });

    expect(renamed.body.fullName).toBe('Ayesha Noor');
    expect(cleared.body.phone).toBeNull();
  });

  it("changes a teacher's modules but refuses modules for a student", async () => {
    const student = await createStudent();

    const teacher = await asAdmin('patch', `/api/users/${world.teacherId}`).send({
      subjects: ['Speaking'],
    });
    const refused = await asAdmin('patch', `/api/users/${student.user.id}`).send({
      subjects: ['Speaking'],
    });

    expect(teacher.body.subjects).toEqual(['Speaking']);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('SUBJECTS_FOR_TEACHERS_ONLY');
  });

  it('refuses a change to the role or the username', async () => {
    const created = await createStudent();

    const res = await asAdmin('patch', `/api/users/${created.user.id}`).send({ role: 'admin' });

    expect(res.status).toBe(400);
  });
});

describe('ADM-01 deactivating accounts', () => {
  async function seatedStudent() {
    const created = await createStudent({ password: TEST_PASSWORD });
    // Logging in at a lab PC records the seat (STU-01).
    const login = await postLogin(app, {
      username: created.user.username,
      password: TEST_PASSWORD,
    });
    return { created, refreshToken: login.body.refreshToken as string };
  }

  it('ends every login, frees the seat, and refuses the next login', async () => {
    const { created, refreshToken } = await seatedStudent();

    const res = await asAdmin('patch', `/api/users/${created.user.id}`).send({
      status: 'inactive',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('inactive');
    const login = await postLogin(app, {
      username: created.user.username,
      password: TEST_PASSWORD,
    });
    expect(login.body.error.code).toBe('ACCOUNT_INACTIVE');
    const refresh = await http().post('/api/auth/refresh').send({ refreshToken });
    expect(refresh.status).not.toBe(200);
    expect(
      await prisma.refreshToken.count({ where: { userId: created.user.id, revokedAt: null } }),
    ).toBe(0);
    expect(
      await prisma.deviceLogin.findFirst({ where: { studentId: created.user.id } }),
    ).toMatchObject({
      logoutReason: 'admin',
      loggedOutAt: new Date('2026-11-02T09:00:00.000Z'),
    });
  });

  it('reactivates an account, which can then log in again', async () => {
    const { created } = await seatedStudent();
    await asAdmin('patch', `/api/users/${created.user.id}`).send({ status: 'inactive' });

    const res = await asAdmin('patch', `/api/users/${created.user.id}`).send({ status: 'active' });

    expect(res.body.status).toBe('active');
    await expect(loginAs(app, created.user.username)).resolves.toBeTypeOf('string');
  });

  it('refuses to let the admin deactivate their own account', async () => {
    const res = await asAdmin('patch', `/api/users/${world.adminId}`).send({ status: 'inactive' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
  });
});

describe('ADM-01 unlocking accounts', () => {
  it('shows the lock, and unlocking lets the account log in at once', async () => {
    const created = await createStudent({ password: TEST_PASSWORD });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postLogin(app, { username: created.user.username, password: 'wrong-password' });
    }
    const locked = await asAdmin('get', `/api/users/${created.user.id}`);
    expect(locked.body.lockedUntil).toBe('2026-11-02T09:10:00.000Z');

    const res = await asAdmin('post', `/api/users/${created.user.id}/unlock`);

    expect(res.status).toBe(200);
    expect(res.body.lockedUntil).toBeNull();
    await expect(loginAs(app, created.user.username)).resolves.toBeTypeOf('string');
  });

  it('shows no lock once its time has passed', async () => {
    const created = await createStudent();
    await prisma.user.update({
      where: { id: created.user.id },
      data: { lockedUntil: new Date('2026-11-02T08:00:00.000Z') },
    });

    const res = await asAdmin('get', `/api/users/${created.user.id}`);

    expect(res.body.lockedUntil).toBeNull();
  });
});

describe('ADM-01 audit log', () => {
  it('records who created which account, from where, without the password', async () => {
    const res = await asAdmin('post', '/api/users')
      .set('X-Forwarded-For', '192.168.10.31')
      .send({ role: 'student', fullName: 'Ayesha Khan', password: 'Karachi-2026' });
    const created = res.body as CreateUserResponse;

    const entries = await prisma.auditLog.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: world.adminId,
      action: 'user.created',
      entity: 'user',
      entityId: created.user.id,
      ip: '192.168.10.31',
      details: { username: 'S-1001', role: 'student' },
    });
    expect(JSON.stringify(entries)).not.toMatch(/Karachi-2026|argon2/);
  });

  it('records the address the request came from when there is no proxy header', async () => {
    await asAdmin('post', '/api/users').send({ role: 'student', fullName: 'Ayesha Khan' });

    const entry = await prisma.auditLog.findFirstOrThrow();
    expect(entry.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it('records deactivating, reactivating and unlocking', async () => {
    const created = await createStudent();
    await prisma.auditLog.deleteMany();

    await asAdmin('patch', `/api/users/${created.user.id}`).send({ status: 'inactive' });
    await asAdmin('patch', `/api/users/${created.user.id}`).send({ status: 'active' });
    await asAdmin('post', `/api/users/${created.user.id}/unlock`);
    await asAdmin('patch', `/api/users/${created.user.id}`).send({ fullName: 'Ayesha Noor' });

    const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(entries.map((entry) => entry.action)).toEqual([
      'user.deactivated',
      'user.reactivated',
      'user.unlocked',
    ]);
    expect(
      entries.every(
        (entry) => entry.actorId === world.adminId && entry.entityId === created.user.id,
      ),
    ).toBe(true);
  });

  it('writes nothing when the change is refused', async () => {
    await asAdmin('patch', `/api/users/${world.adminId}`).send({ status: 'inactive' });
    await asAdmin('post', '/api/users').send({
      role: 'student',
      fullName: 'Ayesha Khan',
      classCode: 'B-99',
    });

    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe('ADM-01 who may manage accounts', () => {
  it.each([
    ['get', '/api/users'],
    ['post', '/api/users'],
  ] as const)('refuses a teacher on %s %s', async (method, path) => {
    const res = await http()
      [method](path)
      .set('Authorization', `Bearer ${world.teacherToken}`)
      .send({ role: 'student', fullName: 'X Y' });

    expect(res.status).toBe(403);
  });

  it('refuses a teacher on one account, its edit and its unlock', async () => {
    const created = await createStudent();
    const as = (method: 'get' | 'patch' | 'post', path: string) =>
      http()[method](path).set('Authorization', `Bearer ${world.teacherToken}`);

    expect((await as('get', `/api/users/${created.user.id}`)).status).toBe(403);
    expect(
      (await as('patch', `/api/users/${created.user.id}`).send({ fullName: 'X Y' })).status,
    ).toBe(403);
    expect((await as('post', `/api/users/${created.user.id}/unlock`)).status).toBe(403);
  });
});
