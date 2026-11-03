import { Injectable } from '@nestjs/common';
import type { ImportCreatedRow, ImportResponse, ImportRowError } from '@lingualab/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Clock } from '../../common/clock.js';
import { AuditService } from '../../audit/audit.service.js';
import { hashPassword } from '../../auth/password.js';
import { generateFirstPassword } from '../../auth/generate-password.js';
import type { Prisma, User } from '../../generated/prisma/index.js';
import {
  ACCOUNT_TRANSACTION,
  classesByCode,
  lockAccounts,
  nextStudentNumber,
  studentIdFor,
} from '../accounts.js';
import { ImportFileError } from './import-file-error.js';
import { checkRows, duplicateKey, studentKeys } from './rows.js';
import type { ImportCandidate } from './rows.js';
import { readImportFile } from './sheet.js';
import type { ImportUpload } from './sheet.js';

/** Every student already on the server, by each key a row could match them on. */
async function existingStudents(
  db: Pick<Prisma.TransactionClient, 'user'>,
): Promise<Map<string, string>> {
  const students = await db.user.findMany({
    where: { role: 'student' },
    select: {
      username: true,
      fullName: true,
      phone: true,
      enrollments: { select: { class: { select: { code: true } } } },
    },
  });
  const known = new Map<string, string>();
  for (const student of students) {
    const codes = student.enrollments.map((link) => link.class.code);
    for (const key of studentKeys(student.fullName, student.phone, codes)) {
      known.set(key, student.username);
    }
  }
  return known;
}

function alreadyExists(candidate: ImportCandidate, username: string): ImportRowError {
  return {
    row: candidate.row,
    field: 'name',
    code: 'ALREADY_EXISTS',
    message: 'This student already has an account',
    existingUsername: username,
  };
}

/**
 * The student import (ADM-02, T-ADM-02). Bad rows are reported, good rows
 * are created, and a student who is already on the server is never created
 * again, even when the same file is sent twice at once.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async importStudents(
    actor: User,
    upload: ImportUpload | undefined,
    ip: string,
  ): Promise<ImportResponse> {
    if (upload === undefined) {
      throw new ImportFileError('no_file');
    }
    const rows = await readImportFile(upload);
    const checked = checkRows(rows, await classesByCode(this.prisma));
    const errors = [...checked.errors];

    // A first look outside the lock, so passwords are only hashed for rows
    // that will probably be created. The look inside the lock decides.
    const before = await existingStudents(this.prisma);
    const fresh: ImportCandidate[] = [];
    for (const candidate of checked.candidates) {
      const username = before.get(
        duplicateKey(candidate.fullName, candidate.phone, candidate.classCode),
      );
      if (username === undefined) {
        fresh.push(candidate);
      } else {
        errors.push(alreadyExists(candidate, username));
      }
    }

    const passwords = fresh.map(() => generateFirstPassword());
    const hashes = await Promise.all(passwords.map((password) => hashPassword(password)));
    const now = this.clock.now();

    const created = await this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx);
      const known = await existingStudents(tx);
      let next = await nextStudentNumber(tx);
      const rollNumbers = new Map<string, number>();

      const accepted: (ImportCreatedRow & {
        classId: string;
        hash: string;
        phone: string | null;
        rollNo: string;
      })[] = [];
      for (const [index, candidate] of fresh.entries()) {
        const username = known.get(
          duplicateKey(candidate.fullName, candidate.phone, candidate.classCode),
        );
        if (username !== undefined) {
          // Another import created this student while this one was waiting.
          errors.push(alreadyExists(candidate, username));
          continue;
        }
        if (!rollNumbers.has(candidate.classId)) {
          rollNumbers.set(
            candidate.classId,
            await tx.enrollment.count({ where: { classId: candidate.classId } }),
          );
        }
        const rollNo = (rollNumbers.get(candidate.classId) as number) + 1;
        rollNumbers.set(candidate.classId, rollNo);

        accepted.push({
          row: candidate.row,
          id: '',
          username: studentIdFor(next),
          fullName: candidate.fullName,
          classCode: candidate.classCode,
          password: passwords[index] as string,
          classId: candidate.classId,
          hash: hashes[index] as string,
          phone: candidate.phone,
          rollNo: String(rollNo),
        });
        next += 1;
      }
      if (accepted.length === 0) {
        return [];
      }

      const users = await tx.user.createManyAndReturn({
        data: accepted.map((row) => ({
          role: 'student' as const,
          username: row.username,
          passwordHash: row.hash,
          fullName: row.fullName,
          phone: row.phone,
          mustChangePassword: true,
        })),
        select: { id: true, username: true },
      });
      const idOf = new Map(users.map((user) => [user.username, user.id]));
      for (const row of accepted) {
        row.id = idOf.get(row.username) as string;
      }

      await tx.studentProfile.createMany({
        data: accepted.map((row) => ({ userId: row.id, rollNo: row.rollNo, joinedOn: now })),
      });
      await tx.enrollment.createMany({
        data: accepted.map((row) => ({ classId: row.classId, studentId: row.id, enrolledOn: now })),
      });
      await this.audit.record(
        accepted.map((row) => ({
          actorId: actor.id,
          action: 'user.created',
          entity: 'user',
          entityId: row.id,
          details: { username: row.username, role: 'student', source: 'import' },
          ip,
        })),
        tx,
      );

      return accepted.map(({ row, id, username, fullName, classCode, password }) => ({
        row,
        id,
        username,
        fullName,
        classCode,
        password,
      }));
    }, ACCOUNT_TRANSACTION);

    errors.sort((left, right) => left.row - right.row);
    return {
      created,
      errors,
      counts: {
        rows: checked.rows,
        created: created.length,
        rejected: checked.rows - created.length,
      },
    };
  }
}
