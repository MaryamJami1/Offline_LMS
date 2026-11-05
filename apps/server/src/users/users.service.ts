import { Injectable } from '@nestjs/common';
import type {
  AdminUser,
  CreateUserRequest,
  CreateUserResponse,
  ListUsersQuery,
  ResetPasswordResponse,
  UpdateUserRequest,
  UserListResponse,
} from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';
import { generateFirstPassword } from '../auth/generate-password.js';
import type { Prisma, User } from '../generated/prisma/index.js';
import {
  ACCOUNT_TRANSACTION,
  accountView,
  classesByCode,
  endSessions,
  lockAccounts,
  nextStudentNumber,
  studentIdFor,
  toAdminUser,
} from './accounts.js';

const UNIQUE_VIOLATION = 'P2002';

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'There is no such account');
}

function usernameTaken(): AppError {
  return new AppError(409, 'USERNAME_TAKEN', 'That username is already in use');
}

function orderOf(sort: ListUsersQuery['sort']): Prisma.UserOrderByWithRelationInput[] {
  const descending = sort.startsWith('-');
  const field = (descending ? sort.slice(1) : sort) as
    'name' | 'username' | 'createdAt' | 'lastLoginAt';
  const direction = descending ? 'desc' : 'asc';
  const column = field === 'name' ? 'fullName' : field;
  // The username breaks ties, so a page never shows a row twice.
  return [{ [column]: direction }, { username: 'asc' }];
}

