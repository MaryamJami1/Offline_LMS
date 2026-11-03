import { Controller, Get } from '@nestjs/common';
import type { Branding } from '@lingualab/shared';
import { Public } from '../auth/roles.decorator.js';
import { SettingsService } from './settings.service.js';

/** Settings (docs/docs/04-api-and-events.md, Reports and system). */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public: the login screens show the name and logo before anyone logs in. */
  @Get('branding')
  @Public()
  async branding(): Promise<Branding> {
    return this.settings.branding();
  }
}
