// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { ServerError, ServerUnreachable, createServerApi } from './server-api.js';

/**
 * STU-01, STU-06, STU-07 and ADM-04: every call the student app makes goes to
 * the endpoint and in the shape docs/docs/04-api-and-events.md gives it, with
 * the PC's device key in `X-Device-Key` once it has one. Answers are checked
 * against the contracts in packages/shared before anything uses them. The
 * calls are made in Electron's main process, so the screens never hold the
 * key or a token.
 */

const SERVER = 'https://192.168.10.2';
const ID = '0195f3a0-0000-7000-8000-000000000001';
const KEY = 'the-device-key';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function setUp(answer: { status?: number; body?: unknown } = {}, deviceKey: string | null = KEY) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const status = answer.status ?? (answer.body === undefined ? 204 : 200);
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status,
    });
  });
  const api = createServerApi({ serverUrl: SERVER, fetch, deviceKey: () => deviceKey });
  return { api, calls, fetch };
}

const user = {
  id: ID,
  username: 'S-1001',
  fullName: 'Ayesha Khan',
  role: 'student',
  mustChangePassword: false,
};
const loginAnswer = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user,
  seat: { seatCode: 'A1', labRoomName: 'Lab 1' },
};

describe('The student app calls the documented endpoints', () => {
  it('reads the branding', async () => {
    const branding = {
      softwareName: 'Lab',
      instituteName: '',
      logoUrl: null,
      primaryColour: '#1D4ED8',
    };
    const { api, calls } = setUp({ body: branding });

    expect(await api.branding()).toEqual(branding);
    expect(calls[0]).toMatchObject({ method: 'GET', url: `${SERVER}/api/settings/branding` });
  });

  it('registers, with the key once the PC has one, and says whether a key was made', async () => {
    const { api, calls } = setUp({
      status: 201,
      body: { deviceId: ID, status: 'waiting', deviceKey: 'new-key' },
    });
    const identity = {
      hostname: 'LAB1-A1',
      mac: 'aa:bb:cc:00:11:22',
      macs: ['aa:bb:cc:00:11:22'],
      osVersion: 'Windows 11',
      appVersion: '0.1.0',
    };

    expect(await api.register(identity)).toEqual({
      created: true,
      answer: { deviceId: ID, status: 'waiting', deviceKey: 'new-key' },
    });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${SERVER}/api/devices/register`,
      headers: { 'x-device-key': KEY, 'content-type': 'application/json' },
      body: {
        hostname: 'LAB1-A1',
        mac: 'aa:bb:cc:00:11:22',
        osVersion: 'Windows 11',
        appVersion: '0.1.0',
      },
    });
  });

  it('sends no key header before the PC has a key', async () => {
    const { api, calls } = setUp({ body: { deviceId: ID, hostname: 'LAB1-A1', seat: null } }, null);

    await api.deviceMe();

    expect(calls[0]?.headers['x-device-key']).toBeUndefined();
  });

  it('asks where this PC is', async () => {
    const { api, calls } = setUp({
      body: { deviceId: ID, hostname: 'LAB1-A1', seat: { seatCode: 'A1', labRoomName: 'Lab 1' } },
    });

    expect((await api.deviceMe()).seat).toEqual({ seatCode: 'A1', labRoomName: 'Lab 1' });
    expect(calls[0]).toMatchObject({ method: 'GET', url: `${SERVER}/api/devices/me` });
  });

  it('logs in with the device key', async () => {
    const { api, calls } = setUp({ body: loginAnswer });

    expect(await api.login('S-1001', 'secret-pass')).toEqual(loginAnswer);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${SERVER}/api/auth/login`,
      headers: { 'x-device-key': KEY },
      body: { username: 'S-1001', password: 'secret-pass' },
    });
    expect(calls[0]?.headers['authorization']).toBeUndefined();
  });

  it('refreshes, changes the password and logs out with the tokens it is given', async () => {
    const { api, calls } = setUp({ body: loginAnswer });

    await api.refresh('refresh');
    await api.changePassword('access', 'old-pass', 'new-pass-2026');
    await api.logout({ accessToken: 'access', refreshToken: 'refresh' }, 'idle');

    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ['POST', `${SERVER}/api/auth/refresh`, { refreshToken: 'refresh' }],
      [
        'POST',
        `${SERVER}/api/auth/change-password`,
        { currentPassword: 'old-pass', newPassword: 'new-pass-2026' },
      ],
      ['POST', `${SERVER}/api/auth/logout`, { refreshToken: 'refresh', reason: 'idle' }],
    ]);
    expect(calls[1]?.headers['authorization']).toBe('Bearer access');
    expect(calls[2]?.headers['authorization']).toBe('Bearer access');
  });

  it('asks to close the app with the PIN', async () => {
    const { api, calls } = setUp();

    await api.exit('204816');

    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${SERVER}/api/devices/exit`,
      headers: { 'x-device-key': KEY },
      body: { pin: '204816' },
    });
  });

  it('gives up on a server that does not answer within ten seconds', async () => {
    const { api, fetch } = setUp({ body: loginAnswer });

    await api.login('S-1001', 'secret-pass');

    const init = fetch.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('The student app reads what the server refuses', () => {
  it('as the error code, status and details the server sent', async () => {
    const { api } = setUp({
      status: 403,
      body: {
        error: { code: 'EXIT_PIN_WRONG', message: 'That PIN is wrong', details: { triesLeft: 4 } },
      },
    });

    const error = await api.exit('000000').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerError);
    expect(error).toMatchObject({ status: 403, code: 'EXIT_PIN_WRONG', details: { triesLeft: 4 } });
  });

  it('as an answer the contract does not allow, which is never passed on', async () => {
    const { api } = setUp({ body: { accessToken: 'only this' } });

    await expect(api.login('S-1001', 'secret-pass')).rejects.toMatchObject({
      code: 'BAD_ANSWER',
    });
  });

  it('as unreachable when the network fails', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const api = createServerApi({ serverUrl: SERVER, fetch, deviceKey: () => KEY });

    await expect(api.deviceMe()).rejects.toBeInstanceOf(ServerUnreachable);
  });
});

describe('The logo, for a page that may load nothing from the network', () => {
  it('is fetched by the main process and handed over as a data URL', async () => {
    const fetch = vi.fn(
      async (_input: string) =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
    );
    const api = createServerApi({ serverUrl: SERVER, fetch, deviceKey: () => KEY });

    expect(await api.logo('/api/settings/branding/logo')).toBe('data:image/png;base64,AQID');
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${SERVER}/api/settings/branding/logo`);
  });

  it('is left out when it is not an image or does not come', async () => {
    const notImage = vi.fn(
      async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    );
    const missing = vi.fn(async () => new Response(null, { status: 404 }));

    for (const fetch of [notImage, missing]) {
      const api = createServerApi({ serverUrl: SERVER, fetch, deviceKey: () => KEY });
      expect(await api.logo('/api/settings/branding/logo')).toBeNull();
    }
  });

  it('comes only from the lab server', async () => {
    const { api, fetch } = setUp();

    expect(await api.logo('https://example.com/logo.png')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
