import {
  brandingSchema,
  deviceMeResponseSchema,
  loginResponseSchema,
  refreshResponseSchema,
  registerDeviceResponseSchema,
  type Branding,
  type DeviceMeResponse,
  type LoginResponse,
  type LogoutReason,
  type RefreshResponse,
  type RegisterDeviceResponse,
} from '@lingualab/shared';
import { z } from 'zod';
import type { PcIdentity } from './pc-identity.js';

/** An answer the server gave on purpose: `{ error: { code, message, details } }` (04). */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/** No answer at all: the server is off, or the network is down. */
export class ServerUnreachable extends Error {
  constructor() {
    super('The server cannot be reached.');
    this.name = 'ServerUnreachable';
  }
}

const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** How long a call waits before the server counts as unreachable. */
const TIMEOUT_MS = 10_000;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface ServerApi {
  branding(): Promise<Branding>;
  /** A data URL, or null when there is no usable logo on the lab server. */
  logo(path: string): Promise<string | null>;
  register(identity: PcIdentity): Promise<{ created: boolean; answer: RegisterDeviceResponse }>;
  deviceMe(): Promise<DeviceMeResponse>;
  login(username: string, password: string): Promise<LoginResponse>;
  refresh(refreshToken: string): Promise<RefreshResponse>;
  changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResponse>;
  logout(tokens: Tokens, reason: LogoutReason): Promise<void>;
  /** Resolves when the admin PIN is right and the app may close (STU-06). */
  exit(pin: string): Promise<void>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The student app's only door to the server, used from Electron's main
 * process. Every call carries the PC's device key once it has one.
 */
export function createServerApi(options: {
  serverUrl: string;
  fetch: Fetch;
  deviceKey: () => string | null;
}): ServerApi {
  async function send(
    method: 'GET' | 'POST',
    path: string,
    body?: object,
    accessToken?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    const key = options.deviceKey();
    if (key !== null) {
      headers['X-Device-Key'] = key;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (accessToken !== undefined) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    let response: Response;
    try {
      response = await options.fetch(`${options.serverUrl}/api${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ServerUnreachable();
    }
    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
      throw parsed.success
        ? new ServerError(
            response.status,
            parsed.data.error.code,
            parsed.data.error.message,
            parsed.data.error.details ?? {},
          )
        : new ServerError(
            response.status,
            'BAD_ANSWER',
            'The server gave an answer we cannot read.',
          );
    }
    return response;
  }

  async function call<T>(
    schema: z.ZodType<T>,
    method: 'GET' | 'POST',
    path: string,
    body?: object,
    accessToken?: string,
  ): Promise<T> {
    const response = await send(method, path, body, accessToken);
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new ServerError(
        response.status,
        'BAD_ANSWER',
        'The server gave an answer we cannot read.',
      );
    }
    return parsed.data;
  }

  return {
    branding: () => call(brandingSchema, 'GET', '/settings/branding'),

    async logo(path) {
      if (!path.startsWith('/api/')) {
        return null;
      }
      try {
        const response = await options.fetch(`${options.serverUrl}${path}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.startsWith('image/')) {
          return null;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
      } catch {
        return null;
      }
    },

    async register(identity) {
      const response = await send('POST', '/devices/register', {
        hostname: identity.hostname,
        mac: identity.mac,
        osVersion: identity.osVersion,
        appVersion: identity.appVersion,
      });
      const parsed = registerDeviceResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success) {
        throw new ServerError(
          response.status,
          'BAD_ANSWER',
          'The server gave an answer we cannot read.',
        );
      }
      return { created: response.status === 201, answer: parsed.data };
    },

    deviceMe: () => call(deviceMeResponseSchema, 'GET', '/devices/me'),

    login: (username, password) =>
      call(loginResponseSchema, 'POST', '/auth/login', { username, password }),

    refresh: (refreshToken) =>
      call(refreshResponseSchema, 'POST', '/auth/refresh', { refreshToken }),

    changePassword: (accessToken, currentPassword, newPassword) =>
      call(
        loginResponseSchema,
        'POST',
        '/auth/change-password',
        { currentPassword, newPassword },
        accessToken,
      ),

    async logout(tokens, reason) {
      await send(
        'POST',
        '/auth/logout',
        { refreshToken: tokens.refreshToken, reason },
        tokens.accessToken,
      );
    },

    async exit(pin) {
      await send('POST', '/devices/exit', { pin });
    },
  };
}
