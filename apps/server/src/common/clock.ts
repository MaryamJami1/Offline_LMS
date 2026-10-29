import { Injectable } from '@nestjs/common';

/**
 * The current time, injected rather than read from the global clock, so lockout
 * windows and token lifetimes can be tested by advancing time.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
