import { describe, it, expect } from 'vitest';
import { resetPasswordResponseSchema } from './users.js';

/**
 * ADM-11: the answer to a password reset carries the new first-login password
 * once, with what the teacher needs to write the slip, and nothing else about
 * the account.
 */
describe('ADM-11 the reset-password answer', () => {
  const answer = {
    id: '0190f5a0-0000-7000-8000-000000000001',
    username: 'S-1001',
    fullName: 'Ayesha Khan',
    generatedPassword: 'Kp7mQx2vRt',
  };

  it('accepts the account and its new password', () => {
    expect(resetPasswordResponseSchema.parse(answer)).toEqual(answer);
  });

  it('always has a password, since that is the point of the answer', () => {
    expect(
      resetPasswordResponseSchema.safeParse({ ...answer, generatedPassword: null }).success,
    ).toBe(false);
  });

  it('carries nothing else about the account', () => {
    expect(resetPasswordResponseSchema.safeParse({ ...answer, phone: '03001234567' }).success).toBe(
      false,
    );
  });
});
