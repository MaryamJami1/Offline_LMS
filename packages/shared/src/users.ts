import { z } from 'zod';
import { PASSWORD_MINIMUM_LENGTH, roleSchema } from './auth.js';

/**
 * Accounts as the admin manages them (ADM-01) and the student import (ADM-02),
 * per docs/docs/04-api-and-events.md, Auth and users. The import checks each
 * row with the same field rules a form uses.
 */

/** Trimmed, runs of spaces folded to one, 1 to 100 characters. */
export const fullNameSchema = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Enter a name').max(100, 'Use at most 100 characters'));

const PHONE_DIGITS = { min: 7, max: 15 } as const;

/** Digits with the usual spaces, dashes and brackets, and an optional leading +. */
export const phoneSchema = z
  .string()
  .trim()
  .refine((phone) => {
    if (!/^\+?[\d\s()-]+$/.test(phone)) {
      return false;
    }
    const digits = phone.replace(/\D/g, '').length;
    return digits >= PHONE_DIGITS.min && digits <= PHONE_DIGITS.max;
  }, 'Enter a phone number of 7 to 15 digits');

/** Student IDs (S-1001) and staff names (sara.iqbal): no spaces, 3 to 40 characters. */
export const usernameSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/,
    'Use 3 to 40 letters, digits, dots, dashes or underscores',
  );

export const userStatusSchema = z.enum(['active', 'inactive']);

/** At most 128 characters, so a huge body cannot keep the password hasher busy. */
const firstPasswordSchema = z.string().min(PASSWORD_MINIMUM_LENGTH).max(128);

/** A class as an account shows it: B-12, Morning B. */
export const userClassSchema = z.object({ code: z.string(), name: z.string() });

/**
 * The admin creates teachers and students; admin accounts are not made here.
 * A student's ID is the next free S-number unless one is given, and the first
 * password is generated unless the admin types one, as the Add student dialog
 * in the prototype does.
 */
export const createUserRequestSchema = z.discriminatedUnion('role', [
  z.strictObject({
    role: z.literal('student'),
    fullName: fullNameSchema,
    username: usernameSchema.optional(),
    phone: phoneSchema.optional(),
    password: firstPasswordSchema.optional(),
    classCode: z.string().trim().min(1).optional(),
  }),
  z.strictObject({
    role: z.literal('teacher'),
    fullName: fullNameSchema,
    username: usernameSchema,
    phone: phoneSchema.optional(),
    password: firstPasswordSchema.optional(),
    /** The modules they teach: Speaking, Listening. */
    subjects: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    classCodes: z.array(z.string().trim().min(1)).max(20).optional(),
  }),
]);

/** Name, phone, status and a teacher's subjects; never the role or the username. */
export const updateUserRequestSchema = z
  .strictObject({
    fullName: fullNameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    status: userStatusSchema.optional(),
    subjects: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .refine((change) => Object.keys(change).length > 0, 'Change at least one field');

export const USER_SORTS = [
  'name',
  '-name',
  'username',
  '-username',
  'createdAt',
  '-createdAt',
  'lastLoginAt',
  '-lastLoginAt',
] as const;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(USER_SORTS).default('name'),
  q: z.string().trim().min(1).max(100).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  classCode: z.string().trim().min(1).optional(),
});

/** An account as the admin panel shows it. Never the password hash. */
export const adminUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  role: roleSchema,
  phone: z.string().nullable(),
  status: userStatusSchema,
  mustChangePassword: z.boolean(),
  lastLoginAt: z.iso.datetime({ offset: true }).nullable(),
  /** When a lockout ends, while the account is locked; null otherwise. */
  lockedUntil: z.iso.datetime({ offset: true }).nullable(),
  /** Classes a student is enrolled in, or a teacher teaches. */
  classes: z.array(userClassSchema),
  /** A student's roll number in their class; null for staff. */
  rollNo: z.string().nullable(),
  /** A teacher's modules; empty for everyone else. */
  subjects: z.array(z.string()),
  createdAt: z.iso.datetime({ offset: true }),
});

export const userListResponseSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

/**
 * The new account, and its first password when the server made it up. That
 * answer is the only time the password is ever shown: it goes on the slip.
 */
export const createUserResponseSchema = z.object({
  user: adminUserSchema,
  generatedPassword: z.string().nullable(),
});

// ------------------------------------------------------------------ Import

/** The columns a student import file must have, in any order and any case. */
export const IMPORT_COLUMNS = ['name', 'class', 'phone'] as const;

/** Most rows one file may hold; a whole institute fits several times over. */
export const IMPORT_MAX_ROWS = 1000;

/** Largest file accepted, in bytes. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export const IMPORT_ROW_ERROR_CODES = [
  'NAME_REQUIRED',
  'NAME_INVALID',
  'CLASS_REQUIRED',
  'CLASS_NOT_FOUND',
  'PHONE_INVALID',
  'DUPLICATE_IN_FILE',
  'ALREADY_EXISTS',
] as const;

/**
 * A row that was not imported. `row` is the row number the spreadsheet shows,
 * the header being row 1. The value itself is not repeated back.
 */
export const importRowErrorSchema = z.object({
  row: z.number().int(),
  field: z.enum(['name', 'class', 'phone']),
  code: z.enum(IMPORT_ROW_ERROR_CODES),
  message: z.string(),
  /** For DUPLICATE_IN_FILE: the earlier row with the same student. */
  duplicateOfRow: z.number().int().optional(),
  /** For ALREADY_EXISTS: the student ID the student already has. */
  existingUsername: z.string().optional(),
});

export const importCreatedRowSchema = z.object({
  row: z.number().int(),
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  classCode: z.string(),
  /** The first password for the slip; shown this once and never again. */
  password: z.string(),
});

export const importResponseSchema = z.object({
  created: z.array(importCreatedRowSchema),
  errors: z.array(importRowErrorSchema),
  counts: z.object({
    rows: z.number().int(),
    created: z.number().int(),
    rejected: z.number().int(),
  }),
});

/** Why a whole file was refused, in `details.reason` of IMPORT_FILE_INVALID. */
export const IMPORT_FILE_REASONS = [
  'no_file',
  'too_large',
  'unsupported_type',
  'unreadable',
  'missing_columns',
  'no_rows',
  'too_many_rows',
] as const;

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type UserListResponse = z.infer<typeof userListResponseSchema>;
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type ImportRowError = z.infer<typeof importRowErrorSchema>;
export type ImportRowErrorCode = (typeof IMPORT_ROW_ERROR_CODES)[number];
export type ImportCreatedRow = z.infer<typeof importCreatedRowSchema>;
export type ImportResponse = z.infer<typeof importResponseSchema>;
export type ImportFileReason = (typeof IMPORT_FILE_REASONS)[number];
