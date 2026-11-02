import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** The header a lab PC presents its device key in. */
export const DEVICE_KEY_HEADER = 'x-device-key';

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
   * The approved PC a key belongs to, or null when no key was sent, the key is
   * unknown, or the PC is still waiting for the admin. Issuing keys belongs to
   * ADM-04; this only checks one that is presented.
   */
  async resolveDevice(key: string | undefined): Promise<string | null> {
    if (key === undefined || key.trim().length === 0) {
      return null;
    }
    const device = await this.prisma.device.findFirst({
      where: { deviceKeyHash: this.hash(key), approved: true },
      select: { id: true },
    });
    return device?.id ?? null;
  }
}
