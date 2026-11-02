import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator.js';
import type { AuthenticatedRequest } from './jwt.guard.js';
import type { Role } from '../generated/prisma/index.js';

/**
 * Checks the role of the account the authentication guard has already loaded
 * against the roles the route names. Ownership — a teacher's own classes, a
 * student's own data — needs the record itself and lives in AccessService.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user === undefined) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
    }

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // A route that names no role is open to everyone who is logged in.
    if (allowed === undefined || allowed.includes(user.role)) {
      return true;
    }

    // The message says nothing about which role would have been allowed: an
    // account learns what it may do, not how the institute is organised.
    throw new AppError(403, 'FORBIDDEN', 'This account may not do that');
  }
}
