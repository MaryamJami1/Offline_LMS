import { Injectable } from '@nestjs/common';
import type { ChangeExitPinRequest, ExitPinStatus } from '@lingualab/shared';
import type { User } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { verifyPassword } from '../auth/password.js';
import { exitPinValue, readExitPin, writeExitPin } from './exit-pin.js';

/**
 * The admin's side of the exit PIN (ADM-07, STU-06): whether the seeded PIN
 * is still in use, and changing it. The lab PC's side is `POST /devices/exit`.
 */
@Injectable()
export class ExitPinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  async status(): Promise<ExitPinStatus> {
    const stored = await readExitPin(this.prisma);
    const changedAt = stored?.changedAt ?? null;
    return { mustChange: changedAt === null, changedAt };
  }

  /** The admin's own password is typed again, as for a restore. */
  async change(admin: User, request: ChangeExitPinRequest, ip: string): Promise<ExitPinStatus> {
    if (!(await verifyPassword(admin.passwordHash, request.currentPassword))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'The password is wrong');
    }

    const value = await exitPinValue(request.pin, this.clock.now());
    await this.prisma.$transaction(async (tx) => {
      await writeExitPin(tx, value, admin.id);
      await this.audit.record(
        { actorId: admin.id, action: 'settings.exit_pin_changed', entity: 'setting', ip },
        tx,
      );
    });
    return { mustChange: false, changedAt: value.changedAt };
  }
}
