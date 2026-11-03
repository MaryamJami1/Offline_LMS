import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ClassGroup } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';
import { addStudent, buildClassesWorld, type ClassesWorld } from '../support/classes-world.js';

/**
 * ADM-03 (T-ADM-03): groups of a class, made by the admin or the class's own
 * teacher. Pairs follow the roll numbers, random groups are shuffled to a
 * size, and manual groups hold the students named. Pairing by seat, during a
 * class, comes with LAB-15, when the server knows who sits where.
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

function as(token: string, method: 'get' | 'post', path: string) {
  return http()[method](path).set('Authorization', `Bearer ${token}`);
}

const groupsOf = (classId: string) => `/api/classes/${classId}/groups`;

/** Enrols `count` students in B-12 with roll numbers 1 to count; returns their usernames. */
async function enrol(count: number, classId = world.classes.b12): Promise<string[]> {
  const usernames: string[] = [];
  for (let roll = 1; roll <= count; roll += 1) {
    const username = `S-${1000 + roll}`;
    await addStudent(prisma, {
      username,
      fullName: `Student ${roll}`,
      rollNo: String(roll),
      classId,
    });
    usernames.push(username);
  }
  return usernames;
}

function members(groups: ClassGroup[]): string[][] {
  return groups.map((group) => group.members.map((member) => member.username));
}

describe('T-ADM-03 pairs', () => {
  it('pairs the class in roll-number order', async () => {
    await enrol(4);

    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'pair',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.items.map((group: ClassGroup) => [group.name, group.kind])).toEqual([
      ['Pair 1', 'pair'],
      ['Pair 2', 'pair'],
    ]);
    expect(members(res.body.items)).toEqual([
      ['S-1001', 'S-1002'],
      ['S-1003', 'S-1004'],
    ]);
  });

  it('puts the odd student into the last pair, so nobody is alone', async () => {
    await enrol(5);

    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'pair',
    });

    expect(members(res.body.items)).toEqual([
      ['S-1001', 'S-1002'],
      ['S-1003', 'S-1004', 'S-1005'],
    ]);
  });

  it('pairs only the students still in the class', async () => {
    await enrol(3);
    await prisma.enrollment.updateMany({
      where: { student: { username: 'S-1002' } },
      data: { status: 'left' },
    });

    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'pair',
    });

    expect(members(res.body.items)).toEqual([['S-1001', 'S-1003']]);
  });

  it('replaces the earlier pairs, and keeps the manual groups', async () => {
    await enrol(4);
    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'manual',
      name: 'Debate team',
      studentIds: [(await prisma.user.findUniqueOrThrow({ where: { username: 'S-1001' } })).id],
    });
    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({ kind: 'pair' });

    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({ kind: 'pair' });

    const list = await as(world.sara.token, 'get', groupsOf(world.classes.b12));
    expect(list.body.items.map((group: ClassGroup) => group.name)).toEqual([
      'Debate team',
      'Pair 1',
      'Pair 2',
    ]);
  });

  it('refuses to pair a class of fewer than two students', async () => {
    await enrol(1);

    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'pair',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_ENOUGH_STUDENTS');
  });
});

describe('T-ADM-03 random groups', () => {
  it('puts everyone in exactly one group of at most the size asked, as evenly as it can', async () => {
    const usernames = await enrol(10);

    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'random',
      size: 4,
    });

    expect(res.status).toBe(201);
    const groups = members(res.body.items);
    expect(groups.map((group) => group.length)).toEqual([4, 3, 3]);
    expect(groups.flat().sort()).toEqual(usernames);
    expect(res.body.items.map((group: ClassGroup) => group.name)).toEqual([
      'Group 1',
      'Group 2',
      'Group 3',
    ]);
  });

  it('never leaves a student alone', async () => {
    await enrol(3);

    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'random',
      size: 2,
    });

    expect(members(res.body.items).map((group) => group.length)).toEqual([3]);
  });

  it('shuffles: the groups are not always the roll order', async () => {
    await enrol(12);
    const orders = new Set<string>();

    for (let run = 0; run < 5; run += 1) {
      const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
        kind: 'random',
        size: 4,
      });
      orders.add(JSON.stringify(members(res.body.items)));
    }

    // Five shuffles of twelve students all landing on the same split has a
    // chance far below one in a billion.
    expect(orders.size).toBeGreaterThan(1);
  });

  it('replaces the earlier random groups', async () => {
    await enrol(8);
    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'random',
      size: 2,
    });

    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'random',
      size: 4,
    });

    const list = await as(world.sara.token, 'get', groupsOf(world.classes.b12));
    expect(list.body.items).toHaveLength(2);
    expect(await prisma.groupMember.count()).toBe(8);
  });
});

