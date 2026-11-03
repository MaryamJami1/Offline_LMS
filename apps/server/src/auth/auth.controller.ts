import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
} from '@lingualab/shared';
import type {
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  RefreshRequest,
  RefreshResponse,
} from '@lingualab/shared';
import type { User } from '../generated/prisma/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { DEVICE_KEY_HEADER } from './device-key.service.js';
import { Public } from './roles.decorator.js';
import { CurrentUser } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Headers(DEVICE_KEY_HEADER) deviceKey?: string,
  ): Promise<LoginResponse> {
    return this.auth.login(body, deviceKey);
  }

  @Post('refresh')
  @HttpCode(200)
  @Public()
  async refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
    @Headers(DEVICE_KEY_HEADER) deviceKey?: string,
  ): Promise<RefreshResponse> {
    return this.auth.refresh(body, deviceKey);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(logoutRequestSchema)) body: LogoutRequest,
  ): Promise<void> {
    return this.auth.logout(user, body);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Headers(DEVICE_KEY_HEADER) deviceKey?: string,
  ): Promise<LoginResponse> {
    return this.auth.changePassword(user, body, deviceKey);
  }
}