/**
 * Teachers and students as the admin manages them (ADM-01). Every change worth
 * knowing about later is written to the audit log in the same transaction.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(query: ListUsersQuery): Promise<UserListResponse> {
    const filter = this.filterFor(query);
    const now = this.clock.now();
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where: filter }),
      this.prisma.user.findMany({
        where: filter,
        include: accountView(now),
        orderBy: orderOf(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: users.map((user) => toAdminUser(user, now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * The search and the class filter each match on several columns, so every
   * filter goes under one AND rather than one OR overwriting the other.
   */
  private filterFor(query: ListUsersQuery): Prisma.UserWhereInput {
    const parts: Prisma.UserWhereInput[] = [];
    if (query.role !== undefined) {
      parts.push({ role: query.role });
    }
    if (query.status !== undefined) {
      parts.push({ status: query.status });
    }
    if (query.q !== undefined) {
      parts.push({
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { username: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.classCode !== undefined) {
      const code = { equals: query.classCode, mode: 'insensitive' } as const;
      parts.push({
        OR: [
          { enrollments: { some: { status: 'active', class: { code } } } },
          { classesTaught: { some: { class: { code } } } },
        ],
      });
    }
    return { AND: parts };
  }

  async get(id: string): Promise<AdminUser> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUnique({ where: { id }, include: accountView(now) });
    if (user === null) {
      throw notFound();
    }
    return toAdminUser(user, now);
  }

  async create(actor: User, request: CreateUserRequest, ip: string): Promise<CreateUserResponse> {
    const codes =
      request.role === 'student'
        ? request.classCode === undefined
          ? []
          : [request.classCode]
        : (request.classCodes ?? []);
    const classes = await classesByCode(this.prisma, codes);
    if (codes.some((code) => !classes.has(code.toUpperCase()))) {
      throw new AppError(422, 'CLASS_NOT_FOUND', 'There is no class with that code');
    }

    const generatedPassword = request.password === undefined ? generateFirstPassword() : null;
    // Hashing takes long enough that it is done before the transaction opens.
    const passwordHash = await hashPassword(request.password ?? (generatedPassword as string));
    const now = this.clock.now();

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await lockAccounts(tx);

        let username = request.username;
        if (username === undefined) {
          username = studentIdFor(await nextStudentNumber(tx));
        } else if (
          (await tx.user.findFirst({
            where: { username: { equals: username, mode: 'insensitive' } },
            select: { id: true },
          })) !== null
        ) {
          throw usernameTaken();
        }

        const user = await tx.user.create({
          data: {
            role: request.role,
            username,
            passwordHash,
            fullName: request.fullName,
            phone: request.phone ?? null,
            mustChangePassword: true,
          },
        });

        if (request.role === 'student') {
          const taught =
            request.classCode === undefined
              ? undefined
              : classes.get(request.classCode.toUpperCase());
          const rollNo =
            taught === undefined
              ? username.replace(/\D/g, '')
              : String((await tx.enrollment.count({ where: { classId: taught.id } })) + 1);
          await tx.studentProfile.create({ data: { userId: user.id, rollNo, joinedOn: now } });
          if (taught !== undefined) {
            await tx.enrollment.create({
              data: { classId: taught.id, studentId: user.id, enrolledOn: now },
            });
          }
        } else {
          await tx.teacherProfile.create({
            data: { userId: user.id, subjects: request.subjects ?? [] },
          });
          await tx.classTeacher.createMany({
            data: [...classes.values()].map((taught) => ({
              classId: taught.id,
              teacherId: user.id,
            })),
            skipDuplicates: true,
          });
        }

        await this.audit.record(
          {
            actorId: actor.id,
            action: 'user.created',
            entity: 'user',
            entityId: user.id,
            details: { username, role: request.role },
            ip,
          },
          tx,
        );
        return user.id;
      }, ACCOUNT_TRANSACTION);

      return { user: await this.get(id), generatedPassword };
    } catch (error) {
      // The lock makes this unlikely; the unique index makes it impossible.
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw usernameTaken();
      }
      throw error;
    }
  }

  async update(actor: User, id: string, change: UpdateUserRequest, ip: string): Promise<AdminUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user === null) {
      throw notFound();
    }
    if (change.subjects !== undefined && user.role !== 'teacher') {
      throw new AppError(422, 'SUBJECTS_FOR_TEACHERS_ONLY', 'Only a teacher has modules');
    }
    if (change.status === 'inactive' && user.id === actor.id) {
      throw new AppError(422, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
    }

    const now = this.clock.now();
    const statusChanged = change.status !== undefined && change.status !== user.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(change.fullName === undefined ? {} : { fullName: change.fullName }),
          ...(change.phone === undefined ? {} : { phone: change.phone }),
          ...(change.status === undefined ? {} : { status: change.status }),
        },
      });
      if (change.subjects !== undefined) {
        await tx.teacherProfile.upsert({
          where: { userId: id },
          create: { userId: id, subjects: change.subjects },
          update: { subjects: change.subjects },
        });
      }
      if (!statusChanged) {
        return;
      }
      if (change.status === 'inactive') {
        await endSessions(tx, id, now);
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: change.status === 'inactive' ? 'user.deactivated' : 'user.reactivated',
          entity: 'user',
          entityId: id,
          details: { username: user.username, role: user.role },
          ip,
        },
        tx,
      );
    });

    return this.get(id);
  }

  /**
   * Gives an account a new first-login password made up here (ADM-11). Who may
   * reset whose is checked before this by AccessService. The reset also does
   * what a forgotten password calls for: it lifts a lockout, ends every login
   * the old password opened and frees the seat. The audit entry is written in
   * the same transaction, so a reset that cannot be logged does not happen.
   */
  async resetPassword(actor: User, id: string, ip: string): Promise<ResetPasswordResponse> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user === null) {
      throw notFound();
    }
    const generatedPassword = generateFirstPassword();
    const passwordHash = await hashPassword(generatedPassword);
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
      });
      await endSessions(tx, id, now);
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.password_reset',
          entity: 'user',
          entityId: id,
          details: { username: user.username, role: user.role },
          ip,
        },
        tx,
      );
    });

    return { id, username: user.username, fullName: user.fullName, generatedPassword };
  }

  /** Clears a lockout at once, instead of the account waiting out its ten minutes. */
  async unlock(actor: User, id: string, ip: string): Promise<AdminUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user === null) {
      throw notFound();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.unlocked',
          entity: 'user',
          entityId: id,
          details: { username: user.username, role: user.role },
          ip,
        },
        tx,
      );
    });
    return this.get(id);
  }
}
