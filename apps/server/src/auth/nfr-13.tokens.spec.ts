import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { FakeClock } from '../../test/support/fake-clock.js';
import {
  ACCESS_TOKEN_MINUTES,
  STAFF_REFRESH_DAYS,
  STUDENT_REFRESH_MINUTES,
  TokensService,
} from './tokens.service.js';
import { requireJwtSecret } from './jwt-secret.js';

const SECRET = 'test-only-secret-at-least-32-characters';
const OTHER_SECRET = 'another-test-only-secret-at-least-32-chars';

const account = {
  id: '01999999-9999-7999-8999-999999999999',
  role: 'teacher' as const,
  mustChangePassword: false,
};

let clock: FakeClock;
let tokens: TokensService;

function serviceWith(secret: string): TokensService {
  return new TokensService(new JwtService({ secret }), clock);
}

beforeEach(() => {
  clock = new FakeClock();
  tokens = serviceWith(SECRET);
});

describe('NFR-13 access tokens', () => {
  it('carries the account, its role and the first-login flag', () => {
    const token = tokens.signAccessToken(account);

    const claims = tokens.verifyAccessToken(token);
    expect(claims.sub).toBe(account.id);
    expect(claims.role).toBe('teacher');
    expect(claims.mustChangePassword).toBe(false);
  });

  it('lasts fifteen minutes', () => {
    expect(ACCESS_TOKEN_MINUTES).toBe(15);
    const token = tokens.signAccessToken(account);

    clock.advanceMinutes(14);
    expect(tokens.verifyAccessToken(token).sub).toBe(account.id);

    clock.advanceMinutes(2);
    expect(() => tokens.verifyAccessToken(token)).toThrow();
  });

  it('refuses a token signed with another secret', () => {
    const foreign = serviceWith(OTHER_SECRET).signAccessToken(account);

    expect(() => tokens.verifyAccessToken(foreign)).toThrow();
  });

  it('refuses a token whose claims were edited', () => {
    const [header, payload, signature] = tokens.signAccessToken(account).split('.') as [
      string,
      string,
      string,
    ];
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role: string;
    };
    claims.role = 'admin';
    const edited = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');

    expect(() => tokens.verifyAccessToken(`${header}.${edited}.${signature}`)).toThrow();
  });

  it('refuses something that is not a token at all', () => {
    expect(() => tokens.verifyAccessToken('not-a-token')).toThrow();
    expect(() => tokens.verifyAccessToken('')).toThrow();
  });

  it('never carries the password hash', () => {
    const token = tokens.signAccessToken({ ...account, mustChangePassword: true });
    const payload = token.split('.')[1] as string;

    const claims = Buffer.from(payload, 'base64url').toString('utf8');
    expect(claims).not.toMatch(/argon2/i);
    expect(claims).not.toMatch(/passwordHash/i);
  });
});

describe('NFR-13 refresh tokens', () => {
  it('is random, and different every time', () => {
    const first = tokens.createRefreshToken();
    const second = tokens.createRefreshToken();

    expect(first.token).not.toBe(second.token);
    // 32 random bytes, base64url: never guessable by trying.
    expect(first.token.length).toBeGreaterThanOrEqual(43);
  });

  it('is stored as a hash, never as itself', () => {
    const { token, hash } = tokens.createRefreshToken();

    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
    expect(tokens.hashRefreshToken(token)).toBe(hash);
  });

  it('hashes two different tokens to two different hashes', () => {
    const first = tokens.createRefreshToken();
    const second = tokens.createRefreshToken();

    expect(first.hash).not.toBe(second.hash);
  });

  it('lasts seven days for staff', () => {
    expect(STAFF_REFRESH_DAYS).toBe(7);

    const expiry = tokens.refreshExpiryFor('teacher');

    expect(expiry.getTime() - clock.now().getTime()).toBe(STAFF_REFRESH_DAYS * 24 * 60 * 60_000);
    expect(tokens.refreshExpiryFor('admin')).toEqual(expiry);
  });

  it('lasts thirty minutes for a student, so an idle PC cannot refresh', () => {
    expect(STUDENT_REFRESH_MINUTES).toBe(30);

    const expiry = tokens.refreshExpiryFor('student');

    expect(expiry.getTime() - clock.now().getTime()).toBe(STUDENT_REFRESH_MINUTES * 60_000);
  });
});

describe('NFR-13 the signing secret', () => {
  it('is read from the environment', () => {
    expect(requireJwtSecret({ JWT_SECRET: SECRET })).toBe(SECRET);
  });

  it('refuses to start without one, rather than falling back to a default', () => {
    expect(() => requireJwtSecret({})).toThrow(/JWT_SECRET/);
    expect(() => requireJwtSecret({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/);
  });

  it('refuses a secret short enough to guess', () => {
    expect(() => requireJwtSecret({ JWT_SECRET: 'short' })).toThrow(/32/);
  });
});
