import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { createLabRequestSchema, updateLabRequestSchema } from '@lingualab/shared';
import type {
  CreateLabRequest,
  Items,
  LabSeatsResponse,
  LabView,
  UpdateLabRequest,
} from '@lingualab/shared';
import type { User } from '../generated/prisma/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { LabsService } from './labs.service.js';

const idPipe = new ZodValidationPipe(z.uuid());

/**
 * Labs and seat maps (docs/docs/04-api-and-events.md, Lab, devices and
 * sessions). Managing them is the admin's; every teacher may see the seats.
 */
@Controller('labs')
@Roles('admin')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  async list(): Promise<Items<LabView>> {
    return this.labs.list();
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createLabRequestSchema)) body: CreateLabRequest,
  ): Promise<LabView> {
    return this.labs.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateLabRequestSchema)) body: UpdateLabRequest,
  ): Promise<LabView> {
    return this.labs.update(id, body);
  }

  @Get(':id/seats')
  @Roles('admin', 'teacher')
  async seats(
    @CurrentUser() user: User,
    @Param('id', idPipe) id: string,
  ): Promise<LabSeatsResponse> {
    return this.labs.seats(id, user);
  }
}
