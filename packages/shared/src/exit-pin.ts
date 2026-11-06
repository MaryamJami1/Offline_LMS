import { z } from 'zod';

/**
 * The admin PIN that closes the student app (STU-06). It is stored hashed on
 * the server and only ever checked there; a lab PC never holds it, so a short
 * PIN cannot be tried offline (docs/docs/06-security-and-data.md).
 */

/** Exactly six digits, 0 to 9. */
export const exitPinSchema = z.string().regex(/^[0-9]{6}$/, 'Use six digits');

/** Wrong PINs a lab PC may send before it has to wait. */
export const EXIT_PIN_TRIES = 5;

/** How long a lab PC waits after its last allowed wrong PIN. */
export const EXIT_PIN_LOCK_MINUTES = 15;

/** `POST /devices/exit`, with the PC's `X-Device-Key`. */
export const deviceExitRequestSchema = z.strictObject({
  pin: exitPinSchema,
});

/** `PUT /settings/exit-pin`: the admin types their own password again. */
export const changeExitPinRequestSchema = z.strictObject({
  currentPassword: z.string().min(1),
  pin: exitPinSchema,
});

/**
 * `GET /settings/exit-pin`: whether the seeded PIN is still the one in use,
 * for "Needs attention" on the dashboard (A-01). Never the PIN or its hash.
 */
export const exitPinStatusSchema = z.strictObject({
  mustChange: z.boolean(),
  changedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type DeviceExitRequest = z.infer<typeof deviceExitRequestSchema>;
export type ChangeExitPinRequest = z.infer<typeof changeExitPinRequestSchema>;
export type ExitPinStatus = z.infer<typeof exitPinStatusSchema>;
