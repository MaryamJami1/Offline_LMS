import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import type { HttpRequest } from '../common/http.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokensService } from './tokens.service.js';
import { PUBLIC_KEY } from './roles.decorator.js';
import type { User } from '../generated/prisma/index.js';

/**
 * What an account may still do before it has changed its first password: see
 * itself, change the password, and log out. Everything else waits, enforced
 * here rather than by the app hiding a screen (docs/docs/06-security-and-data.md).
 */
const ALLOWED_BEFORE_PASSWORD_CHANGE = ['/me', '/auth/change-password', '/auth/logout'];

export interface AuthenticatedRequest extends HttpRequest {
  user?: User;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Three routes answer with nobody logged in: logging in, refreshing a
    // token, and the health check. Every other route needs an account,
    // whether or not it remembered to ask (docs/docs/06-security-and-data.md).
    const open = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (open === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
    }

    let subject: string;
    try {
      subject = this.tokens.verifyAccessToken(header.slice('Bearer '.length)).sub;
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'This login has ended. Please log in again.');
    }

    // Read on every request, so deactivating an account takes effect at once
    // instead of when its access token runs out.
    const user = await this.prisma.user.findUnique({ where: { id: subject } });
    if (user === null) {
      throw new AppError(401, 'INVALID_TOKEN', 'This login has ended. Please log in again.');
    }
    if (user.status === 'inactive') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated');
    }
    if (user.mustChangePassword && !this.isAllowedBeforePasswordChange(request.path)) {
      throw new AppError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Please change your password before you carry on',
      );
    }

    request.user = user;
    return true;
  }

  private isAllowedBeforePasswordChange(path: string): boolean {
    return ALLOWED_BEFORE_PASSWORD_CHANGE.some((allowed) => path.endsWith(allowed));
  }
}
