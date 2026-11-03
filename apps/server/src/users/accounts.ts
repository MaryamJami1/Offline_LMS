import type { AdminUser } from '@lingualab/shared';
import type { Prisma } from '../generated/prisma/index.js';

/**
 * Held for the length of a transaction that creates accounts, so two requests
 * cannot both take the next student ID or both pass a duplicate check. Any
 * fixed number works as long as nothing else locks it.
 */
const ACCOUNTS_LOCK = 4_100_101;

export async function lockAccounts(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ACCOUNTS_LOCK})`;
}

/** Long enough for a few hundred rows of an import, which runs in one transaction. */
export const ACCOUNT_TRANSACTION = { timeout: 30_000, maxWait: 30_000 } as const;

/** Student IDs are S- and a number; the first one is S-1001. */
const FIRST_STUDENT_NUMBER = 1001;

/** The next free student number. Call it with the accounts lock held. */
export async function nextStudentNumber(tx: Prisma.TransactionClient): Promise<number> {
  const [found] = await tx.$queryRaw<{ highest: number | null }[]>`
    SELECT MAX(CAST(substring(username from 3) AS integer)) AS highest
    FROM users WHERE username ~* '^S-[0-9]{1,9}$'
  `;
  const highest = found?.highest ?? null;
  return highest === null ? FIRST_STUDENT_NUMBER : Math.max(FIRST_STUDENT_NUMBER, highest + 1);
}

export function studentIdFor(number: number): string {
  return `S-${number}`;
}

/** Everything an account is shown with. */
export const ACCOUNT_VIEW = {
  studentProfile: true,
  teacherProfile: true,
  enrollments: {
    where: { status: 'active' },
    include: { class: true },
    orderBy: { class: { code: 'asc' } },
  },
  classesTaught: { include: { class: true }, orderBy: { class: { code: 'asc' } } },
} satisfies Prisma.UserInclude;

export type AccountRow = Prisma.UserGetPayload<{ include: typeof ACCOUNT_VIEW }>;

/** An account as the admin panel shows it: never the hash or the lockout counter. */
export function toAdminUser(user: AccountRow, now: Date): AdminUser {
  const taught =
    user.role === 'teacher'
      ? user.classesTaught.map((link) => link.class)
      : user.enrollments.map((link) => link.class);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    lockedUntil:
      user.lockedUntil !== null && user.lockedUntil > now ? user.lockedUntil.toISOString() : null,
    classes: taught.map((taughtClass) => ({ code: taughtClass.code, name: taughtClass.name })),
    rollNo: user.studentProfile?.rollNo ?? null,
    subjects: user.teacherProfile?.subjects ?? [],
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Finds classes by code without regard to case. Returns them keyed by the
 * upper-case code; a code with no class is simply missing from the map.
 */
export async function classesByCode(
  db: Pick<Prisma.TransactionClient, 'class'>,
  codes?: string[],
): Promise<Map<string, { id: string; code: string }>> {
  const found = await db.class.findMany({
    where:
      codes === undefined
        ? {}
        : { OR: codes.map((code) => ({ code: { equals: code, mode: 'insensitive' } })) },
    select: { id: true, code: true },
  });
  return new Map(found.map((taught) => [taught.code.toUpperCase(), taught]));
}

/**
 * Ends every login an account has on every PC and frees its seat, so the
 * console does not go on showing it at a PC. Deactivating an account and
 * resetting its password both call for this.
 */
export async function endSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.deviceLogin.updateMany({
    where: { studentId: userId, loggedOutAt: null },
    data: { loggedOutAt: now, logoutReason: 'admin' },
  });
}
