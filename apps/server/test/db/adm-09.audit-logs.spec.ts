import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { createTestPrisma, errorCode, resetDatabase } from './database.js';

/**
 * The audit_logs table (docs/docs/03-database.md, System). It carries ADM-09,
 * the audit log itself, and is what ADM-01 and ADM-11 write to: every account
 * created, deactivated or unlocked and every password reset.
 */

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

async function createAdmin(username = 'admin') {
  return prisma.user.create({
    data: {
      role: 'admin',
      username,
      passwordHash: 'argon2id-hash',
      fullName: 'Institute Admin',
    },
  });
}

describe('ADM-09 audit log', () => {
  it('stores who did what to which record, and from where', async () => {
    const admin = await createAdmin();
    const target = await prisma.user.create({
      data: { role: 'student', username: 'S-1001', passwordHash: 'x', fullName: 'Ayesha Khan' },
    });

    const entry = await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'user.password_reset',
        entity: 'user',
        entityId: target.id,
        details: { targetUsername: 'S-1001' },
        ip: '192.168.1.20',
      },
    });

    expect(entry.actorId).toBe(admin.id);
    expect(entry.action).toBe('user.password_reset');
    expect(entry.entity).toBe('user');
    expect(entry.entityId).toBe(target.id);
    expect(entry.details).toEqual({ targetUsername: 'S-1001' });
    expect(entry.ip).toBe('192.168.1.20');
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('defaults the details to an empty object', async () => {
    const entry = await prisma.auditLog.create({
      data: { action: 'auth.login_failed', entity: 'user', ip: '192.168.1.20' },
    });

    expect(entry.details).toEqual({});
  });

  it('allows an entry with no actor and no record, such as a failed login', async () => {
    const entry = await prisma.auditLog.create({
      data: { action: 'auth.login_failed', entity: 'user', ip: '192.168.1.20' },
    });

    expect(entry.actorId).toBeNull();
    expect(entry.entityId).toBeNull();
  });

  it('keeps an IPv6 address as it was given', async () => {
    const entry = await prisma.auditLog.create({
      data: { action: 'user.created', entity: 'user', ip: '::ffff:192.168.1.20' },
    });

    expect(entry.ip).toBe('::ffff:192.168.1.20');
  });

  it('refuses text that is not an IP address', async () => {
    expect(
      await errorCode(
        prisma.auditLog.create({
          data: { action: 'user.created', entity: 'user', ip: 'not-an-address' },
        }),
      ),
    ).toBeDefined();
  });

  it('keeps the history when the account that did it is deleted', async () => {
    const admin = await createAdmin('former.admin');
    const entry = await prisma.auditLog.create({
      data: { actorId: admin.id, action: 'user.created', entity: 'user', ip: '192.168.1.20' },
    });

    await prisma.user.delete({ where: { id: admin.id } });

    const kept = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(kept.actorId).toBeNull();
    expect(kept.action).toBe('user.created');
  });

  it('is indexed by time, because the log is read newest first', async () => {
    const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'audit_logs'
    `;

    expect(indexes.some((index) => /\(created_at\)/.test(index.indexdef))).toBe(true);
  });
});