describe('T-ADM-03 manual groups', () => {
  let ids: Record<string, string>;

  beforeEach(async () => {
    await enrol(4);
    const outsider = await addStudent(prisma, {
      username: 'S-2001',
      fullName: 'Zara Malik',
      rollNo: '1',
      classId: world.classes.b13,
    });
    ids = { outsider };
    for (const user of await prisma.user.findMany({ where: { role: 'student' } })) {
      ids[user.username] = user.id;
    }
  });

  it('makes a group of the students named', async () => {
    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'manual',
      name: 'Debate team',
      studentIds: [ids['S-1003'], ids['S-1001']],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.items).toEqual([
      {
        id: expect.any(String),
        name: 'Debate team',
        kind: 'manual',
        members: [
          { id: ids['S-1001'], username: 'S-1001', fullName: 'Student 1' },
          { id: ids['S-1003'], username: 'S-1003', fullName: 'Student 3' },
        ],
      },
    ]);
  });

  it('keeps several manual groups side by side', async () => {
    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'manual',
      name: 'Team A',
      studentIds: [ids['S-1001']],
    });
    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'manual',
      name: 'Team B',
      studentIds: [ids['S-1002']],
    });

    const list = await as(world.sara.token, 'get', groupsOf(world.classes.b12));
    expect(list.body.items.map((group: ClassGroup) => group.name)).toEqual(['Team A', 'Team B']);
  });

  it('refuses a student who is not in the class', async () => {
    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'manual',
      name: 'Debate team',
      studentIds: [ids['S-1001'], ids.outsider],
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_IN_CLASS');
    expect(await prisma.group.count()).toBe(0);
  });

  it('refuses a student already in another manual group of the class', async () => {
    await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'manual',
      name: 'Team A',
      studentIds: [ids['S-1001'], ids['S-1002']],
    });

    const res = await as(world.sara.token, 'post', groupsOf(world.classes.b12)).send({
      kind: 'manual',
      name: 'Team B',
      studentIds: [ids['S-1002'], ids['S-1003']],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_GROUP');
    expect(await prisma.group.count()).toBe(1);
  });
});

describe('T-ADM-03 who makes groups', () => {
  it('lets the admin make groups in any class', async () => {
    await enrol(2, world.classes.b13);

    const res = await as(world.adminToken, 'post', groupsOf(world.classes.b13)).send({
      kind: 'pair',
    });

    expect(res.status).toBe(201);
  });

  it('refuses a teacher another class’s groups, to make or to see', async () => {
    await enrol(2, world.classes.b13);

    const made = await as(world.sara.token, 'post', groupsOf(world.classes.b13)).send({
      kind: 'pair',
    });
    const seen = await as(world.sara.token, 'get', groupsOf(world.classes.b13));

    expect(made.status).toBe(403);
    expect(seen.status).toBe(403);
    expect(await prisma.group.count()).toBe(0);
  });

  it('lists only the groups that outlast a class session', async () => {
    await enrol(2);
    const session = await prisma.classSession.create({
      data: {
        classId: world.classes.b12,
        labRoomId: world.labRoomId,
        teacherId: world.sara.id,
      },
    });
    await prisma.group.create({
      data: { classId: world.classes.b12, sessionId: session.id, name: 'Today', kind: 'pair' },
    });

    const res = await as(world.sara.token, 'get', groupsOf(world.classes.b12));

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});
