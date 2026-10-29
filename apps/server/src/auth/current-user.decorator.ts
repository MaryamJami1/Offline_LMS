import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { User } from '../generated/prisma/index.js';
import type { AuthenticatedRequest } from './jwt.guard.js';

/** The account the guard has already loaded and checked for this request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (user === undefined) {
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return user;
  },
);
