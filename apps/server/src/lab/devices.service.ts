import { Injectable } from '@nestjs/common';
import type {
  DeviceMeResponse,
  DeviceView,
  Items,
  ListDevicesQuery,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UpdateDeviceRequest,
} from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/app-error.js';
import { DeviceKeyService, deviceNotApproved } from '../auth/device-key.service.js';
import type { Prisma } from '../generated/prisma/index.js';
import { byName, isUniqueViolation, notFound } from '../organisation/organisation.js';
import { deviceStatus } from './device-status.js';

/** New PCs are refused while this many wait, so the open register call cannot flood the list. */
export const MAX_WAITING_DEVICES = 100;

const DEVICE_VIEW = { seat: { include: { labRoom: true } } } satisfies Prisma.DeviceInclude;

type DeviceRow = Prisma.DeviceGetPayload<{ include: typeof DEVICE_VIEW }>;

function toDeviceView(row: DeviceRow, now: Date): DeviceView {
  return {
    id: row.id,
    hostname: row.hostname,
    mac: row.mac,
    ip: row.ip,
    osVersion: row.osVersion,
    appVersion: row.appVersion,
    status: deviceStatus(row, now),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    seat:
      row.seat === null
        ? null
        : {
            id: row.seat.id,
            code: row.seat.code,
            labId: row.seat.labRoomId,
            labName: row.seat.labRoom.name,
          },
    createdAt: row.createdAt.toISOString(),
  };
}

function retired(): AppError {
  return new AppError(422, 'DEVICE_RETIRED', 'This PC has been retired; reset it first');
}

/** The answer to a registration, and whether it made a new key (201) or was a check-in (200). */
export interface Registration {
  created: boolean;
  answer: RegisterDeviceResponse;
}

