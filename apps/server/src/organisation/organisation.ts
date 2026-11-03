import { AppError } from '../common/app-error.js';

/** Prisma's code for a unique index that refused a row. */
export const UNIQUE_VIOLATION = 'P2002';

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;
}

export function notFound(what: string): AppError {
  return new AppError(404, 'NOT_FOUND', `There is no such ${what}`);
}

/** A `date` column as the API writes it: 2026-09-01. */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 2026-09-01 as the `date` column stores it: midnight UTC. */
export function fromDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

const naturally = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Names with numbers in them in the order people expect: Pair 2 before Pair 10. */
export function byName(a: string, b: string): number {
  return naturally.compare(a, b);
}

/**
 * The order of a class list: roll number as a number (2 before 10), students
 * without one last, then by name.
 */
export function byRollNo(
  a: { rollNo: string | null; fullName: string },
  b: { rollNo: string | null; fullName: string },
): number {
  if (a.rollNo !== b.rollNo) {
    if (a.rollNo === null) {
      return 1;
    }
    if (b.rollNo === null) {
      return -1;
    }
    const order = naturally.compare(a.rollNo, b.rollNo);
    if (order !== 0) {
      return order;
    }
  }
  return naturally.compare(a.fullName, b.fullName);
}
