import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ClassGroup, CreateGroupRequest, Items } from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import type { GroupKind, Prisma } from '../generated/prisma/index.js';
import { byName, byRollNo } from './organisation.js';

const MEMBER = { include: { studentProfile: true } } satisfies Prisma.UserDefaultArgs;

const GROUP_VIEW = {
  members: { include: { student: MEMBER } },
} satisfies Prisma.GroupInclude;

type GroupRow = Prisma.GroupGetPayload<{ include: typeof GROUP_VIEW }>;
type Member = Prisma.UserGetPayload<typeof MEMBER>;

function rollOrder(a: Member, b: Member): number {
  return byRollNo(
    { rollNo: a.studentProfile?.rollNo ?? null, fullName: a.fullName },
    { rollNo: b.studentProfile?.rollNo ?? null, fullName: b.fullName },
  );
}

function toGroup(row: GroupRow): ClassGroup {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    members: row.members
      .map(({ student }) => student)
      .sort(rollOrder)
      .map((student) => ({
        id: student.id,
        username: student.username,
        fullName: student.fullName,
      })),
  };
}

/** Pairs in the order given; an odd one out joins the last pair. */
export function pairUp<T>(students: T[]): T[][] {
  const pairs: T[][] = [];
  for (let start = 0; start + 1 < students.length; start += 2) {
    pairs.push(students.slice(start, start + 2));
  }
  if (students.length % 2 === 1) {
    pairs.at(-1)?.push(students[students.length - 1] as T);
  }
  return pairs;
}

/**
 * Shuffles the students into as few groups as keeps each to at most `size`,
 * sized as evenly as possible (ten in fours: 4, 3, 3). Never a group of one:
 * with too few students for that, there are fewer, larger groups.
 */
export function splitAtRandom<T>(students: T[], size: number): T[][] {
  const shuffled = [...students];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other] as T, shuffled[index] as T];
  }

  const count = Math.max(
    1,
    Math.min(Math.ceil(shuffled.length / size), Math.floor(shuffled.length / 2)),
  );
  const base = Math.floor(shuffled.length / count);
  const larger = shuffled.length % count;
  const groups: T[][] = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    const length = base + (index < larger ? 1 : 0);
    groups.push(shuffled.slice(start, start + length));
    start += length;
  }
  return groups;
}

/**
 * Groups of a class that last beyond one class session (ADM-03). Whether the
 * caller may touch the class is decided before this by AccessService.
 */
@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(classId: string): Promise<Items<ClassGroup>> {
    const rows = await this.prisma.group.findMany({
      where: { classId, sessionId: null },
      include: GROUP_VIEW,
    });
    return { items: rows.map(toGroup).sort((a, b) => byName(a.name, b.name)) };
  }

  /**
   * Pairs and random groups replace the class's earlier ones of that kind, so
   * pressing the button again reshuffles instead of piling up groups. A manual
   * group is added beside the others.
   */
  async create(classId: string, request: CreateGroupRequest): Promise<Items<ClassGroup>> {
    if (request.kind === 'manual') {
      return this.createManual(classId, request.name, request.studentIds);
    }

    const students = (await this.activeStudents(classId)).sort(rollOrder);
    if (students.length < 2) {
      throw new AppError(422, 'NOT_ENOUGH_STUDENTS', 'A class needs two students to make groups');
    }
    const [label, split] =
      request.kind === 'pair'
        ? (['Pair', pairUp(students)] as const)
        : (['Group', splitAtRandom(students, request.size)] as const);

    return this.replace(
      classId,
      request.kind,
      split.map((members, index) => ({ name: `${label} ${index + 1}`, members })),
    );
  }

  private async createManual(
    classId: string,
    name: string,
    studentIds: string[],
  ): Promise<Items<ClassGroup>> {
    return this.prisma.$transaction(async (tx) => {
      const inClass = await tx.enrollment.count({
        where: { classId, status: 'active', studentId: { in: studentIds } },
      });
      if (inClass !== studentIds.length) {
        throw new AppError(422, 'NOT_IN_CLASS', 'Every student must be in this class');
      }
      const grouped = await tx.groupMember.findMany({
        where: {
          studentId: { in: studentIds },
          group: { classId, sessionId: null, kind: 'manual' },
        },
        select: { studentId: true },
      });
      if (grouped.length > 0) {
        throw new AppError(409, 'ALREADY_IN_GROUP', 'A student is already in another group', {
          studentIds: grouped.map((member) => member.studentId),
        });
      }

      const group = await tx.group.create({
        data: {
          classId,
          name,
          kind: 'manual',
          members: { create: studentIds.map((studentId) => ({ studentId })) },
        },
        include: GROUP_VIEW,
      });
      return { items: [toGroup(group)] };
    });
  }

  private async replace(
    classId: string,
    kind: GroupKind,
    groups: { name: string; members: Member[] }[],
  ): Promise<Items<ClassGroup>> {
    return this.prisma.$transaction(async (tx) => {
      await tx.group.deleteMany({ where: { classId, sessionId: null, kind } });
      const created: ClassGroup[] = [];
      for (const group of groups) {
        const row = await tx.group.create({
          data: {
            classId,
            name: group.name,
            kind,
            members: { create: group.members.map((member) => ({ studentId: member.id })) },
          },
          include: GROUP_VIEW,
        });
        created.push(toGroup(row));
      }
      return { items: created };
    });
  }

  private async activeStudents(classId: string): Promise<Member[]> {
    const enrolments = await this.prisma.enrollment.findMany({
      where: { classId, status: 'active' },
      include: { student: MEMBER },
    });
    return enrolments.map(({ student }) => student);
  }
}
