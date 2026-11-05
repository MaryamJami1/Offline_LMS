import type {
  AdminUser,
  AuthUser,
  Batch,
  Branding,
  ClassView,
  DeviceView,
  ImportResponse,
  LabSeatsResponse,
  LabView,
  LoginResponse,
} from '@lingualab/shared';
import { DEFAULT_BRANDING } from '@lingualab/shared';
import type { AdminApi } from '../api/admin-api.js';
import { ApiError } from '../api/client.js';

/**
 * A small institute in memory, behaving the way 04 says the server does, so
 * each screen can be tested without a server. Tests change `world` directly
 * to set a scene, and spy on the methods to see what a screen asked for.
 */

let counter = 0;
/** A fresh UUID-shaped id, so the shared schemas accept it. */
export function fakeId(): string {
  counter += 1;
  return `0195f3a0-0000-7000-8000-${String(counter).padStart(12, '0')}`;
}

export const NOW = new Date('2026-11-05T09:00:00.000Z');
const STAMP = NOW.toISOString();

interface Account extends AdminUser {
  password: string;
}

interface FakeSeat {
  id: string;
  labId: string;
  code: string;
  row: string;
  position: number;
  studentId: string | null;
}

export interface FakeWorld {
  branding: Branding;
  accounts: Account[];
  batches: Batch[];
  classes: ClassView[];
  labs: LabView[];
  seats: FakeSeat[];
  devices: DeviceView[];
  /** What the next import answers; the created rows also become accounts. */
  nextImport: ImportResponse | ApiError | null;
  /** Who is logged in now, if anyone. */
  session: AuthUser | null;
}

function account(
  fields: Partial<Account> & Pick<Account, 'username' | 'fullName' | 'role'>,
): Account {
  return {
    id: fakeId(),
    phone: null,
    status: 'active',
    mustChangePassword: false,
    lastLoginAt: null,
    lockedUntil: null,
    classes: [],
    rollNo: null,
    subjects: [],
    seatToday: null,
    createdAt: STAMP,
    password: 'Lab-pass-2026',
    ...fields,
  };
}