/**
 * Lab PCs (ADM-04; docs/docs/06-security-and-data.md, Device trust). A PC
 * registers itself and is given its key at once; the key is accepted only
 * after the admin approves the PC, so registering alone gets nobody into the
 * lab. An approved PC must come back with its key: a copied MAC address
 * cannot take over its seat.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly keys: DeviceKeyService,
  ) {}

  /** An approved PC asking who it is; asking counts as being seen. */
  async whoAmI(deviceKey: string | undefined): Promise<DeviceMeResponse> {
    const device = await this.keys.approvedDevice(deviceKey);
    if (device === null) {
      throw deviceNotApproved();
    }
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: this.clock.now() },
    });
    return {
      deviceId: device.id,
      hostname: device.hostname,
      seat:
        device.seat === null
          ? null
          : { seatCode: device.seat.code, labRoomName: device.seat.labRoom.name },
    };
  }

  async register(
    request: RegisterDeviceRequest,
    presentedKey: string | undefined,
    ip: string,
  ): Promise<Registration> {
    const now = this.clock.now();
    const seen = {
      ip,
      lastSeenAt: now,
      ...(request.osVersion === undefined ? {} : { osVersion: request.osVersion }),
      ...(request.appVersion === undefined ? {} : { appVersion: request.appVersion }),
    };
    const existing = await this.prisma.device.findUnique({ where: { mac: request.mac } });

    if (
      existing !== null &&
      existing.deviceKeyHash !== null &&
      presentedKey !== undefined &&
      this.keys.hash(presentedKey) === existing.deviceKeyHash
    ) {
      // A check-in: the name stays the one the admin gave it.
      await this.prisma.device.update({ where: { id: existing.id }, data: seen });
      return {
        created: false,
        answer: {
          deviceId: existing.id,
          status: existing.approved ? 'approved' : 'waiting',
          deviceKey: null,
        },
      };
    }
    if (existing !== null && existing.retiredAt !== null) {
      throw new AppError(409, 'DEVICE_RETIRED', 'This PC has been retired');
    }
    if (existing?.approved === true) {
      throw new AppError(
        409,
        'DEVICE_ALREADY_REGISTERED',
        'This PC is already approved; ask the admin to reset it',
      );
    }
    if (
      existing === null &&
      (await this.prisma.device.count({ where: { approved: false, retiredAt: null } })) >=
        MAX_WAITING_DEVICES
    ) {
      throw new AppError(429, 'TOO_MANY_WAITING', 'Too many PCs are waiting for approval');
    }

    const { key, hash } = this.keys.issue();
    const data = { hostname: request.hostname, deviceKeyHash: hash, ...seen };
    try {
      const device =
        existing === null
          ? await this.prisma.device.create({ data: { mac: request.mac, ...data } })
          : await this.prisma.device.update({ where: { id: existing.id }, data });
      return { created: true, answer: { deviceId: device.id, status: 'waiting', deviceKey: key } };
    } catch (error) {
      // Two first starts of the same PC at once: the other one won.
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'DEVICE_ALREADY_REGISTERED', 'This PC has just registered');
      }
      throw error;
    }
  }

  async list(query: ListDevicesQuery): Promise<Items<DeviceView>> {
    const now = this.clock.now();
    const rows = await this.prisma.device.findMany({ include: DEVICE_VIEW });
    return {
      items: rows
        .map((row) => toDeviceView(row, now))
        .filter((device) => query.status === undefined || device.status === query.status)
        .sort((a, b) => byName(a.hostname, b.hostname)),
    };
  }

  async update(id: string, request: UpdateDeviceRequest): Promise<DeviceView> {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (device === null) {
      throw notFound('PC');
    }
    const now = this.clock.now();

    switch (request.action) {
      case 'approve':
        if (device.retiredAt !== null) {
          throw retired();
        }
        if (device.deviceKeyHash === null) {
          throw new AppError(
            422,
            'WAITING_FOR_PC',
            'Start the student app on this PC so it registers again',
          );
        }
        await this.bind(id, request.seatId, { approved: true });
        break;
      case 'bind':
        if (device.retiredAt !== null) {
          throw retired();
        }
        await this.bind(id, request.seatId, {});
        break;
      case 'rename':
        await this.prisma.device.update({ where: { id }, data: { hostname: request.hostname } });
        break;
      case 'retire':
      case 'reset':
        await this.prisma.$transaction(async (tx) => {
          await tx.device.update({
            where: { id },
            data:
              request.action === 'retire'
                ? { approved: false, deviceKeyHash: null, seatId: null, retiredAt: now }
                : { approved: false, deviceKeyHash: null, retiredAt: null },
          });
          // Nobody stays logged in on a PC whose key is gone.
          await tx.deviceLogin.updateMany({
            where: { deviceId: id, loggedOutAt: null },
            data: { loggedOutAt: now, logoutReason: 'admin' },
          });
          await tx.refreshToken.updateMany({
            where: { deviceId: id, revokedAt: null },
            data: { revokedAt: now },
          });
        });
        break;
    }

    const row = await this.prisma.device.findUniqueOrThrow({ where: { id }, include: DEVICE_VIEW });
    return toDeviceView(row, now);
  }

  /** `undefined` leaves the seat as it is; `null` takes the PC off its seat. */
  private async bind(
    id: string,
    seatId: string | null | undefined,
    extra: Prisma.DeviceUpdateInput,
  ): Promise<void> {
    if (seatId !== undefined && seatId !== null) {
      const seat = await this.prisma.seat.findUnique({
        where: { id: seatId },
        include: { device: true },
      });
      if (seat === null) {
        throw new AppError(422, 'SEAT_NOT_FOUND', 'There is no such seat');
      }
      if (seat.device !== null && seat.device.id !== id) {
        throw seatTaken();
      }
    }
    try {
      await this.prisma.device.update({
        where: { id },
        data: {
          ...extra,
          ...(seatId === undefined
            ? {}
            : { seat: seatId === null ? { disconnect: true } : { connect: { id: seatId } } }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw seatTaken();
      }
      throw error;
    }
  }
}

function seatTaken(): AppError {
  return new AppError(409, 'SEAT_TAKEN', 'Another PC is bound to that seat');
}
