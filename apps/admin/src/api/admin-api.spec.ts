import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttpAdminApi } from './admin-api.js';
import { REFRESH_TOKEN_KEY, createApiClient } from './client.js';

/**
 * ADM-01, ADM-02, ADM-03, ADM-04, ADM-11 and ADM-07 (branding): every call the
 * panel makes goes to the endpoint and in the shape that
 * docs/docs/04-api-and-events.md gives it. The screens are tested against a
 * fake of this interface, so this is where the real paths are pinned down.
 */

const ID = '0195f3a0-0000-7000-8000-000000000001';
const STAMP = '2026-11-05T09:00:00.000Z';

const user = {
  id: ID,
  username: 'S-1001',
  fullName: 'Ayesha Khan',
  role: 'student',
  phone: null,
  status: 'active',
  mustChangePassword: true,
  lastLoginAt: null,
  lockedUntil: null,
  classes: [],
  rollNo: null,
  subjects: [],
  seatToday: null,
  createdAt: STAMP,
};
const lab = {
  id: ID,
  name: 'Lab 1',
  rows: 5,
  seatsPerRow: 6,
  layout: { pairs: true, aisles: [2, 4] },
  seatCount: 30,
  pcCount: 0,
};
const device = {
  id: ID,
  hostname: 'LAB1-A1',
  mac: '02:00:00:00:00:01',
  ip: null,
  osVersion: null,
  appVersion: null,
  status: 'online',
  lastSeenAt: null,
  seat: null,
  createdAt: STAMP,
};
const classView = {
  id: ID,
  code: 'B-12',
  name: 'Spoken English',
  course: { id: ID, name: 'Spoken English' },
  batch: { id: ID, name: 'Fall 2026' },
  lab: { id: ID, name: 'Lab 1' },
  schedule: null,
  teachers: [],
  studentCount: 0,
  groupCount: 0,
};
const authUser = {
  id: ID,
  username: 'admin',
  fullName: 'Admin',
  role: 'admin',
  mustChangePassword: false,
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function setUp(answer: unknown) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? 'GET',
      path: String(input),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    });
    return new Response(answer === undefined ? null : JSON.stringify(answer), {
      status: answer === undefined ? 204 : 200,
    });
  });
  const client = createApiClient({ fetch });
  client.startSession({ accessToken: 'a', refreshToken: 'r' });
  return { api: createHttpAdminApi(client), calls, client };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('The admin API calls the documented endpoints', () => {
  it('reads the branding without a login', async () => {
    const { api, calls } = setUp({
      softwareName: 'Lab',
      instituteName: '',
      logoUrl: null,
      primaryColour: '#1D4ED8',
    });

    await api.branding();

    expect(calls).toEqual([{ method: 'GET', path: '/api/settings/branding', body: undefined }]);
  });

  it('asks the public health endpoint whether the server answers, for the side menu', async () => {
    const { api, calls } = setUp({ server: 'ok', database: 'ok', livekit: 'ok' });

    await api.serverAnswers();

    expect(calls).toEqual([{ method: 'GET', path: '/api/health', body: undefined }]);
  });

  it('logs in and keeps the session, and logs out with the refresh token', async () => {
    const { api, calls, client } = setUp({
      accessToken: 'access-9',
      refreshToken: 'refresh-9',
      user: authUser,
      seat: null,
    });

    const login = await api.login('admin', 'Karachi-2026');

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'admin', password: 'Karachi-2026' },
    });
    expect(login.user.username).toBe('admin');
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-9');

    await api.logout().catch(() => undefined);
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: '/api/auth/logout',
      body: { refreshToken: 'refresh-9' },
    });
    expect(client.hasSession()).toBe(false);
  });

  it('changes the password and keeps the new session', async () => {
    const { api, calls } = setUp({
      accessToken: 'access-9',
      refreshToken: 'refresh-9',
      user: authUser,
      seat: null,
    });

    await api.changePassword('Old-pass-2026', 'New-pass-2026');

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/auth/change-password',
      body: { currentPassword: 'Old-pass-2026', newPassword: 'New-pass-2026' },
    });
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-9');
  });

  it('asks who is logged in', async () => {
    const { api, calls } = setUp({ user: authUser, seat: null });

    await api.me();

    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/me' });
  });

  it('lists users with only the filters given', async () => {
    const { api, calls } = setUp({ items: [user], total: 1, page: 1, pageSize: 200 });

    await api.listUsers({ role: 'student', classCode: 'B-12', q: 'ayesha', pageSize: 200 });
    await api.listUsers({ role: 'teacher' });

    expect(calls[0]?.path).toBe('/api/users?role=student&classCode=B-12&q=ayesha&pageSize=200');
    expect(calls[1]?.path).toBe('/api/users?role=teacher');
  });

  it('creates a user', async () => {
    const { api, calls } = setUp({ user, generatedPassword: 'Lab-4821-kite' });

    const created = await api.createUser({
      role: 'student',
      fullName: 'Ayesha Khan',
      classCode: 'B-12',
    });

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/users',
      body: { role: 'student', fullName: 'Ayesha Khan', classCode: 'B-12' },
    });
    expect(created.generatedPassword).toBe('Lab-4821-kite');
  });

  it('uploads the import file in the field "file"', async () => {
    const { api, calls } = setUp({
      created: [],
      errors: [],
      counts: { rows: 0, created: 0, rejected: 0 },
    });
    const file = new File(['name,class,phone\n'], 'students.csv', { type: 'text/csv' });

    await api.importStudents(file);

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe('/api/users/import');
    expect((calls[0]?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it("resets a user's password", async () => {
    const { api, calls } = setUp({
      id: ID,
      username: 'S-1001',
      fullName: 'Ayesha Khan',
      generatedPassword: 'Lab-1234-moon',
    });

    await api.resetPassword(ID);

    expect(calls[0]).toMatchObject({ method: 'POST', path: `/api/users/${ID}/reset-password` });
  });

  it('lists classes and batches, and creates a class', async () => {
    const { api, calls } = setUp({ items: [] });
    await api.listClasses();
    await api.listBatches();

    expect(calls.map((call) => call.path)).toEqual(['/api/classes', '/api/batches']);

    const created = setUp(classView);
    await created.api.createClass({
      code: 'B-14',
      name: 'Evening Grammar',
      batchId: ID,
      labRoomId: ID,
      schedule: { days: ['mon', 'wed'], start: '17:00', minutes: 60 },
      teacherIds: [ID],
    });
    expect(created.calls[0]).toMatchObject({ method: 'POST', path: '/api/classes' });
  });

  it('lists labs, reads a seat map, lists PCs and changes one', async () => {
    const labs = setUp({ items: [lab] });
    await labs.api.listLabs();
    expect(labs.calls[0]?.path).toBe('/api/labs');

    const seats = setUp({ lab, seats: [] });
    await seats.api.labSeats(ID);
    expect(seats.calls[0]?.path).toBe(`/api/labs/${ID}/seats`);

    const devices = setUp({ items: [device] });
    await devices.api.listDevices('waiting');
    await devices.api.listDevices();
    expect(devices.calls.map((call) => call.path)).toEqual([
      '/api/devices?status=waiting',
      '/api/devices',
    ]);

    const changed = setUp(device);
    await changed.api.updateDevice(ID, { action: 'approve', seatId: ID });
    expect(changed.calls[0]).toEqual({
      method: 'PATCH',
      path: `/api/devices/${ID}`,
      body: { action: 'approve', seatId: ID },
    });
  });
});
