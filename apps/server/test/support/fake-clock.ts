import type { Clock } from '../../src/common/clock.js';

/**
 * A clock the tests move by hand, so lockout windows and token lifetimes are
 * checked by advancing time instead of waiting for it.
 */
export class FakeClock implements Clock {
  constructor(private current: Date = new Date('2026-10-29T09:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  advanceDays(days: number): void {
    this.advanceMinutes(days * 24 * 60);
  }

  set(moment: Date): void {
    this.current = new Date(moment);
  }
}
