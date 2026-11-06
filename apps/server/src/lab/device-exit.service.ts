import { Injectable } from '@nestjs/common';
import { EXIT_PIN_LOCK_MINUTES, EXIT_PIN_TRIES } from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { DeviceKeyService, deviceNotApproved } from '../auth/device-key.service.js';
import { verifyPassword } from '../auth/password.js';
import { readExitPin } from '../settings/exit-pin.js';

function exitPinLocked(unlocksAt: Date): AppError {
  return new AppError(
    403,
    'EXIT_PIN_LOCKED',
    `Too many wrong PINs. Try again after ${EXIT_PIN_LOCK_MINUTES} minutes.`,
    { unlocksAt: unlocksAt.toISOString() },
  );
}

/**
 * The lab PC's side of the exit PIN (STU-06; docs/docs/06-security-and-data.md,
 * Student app lock-down). Only an approved PC may try, the PIN is checked here
 * and nowhere else, and five wrong tries lock that PC out for fifteen minutes.
 * Every try that is checked goes into the audit log with the PC; tries made
 * during a lockout are not checked, so they are not logged either.
 */
@Injectable()
export class DeviceExitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly keys: DeviceKeyService,
    private readonly audit: AuditService,
  ) {}

  async exit(deviceKey: string | undefined, pin: string, ip: string): Promise<void> {
    const approved = await this.keys.approvedDevice(deviceKey);
    if (approved === null) {
      throw deviceNotApproved();
    }
    const now = this.clock.now();
    const device = await this.prisma.device.findUniqueOrThrow({ where: { id: approved.id } });
    if (device.exitPinLockedUntil !== null && device.exitPinLockedUntil > now) {
      throw exitPinLocked(device.exitPinLockedUntil);
    }

    const stored = await readExitPin(this.prisma);
    const right = stored !== null && (await verifyPassword(stored.hash, pin));
    const entry = { actorId: null, entity: 'device', entityId: device.id, ip };

    if (right) {
      await this.prisma.$transaction(async (tx) => {
        await tx.device.update({
          where: { id: device.id },
          data: { exitPinFailures: 0, exitPinLockedUntil: null },
        });
        await this.audit.record({ ...entry, action: 'device.exit' }, tx);
      });
      return;
    }

    // A lock that has passed starts the count again.
    const failures = (device.exitPinLockedUntil === null ? device.exitPinFailures : 0) + 1;
    if (failures < EXIT_PIN_TRIES) {
      await this.prisma.$transaction(async (tx) => {
        await tx.device.update({
          where: { id: device.id },
          data: { exitPinFailures: failures, exitPinLockedUntil: null },
        });
        await this.audit.record({ ...entry, action: 'device.exit_pin_wrong' }, tx);
      });
      throw new AppError(403, 'EXIT_PIN_WRONG', 'That PIN is wrong', {
        triesLeft: EXIT_PIN_TRIES - failures,
      });
    }

    const unlocksAt = new Date(now.getTime() + EXIT_PIN_LOCK_MINUTES * 60_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: device.id },
        data: { exitPinFailures: 0, exitPinLockedUntil: unlocksAt },
      });
      await this.audit.record({ ...entry, action: 'device.exit_locked' }, tx);
    });
    throw exitPinLocked(unlocksAt);
  }
}
