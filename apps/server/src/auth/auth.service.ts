import { Injectable } from '@nestjs/common';
import type {
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  MeResponse,
  RefreshRequest,
  RefreshResponse,
} from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/app-error.js';
import { hashPassword, verifyPassword } from './password.js';
import { TokensService } from './tokens.service.js';
import type { User } from '../generated/prisma/index.js';

/** docs/docs/06-security-and-data.md: five wrong attempts, ten minutes. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 10;

/**
 * One answer for a wrong password and for an account that does not exist, so
 * the login form cannot be used to find out which student IDs are real.
 */
function invalidCredentials(): AppError {
  return new AppError(401, 'INVALID_CREDENTIALS', 'The username or password is wrong');
}

/** Every dead refresh token answers the same, whatever killed it. */
function invalidToken(): AppError {
  return new AppError(401, 'INVALID_TOKEN', 'This login has ended. Please log in again.');
}

function accountLocked(unlocksAt: Date): AppError {
  return new AppError(
    403,
    'ACCOUNT_LOCKED',
    `Too many wrong passwords. Try again after ${LOCK_MINUTES} minutes.`,
    { unlocksAt: unlocksAt.toISOString() },
  );
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly clock: Clock,
  ) {}

  async login({ username, password }: LoginRequest): Promise<LoginResponse> {
    // Student IDs are unique without regard to case, so S-1001 and s-1001 are
    // the same account and either spelling may be typed at the seat.
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (user === null) {
      throw invalidCredentials();
    }
    if (user.status === 'inactive') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated');
    }

    const now = this.clock.now();
    if (user.lockedUntil !== null && user.lockedUntil > now) {
      throw accountLocked(user.lockedUntil);
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      throw await this.recordFailure(user, now);
    }

    return this.issueTokens(user);
  }

  /**
   * Counts a wrong password and locks the account at the fifth one. A lock that
   * has passed starts the count again, so an old lock cannot shut an account
   * out on its first mistake.
   */
  private async recordFailure(user: User, now: Date): Promise<AppError> {
    const previous = user.lockedUntil === null ? user.failedLoginAttempts : 0;
    const attempts = previous + 1;

    if (attempts < MAX_FAILED_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil: null },
      });
      return invalidCredentials();
    }

    const unlocksAt = new Date(now.getTime() + LOCK_MINUTES * 60_000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: unlocksAt },
    });
    return accountLocked(unlocksAt);
  }

  /**
   * Trades a refresh token for a new pair and retires the one it was given, so
   * a token that was copied off a lab PC is good at most once (NFR-13). Using
   * one twice ends every login of that account.
   */
  async refresh({ refreshToken }: RefreshRequest): Promise<RefreshResponse> {
    const now = this.clock.now();
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
      include: { user: true },
    });
    if (stored === null) {
      throw invalidToken();
    }
    // A token offered a second time means the server can no longer tell the
    // real app from whoever copied the token, because rotation gave each of
    // them half of the same chain. Both are ended and the person logs in
    // again. A token that merely ran out of time is not a replay.
    if (stored.revokedAt !== null) {
      await this.endEveryLogin(stored.userId, now);
      throw invalidToken();
    }
    if (stored.expiresAt <= now) {
      throw invalidToken();
    }
    if (stored.user.status === 'inactive') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated');
    }

    const replacement = this.tokens.createRefreshToken();
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: now } }),
      this.prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          deviceId: stored.deviceId,
          tokenHash: replacement.hash,
          expiresAt: this.tokens.refreshExpiryFor(stored.user.role),
        },
      }),
    ]);

    return {
      accessToken: this.tokens.signAccessToken(stored.user),
      refreshToken: replacement.token,
    };
  }

  /**
   * Ends one login: the refresh token is revoked and the seat it was using is
   * freed. A token this server never issued is simply nothing to end, so the
   * answer is the same either way; a token belonging to somebody else is not.
   */
  async logout(user: User, { refreshToken }: LogoutRequest): Promise<void> {
    const now = this.clock.now();
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
    });
    if (stored === null) {
      return;
    }
    if (stored.userId !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'That login belongs to another account');
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.deviceLogin.updateMany({
        where: { studentId: user.id, loggedOutAt: null },
        data: { loggedOutAt: now, logoutReason: 'manual' },
      }),
    ]);
  }

  /**
   * Changes own password and ends every login of that account, this one
   * included, then hands back a fresh pair so the app can carry on while any
   * other PC has to log in again.
   */
  async changePassword(
    user: User,
    { currentPassword, newPassword }: ChangePasswordRequest,
  ): Promise<LoginResponse> {
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw invalidCredentials();
    }

    // Hashing takes long enough that it is done before the transaction opens.
    const passwordHash = await hashPassword(newPassword);
    const now = this.clock.now();

    const [, updated] = await this.prisma.$transaction([
      this.endEveryLogin(user.id, now),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
    ]);

    return this.issueTokens(updated);
  }

  /**
   * Revokes every refresh token the account still has, so every PC it is
   * logged in at has to log in again. Returned rather than awaited so it can
   * also go inside a transaction.
   */
  private endEveryLogin(userId: string, now: Date) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Own profile and the seat they are sitting at now, if any. */
  async describe(user: User): Promise<MeResponse> {
    const login = await this.prisma.deviceLogin.findFirst({
      where: { studentId: user.id, loggedOutAt: null },
      include: { seat: { include: { labRoom: true } } },
    });

    return {
      user: toAuthUser(user),
      seat:
        login === null ? null : { seatCode: login.seat.code, labRoomName: login.seat.labRoom.name },
    };
  }

  private async issueTokens(user: User): Promise<LoginResponse> {
    const refresh = this.tokens.createRefreshToken();
    const now = this.clock.now();

    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: refresh.hash,
          expiresAt: this.tokens.refreshExpiryFor(user.role),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        // A good password clears whatever wrong ones came before it.
        data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
      }),
    ]);

    return {
      accessToken: this.tokens.signAccessToken(user),
      refreshToken: refresh.token,
      user: toAuthUser(user),
    };
  }
}
