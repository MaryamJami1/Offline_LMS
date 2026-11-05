/** Caddy proxies to this port on the lab server (02). */
export const DEFAULT_PORT = 3000;

/**
 * The port to listen on: PORT when set, else 3000. A PORT that is not a whole
 * number from 1 to 65535 stops the server instead of leaving it somewhere
 * Caddy does not look.
 */
export function serverPort(env: NodeJS.ProcessEnv): number {
  const port = env['PORT'];
  if (port === undefined) return DEFAULT_PORT;
  const value = Number(port);
  if (!/^\d+$/.test(port) || value < 1 || value > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, not "${port}".`);
  }
  return value;
}
