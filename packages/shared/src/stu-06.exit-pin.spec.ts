import { describe, it, expect } from 'vitest';
import {
  EXIT_PIN_LOCK_MINUTES,
  EXIT_PIN_TRIES,
  changeExitPinRequestSchema,
  deviceExitRequestSchema,
  exitPinSchema,
  exitPinStatusSchema,
} from './exit-pin.js';

/**
 * STU-06: the student app closes only with the admin PIN. The admin sets it
 * (ADM-07), the lab PC sends it, and the server checks it; these are the
 * shapes both sides agree on.
 */

describe('STU-06 the exit PIN', () => {
  it('is six digits', () => {
    expect(exitPinSchema.safeParse('204816').success).toBe(true);
  });

  it('refuses fewer or more than six digits, letters and spaces', () => {
    for (const pin of ['', '20481', '2048163', '20481a', ' 204816', '20 4816', '٢٠٤٨١٦']) {
      expect(exitPinSchema.safeParse(pin).success, pin).toBe(false);
    }
  });

  it('allows five tries before a fifteen-minute lockout', () => {
    expect(EXIT_PIN_TRIES).toBe(5);
    expect(EXIT_PIN_LOCK_MINUTES).toBe(15);
  });

  it('is sent by the lab PC on its own', () => {
    expect(deviceExitRequestSchema.parse({ pin: '204816' })).toEqual({ pin: '204816' });
    expect(deviceExitRequestSchema.safeParse({ pin: '204816', deviceKey: 'k' }).success).toBe(
      false,
    );
  });

  it('is changed by the admin with their own password typed again', () => {
    expect(
      changeExitPinRequestSchema.parse({ currentPassword: 'Karachi-2026', pin: '204816' }),
    ).toEqual({ currentPassword: 'Karachi-2026', pin: '204816' });
    expect(changeExitPinRequestSchema.safeParse({ pin: '204816' }).success).toBe(false);
    expect(
      changeExitPinRequestSchema.safeParse({ currentPassword: 'Karachi-2026', pin: '1234' })
        .success,
    ).toBe(false);
  });

  it('tells the admin whether the seeded PIN is still in use, and never the PIN', () => {
    expect(exitPinStatusSchema.parse({ mustChange: true, changedAt: null })).toEqual({
      mustChange: true,
      changedAt: null,
    });
    expect(
      exitPinStatusSchema.parse({ mustChange: false, changedAt: '2026-11-06T09:00:00.000Z' }),
    ).toEqual({ mustChange: false, changedAt: '2026-11-06T09:00:00.000Z' });
    expect(
      exitPinStatusSchema.safeParse({ mustChange: false, changedAt: null, pin: '204816' }).success,
    ).toBe(false);
  });
});
