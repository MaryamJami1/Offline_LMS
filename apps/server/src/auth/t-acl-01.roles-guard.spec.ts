import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Role, User } from '../generated/prisma/index.js';
import { AppError } from '../common/app-error.js';
import { Public, Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

/** Stands in for the controller class whose metadata a guard reads. */
class ProbeController {
  handle(): void {}
}

const account: User = {
  id: '01999999-9999-7999-8999-999999999999',
  role: 'student',
  username: 'S-1001',
  passwordHash: '$argon2id$never-leaves-the-server',
  fullName: 'Ayesha Khan',
  phone: null,
  status: 'active',
  mustChangePassword: false,
  lastLoginAt: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
};

/**
 * A request as the guard sees it: the account the authentication guard has
 * already put on it, and the handler whose decorators it has to read.
 */
function contextFor(handler: () => void, role?: Role): ExecutionContext {
  const user = role === undefined ? undefined : { ...account, role };
  return {
    switchToHttp: () => ({ getRequest: () => ({ path: '/api/probe', user }) }),
    getHandler: () => handler,
    getClass: () => ProbeController,
  } as unknown as ExecutionContext;
}

function guard(): RolesGuard {
  return new RolesGuard(new Reflector());
}

/** A handler carrying the decorators under test, as a controller would. */
function handlerWith(...decorators: MethodDecorator[]): () => void {
  class Probe {
    handle(): void {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(Probe.prototype, 'handle');
  for (const decorate of decorators) {
    decorate(Probe.prototype, 'handle', descriptor as PropertyDescriptor);
  }
  return Probe.prototype.handle;
}

describe('T-ACL-01 the role guard', () => {
  it('lets any logged-in account through a route that names no role', async () => {
    const open = handlerWith();

    for (const role of ['admin', 'teacher', 'student'] as Role[]) {
      await expect(guard().canActivate(contextFor(open, role))).resolves.toBe(true);
    }
  });

  it('lets the named role through', async () => {
    const adminOnly = handlerWith(Roles('admin'));

    await expect(guard().canActivate(contextFor(adminOnly, 'admin'))).resolves.toBe(true);
  });

  it('refuses every role the route does not name', async () => {
    const adminOnly = handlerWith(Roles('admin'));

    for (const role of ['teacher', 'student'] as Role[]) {
      await expect(guard().canActivate(contextFor(adminOnly, role))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });

  it('accepts any one of several named roles', async () => {
    const staff = handlerWith(Roles('admin', 'teacher'));

    await expect(guard().canActivate(contextFor(staff, 'admin'))).resolves.toBe(true);
    await expect(guard().canActivate(contextFor(staff, 'teacher'))).resolves.toBe(true);
    await expect(guard().canActivate(contextFor(staff, 'student'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses with the documented shape, not a bare 500', async () => {
    const refusal = await guard()
      .canActivate(contextFor(handlerWith(Roles('admin')), 'student'))
      .catch((error: unknown) => error as AppError);

    expect(refusal).toBeInstanceOf(AppError);
    expect((refusal as AppError).getStatus()).toBe(403);
  });

  it('says only that the account may not do this, never which role could', async () => {
    const refusal = await guard()
      .canActivate(contextFor(handlerWith(Roles('admin')), 'student'))
      .catch((error: unknown) => error as AppError);

    expect((refusal as AppError).message).not.toMatch(/admin/i);
    expect(JSON.stringify((refusal as AppError).details)).not.toMatch(/admin/i);
  });

  it('lets a public route through with nobody logged in', async () => {
    const open = handlerWith(Public());

    await expect(guard().canActivate(contextFor(open))).resolves.toBe(true);
  });

  it('refuses a route that names a role when nobody is logged in', async () => {
    const adminOnly = handlerWith(Roles('admin'));

    await expect(guard().canActivate(contextFor(adminOnly))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
