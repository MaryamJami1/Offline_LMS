import { INSTITUTE_TIME_ZONE } from '@lingualab/shared';
import { ApiError } from '../api/client.js';

/** Times are shown in the institute's time, whatever the browser's (04). */
const timeOfDayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTITUTE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dayAndTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTITUTE_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 14:15 */
export function timeOfDay(iso: string): string {
  return timeOfDayFormat.format(new Date(iso));
}

/** "Just now" within two minutes, the time a PC counts as online (04); otherwise "4 Nov, 16:42". */
export function whenSeen(iso: string | null, now: Date = new Date()): string {
  if (iso === null) {
    return 'Never';
  }
  const at = new Date(iso);
  if (now.getTime() - at.getTime() < 2 * 60 * 1000) {
    return 'Just now';
  }
  return dayAndTimeFormat.format(at);
}

/** What to tell the admin when a call fails. */
export function problemOf(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'The server cannot be reached. Check the network and try again.';
}
