import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import type { Prisma, User } from '../generated/prisma/index.js';

/**
 * Ownership, the half of the permissions table a role cannot answer: a teacher
 * acts on their own classes, a student sees their own data
 * (docs/docs/06-security-and-data.md, Roles and permissions). The role guard
 * decides who may call an endpoint at all; these checks decide which records
 * they may touch, so every endpoint that takes the id of a class or a student
 * calls one of them.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One refusal for a record that is not yours and for one that does not
   * exist, so an id cannot be used to find out what the institute has.
   */
  private forbidden(): AppError {
    return new AppError(403, 'FORBIDDEN', 'This account may not do that');
  }

  /** The admin may act on any class; a teacher only on one they teach. */
  async assertOwnClass(user: User, classId: string): Promise<void> {
    if (user.role === 'admin') {
      await this.assertClassExists(classId);
      return;
    }
    if (user.role !== 'teacher') {
      throw this.forbidden();
    }

    const taught = await this.prisma.classTeacher.findUnique({
      where: { classId_teacherId: { classId, teacherId: user.id } },
    });
    if (taught === null) {
      throw this.forbidden();
    }
  }

  /**
   * The admin may act on any student; a teacher on the students of their own
   * classes; a student only on themselves.
   */
  async assertOwnStudent(user: User, studentId: string): Promise<void> {
    if (user.role === 'student') {
      if (studentId !== user.id) {
        throw this.forbidden();
      }
      return;
    }
    if (user.role === 'admin') {
      await this.assertStudentExists(studentId);
      return;
    }

    const shared = await this.prisma.enrollment.findFirst({
      where: { studentId, class: { teachers: { some: { teacherId: user.id } } } },
    });
    if (shared === null) {
      throw this.forbidden();
    }
  }

  /**
   * What a list of classes may hold for this account: every class for the
   * admin, the ones they teach for a teacher, the ones they are enrolled in
   * for a student. Lists are filtered on the server, never in the app.
   */
  classFilter(user: User): Prisma.ClassWhereInput {
    switch (user.role) {
      case 'admin':
        return {};
      case 'teacher':
        return { teachers: { some: { teacherId: user.id } } };
      default:
        return { enrollments: { some: { studentId: user.id } } };
    }
  }

  private async assertClassExists(classId: string): Promise<void> {
    const found = await this.prisma.class.findUnique({ where: { id: classId } });
    if (found === null) {
      throw this.forbidden();
    }
  }

  private async assertStudentExists(studentId: string): Promise<void> {
    const found = await this.prisma.user.findFirst({
      where: { id: studentId, role: 'student' },
    });
    if (found === null) {
      throw this.forbidden();
    }
  }
}
