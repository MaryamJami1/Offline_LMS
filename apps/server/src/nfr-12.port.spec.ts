import { describe, it, expect } from 'vitest';
import { serverPort } from './port.js';

/**
 * NFR-12: the server listens on 3000, the port Caddy proxies to on the lab
 * server. PORT moves it, so the end-to-end journey can run its own server on a
 * fresh database beside a developer's.
 */
describe('NFR-12 the port the server listens on', () => {
  it('is 3000 unless told otherwise', () => {
    expect(serverPort({})).toBe(3000);
  });

  it('is PORT when it is set', () => {
    expect(serverPort({ PORT: '3100' })).toBe(3100);
  });

  it.each(['0', '65536', 'abc', '30.5', '-1', ''])(
    'refuses PORT=%j rather than listening somewhere unexpected',
    (port) => {
      expect(() => serverPort({ PORT: port })).toThrow(/PORT/);
    },
  );
});
