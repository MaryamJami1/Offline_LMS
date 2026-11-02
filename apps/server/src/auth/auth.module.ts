import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { MeController } from './me.controller.js';
import { JwtAuthGuard } from './jwt.guard.js';
import { RolesGuard } from './roles.guard.js';
import { AccessService } from './access.service.js';
import { AuthService } from './auth.service.js';
import { DeviceKeyService } from './device-key.service.js';
import { TokensService } from './tokens.service.js';
import { requireJwtSecret } from './jwt-secret.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      // Read when the module starts, not when the file is imported, so a
      // missing secret stops the server with a clear error.
      useFactory: () => ({ secret: requireJwtSecret() }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    AccessService,
    DeviceKeyService,
    TokensService,
    JwtAuthGuard,
    RolesGuard,
    // Order matters: the account is loaded first, then its role is checked.
    // Registering them here means a new endpoint is protected because
    // nobody did anything, rather than because somebody remembered.
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
  exports: [AccessService, DeviceKeyService, TokensService, JwtAuthGuard],
})
export class AuthModule {}
