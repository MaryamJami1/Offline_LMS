import { Injectable } from '@nestjs/common';
import type {
  Batch,
  Course,
  CreateBatchRequest,
  CreateCourseRequest,
  Items,
  ListBatchesQuery,
  UpdateBatchRequest,
  UpdateCourseRequest,
} from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import type { Prisma } from '../generated/prisma/index.js';
import { fromDay, notFound, toDay } from './organisation.js';

type BatchRow = Prisma.BatchGetPayload<{ include: { course: true } }>;

function toCourse(course: { id: string; name: string; description: string | null }): Course {
  return { id: course.id, name: course.name, description: course.description };
}

function toBatch(batch: BatchRow): Batch {
  return {
    id: batch.id,
    courseId: batch.courseId,
    courseName: batch.course.name,
    name: batch.name,
    startsOn: toDay(batch.startsOn),
    endsOn: batch.endsOn === null ? null : toDay(batch.endsOn),
  };
}

/** Days written as 2026-09-01 compare correctly as text. */
function assertDatesInOrder(startsOn: string, endsOn: string | null): void {
  if (endsOn !== null && endsOn < startsOn) {
    throw new AppError(422, 'BATCH_ENDS_BEFORE_START', 'A batch cannot end before it starts');
  }
}

/** Courses and batches (ADM-03): the admin's alone, checked by the controller's role. */
@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCourses(): Promise<Items<Course>> {
    const courses = await this.prisma.course.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return { items: courses.map(toCourse) };
  }

  async createCourse(request: CreateCourseRequest): Promise<Course> {
    return toCourse(
      await this.prisma.course.create({
        data: { name: request.name, description: request.description ?? null },
      }),
    );
  }

  async updateCourse(id: string, change: UpdateCourseRequest): Promise<Course> {
    const found = await this.prisma.course.findUnique({ where: { id } });
    if (found === null) {
      throw notFound('course');
    }
    return toCourse(await this.prisma.course.update({ where: { id }, data: change }));
  }

  async listBatches(query: ListBatchesQuery): Promise<Items<Batch>> {
    const batches = await this.prisma.batch.findMany({
      where: query.courseId === undefined ? {} : { courseId: query.courseId },
      include: { course: true },
      orderBy: [{ startsOn: 'desc' }, { name: 'asc' }],
    });
    return { items: batches.map(toBatch) };
  }

  async createBatch(request: CreateBatchRequest): Promise<Batch> {
    const course = await this.prisma.course.findUnique({ where: { id: request.courseId } });
    if (course === null) {
      throw new AppError(422, 'COURSE_NOT_FOUND', 'There is no such course');
    }
    assertDatesInOrder(request.startsOn, request.endsOn ?? null);

    return toBatch(
      await this.prisma.batch.create({
        data: {
          courseId: request.courseId,
          name: request.name,
          startsOn: fromDay(request.startsOn),
          endsOn: request.endsOn === undefined ? null : fromDay(request.endsOn),
        },
        include: { course: true },
      }),
    );
  }

  /** A changed date is checked against the date the batch keeps. */
  async updateBatch(id: string, change: UpdateBatchRequest): Promise<Batch> {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (batch === null) {
      throw notFound('batch');
    }
    const storedEnd = batch.endsOn === null ? null : toDay(batch.endsOn);
    assertDatesInOrder(
      change.startsOn ?? toDay(batch.startsOn),
      change.endsOn === undefined ? storedEnd : change.endsOn,
    );

    return toBatch(
      await this.prisma.batch.update({
        where: { id },
        data: {
          ...(change.name === undefined ? {} : { name: change.name }),
          ...(change.startsOn === undefined ? {} : { startsOn: fromDay(change.startsOn) }),
          ...(change.endsOn === undefined
            ? {}
            : { endsOn: change.endsOn === null ? null : fromDay(change.endsOn) }),
        },
        include: { course: true },
      }),
    );
  }
}
