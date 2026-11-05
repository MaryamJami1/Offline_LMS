import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ApiError, REFRESH_TOKEN_KEY, createApiClient } from './client.js';

/**
 * NFR-13 in the admin panel's browser: the access token lives in memory only
 * and the refresh token in sessionStorage, so closing the tab logs the admin
 * out (06). Every refresh rotates the token and a token used twice ends every
 * login of the account, so the client must never send the same refresh token
 * twice, even when several calls find the access token expired at once.
 */

type Reply = { status: number; body?: unknown };

function json({ status, body }: Reply): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });
}

const thing = z.object({ name: z.string() });

/** A fake server: answers calls from a list of handlers, and records them. */
function fakeFetch(handler: (path: string, init: RequestInit) => Reply | Promise<Reply>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input);
    calls.push({ path, init });
    return json(await handler(path, init));
  });
  return { fetch, calls };
}

function bearerOf(init: RequestInit): string | null {
  return new Headers(init.headers).get('Authorization');
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('NFR-13 the admin API client', () => {
  it('sends the access token and checks the answer against its schema', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { name: 'Lab 1' } }));
    const client = createApiClient({ fetch });
    client.startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    const answer = await client.request('GET', '/labs/1', thing);

    expect(answer).toEqual({ name: 'Lab 1' });
    expect(calls[0]?.path).toBe('/api/labs/1');
    expect(bearerOf(calls[0]?.init ?? {})).toBe('Bearer access-1');
  });

  it('keeps the refresh token in sessionStorage and never the access token', () => {
    const client = createApiClient({ fetch: vi.fn() });

    client.startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('access-1');
    expect(JSON.stringify({ ...localStorage })).not.toContain('refresh-1');
  });

  it('sends JSON bodies as JSON and files as they are', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { name: 'ok' } }));
    const client = createApiClient({ fetch });
    client.startSession({ accessToken: 'a', refreshToken: 'r' });
    const form = new FormData();
    form.append('file', new Blob(['name,class\n']), 'students.csv');

    await client.request('POST', '/users', thing, { fullName: 'Ayesha Khan' });
    await client.request('POST', '/users/import', thing, form);

    expect(new Headers(calls[0]?.init.headers).get('Content-Type')).toBe('application/json');
    expect(calls[0]?.init.body).toBe('{"fullName":"Ayesha Khan"}');
    expect(new Headers(calls[1]?.init.headers).get('Content-Type')).toBeNull();
    expect(calls[1]?.init.body).toBe(form);
  });

  it('refreshes once when the access token has run out, keeps the new pair, and tries again', async () => {
    const { fetch, calls } = fakeFetch((path, init) => {
      if (path === '/api/auth/refresh') {
        return { status: 200, body: { accessToken: 'access-2', refreshToken: 'refresh-2' } };
      }
      return bearerOf(init) === 'Bearer access-2'
        ? { status: 200, body: { name: 'Lab 1' } }
        : {
            status: 401,
            body: { error: { code: 'INVALID_TOKEN', message: 'Expired', details: {} } },
          };
    });
    const client = createApiClient({ fetch });
    client.startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    const answer = await client.request('GET', '/labs', thing);

    expect(answer).toEqual({ name: 'Lab 1' });
    expect(calls.map((call) => call.path)).toEqual(['/api/labs', '/api/auth/refresh', '/api/labs']);
    expect(calls[1]?.init.body).toBe('{"refreshToken":"refresh-1"}');
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-2');
  });

  it('sends the refresh token only once when several calls find the token expired together', async () => {
    let refreshes = 0;
    const { fetch } = fakeFetch(async (path, init) => {
      if (path === '/api/auth/refresh') {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { status: 200, body: { accessToken: 'access-2', refreshToken: 'refresh-2' } };
      }
      return bearerOf(init) === 'Bearer access-2'
        ? { status: 200, body: { name: path } }
        : {
            status: 401,
            body: { error: { code: 'INVALID_TOKEN', message: 'Expired', details: {} } },
          };
    });
    const client = createApiClient({ fetch });
    client.startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    const answers = await Promise.all([
      client.request('GET', '/users', thing),
      client.request('GET', '/classes', thing),
      client.request('GET', '/labs', thing),
    ]);

    expect(refreshes).toBe(1);
    expect(answers.map((answer) => answer.name)).toEqual([
      '/api/users',
      '/api/classes',
      '/api/labs',
    ]);
  });

  it('ends the session and says so when the refresh is refused', async () => {
    const onSessionEnded = vi.fn();
    const { fetch } = fakeFetch(() => ({
      status: 401,
      body: { error: { code: 'INVALID_TOKEN', message: 'Expired', details: {} } },
    }));
    const client = createApiClient({ fetch, onSessionEnded });
    client.startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await expect(client.request('GET', '/labs', thing)).rejects.toMatchObject({ status: 401 });

    expect(onSessionEnded).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(client.hasSession()).toBe(false);
  });

  it('turns an error answer into an ApiError with its code, message and field messages', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Check the form',
          details: { issues: [{ field: 'fullName', message: 'Write the full name' }] },
        },
      },
    }));
    const client = createApiClient({ fetch });
    client.startSession({ accessToken: 'a', refreshToken: 'r' });

    const error = await client
      .request('POST', '/users', thing, {})
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Check the form',
      fields: { fullName: 'Write the full name' },
    });
  });

  it('refuses an answer that does not match the contract', async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: { title: 'not a name' } }));
    const client = createApiClient({ fetch });
    client.startSession({ accessToken: 'a', refreshToken: 'r' });

    await expect(client.request('GET', '/labs/1', thing)).rejects.toMatchObject({
      code: 'UNEXPECTED_ANSWER',
    });
  });

  it('answers a call with no content with nothing', async () => {
    const { fetch } = fakeFetch(() => ({ status: 204 }));
    const client = createApiClient({ fetch });
    client.startSession({ accessToken: 'a', refreshToken: 'r' });

    await expect(client.request('POST', '/auth/logout', null, { refreshToken: 'r' })).resolves.toBe(
      undefined,
    );
  });

  it('calls a public endpoint without a token', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { name: 'Lab' } }));
    const client = createApiClient({ fetch });

    await client.request('GET', '/settings/branding', thing, undefined, { public: true });

    expect(bearerOf(calls[0]?.init ?? {})).toBeNull();
  });

  it('picks the session back up from sessionStorage after a page reload', async () => {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      body: { accessToken: 'access-2', refreshToken: 'refresh-2' },
    }));
    const client = createApiClient({ fetch });

    expect(client.hasSession()).toBe(true);
    await client.resumeSession();

    expect(calls[0]?.path).toBe('/api/auth/refresh');
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-2');
  });
});
