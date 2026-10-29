import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { UNIQUE_VIOLATION, createTestPrisma, errorCode, resetDatabase } from './database.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function student(username: string, fullName = 'Ayesha Khan') {
  return {
    role: 'student',
    username,
    passwordHash: 'argon2id-hash',
    fullName,
  } as const;
}

describe('ADM-01 user accounts', () => {
  it('stores a student with their student ID as the username', async () => {
    const created = await prisma.user.create({ data: student('S-1001') });

    expect(created.username).toBe('S-1001');
    expect(created.role).toBe('student');
    expect(created.status).toBe('active');
    expect(created.lastLoginAt).toBeNull();
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it('makes every new account change its password at first login', async () => {
    const created = await prisma.user.create({ data: student('S-1002') });

    expect(created.mustChangePassword).toBe(true);
  });

  it('refuses a second account with the same student ID', async () => {
    await prisma.user.create({ data: student('S-1003') });

    expect(await errorCode(prisma.user.create({ data: student('S-1003', 'Bilal Ahmed') }))).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it('refuses a student ID that differs only in case', async () => {
    await prisma.user.create({ data: student('S-1004') });

    expect(await errorCode(prisma.user.create({ data: student('s-1004', 'Bilal Ahmed') }))).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it('keeps one profile per student', async () => {
    const user = await prisma.user.create({ data: student('S-1005') });
    await prisma.studentProfile.create({
      data: { userId: user.id, rollNo: '5', joinedOn: new Date('2026-10-01') },
    });

    expect(
      await errorCode(
        prisma.studentProfile.create({
          data: { userId: user.id, rollNo: '6', joinedOn: new Date('2026-10-02') },
        }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('stores a student profile with guardian details', async () => {
    const user = await prisma.user.create({ data: student('S-1006') });
    const profile = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        rollNo: '6',
        guardianName: 'Nadia Khan',
        guardianPhone: '0300-1234567',
        joinedOn: new Date('2026-10-01'),
      },
    });

    expect(profile.guardianName).toBe('Nadia Khan');
    expect(profile.guardianPhone).toBe('0300-1234567');
  });

  it('stores a teacher profile with their subjects', async () => {
    const user = await prisma.user.create({
      data: {
        role: 'teacher',
        username: 'sara.iqbal',
        passwordHash: 'argon2id-hash',
        fullName: 'Sara Iqbal',
      },
    });
    const profile = await prisma.teacherProfile.create({
      data: { userId: user.id, subjects: ['Speaking', 'Listening'] },
    });

    expect(profile.subjects).toEqual(['Speaking', 'Listening']);
  });

  it('deactivates a student instead of deleting them', async () => {
    const user = await prisma.user.create({ data: student('S-1007') });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { status: 'inactive' },
    });

    expect(updated.status).toBe('inactive');
    expect(await prisma.user.count()).toBe(1);
  });
});
