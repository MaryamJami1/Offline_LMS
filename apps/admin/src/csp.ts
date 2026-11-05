import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The admin panel's Content-Security-Policy lives in one place, infra/Caddyfile,
 * which is what the lab server sends. `vite preview` reads it from there so the
 * end-to-end journey runs under the same policy (NFR-13). Node-only: the panel's
 * own bundle never imports this file.
 */

const CADDYFILE = join(import.meta.dirname, '..', '..', '..', 'infra', 'Caddyfile');

const HEADER = /header\s+Content-Security-Policy\s+"([^"]+)"/;

/** The policy in a Caddyfile's text; throws when there is none. */
export function policyIn(caddyfile: string): string {
  const match = HEADER.exec(caddyfile);
  if (!match?.[1]) {
    throw new Error('infra/Caddyfile sends no Content-Security-Policy header for the admin panel');
  }
  return match[1];
}

/** The policy infra/Caddyfile sends. */
export function caddyfilePolicy(): string {
  return policyIn(readFileSync(CADDYFILE, 'utf8'));
}

/** Each directive of a policy with its sources, in the order written. */
export function directivesOf(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
}
