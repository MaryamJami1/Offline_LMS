import { SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/index.js';

export const ROLES_KEY = 'lingualab:roles';
export const PUBLIC_KEY = 'lingualab:public';

/**
 * The roles that may reach this route. Without it a route is open to any
 * logged-in account, which is what `/me` and the auth endpoints want; it is
 * never open to nobody, because the guards deny by default
 * (docs/docs/06-security-and-data.md, Roles and permissions).
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Lets a route answer with nobody logged in. Only three need it: logging in,
 * refreshing a token, and the health check the lab PCs read.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
