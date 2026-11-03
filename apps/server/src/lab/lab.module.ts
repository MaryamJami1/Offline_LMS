import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LabsController } from './labs.controller.js';
import { LabsService } from './labs.service.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

/** Labs, seat maps and lab PCs (ADM-04). */
@Module({
  imports: [AuthModule],
  controllers: [LabsController, DevicesController],
  providers: [LabsService, DevicesService],
})
export class LabModule {}
