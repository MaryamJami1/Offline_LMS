import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Clock } from '../../src/common/clock.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { hashPassword } from '../../src/auth/password.js';
import type { PrismaClient, Role } from '../../src/generated/prisma/index.js';
import { FakeClock } from './fake-clock.js';

export interface AuthTestApp {
  app: INestApplication;
  prisma: PrismaClient;
  clock: FakeClock;
}

/**
 * The real application, wired exactly as main.ts wires it, with the clock
 * replaced so lockout windows and token lifetimes can be advanced by hand.
 */
export async function createAuthTestApp(): Promise<AuthTestApp> {
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService), clock };
}

export interface SeededAccount {
  id: string;
  username: string;
  password: string;
}

/** The first password every test account is created with. */
export const TEST_PASSWORD = 'Lab-2026-test';

let cachedHash: string | undefined;

async function testPasswordHash(): Promise<string> {
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  return cachedHash;
}

export async function createAccount(
  prisma: PrismaClient,
  options: {
    username: string;
    role: Role;
    fullName?: string;
    mustChangePassword?: boolean;
    status?: 'active' | 'inactive';
  },
): Promise<SeededAccount> {
  const user = await prisma.user.create({
    data: {
      role: options.role,
      username: options.username,
      passwordHash: await testPasswordHash(),
      fullName: options.fullName ?? 'Test Account',
      mustChangePassword: options.mustChangePassword ?? false,
      status: options.status ?? 'active',
    },
  });
  return { id: user.id, username: user.username, password: TEST_PASSWORD };
}
