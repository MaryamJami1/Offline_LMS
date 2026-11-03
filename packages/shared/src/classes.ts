import { z } from 'zod';
import { userStatusSchema } from './users.js';

/**
 * Organisation (ADM-03): courses, batches, classes, who teaches and who is
 * enrolled in them, and groups, per docs/docs/04-api-and-events.md, Classes
 * and groups.
 */

/** Trimmed, runs of spaces folded to one, 1 to 100 characters. */
const titleSchema = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Enter a name').max(100, 'Use at most 100 characters'));

const descriptionSchema = z.string().trim().max(500, 'Use at most 500 characters');

/** A calendar day, 2026-09-01. */
const daySchema = z.iso.date();

/** No more than any real class needs, so one request cannot ask for millions of rows. */
const MAX_STUDENTS = 200;
const MAX_TEACHERS = 20;

function uniqueIds(max: number) {
  return z
    .array(z.uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, 'List each account once');
}

function atLeastOneField<T extends z.ZodRawShape>(shape: T) {
  return z
    .strictObject(shape)
    .refine((change) => Object.keys(change).length > 0, 'Change at least one field');
}

// ---------------------------------------------------------------- Courses

export const createCourseRequestSchema = z.strictObject({
  name: titleSchema,
  description: descriptionSchema.optional(),
});

/** `description: null` clears it. */
export const updateCourseRequestSchema = atLeastOneField({
  name: titleSchema.optional(),
  description: descriptionSchema.nullable().optional(),
});

export const courseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
});

// ---------------------------------------------------------------- Batches

/** A batch never ends before it starts; the server checks that against what it keeps. */
export const createBatchRequestSchema = z.strictObject({
  courseId: z.uuid(),
  name: titleSchema,
  startsOn: daySchema,
  endsOn: daySchema.optional(),
});

/** Name and dates only: a batch stays in its course. `endsOn: null` makes it open-ended. */
export const updateBatchRequestSchema = atLeastOneField({
  name: titleSchema.optional(),
  startsOn: daySchema.optional(),
  endsOn: daySchema.nullable().optional(),
});

export const listBatchesQuerySchema = z.object({ courseId: z.uuid().optional() });

export const batchSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  courseName: z.string(),
  name: z.string(),
  startsOn: daySchema,
  endsOn: daySchema.nullable(),
});

// ---------------------------------------------------------------- Classes

/** B-12: letters, digits and dashes, kept in capitals as timetables write them. */
export const classCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, 'Use up to 20 letters, digits or dashes, like B-12');

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** When a class meets each week: Mon to Thu at 10:00, for 90 minutes. */
export const scheduleSchema = z.strictObject({
  days: z
    .array(z.enum(WEEKDAYS))
    .min(1, 'Pick at least one day')
    .refine((days) => new Set(days).size === days.length, 'List each day once'),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time, like 10:00'),
  minutes: z.number().int().min(15).max(480),
});

export const createClassRequestSchema = z.strictObject({
  code: classCodeSchema,
  name: titleSchema,
  batchId: z.uuid(),
  labRoomId: z.uuid(),
  schedule: scheduleSchema.optional(),
  teacherIds: uniqueIds(MAX_TEACHERS).optional(),
});

/** `schedule: null` clears it. Teachers and students have calls of their own. */
export const updateClassRequestSchema = atLeastOneField({
  code: classCodeSchema.optional(),
  name: titleSchema.optional(),
  batchId: z.uuid().optional(),
  labRoomId: z.uuid().optional(),
  schedule: scheduleSchema.nullable().optional(),
});

export const setTeachersRequestSchema = z.strictObject({ teacherIds: uniqueIds(MAX_TEACHERS) });

/** Every student who should be in the class; anyone left out is marked as having left. */
export const setStudentsRequestSchema = z.strictObject({ studentIds: uniqueIds(MAX_STUDENTS) });

const namedSchema = z.object({ id: z.uuid(), name: z.string() });

/** A class as the A-04 cards show it. */
export const classViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  course: namedSchema,
  batch: namedSchema,
  lab: namedSchema,
  schedule: scheduleSchema.nullable(),
  teachers: z.array(z.object({ id: z.uuid(), fullName: z.string() })),
  /** Students enrolled now, not those who have left. */
  studentCount: z.number().int(),
  /** Groups that last beyond a single class session. */
  groupCount: z.number().int(),
});

/** A student in the class list (teacher screen T-09). */
export const classStudentSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  rollNo: z.string().nullable(),
  /** The account's status: an inactive account cannot log in. */
  status: userStatusSchema,
});

// ----------------------------------------------------------------- Groups

export const GROUP_KINDS = ['pair', 'random', 'manual'] as const;

/**
 * Pairs follow the roll numbers; random groups are shuffled to at most
 * `size`; a manual group holds the students named.
 */
export const createGroupRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('pair') }),
  z.strictObject({ kind: z.literal('random'), size: z.number().int().min(2).max(20) }),
  z.strictObject({
    kind: z.literal('manual'),
    name: titleSchema,
    studentIds: uniqueIds(MAX_STUDENTS).min(1, 'Pick at least one student'),
  }),
]);

export const classGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(GROUP_KINDS),
  members: z.array(z.object({ id: z.uuid(), username: z.string(), fullName: z.string() })),
});

export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;
export type UpdateCourseRequest = z.infer<typeof updateCourseRequestSchema>;
export type Course = z.infer<typeof courseSchema>;
export type CreateBatchRequest = z.infer<typeof createBatchRequestSchema>;
export type UpdateBatchRequest = z.infer<typeof updateBatchRequestSchema>;
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;
export type Batch = z.infer<typeof batchSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type CreateClassRequest = z.infer<typeof createClassRequestSchema>;
export type UpdateClassRequest = z.infer<typeof updateClassRequestSchema>;
export type SetTeachersRequest = z.infer<typeof setTeachersRequestSchema>;
export type SetStudentsRequest = z.infer<typeof setStudentsRequestSchema>;
export type ClassView = z.infer<typeof classViewSchema>;
export type ClassStudent = z.infer<typeof classStudentSchema>;
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;
export type ClassGroup = z.infer<typeof classGroupSchema>;
export type GroupKind = (typeof GROUP_KINDS)[number];
/** Every list in this area is `{ items }`. */
export interface Items<T> {
  items: T[];
}
