import { Body, Controller, Get, Put } from '@nestjs/common';
import { changeExitPinRequestSchema } from '@lingualab/shared';
import type { Branding, ChangeExitPinRequest, ExitPinStatus } from '@lingualab/shared';
import type { User } from '../generated/prisma/index.js';
import { Public, Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ClientIp } from '../common/client-ip.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';
import { ExitPinService } from './exit-pin.service.js';

/** Settings (docs/docs/04-api-and-events.md, Reports and system). */
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly exitPin: ExitPinService,
  ) {}

  /** Public: the login screens show the name and logo before anyone logs in. */
  @Get('branding')
  @Public()
  async branding(): Promise<Branding> {
    return this.settings.branding();
  }

  /** Whether the seeded exit PIN must still be changed (A-01). Never the PIN. */
  @Get('exit-pin')
  @Roles('admin')
  async exitPinStatus(): Promise<ExitPinStatus> {
    return this.exitPin.status();
  }

  @Put('exit-pin')
  @Roles('admin')
  async changeExitPin(
    @CurrentUser() admin: User,
    @Body(new ZodValidationPipe(changeExitPinRequestSchema)) body: ChangeExitPinRequest,
    @ClientIp() ip: string,
  ): Promise<ExitPinStatus> {
    return this.exitPin.change(admin, body, ip);
  }
}
