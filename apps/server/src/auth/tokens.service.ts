import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Clock } from '../common/clock.js';
import type { Role } from '../generated/prisma/index.js';

/** docs/docs/06-security-and-data.md: access token 15 minutes, JWT. */
export const ACCESS_TOKEN_MINUTES = 15;

/** Staff stay logged in for a week. */
export const STAFF_REFRESH_DAYS = 7;

/**
 * A student's token dies 30 minutes after it was last used, so a PC left alone
 * cannot refresh itself back to life (STU-07). Logout and End class revoke it
 * sooner.
 */
export const STUDENT_REFRESH_MINUTES = 30;

/** 256 bits of randomness: a refresh token is never guessed, only stolen. */
const REFRESH_TOKEN_BYTES = 32;

export interface AccessTokenSubject {
  id: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  mustChangePassword: boolean;
  iat: number;
  exp: number;
}

export interface NewRefreshToken {
  /** Given to the app once, and never stored. */
  token: string;
  /** What the server keeps in refresh_tokens.token_hash. */
  hash: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly clock: Clock,
  ) {}

  signAccessToken(subject: AccessTokenSubject): string {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    return this.jwt.sign({
      sub: subject.id,
      role: subject.role,
      mustChangePassword: subject.mustChangePassword,
      iat: issuedAt,
      exp: issuedAt + ACCESS_TOKEN_MINUTES * 60,
    });
  }

  /** Throws when the token is unsigned, edited, expired or not a token at all. */
  verifyAccessToken(token: string): AccessTokenClaims {
    return this.jwt.verify<AccessTokenClaims>(token, {
      clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
    });
  }

  createRefreshToken(): NewRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  /**
   * SHA-256, not Argon2id: a 256-bit random token needs no slow hashing, and
   * refresh happens on every lab PC. What matters is that the database never
   * holds anything that can be replayed.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiryFor(role: Role): Date {
    const minutes = role === 'student' ? STUDENT_REFRESH_MINUTES : STAFF_REFRESH_DAYS * 24 * 60;
    return new Date(this.clock.now().getTime() + minutes * 60_000);
  }
}
