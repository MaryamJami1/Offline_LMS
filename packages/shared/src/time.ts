/**
 * The server stores UTC and the apps show the institute's time (04,
 * Conventions). "Today" on any screen is the institute's day.
 */
export const INSTITUTE_TIME_ZONE = 'Asia/Karachi';

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTITUTE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Midnight of the institute's day that `now` falls in, as an instant. */
export function startOfInstituteDay(now: Date): Date {
  const parts = clock.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const intoTheDay =
    ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000 + now.getUTCMilliseconds();
  return new Date(now.getTime() - intoTheDay);
}
