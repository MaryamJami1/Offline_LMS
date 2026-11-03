import { Injectable } from '@nestjs/common';
import { buildSeatMap, labLayoutSchema } from '@lingualab/shared';
import type {
  CreateLabRequest,
  Items,
  LabLayout,
  LabSeat,
  LabSeatsResponse,
  LabView,
  UpdateLabRequest,
} from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/app-error.js';
import type { Prisma, User } from '../generated/prisma/index.js';
import { byName, notFound } from '../organisation/organisation.js';
import { deviceStatus } from './device-status.js';

const LAB_VIEW = {
  seats: { select: { device: { select: { id: true } } } },
} satisfies Prisma.LabRoomInclude;

type LabRow = Prisma.LabRoomGetPayload<{ include: typeof LAB_VIEW }>;

const NO_LAYOUT: LabLayout = { pairs: false, aisles: [] };

function layoutOf(stored: Prisma.JsonValue): LabLayout {
  const parsed = labLayoutSchema.safeParse(stored);
  return parsed.success ? parsed.data : NO_LAYOUT;
}

function toLabView(row: LabRow): LabView {
  return {
    id: row.id,
    name: row.name,
    rows: row.rows,
    seatsPerRow: row.seatsPerRow,
    layout: layoutOf(row.layout),
    seatCount: row.seats.length,
    pcCount: row.seats.filter((seat) => seat.device !== null).length,
  };
}

/** An aisle runs between two seats, so it can follow any seat but the last of the row. */
function assertAislesFit(layout: LabLayout, seatsPerRow: number): void {
  if (layout.aisles.some((aisle) => aisle >= seatsPerRow)) {
    throw new AppError(422, 'AISLE_OUTSIDE_ROW', 'An aisle must fall between two seats of a row');
  }
}

/**
 * Labs and their seat maps (ADM-04). Changing the size adds or removes seats;
 * a seat with a PC bound to it, or with any login or attendance history, is
 * never removed, because "who sat where" must stay true.
 */
@Injectable()
export class LabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<Items<LabView>> {
    const rows = await this.prisma.labRoom.findMany({ include: LAB_VIEW });
    return { items: rows.map(toLabView).sort((a, b) => byName(a.name, b.name)) };
  }

  async create(request: CreateLabRequest): Promise<LabView> {
    assertAislesFit(request.layout, request.seatsPerRow);

    const id = await this.prisma.$transaction(async (tx) => {
      const lab = await tx.labRoom.create({
        data: {
          name: request.name,
          rows: request.rows,
          seatsPerRow: request.seatsPerRow,
          layout: request.layout,
        },
      });
      await tx.seat.createMany({
        data: buildSeatMap(request).map((seat) => ({ labRoomId: lab.id, ...seat })),
      });
      return lab.id;
    });
    return this.get(id);
  }

  async update(id: string, change: UpdateLabRequest): Promise<LabView> {
    const lab = await this.prisma.labRoom.findUnique({ where: { id }, include: { seats: true } });
    if (lab === null) {
      throw notFound('lab');
    }
    const rows = change.rows ?? lab.rows;
    const seatsPerRow = change.seatsPerRow ?? lab.seatsPerRow;
    const layout = change.layout ?? layoutOf(lab.layout);
    assertAislesFit(layout, seatsPerRow);

    const wanted = buildSeatMap({ rows, seatsPerRow });
    const wantedCodes = new Set(wanted.map((seat) => seat.code));
    const removed = lab.seats.filter((seat) => !wantedCodes.has(seat.code));
    const kept = new Set(lab.seats.map((seat) => seat.code));

    const used = await this.prisma.seat.findMany({
      where: {
        id: { in: removed.map((seat) => seat.id) },
        OR: [{ device: { isNot: null } }, { logins: { some: {} } }, { attendance: { some: {} } }],
      },
      select: { code: true },
    });
    if (used.length > 0) {
      throw new AppError(409, 'SEAT_IN_USE', 'A seat being removed has a PC or a history', {
        seats: used.map((seat) => seat.code).sort((a, b) => byName(a, b)),
      });
    }

    await this.prisma.$transaction([
      this.prisma.seat.deleteMany({ where: { id: { in: removed.map((seat) => seat.id) } } }),
      this.prisma.seat.createMany({
        data: wanted
          .filter((seat) => !kept.has(seat.code))
          .map((seat) => ({ labRoomId: id, ...seat })),
      }),
      this.prisma.labRoom.update({
        where: { id },
        data: {
          ...(change.name === undefined ? {} : { name: change.name }),
          rows,
          seatsPerRow,
          layout,
        },
      }),
    ]);
    return this.get(id);
  }

  /**
   * Every seat with its PC and who is logged in there now. The admin sees
   * every name; a teacher only those of students enrolled in a class they
   * teach, and the other seats as in use. During a running session the
   * console will also show that session's class (LAB-01).
   */
  async seats(id: string, viewer: User): Promise<LabSeatsResponse> {
    const lab = await this.get(id);
    const seats = await this.prisma.seat.findMany({
      where: { labRoomId: id },
      include: {
        device: true,
        logins: { where: { loggedOutAt: null }, include: { student: true } },
      },
      orderBy: [{ row: 'asc' }, { position: 'asc' }],
    });

    const occupants = seats.flatMap((seat) => seat.logins.map((login) => login.studentId));
    const visible = new Set(
      viewer.role === 'admin'
        ? occupants
        : (
            await this.prisma.enrollment.findMany({
              where: {
                studentId: { in: occupants },
                status: 'active',
                class: { teachers: { some: { teacherId: viewer.id } } },
              },
              select: { studentId: true },
            })
          ).map((enrolment) => enrolment.studentId),
    );

    const now = this.clock.now();
    return {
      lab,
      seats: seats.map((seat): LabSeat => {
        const login = seat.logins[0];
        const student = login !== undefined && visible.has(login.studentId) ? login.student : null;
        return {
          id: seat.id,
          code: seat.code,
          row: seat.row,
          position: seat.position,
          device:
            seat.device === null
              ? null
              : {
                  id: seat.device.id,
                  hostname: seat.device.hostname,
                  ip: seat.device.ip,
                  appVersion: seat.device.appVersion,
                  status: deviceStatus(seat.device, now),
                  lastSeenAt: seat.device.lastSeenAt?.toISOString() ?? null,
                },
          occupied: login !== undefined,
          student:
            student === null
              ? null
              : { id: student.id, username: student.username, fullName: student.fullName },
        };
      }),
    };
  }

  private async get(id: string): Promise<LabView> {
    const row = await this.prisma.labRoom.findUnique({ where: { id }, include: LAB_VIEW });
    if (row === null) {
      throw notFound('lab');
    }
    return toLabView(row);
  }
}
