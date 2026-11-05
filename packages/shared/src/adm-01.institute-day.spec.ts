import { describe, it, expect } from 'vitest';
import { INSTITUTE_TIME_ZONE, startOfInstituteDay } from './time.js';

/**
 * ADM-01, "today's seat" on the Students screen: the server stores UTC and the
 * apps show Asia/Karachi time (04, Conventions), so "today" starts at midnight
 * in Karachi, five hours before midnight UTC.
 */
describe('ADM-01 the institute day', () => {
  it('is Karachi time', () => {
    expect(INSTITUTE_TIME_ZONE).toBe('Asia/Karachi');
  });

  it('starts at midnight in Karachi, which is 19:00 UTC the day before', () => {
    expect(startOfInstituteDay(new Date('2026-11-02T09:00:00.000Z')).toISOString()).toBe(
      '2026-11-01T19:00:00.000Z',
    );
  });

  it('has already turned over at 00:30 in Karachi, while it is still the day before in UTC', () => {
    expect(startOfInstituteDay(new Date('2026-11-01T19:30:00.000Z')).toISOString()).toBe(
      '2026-11-01T19:00:00.000Z',
    );
  });

  it('is still the day before at 23:59:59.999 in Karachi', () => {
    expect(startOfInstituteDay(new Date('2026-11-01T18:59:59.999Z')).toISOString()).toBe(
      '2026-10-31T19:00:00.000Z',
    );
  });

  it('starts exactly at midnight', () => {
    expect(startOfInstituteDay(new Date('2026-11-01T19:00:00.000Z')).toISOString()).toBe(
      '2026-11-01T19:00:00.000Z',
    );
  });
});