function authUserOf(user: Account): AuthUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Lab 1: rows A and B of four seats, in pairs with a walkway after seat 2. */
export function buildWorld(): FakeWorld {
  const admin = account({
    username: 'admin',
    fullName: 'Lab Admin',
    role: 'admin',
    password: 'Admin-pass-2026',
  });
  const sara = account({
    username: 'sara.iqbal',
    fullName: 'Sara Iqbal',
    role: 'teacher',
    password: 'Teacher-pass-2026',
    subjects: ['Speaking', 'Listening'],
    classes: [{ code: 'B-12', name: 'Spoken English' }],
  });
  const kamran = account({
    username: 'kamran.ali',
    fullName: 'Kamran Ali',
    role: 'teacher',
    subjects: ['Writing'],
    classes: [{ code: 'B-14', name: 'Evening Grammar' }],
  });
  const b12 = [{ code: 'B-12', name: 'Spoken English' }];
  const ayesha = account({
    username: 'S-1001',
    fullName: 'Ayesha Khan',
    role: 'student',
    classes: b12,
    rollNo: '1',
    seatToday: { seatCode: 'A1', labName: 'Lab 1', loggedIn: true },
  });
  const bilal = account({
    username: 'S-1002',
    fullName: 'Bilal Ahmed',
    role: 'student',
    classes: b12,
    rollNo: '2',
    seatToday: { seatCode: 'B2', labName: 'Lab 1', loggedIn: false },
  });
  const hira = account({
    username: 'S-1003',
    fullName: 'Hira Malik',
    role: 'student',
    classes: b12,
    rollNo: '3',
    lockedUntil: '2026-11-05T09:15:00.000Z',
  });
  const omar = account({
    username: 'S-1004',
    fullName: 'Omar Farooq',
    role: 'student',
    classes: [{ code: 'B-14', name: 'Evening Grammar' }],
    status: 'inactive',
  });
  const zainab = account({
    username: 'S-1005',
    fullName: 'Zainab Ali',
    role: 'student',
    classes: [{ code: 'B-14', name: 'Evening Grammar' }],
    mustChangePassword: true,
  });

  const lab1: LabView = {
    id: fakeId(),
    name: 'Lab 1',
    rows: 2,
    seatsPerRow: 4,
    layout: { pairs: true, aisles: [2] },
    seatCount: 8,
    pcCount: 3,
  };
  const lab2: LabView = {
    id: fakeId(),
    name: 'Lab 2',
    rows: 1,
    seatsPerRow: 2,
    layout: { pairs: false, aisles: [] },
    seatCount: 2,
    pcCount: 0,
  };
  const seats: FakeSeat[] = [];
  for (const [lab, rows] of [
    [lab1, ['A', 'B']],
    [lab2, ['A']],
  ] as const) {
    for (const row of rows) {
      for (let position = 1; position <= lab.seatsPerRow; position += 1) {
        seats.push({
          id: fakeId(),
          labId: lab.id,
          code: `${row}${position}`,
          row,
          position,
          studentId: null,
        });
      }
    }
  }
  const seatOf = (lab: LabView, code: string) => {
    const found = seats.find((seat) => seat.labId === lab.id && seat.code === code);
    if (found === undefined) {
      throw new Error(`no seat ${code}`);
    }
    return found;
  };
  seatOf(lab1, 'A1').studentId = ayesha.id;

  const device = (fields: Partial<DeviceView> & Pick<DeviceView, 'hostname'>): DeviceView => ({
    id: fakeId(),
    mac: `02:00:00:00:00:${String(counter).padStart(2, '0')}`,
    ip: '192.168.10.121',
    osVersion: 'Windows 11',
    appVersion: '1.0.0',
    status: 'online',
    lastSeenAt: '2026-11-05T08:59:30.000Z',
    seat: null,
    createdAt: STAMP,
    ...fields,
  });
  const onSeat = (lab: LabView, code: string) => {
    const seat = seatOf(lab, code);
    return { id: seat.id, code, labId: lab.id, labName: lab.name };
  };

  const batch: Batch = {
    id: fakeId(),
    courseId: fakeId(),
    courseName: 'Spoken English',
    name: 'Fall 2026',
    startsOn: '2026-09-01',
    endsOn: null,
  };

  return {
    branding: {
      ...DEFAULT_BRANDING,
      softwareName: 'LinguaLab',
      instituteName: 'City English Institute',
    },
    accounts: [admin, sara, kamran, ayesha, bilal, hira, omar, zainab],
    batches: [batch],
    classes: [
      {
        id: fakeId(),
        code: 'B-12',
        name: 'Spoken English',
        course: { id: batch.courseId, name: 'Spoken English' },
        batch: { id: batch.id, name: 'Fall 2026' },
        lab: { id: lab1.id, name: 'Lab 1' },
        schedule: { days: ['mon', 'tue', 'wed', 'thu'], start: '10:00', minutes: 90 },
        teachers: [{ id: sara.id, fullName: 'Sara Iqbal' }],
        studentCount: 3,
        groupCount: 1,
      },
      {
        id: fakeId(),
        code: 'B-14',
        name: 'Evening Grammar',
        course: { id: batch.courseId, name: 'Spoken English' },
        batch: { id: batch.id, name: 'Fall 2026' },
        lab: { id: lab1.id, name: 'Lab 1' },
        schedule: null,
        teachers: [],
        studentCount: 2,
        groupCount: 0,
      },
    ],
    labs: [lab1, lab2],
    seats,
    devices: [
      device({ hostname: 'LAB1-A1', seat: onSeat(lab1, 'A1') }),
      device({ hostname: 'LAB1-A2', seat: onSeat(lab1, 'A2'), ip: '192.168.10.122' }),
      device({
        hostname: 'LAB1-B1',
        seat: onSeat(lab1, 'B1'),
        status: 'offline',
        lastSeenAt: '2026-11-04T11:42:00.000Z',
      }),
      device({ hostname: 'SPARE-PC', status: 'offline', lastSeenAt: '2026-11-03T10:00:00.000Z' }),
      device({
        hostname: 'NEW-PC-07',
        status: 'waiting',
        ip: '192.168.10.150',
        appVersion: '1.0.0',
        lastSeenAt: '2026-11-05T08:58:00.000Z',
      }),
    ],
    nextImport: null,
    session: null,
  };
}

function refuse(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): never {
  throw new ApiError(status, code, message, fields);
}

export interface FakeAdminApi extends AdminApi {
  world: FakeWorld;
}

