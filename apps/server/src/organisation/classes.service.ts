import { Injectable } from '@nestjs/common';
import { scheduleSchema } from '@lingualab/shared';
import type {
  ClassStudent,
  ClassView,
  CreateClassRequest,
  Items,
  Schedule,
  UpdateClassRequest,
} from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/app-error.js';
import type { Prisma } from '../generated/prisma/index.js';
import { byName, byRollNo, isUniqueViolation, notFound } from './organisation.js';

const CLASS_VIEW = {
  batch: { include: { course: true } },
  labRoom: true,
  teachers: { include: { teacher: true } },
  _count: {
    select: {
      enrollments: { where: { status: 'active' } },
      groups: { where: { sessionId: null } },
    },
  },
} satisfies Prisma.ClassInclude;

type ClassRow = Prisma.ClassGetPayload<{ include: typeof CLASS_VIEW }>;

/** A class with no schedule stores `{}`, since the column cannot be null. */
const NO_SCHEDULE = {};

function scheduleOf(stored: Prisma.JsonValue): Schedule | null {
  const parsed = scheduleSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

function toClassView(row: ClassRow): ClassView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    course: { id: row.batch.course.id, name: row.batch.course.name },
    batch: { id: row.batch.id, name: row.batch.name },
    lab: { id: row.labRoom.id, name: row.labRoom.name },
    schedule: scheduleOf(row.schedule),
    teachers: row.teachers
      .map(({ teacher }) => ({ id: teacher.id, fullName: teacher.fullName }))
      .sort((a, b) => byName(a.fullName, b.fullName)),
    studentCount: row._count.enrollments,
    groupCount: row._count.groups,
  };
}

function codeTaken(): AppError {
  return new AppError(409, 'CLASS_CODE_TAKEN', 'Another class already has that code');
}

/**
 * Classes, their teachers and their students (ADM-03). Who may call what is
 * decided before this: the role guard for the admin's calls, AccessService
 * for a teacher's own classes.
 */
@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(where: Prisma.ClassWhereInput): Promise<Items<ClassView>> {
    const rows = await this.prisma.class.findMany({
      where,
      include: CLASS_VIEW,
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toClassView) };
  }

  async get(id: string): Promise<ClassView> {
    const row = await this.prisma.class.findUnique({ where: { id }, include: CLASS_VIEW });
    if (row === null) {
      throw notFound('class');
    }
    return toClassView(row);
  }

  async create(request: CreateClassRequest): Promise<ClassView> {
    await this.assertPlacesExist(request);
    const teacherIds = request.teacherIds ?? [];
    await this.assertTeachers(teacherIds);

    try {
      const created = await this.prisma.class.create({
        data: {
          code: request.code,
          name: request.name,
          batchId: request.batchId,
          labRoomId: request.labRoomId,
          schedule: request.schedule ?? NO_SCHEDULE,
          teachers: { create: teacherIds.map((teacherId) => ({ teacherId })) },
        },
      });
      return await this.get(created.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw codeTaken();
      }
      throw error;
    }
  }

  async update(id: string, change: UpdateClassRequest): Promise<ClassView> {
    await this.assertExists(id);
    await this.assertPlacesExist(change);

    try {
      await this.prisma.class.update({
        where: { id },
        data: {
          ...(change.code === undefined ? {} : { code: change.code }),
          ...(change.name === undefined ? {} : { name: change.name }),
          ...(change.batchId === undefined ? {} : { batchId: change.batchId }),
          ...(change.labRoomId === undefined ? {} : { labRoomId: change.labRoomId }),
          ...(change.schedule === undefined ? {} : { schedule: change.schedule ?? NO_SCHEDULE }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw codeTaken();
      }
      throw error;
    }
    return this.get(id);
  }

  /** Replaces the teachers of a class with the ones given. */
  async setTeachers(id: string, teacherIds: string[]): Promise<ClassView> {
    await this.assertExists(id);
    await this.assertTeachers(teacherIds);

    await this.prisma.$transaction([
      this.prisma.classTeacher.deleteMany({
        where: { classId: id, teacherId: { notIn: teacherIds } },
      }),
      this.prisma.classTeacher.createMany({
        data: teacherIds.map((teacherId) => ({ classId: id, teacherId })),
        skipDuplicates: true,
      }),
    ]);
    return this.get(id);
  }

  /**
   * Makes the students given the class's students. A student left out is
   * marked as having left, so their work in the class stays, and is taken out
   * of its groups; one who comes back keeps the day they first joined.
   */
  async setStudents(id: string, studentIds: string[]): Promise<Items<ClassStudent>> {
    await this.assertExists(id);
    const found = await this.prisma.user.count({
      where: { id: { in: studentIds }, role: 'student' },
    });
    if (found !== studentIds.length) {
      throw new AppError(422, 'STUDENT_NOT_FOUND', 'Every account listed must be a student');
    }

    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const leaving = { classId: id, studentId: { notIn: studentIds }, status: 'active' as const };
      const leavers = await tx.enrollment.findMany({ where: leaving, select: { studentId: true } });
      await tx.enrollment.updateMany({ where: leaving, data: { status: 'left' } });
      await tx.groupMember.deleteMany({
        where: {
          studentId: { in: leavers.map((leaver) => leaver.studentId) },
          group: { classId: id },
        },
      });
      await tx.enrollment.updateMany({
        where: { classId: id, studentId: { in: studentIds }, status: 'left' },
        data: { status: 'active' },
      });
      await tx.enrollment.createMany({
        data: studentIds.map((studentId) => ({ classId: id, studentId, enrolledOn: now })),
        skipDuplicates: true,
      });
    });
    return this.students(id);
  }

  /** The students enrolled in the class now, by roll number. */
  async students(id: string): Promise<Items<ClassStudent>> {
    const enrolments = await this.prisma.enrollment.findMany({
      where: { classId: id, status: 'active' },
      include: { student: { include: { studentProfile: true } } },
    });
    const items = enrolments.map(({ student }): ClassStudent => ({
      id: student.id,
      username: student.username,
      fullName: student.fullName,
      rollNo: student.studentProfile?.rollNo ?? null,
      status: student.status,
    }));
    return { items: items.sort(byRollNo) };
  }

  private async assertExists(id: string): Promise<void> {
    if ((await this.prisma.class.findUnique({ where: { id } })) === null) {
      throw notFound('class');
    }
  }

  private async assertPlacesExist(place: { batchId?: string; labRoomId?: string }): Promise<void> {
    if (
      place.batchId !== undefined &&
      (await this.prisma.batch.findUnique({ where: { id: place.batchId } })) === null
    ) {
      throw new AppError(422, 'BATCH_NOT_FOUND', 'There is no such batch');
    }
    if (
      place.labRoomId !== undefined &&
      (await this.prisma.labRoom.findUnique({ where: { id: place.labRoomId } })) === null
    ) {
      throw new AppError(422, 'LAB_NOT_FOUND', 'There is no such lab');
    }
  }

  private async assertTeachers(teacherIds: string[]): Promise<void> {
    const found = await this.prisma.user.count({
      where: { id: { in: teacherIds }, role: 'teacher' },
    });
    if (found !== teacherIds.length) {
      throw new AppError(422, 'TEACHER_NOT_FOUND', 'Every account listed must be a teacher');
    }
  }
}
