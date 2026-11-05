import { refreshResponseSchema } from '@lingualab/shared';
import type { z } from 'zod';

/**
 * The admin panel's only door to the server. The access token lives in memory
 * and the refresh token in sessionStorage, so a reload keeps the admin logged
 * in and closing the tab does not (06). Every answer is checked against the
 * contract in packages/shared before a screen sees it.
 */

export const REFRESH_TOKEN_KEY = 'lingualab.admin.refreshToken';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT';

/** An error answer from the server, or an answer the contract does not allow. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Field name to message, from a failed Zod check, for the form to show next to each field. */
    readonly fields: Record<string, string> = {},
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  fetch?: typeof globalThis.fetch;
  /** Called when the server will not renew the session, so the panel shows the login. */
  onSessionEnded?: () => void;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiClient {
  request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    body?: object | FormData,
    options?: { public?: boolean },
  ): Promise<T>;
  request(
    method: Method,
    path: string,
    schema: null,
    body?: object | FormData,
    options?: { public?: boolean },
  ): Promise<undefined>;
  startSession(tokens: SessionTokens): void;
  /** After a reload: trade the stored refresh token for a fresh pair. */
  resumeSession(): Promise<void>;
  endSession(): void;
  hasSession(): boolean;
  refreshToken(): string | null;
}

const BASE = '/api';

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

function fieldsOf(details: Record<string, unknown>): Record<string, string> {
  const issues = Array.isArray(details['issues']) ? details['issues'] : [];
  const fields: Record<string, string> = {};
  for (const issue of issues as unknown[]) {
    if (typeof issue === 'object' && issue !== null) {
      const { field, message } = issue as { field?: unknown; message?: unknown };
      if (typeof field === 'string' && typeof message === 'string' && !(field in fields)) {
        fields[field] = message;
      }
    }
  }
  return fields;
}

async function errorOf(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  const code = typeof body.error?.code === 'string' ? body.error.code : 'HTTP_ERROR';
  const message =
    typeof body.error?.message === 'string' ? body.error.message : 'The server could not do that';
  const details =
    typeof body.error?.details === 'object' && body.error.details !== null
      ? (body.error.details as Record<string, unknown>)
      : {};
  return new ApiError(response.status, code, message, fieldsOf(details), details);
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let accessToken: string | null = null;
  /** One refresh at a time: a refresh token sent twice ends every login of the account. */
  let refreshing: Promise<void> | null = null;

  function storedRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
  }

  function startSession(tokens: SessionTokens): void {
    accessToken = tokens.accessToken;
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  function endSession(): void {
    accessToken = null;
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  async function call(
    method: Method,
    path: string,
    body: object | FormData | undefined,
    isPublic: boolean,
  ): Promise<Response> {
    const headers = new Headers();
    if (!isPublic && accessToken !== null) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      payload = JSON.stringify(body);
    }
    return send(`${BASE}${path}`, { method, headers, body: payload });
  }

  async function refresh(): Promise<void> {
    const token = storedRefreshToken();
    if (token === null) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in');
    }
    const response = await call('POST', '/auth/refresh', { refreshToken: token }, true);
    if (!response.ok) {
      endSession();
      options.onSessionEnded?.();
      throw await errorOf(response);
    }
    const parsed = refreshResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      endSession();
      options.onSessionEnded?.();
      throw new ApiError(
        502,
        'UNEXPECTED_ANSWER',
        'The server gave an answer the panel does not know',
      );
    }
    startSession(parsed.data);
  }

  function refreshOnce(): Promise<void> {
    refreshing ??= refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T> | null,
    body?: object | FormData,
    requestOptions: { public?: boolean } = {},
  ): Promise<T | undefined> {
    const isPublic = requestOptions.public === true;
    if (!isPublic && refreshing !== null) {
      await refreshing;
    }
    let response = await call(method, path, body, isPublic);
    if (response.status === 401 && !isPublic && storedRefreshToken() !== null) {
      await refreshOnce();
      response = await call(method, path, body, isPublic);
    }
    if (!response.ok) {
      throw await errorOf(response);
    }
    if (schema === null || response.status === 204) {
      return undefined;
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ApiError(
        502,
        'UNEXPECTED_ANSWER',
        'The server gave an answer the panel does not know',
      );
    }
    return parsed.data;
  }

  return {
    request: request as ApiClient['request'],
    startSession,
    resumeSession: refreshOnce,
    endSession,
    hasSession: () => storedRefreshToken() !== null,
    refreshToken: storedRefreshToken,
  };
}
