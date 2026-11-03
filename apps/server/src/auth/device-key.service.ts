import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import type { Prisma } from '../generated/prisma/index.js';

const APPROVED_DEVICE = {
  seat: { include: { labRoom: true } },
} satisfies Prisma.DeviceInclude;

export type ApprovedDevice = Prisma.DeviceGetPayload<{ include: typeof APPROVED_DEVICE }>;

/** The header a lab PC presents its device key in. */
export const DEVICE_KEY_HEADER = 'x-device-key';

/**
 * One answer for no key, an unknown key, a PC still waiting and a retired one,
 * so the answer says nothing about which PCs the lab has.
 */
export function deviceNotApproved(): AppError {
  return new AppError(
    403,
    'DEVICE_NOT_APPROVED',
    'This PC is not an approved lab PC. Ask the admin to approve it.',
  );
}

@Injectable()
export class DeviceKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SHA-256, as for refresh tokens: a device key is long and random, so it
   * needs no slow hashing, only to be unreadable in the database.
   */
  hash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * A new key for a PC that registers (ADM-04): 32 random bytes, written
   * base64url for the header. Only the hash is stored.
   */
  issue(): { key: string; hash: string } {
    const key = randomBytes(32).toString('base64url');
    return { key, hash: this.hash(key) };
  }

  /**
   * The approved PC a key belongs to, or null when no key was sent, the key is
   * unknown, or the PC is still waiting for the admin. A retired or reset PC
   * has no key, so its old one is unknown.
   */
  async resolveDevice(key: string | undefined): Promise<string | null> {
    return (await this.approvedDevice(key))?.id ?? null;
  }

  /**
   * The approved PC a key belongs to, with its seat and lab, for a student's
   * login (STU-01) and the login screen's question of where it is.
   */
  async approvedDevice(key: string | undefined): Promise<ApprovedDevice | null> {
    if (key === undefined || key.trim().length === 0) {
      return null;
    }
    return this.prisma.device.findFirst({
      where: { deviceKeyHash: this.hash(key), approved: true, retiredAt: null },
      include: APPROVED_DEVICE,
    });
  }
}
