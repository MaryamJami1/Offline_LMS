import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { FOREIGN_KEY_VIOLATION, createTestPrisma, errorCode, resetDatabase } from './database.js';

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

function expiresIn(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function createStudent(username: string) {
  return prisma.user.create({
    data: { role: 'student', username, passwordHash: 'argon2id-hash', fullName: 'Ayesha Khan' },
  });
}

describe('NFR-13 refresh tokens', () => {
  it('keeps only the hash of a token, with its expiry', async () => {
    const user = await createStudent('S-1001');

    const token = await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: 'sha256-hash', expiresAt: expiresIn(7) },
    });

    expect(token.tokenHash).toBe('sha256-hash');
    expect(token.revokedAt).toBeNull();
    expect(token.deviceId).toBeNull();
  });

  it('records the lab PC a student token was issued to', async () => {
    const user = await createStudent('S-1002');
    const device = await prisma.device.create({
      data: { hostname: 'LAB1-A1', mac: '00:1B:44:11:3A:B7', approved: true },
    });

    const token = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        tokenHash: 'sha256-hash',
        expiresAt: expiresIn(1),
      },
    });

    expect(token.deviceId).toBe(device.id);
  });

  it('refuses a token for an account that does not exist', async () => {
    expect(
      await errorCode(
        prisma.refreshToken.create({
          data: {
            userId: '01999999-9999-7999-8999-999999999999',
            tokenHash: 'sha256-hash',
            expiresAt: expiresIn(7),
          },
        }),
      ),
    ).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('revokes a token without deleting the record', async () => {
    const user = await createStudent('S-1003');
    const token = await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: 'sha256-hash', expiresAt: expiresIn(7) },
    });

    const revoked = await prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });

    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(await prisma.refreshToken.count()).toBe(1);
  });
});
