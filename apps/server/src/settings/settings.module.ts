import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import { ExitPinService } from './exit-pin.service.js';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, ExitPinService],
})
export class SettingsModule {}
