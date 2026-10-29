import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { ExecutionContext } from '@nestjs/common';
import { FakeClock } from '../../test/support/fake-clock.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { User } from '../generated/prisma/index.js';
import { AppError } from '../common/app-error.js';
import { JwtAuthGuard } from './jwt.guard.js';
import { TokensService } from './tokens.service.js';

const SECRET = 'test-only-secret-at-least-32-characters';

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

let clock: FakeClock;
let tokens: TokensService;
let stored: User;

/** A request as the guard sees it, with only what the guard reads. */
function contextFor(path: string, authorization?: string): ExecutionContext {
  const request: { path: string; headers: Record<string, string>; user?: User } = {
    path,
    headers: authorization === undefined ? {} : { authorization },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard(): JwtAuthGuard {
  const prisma = {
    user: { findUnique: async () => stored },
  } as unknown as PrismaService;
  return new JwtAuthGuard(tokens, prisma);
}

function bearerFor(user: User): string {
  return `Bearer ${tokens.signAccessToken(user)}`;
}

beforeEach(() => {
  clock = new FakeClock();
  tokens = new TokensService(new JwtService({ secret: SECRET }), clock);
  stored = { ...account };
});

describe('NFR-13 the authentication guard', () => {
  it('lets a signed token through', async () => {
    await expect(guard().canActivate(contextFor('/api/me', bearerFor(account)))).resolves.toBe(
      true,
    );
  });

  it('refuses a request with no Authorization header', async () => {
    await expect(guard().canActivate(contextFor('/api/me'))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('refuses an Authorization header that is not a bearer token', async () => {
    await expect(
      guard().canActivate(contextFor('/api/me', 'Basic c2FyYTpzZWNyZXQ=')),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuses a token it cannot verify', async () => {
    await expect(
      guard().canActivate(contextFor('/api/me', 'Bearer not-a-token')),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('refuses a token whose account is gone', async () => {
    const prisma = { user: { findUnique: async () => null } } as unknown as PrismaService;

    await expect(
      new JwtAuthGuard(tokens, prisma).canActivate(contextFor('/api/me', bearerFor(account))),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('refuses a deactivated account even while its token is still valid', async () => {
    stored = { ...account, status: 'inactive' };

    await expect(
      guard().canActivate(contextFor('/api/me', bearerFor(account))),
    ).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
  });
});

describe('NFR-13 an account that must change its password', () => {
  beforeEach(() => {
    stored = { ...account, mustChangePassword: true };
  });

  it('may see itself, change its password and log out', async () => {
    for (const path of ['/api/me', '/api/auth/change-password', '/api/auth/logout']) {
      await expect(guard().canActivate(contextFor(path, bearerFor(stored)))).resolves.toBe(true);
    }
  });

  it('is refused everywhere else, not merely shown a different screen', async () => {
    await expect(
      guard().canActivate(contextFor('/api/classes', bearerFor(stored))),
    ).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it('is refused with the documented error shape', async () => {
    const refusal = await guard()
      .canActivate(contextFor('/api/users', bearerFor(stored)))
      .catch((error: unknown) => error as AppError);

    expect(refusal).toBeInstanceOf(AppError);
    expect((refusal as AppError).getStatus()).toBe(403);
  });
});