export function createFakeAdminApi(world: FakeWorld = buildWorld()): FakeAdminApi {
  const tokens = (user: Account): LoginResponse => ({
    accessToken: 'fake-access',
    refreshToken: 'fake-refresh',
    user: authUserOf(user),
    seat: null,
  });

  const nextStudentId = (): string => {
    const numbers = world.accounts
      .map((user) => /^S-(\d+)$/.exec(user.username)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number);
    return `S-${Math.max(1000, ...numbers) + 1}`;
  };

  const labSeats = (labId: string): LabSeatsResponse => {
    const lab =
      world.labs.find((candidate) => candidate.id === labId) ??
      refuse(404, 'NOT_FOUND', 'There is no such lab');
    return {
      lab: { ...lab, pcCount: world.devices.filter((pc) => pc.seat?.labId === labId).length },
      seats: world.seats
        .filter((seat) => seat.labId === labId)
        .map((seat) => {
          const pc = world.devices.find((candidate) => candidate.seat?.id === seat.id);
          const student = world.accounts.find((user) => user.id === seat.studentId);
          return {
            id: seat.id,
            code: seat.code,
            row: seat.row,
            position: seat.position,
            device:
              pc === undefined
                ? null
                : {
                    id: pc.id,
                    hostname: pc.hostname,
                    ip: pc.ip,
                    appVersion: pc.appVersion,
                    status: pc.status,
                    lastSeenAt: pc.lastSeenAt,
                  },
            occupied: student !== undefined,
            student:
              student === undefined
                ? null
                : { id: student.id, username: student.username, fullName: student.fullName },
          };
        }),
    };
  };

  const api: FakeAdminApi = {
    world,
    branding: async () => world.branding,
    login: async (username, password) => {
      const user = world.accounts.find(
        (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
      );
      if (user === undefined || user.password !== password) {
        refuse(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
      }
      if (user.status === 'inactive') {
        refuse(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated');
      }
      if (user.lockedUntil !== null) {
        throw new ApiError(
          403,
          'ACCOUNT_LOCKED',
          'Too many wrong passwords',
          {},
          { unlocksAt: user.lockedUntil },
        );
      }
      world.session = authUserOf(user);
      return tokens(user);
    },
    changePassword: async (currentPassword, newPassword) => {
      const user =
        world.accounts.find((candidate) => candidate.id === world.session?.id) ??
        refuse(401, 'UNAUTHENTICATED', 'Please log in');
      if (user.password !== currentPassword) {
        refuse(401, 'INVALID_CREDENTIALS', 'Wrong password');
      }
      if (newPassword.length < 8) {
        refuse(400, 'VALIDATION_FAILED', 'Check the form', {
          newPassword: 'Use at least 8 characters',
        });
      }
      user.password = newPassword;
      user.mustChangePassword = false;
      world.session = authUserOf(user);
      return tokens(user);
    },
    hasSession: () => world.session !== null,
    resumeSession: async () => {
      if (world.session === null) {
        refuse(401, 'INVALID_TOKEN', 'Please log in');
      }
      return { user: world.session, seat: null };
    },
    me: async () => {
      if (world.session === null) {
        refuse(401, 'UNAUTHENTICATED', 'Please log in');
      }
      return { user: world.session, seat: null };
    },
    logout: async () => {
      world.session = null;
    },

    listUsers: async (query) => {
      const q = query.q?.toLowerCase();
      const items = world.accounts
        .filter((user) => user.role !== 'admin' || query.role === 'admin')
        .filter((user) => query.role === undefined || user.role === query.role)
        .filter((user) => query.status === undefined || user.status === query.status)
        .filter(
          (user) =>
            query.classCode === undefined ||
            user.classes.some(
              (taken) => taken.code.toLowerCase() === query.classCode?.toLowerCase(),
            ),
        )
        .filter(
          (user) =>
            q === undefined ||
            [user.fullName, user.username, user.phone ?? ''].some((field) =>
              field.toLowerCase().includes(q),
            ),
        )
        .sort((left, right) => left.fullName.localeCompare(right.fullName));
      const pageSize = query.pageSize ?? 50;
      return {
        items: items.slice(0, pageSize).map(withoutPassword),
        total: items.length,
        page: 1,
        pageSize,
      };
    },
    createUser: async (request) => {
      const username = request.username ?? nextStudentId();
      if (world.accounts.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
        refuse(409, 'USERNAME_TAKEN', 'That username is already in use', {
          username: 'That username is already in use',
        });
      }
      const codes =
        request.role === 'student'
          ? request.classCode === undefined
            ? []
            : [request.classCode]
          : (request.classCodes ?? []);
      const classes = codes.map(
        (code) =>
          world.classes.find((taught) => taught.code === code) ??
          refuse(422, 'CLASS_NOT_FOUND', `There is no class ${code}`),
      );
      const created = account({
        username,
        fullName: request.fullName,
        role: request.role,
        phone: request.phone ?? null,
        mustChangePassword: true,
        classes: classes.map((taught) => ({ code: taught.code, name: taught.name })),
        subjects: request.role === 'teacher' ? (request.subjects ?? []) : [],
        password: request.password ?? 'Kite-4821-lamp',
      });
      world.accounts.push(created);
      const user = withoutPassword(created);
      return { user, generatedPassword: request.password === undefined ? 'Kite-4821-lamp' : null };
    },
    importStudents: async () => {
      const answer = world.nextImport ?? refuse(400, 'IMPORT_FILE_INVALID', 'No file was sent');
      if (answer instanceof ApiError) {
        throw answer;
      }
      for (const row of answer.created) {
        world.accounts.push(
          account({
            id: row.id,
            username: row.username,
            fullName: row.fullName,
            role: 'student',
            mustChangePassword: true,
            classes: [{ code: row.classCode, name: row.classCode }],
          }),
        );
      }
      return answer;
    },
    resetPassword: async (userId) => {
      const user =
        world.accounts.find((candidate) => candidate.id === userId) ??
        refuse(403, 'FORBIDDEN', 'Not allowed');
      user.mustChangePassword = true;
      user.lockedUntil = null;
      return {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        generatedPassword: 'Moon-7314-desk',
      };
    },

    listClasses: async () => ({
      items: [...world.classes].sort((a, b) => a.code.localeCompare(b.code)),
    }),
    listBatches: async () => ({ items: world.batches }),
    createClass: async (request) => {
      const code = request.code.trim().toUpperCase();
      if (world.classes.some((taught) => taught.code === code)) {
        refuse(409, 'CLASS_CODE_TAKEN', `There is already a class ${code}`, {
          code: 'That code is taken',
        });
      }
      const batch =
        world.batches.find((candidate) => candidate.id === request.batchId) ??
        refuse(422, 'BATCH_NOT_FOUND', 'No such batch');
      const lab =
        world.labs.find((candidate) => candidate.id === request.labRoomId) ??
        refuse(422, 'LAB_NOT_FOUND', 'No such lab');
      const created: ClassView = {
        id: fakeId(),
        code,
        name: request.name,
        course: { id: batch.courseId, name: batch.courseName },
        batch: { id: batch.id, name: batch.name },
        lab: { id: lab.id, name: lab.name },
        schedule: request.schedule ?? null,
        teachers: (request.teacherIds ?? []).map((id) => ({
          id,
          fullName: world.accounts.find((user) => user.id === id)?.fullName ?? '',
        })),
        studentCount: 0,
        groupCount: 0,
      };
      world.classes.push(created);
      return created;
    },

    listLabs: async () => ({
      items: [...world.labs]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((lab) => labSeats(lab.id).lab),
    }),
    labSeats: async (labId) => labSeats(labId),
    listDevices: async (status) => ({
      items: world.devices
        .filter((pc) => status === undefined || pc.status === status)
        .sort((a, b) => a.hostname.localeCompare(b.hostname)),
    }),
    updateDevice: async (deviceId, request) => {
      const pc =
        world.devices.find((candidate) => candidate.id === deviceId) ??
        refuse(404, 'NOT_FOUND', 'There is no such PC');
      const seatFor = (seatId: string) => {
        const seat =
          world.seats.find((candidate) => candidate.id === seatId) ??
          refuse(422, 'SEAT_NOT_FOUND', 'There is no such seat');
        const holder = world.devices.find(
          (candidate) => candidate.seat?.id === seatId && candidate.id !== pc.id,
        );
        if (holder !== undefined) {
          refuse(409, 'SEAT_TAKEN', `${holder.hostname} is already on ${seat.code}`);
        }
        const lab = world.labs.find((candidate) => candidate.id === seat.labId);
        return { id: seat.id, code: seat.code, labId: seat.labId, labName: lab?.name ?? '' };
      };
      if (request.action === 'approve') {
        if (request.seatId !== undefined) {
          pc.seat = seatFor(request.seatId);
        }
        pc.status = 'online';
      } else if (request.action === 'bind') {
        pc.seat = request.seatId === null ? null : seatFor(request.seatId);
      }
      return { ...pc };
    },
  };
  return api;
}

/** The fake with the admin already logged in, as after a reload. */
export function loggedInAsAdmin(world: FakeWorld = buildWorld()): FakeAdminApi {
  const api = createFakeAdminApi(world);
  const admin = world.accounts.find((user) => user.role === 'admin');
  if (admin !== undefined) {
    world.session = authUserOf(admin);
  }
  return api;
}

/** An account as the server shows it: never with its password. */
function withoutPassword(account: Account): AdminUser {
  const user: Partial<Account> = { ...account };
  delete user.password;
  return user as AdminUser;
}
