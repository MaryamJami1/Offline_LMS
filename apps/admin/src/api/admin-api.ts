import {
  batchSchema,
  brandingSchema,
  classViewSchema,
  createUserResponseSchema,
  deviceViewSchema,
  importResponseSchema,
  labSeatsResponseSchema,
  labViewSchema,
  loginResponseSchema,
  meResponseSchema,
  resetPasswordResponseSchema,
  userListResponseSchema,
  type Batch,
  type Branding,
  type ClassView,
  type CreateClassRequest,
  type CreateUserRequest,
  type CreateUserResponse,
  type DeviceStatus,
  type DeviceView,
  type ImportResponse,
  type Items,
  type LabSeatsResponse,
  type LabView,
  type ListUsersQuery,
  type LoginResponse,
  type MeResponse,
  type ResetPasswordResponse,
  type UpdateDeviceRequest,
  type UserListResponse,
} from '@lingualab/shared';
import { z } from 'zod';
import type { ApiClient } from './client.js';

/**
 * Everything the admin panel asks of the server (04). Screens use this
 * interface through useAdminApi(), so their tests run against a fake of it.
 */
export interface AdminApi {
  branding(): Promise<Branding>;
  /** Logs in and keeps the session. */
  login(username: string, password: string): Promise<LoginResponse>;
  /** Changes the password and keeps the new session the server gives back. */
  changePassword(currentPassword: string, newPassword: string): Promise<LoginResponse>;
  /** After a reload, picks the session back up from the stored refresh token. */
  resumeSession(): Promise<MeResponse>;
  hasSession(): boolean;
  me(): Promise<MeResponse>;
  /** Ends the login on the server, and forgets the session whatever it answers. */
  logout(): Promise<void>;

  listUsers(query: Partial<ListUsersQuery>): Promise<UserListResponse>;
  createUser(request: CreateUserRequest): Promise<CreateUserResponse>;
  importStudents(file: File): Promise<ImportResponse>;
  resetPassword(userId: string): Promise<ResetPasswordResponse>;

  listClasses(): Promise<Items<ClassView>>;
  listBatches(): Promise<Items<Batch>>;
  createClass(request: CreateClassRequest): Promise<ClassView>;

  listLabs(): Promise<Items<LabView>>;
  labSeats(labId: string): Promise<LabSeatsResponse>;
  listDevices(status?: DeviceStatus): Promise<Items<DeviceView>>;
  updateDevice(deviceId: string, request: UpdateDeviceRequest): Promise<DeviceView>;
}

function itemsOf<T>(schema: z.ZodType<T>) {
  return z.object({ items: z.array(schema) });
}

/** Only the filters that were given, in the order they were given. */
function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

export function createHttpAdminApi(client: ApiClient): AdminApi {
  async function startFrom(answer: Promise<LoginResponse>): Promise<LoginResponse> {
    const login = await answer;
    client.startSession(login);
    return login;
  }

  return {
    branding: () =>
      client.request('GET', '/settings/branding', brandingSchema, undefined, { public: true }),
    login: (username, password) =>
      startFrom(
        client.request(
          'POST',
          '/auth/login',
          loginResponseSchema,
          { username, password },
          { public: true },
        ),
      ),
    changePassword: (currentPassword, newPassword) =>
      startFrom(
        client.request('POST', '/auth/change-password', loginResponseSchema, {
          currentPassword,
          newPassword,
        }),
      ),
    resumeSession: async () => {
      await client.resumeSession();
      return client.request('GET', '/me', meResponseSchema);
    },
    hasSession: () => client.hasSession(),
    me: () => client.request('GET', '/me', meResponseSchema),
    logout: async () => {
      const refreshToken = client.refreshToken();
      try {
        if (refreshToken !== null) {
          await client.request('POST', '/auth/logout', null, { refreshToken });
        }
      } finally {
        client.endSession();
      }
    },

    listUsers: (query) =>
      client.request('GET', `/users${queryString(query)}`, userListResponseSchema),
    createUser: (request) => client.request('POST', '/users', createUserResponseSchema, request),
    importStudents: (file) => {
      const form = new FormData();
      form.append('file', file);
      return client.request('POST', '/users/import', importResponseSchema, form);
    },
    resetPassword: (userId) =>
      client.request('POST', `/users/${userId}/reset-password`, resetPasswordResponseSchema),

    listClasses: () => client.request('GET', '/classes', itemsOf(classViewSchema)),
    listBatches: () => client.request('GET', '/batches', itemsOf(batchSchema)),
    createClass: (request) => client.request('POST', '/classes', classViewSchema, request),

    listLabs: () => client.request('GET', '/labs', itemsOf(labViewSchema)),
    labSeats: (labId) => client.request('GET', `/labs/${labId}/seats`, labSeatsResponseSchema),
    listDevices: (status) =>
      client.request('GET', `/devices${queryString({ status })}`, itemsOf(deviceViewSchema)),
    updateDevice: (deviceId, request) =>
      client.request('PATCH', `/devices/${deviceId}`, deviceViewSchema, request),
  };
}
