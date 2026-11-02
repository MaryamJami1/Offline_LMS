import { Controller, Get, Module, Param } from '@nestjs/common';
import { AccessService } from '../../src/auth/access.service.js';
import { Public, Roles } from '../../src/auth/roles.decorator.js';
import { CurrentUser } from '../../src/auth/current-user.decorator.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import type { User } from '../../src/generated/prisma/index.js';

/**
 * Routes that exist only in the tests, one per way a route can be protected.
 * The endpoints of the permissions table belong to later tasks (ADM-01 to
 * ADM-04, STU-01, LAB-*), and a guard cannot be proved against routes that do
 * not exist yet, so T-ACL-01 proves it here and the table test holds each real
 * endpoint to the same rules as it is built.
 *
 * This module is imported by the tests alone and is in no build.
 */
@Controller('probe')
export class AclProbeController {
  constructor(
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('open')
  @Public()
  open(): { seen: string } {
    return { seen: 'anyone' };
  }

  @Get('any')
  any(@CurrentUser() user: User): { role: string } {
    return { role: user.role };
  }

  @Get('admin')
  @Roles('admin')
  adminOnly(): { ok: boolean } {
    return { ok: true };
  }

  @Get('staff')
  @Roles('admin', 'teacher')
  staff(): { ok: boolean } {
    return { ok: true };
  }

  @Get('classes')
  async classes(@CurrentUser() user: User): Promise<{ codes: string[] }> {
    const rows = await this.prisma.class.findMany({
      where: this.access.classFilter(user),
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    return { codes: rows.map((row) => row.code) };
  }

  @Get('classes/:classId')
  @Roles('admin', 'teacher')
  async ownClass(
    @CurrentUser() user: User,
    @Param('classId') classId: string,
  ): Promise<{ ok: boolean }> {
    await this.access.assertOwnClass(user, classId);
    return { ok: true };
  }

  /** No role named, so a student reaches the class check itself. */
  @Get('open-classes/:classId')
  async anyoneOwnClass(
    @CurrentUser() user: User,
    @Param('classId') classId: string,
  ): Promise<{ ok: boolean }> {
    await this.access.assertOwnClass(user, classId);
    return { ok: true };
  }

  @Get('students/:studentId')
  async ownStudent(
    @CurrentUser() user: User,
    @Param('studentId') studentId: string,
  ): Promise<{ ok: boolean }> {
    await this.access.assertOwnStudent(user, studentId);
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [AclProbeController] })
export class AclProbeModule {}
