import { Controller, Get } from '@nestjs/common';
import type { MeResponse } from '@lingualab/shared';
import type { User } from '../generated/prisma/index.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';

@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  async me(@CurrentUser() user: User): Promise<MeResponse> {
    return this.auth.describe(user);
  }
}
