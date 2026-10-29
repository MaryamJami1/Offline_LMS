import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { MeController } from './me.controller.js';
import { JwtAuthGuard } from './jwt.guard.js';
import { AuthService } from './auth.service.js';
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
  providers: [AuthService, TokensService, JwtAuthGuard],
  exports: [TokensService, JwtAuthGuard],
})
export class AuthModule {}
