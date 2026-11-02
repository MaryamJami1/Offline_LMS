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
import { DeviceKeyService } from './device-key.service.js';
import { REFRESH_GRACE_SECONDS, TokensService } from './tokens.service.js';
import type { RefreshToken, User } from '../generated/prisma/index.js';

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
    private readonly deviceKeys: DeviceKeyService,
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
  async refresh({ refreshToken }: RefreshRequest, deviceKey?: string): Promise<RefreshResponse> {
    const now = this.clock.now();
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
      include: { user: true, replacedBy: true },
    });
    if (stored === null) {
      throw invalidToken();
    }

    if (stored.revokedAt !== null) {
      // The app's own retry after a dropped reply carries on from the token it
      // never received. Anything else offered twice means the server can no
      // longer tell the real app from whoever copied the token, because
      // rotation gave each of them half of the same chain, so both are ended.
      const unreceived = await this.lostAnswerFor(stored, now, deviceKey);
      if (unreceived !== null) {
        return this.rotate(unreceived, stored.user, now);
      }
      await this.endEveryLogin(stored.userId, now);
      throw invalidToken();
    }

    // A token that merely ran out of time is not a replay and ends nothing.
    if (stored.expiresAt <= now) {
      throw invalidToken();
    }
    if (stored.user.status === 'inactive') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated');
    }

    return this.rotate(stored, stored.user, now);
  }

  /**
   * The replacement a retried refresh should carry on from: the token this one
   * was rotated into, when it was issued to a PC that is presenting its own
   * device key, within the grace window, and nobody has used it yet. Null in
   * every other case, a token revoked by logging out among them, which has no
   * replacement at all.
   */
  private async lostAnswerFor(
    stored: RefreshToken & { user: User; replacedBy: RefreshToken | null },
    now: Date,
    deviceKey: string | undefined,
  ): Promise<RefreshToken | null> {
    const unreceived = stored.replacedBy;
    if (stored.revokedAt === null || unreceived === null) {
      return null;
    }
    if (unreceived.revokedAt !== null || unreceived.replacedById !== null) {
      return null;
    }
    if (unreceived.expiresAt <= now || stored.user.status === 'inactive') {
      return null;
    }
    if (now.getTime() - stored.revokedAt.getTime() > REFRESH_GRACE_SECONDS * 1000) {
      return null;
    }
    // Until STU-01 records the PC a student logged in at, no token has a
    // device of its own and the window is shut to every one of them.
    if (stored.deviceId === null) {
      return null;
    }
    return (await this.deviceKeys.resolveDevice(deviceKey)) === stored.deviceId ? unreceived : null;
  }

  /**
   * Retires one refresh token and issues its replacement, keeping the link
   * between the two so a retry can be told from a replay.
   */
  private async rotate(current: RefreshToken, user: User, now: Date): Promise<RefreshResponse> {
    const replacement = this.tokens.createRefreshToken();

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          deviceId: current.deviceId,
          tokenHash: replacement.hash,
          expiresAt: this.tokens.refreshExpiryFor(user.role),
        },
      });
      await tx.refreshToken.update({
        where: { id: current.id },
        data: { revokedAt: now, replacedById: created.id },
      });
    });

    return {
      accessToken: this.tokens.signAccessToken(user),
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
