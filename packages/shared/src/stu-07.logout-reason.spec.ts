import { describe, it, expect } from 'vitest';
import { logoutRequestSchema } from './auth.js';

/**
 * STU-07: a student is logged out by hand or after 30 idle minutes, and
 * `device_logins.logout_reason` says which. End class (`class_end`) is the
 * server's to record with LAB-03, so an app cannot claim it.
 */

describe('STU-07 the logout request', () => {
  it('is a manual logout when no reason is given', () => {
    expect(logoutRequestSchema.parse({ refreshToken: 'r' })).toEqual({ refreshToken: 'r' });
  });

  it('may say the student was idle', () => {
    expect(logoutRequestSchema.parse({ refreshToken: 'r', reason: 'idle' }).reason).toBe('idle');
    expect(logoutRequestSchema.parse({ refreshToken: 'r', reason: 'manual' }).reason).toBe(
      'manual',
    );
  });

  it('refuses the reasons only the server records', () => {
    for (const reason of ['class_end', 'admin', 'replaced', 'revoked', 'bored']) {
      expect(logoutRequestSchema.safeParse({ refreshToken: 'r', reason }).success, reason).toBe(
        false,
      );
    }
  });
});
