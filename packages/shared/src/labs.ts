import { z } from 'zod';

/**
 * Labs, seat maps and lab PCs (ADM-04), per docs/docs/04-api-and-events.md,
 * Lab, devices and sessions, and the device trust steps in
 * docs/docs/06-security-and-data.md.
 */

/** Row letters run A to Z. */
export const MAX_LAB_ROWS = 26;
export const MAX_SEATS_PER_ROW = 20;

const labNameSchema = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Enter a name').max(60, 'Use at most 60 characters'));

/**
 * How the room is drawn: desks in twos when `pairs` is set, and a walkway
 * after each seat position in `aisles` (an aisle after 3 splits A1–A3 from
 * A4–A6). The server checks each aisle falls inside the row.
 */
export const labLayoutSchema = z.strictObject({
  pairs: z.boolean().default(false),
  aisles: z
    .array(z.number().int().min(1).max(MAX_SEATS_PER_ROW))
    .max(MAX_SEATS_PER_ROW)
    .refine((aisles) => new Set(aisles).size === aisles.length, 'List each aisle once')
    .default([]),
});

const rowsSchema = z.number().int().min(1).max(MAX_LAB_ROWS);
const seatsPerRowSchema = z.number().int().min(1).max(MAX_SEATS_PER_ROW);

export const createLabRequestSchema = z.strictObject({
  name: labNameSchema,
  rows: rowsSchema,
  seatsPerRow: seatsPerRowSchema,
  layout: labLayoutSchema.default({ pairs: false, aisles: [] }),
});

/**
 * Any of name, size and layout. Growing a lab adds seats; shrinking it removes
 * seats only if no PC is bound to them and nobody has ever logged in there.
 */
export const updateLabRequestSchema = z
  .strictObject({
    name: labNameSchema.optional(),
    rows: rowsSchema.optional(),
    seatsPerRow: seatsPerRowSchema.optional(),
    layout: labLayoutSchema.optional(),
  })
  .refine((change) => Object.keys(change).length > 0, 'Change at least one field');

export const labViewSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  rows: z.number().int(),
  seatsPerRow: z.number().int(),
  layout: z.object({ pairs: z.boolean(), aisles: z.array(z.number().int()) }),
  seatCount: z.number().int(),
  /** PCs bound to a seat of this lab. */
  pcCount: z.number().int(),
});

// --------------------------------------------------------------- Lab PCs

/** aa:bb:cc:00:11:22, from colons, dashes or bare hex in any case. */
export const macSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9A-Fa-f]{2}([:-]?)[0-9A-Fa-f]{2}(\1[0-9A-Fa-f]{2}){4}$/,
    'Use a MAC address like aa:bb:cc:00:11:22',
  )
  .transform((mac) => {
    const hex = mac.replace(/[:-]/g, '').toLowerCase();
    return [0, 2, 4, 6, 8, 10].map((start) => hex.slice(start, start + 2)).join(':');
  });

/** A Windows computer name: letters, digits and dashes, at most 63. */
export const hostnameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/, 'Use letters, digits and dashes, like LAB1-A1');

/** What the student app sends on every start (step 1 of device trust). */
export const registerDeviceRequestSchema = z.strictObject({
  hostname: hostnameSchema,
  mac: macSchema,
  osVersion: z.string().trim().min(1).max(100).optional(),
  appVersion: z.string().trim().min(1).max(40).optional(),
});

/**
 * `deviceKey` is set only when the server has just made one: the PC stores it
 * and sends it in `X-Device-Key` from then on. It is accepted once the admin
 * has approved the PC. A check-in with the key gets `null`.
 */
export const registerDeviceResponseSchema = z.object({
  deviceId: z.uuid(),
  status: z.enum(['waiting', 'approved']),
  deviceKey: z.string().nullable(),
});

/**
 * `waiting` for the admin; `online` when seen in the last two minutes, else
 * `offline`; `retired` when taken out of service.
 */
export const DEVICE_STATUSES = ['waiting', 'online', 'offline', 'retired'] as const;

export const listDevicesQuerySchema = z.object({ status: z.enum(DEVICE_STATUSES).optional() });

/**
 * One change to a PC at a time. Approving and binding take a seat, or none;
 * resetting sends the PC back to wait with no key, for a reinstall; retiring
 * takes it out of service.
 */
export const updateDeviceRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('approve'), seatId: z.uuid().optional() }),
  z.strictObject({ action: z.literal('bind'), seatId: z.uuid().nullable() }),
  z.strictObject({ action: z.literal('rename'), hostname: hostnameSchema }),
  z.strictObject({ action: z.literal('retire') }),
  z.strictObject({ action: z.literal('reset') }),
]);

const timestampSchema = z.iso.datetime({ offset: true });

export const deviceViewSchema = z.object({
  id: z.uuid(),
  hostname: z.string(),
  mac: z.string(),
  ip: z.string().nullable(),
  osVersion: z.string().nullable(),
  appVersion: z.string().nullable(),
  status: z.enum(DEVICE_STATUSES),
  lastSeenAt: timestampSchema.nullable(),
  seat: z
    .object({ id: z.uuid(), code: z.string(), labId: z.uuid(), labName: z.string() })
    .nullable(),
  createdAt: timestampSchema,
});

/** A seat of the seat map (A-07, and the teacher console's grid). */
export const labSeatSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  row: z.string(),
  position: z.number().int(),
  device: z
    .object({
      id: z.uuid(),
      hostname: z.string(),
      ip: z.string().nullable(),
      appVersion: z.string().nullable(),
      status: z.enum(DEVICE_STATUSES),
      lastSeenAt: timestampSchema.nullable(),
    })
    .nullable(),
  /** Someone is logged in at this seat now. */
  occupied: z.boolean(),
  /** Who, when the caller may see them: the admin always, a teacher their own students. */
  student: z.object({ id: z.uuid(), username: z.string(), fullName: z.string() }).nullable(),
});

export const labSeatsResponseSchema = z.object({
  lab: labViewSchema,
  seats: z.array(labSeatSchema),
});

export type LabLayout = z.infer<typeof labLayoutSchema>;
export type CreateLabRequest = z.infer<typeof createLabRequestSchema>;
export type UpdateLabRequest = z.infer<typeof updateLabRequestSchema>;
export type LabView = z.infer<typeof labViewSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;
export type UpdateDeviceRequest = z.infer<typeof updateDeviceRequestSchema>;
export type DeviceView = z.infer<typeof deviceViewSchema>;
export type LabSeat = z.infer<typeof labSeatSchema>;
export type LabSeatsResponse = z.infer<typeof labSeatsResponseSchema>;
