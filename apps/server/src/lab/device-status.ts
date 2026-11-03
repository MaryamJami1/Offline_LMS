import type { DeviceStatus } from '@lingualab/shared';

/** A PC seen within this long is online. Phase 2's Socket.IO heartbeat keeps it fresh. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function deviceStatus(
  device: { approved: boolean; retiredAt: Date | null; lastSeenAt: Date | null },
  now: Date,
): DeviceStatus {
  if (device.retiredAt !== null) {
    return 'retired';
  }
  if (!device.approved) {
    return 'waiting';
  }
  if (
    device.lastSeenAt !== null &&
    now.getTime() - device.lastSeenAt.getTime() < ONLINE_WINDOW_MS
  ) {
    return 'online';
  }
  return 'offline';
}
