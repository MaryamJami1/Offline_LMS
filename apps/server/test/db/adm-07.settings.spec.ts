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

async function createAdmin() {
  return prisma.user.create({
    data: {
      role: 'admin',
      username: 'admin',
      passwordHash: 'argon2id-hash',
      fullName: 'Institute Admin',
    },
  });
}

describe('ADM-07 settings', () => {
  it('stores a setting by key, with who last changed it', async () => {
    const admin = await createAdmin();

    const setting = await prisma.setting.create({
      data: { key: 'branding.software_name', value: 'Lab', updatedBy: admin.id },
    });

    expect(setting.key).toBe('branding.software_name');
    expect(setting.value).toBe('Lab');
    expect(setting.updatedBy).toBe(admin.id);
  });

  it('holds structured values, not only text', async () => {
    const admin = await createAdmin();

    const setting = await prisma.setting.create({
      data: {
        key: 'grading.scale',
        value: [
          { grade: 'A', from: 80 },
          { grade: 'B', from: 65 },
        ],
        updatedBy: admin.id,
      },
    });

    expect(setting.value).toEqual([
      { grade: 'A', from: 80 },
      { grade: 'B', from: 65 },
    ]);
  });

  it('keeps one row per key', async () => {
    const admin = await createAdmin();
    await prisma.setting.create({
      data: { key: 'branding.software_name', value: 'Lab', updatedBy: admin.id },
    });

    expect(
      await errorCode(
        prisma.setting.create({
          data: { key: 'branding.software_name', value: 'LinguaLab', updatedBy: admin.id },
        }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('rebrands by replacing the value of the same key', async () => {
    const admin = await createAdmin();
    await prisma.setting.create({
      data: { key: 'branding.software_name', value: 'Lab', updatedBy: admin.id },
    });

    const renamed = await prisma.setting.update({
      where: { key: 'branding.software_name' },
      data: { value: 'Speak Up', updatedBy: admin.id },
    });

    expect(renamed.value).toBe('Speak Up');
    expect(await prisma.setting.count()).toBe(1);
  });
});
