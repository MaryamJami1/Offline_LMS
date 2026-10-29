import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MeResponse } from '@lingualab/shared';
import type { User } from '../generated/prisma/index.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt.guard.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  async me(@CurrentUser() user: User): Promise<MeResponse> {
    return this.auth.describe(user);
  }
}
