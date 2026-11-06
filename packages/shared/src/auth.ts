import { z } from 'zod';

/**
 * Request and response shapes for the auth endpoints. The server validates with
 * these schemas and the apps parse with the same ones, so there is one contract
 * (docs/docs/04-api-and-events.md, Auth and users).
 */

export const roleSchema = z.enum(['admin', 'teacher', 'student']);

/** At least eight characters, per docs/docs/06-security-and-data.md. */
export const PASSWORD_MINIMUM_LENGTH = 8;

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const authUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  role: roleSchema,
  mustChangePassword: z.boolean(),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

/**
 * Why a student's app ends its login: by hand, or after 30 idle minutes
 * (STU-07). End class is recorded by the server itself (LAB-03), so an app
 * cannot claim it.
 */
export const LOGOUT_REASONS = ['manual', 'idle'] as const;

export const logoutRequestSchema = refreshRequestSchema.extend({
  reason: z.enum(LOGOUT_REASONS).optional(),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PASSWORD_MINIMUM_LENGTH),
});

/** Where the person is sitting now, or null when they are not at a lab PC. */
export const currentSeatSchema = z.object({
  seatCode: z.string(),
  labRoomName: z.string(),
});

/**
 * A student's login names the seat it recorded (STU-01); staff, who do not
 * log in at a lab PC, get null.
 */
export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: authUserSchema,
  seat: currentSeatSchema.nullable(),
});

export const meResponseSchema = z.object({
  user: authUserSchema,
  seat: currentSeatSchema.nullable(),
});

export type Role = z.infer<typeof roleSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type LogoutReason = (typeof LOGOUT_REASONS)[number];
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type CurrentSeat = z.infer<typeof currentSeatSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
