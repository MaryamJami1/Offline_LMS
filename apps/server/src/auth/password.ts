import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';

/**
 * Argon2id, as docs/docs/06-security-and-data.md requires. The value 2 is
 * `Algorithm.Argon2id`, written out because the library declares it as an
 * ambient const enum, which strict TypeScript cannot import. The cost settings
 * are the library's own defaults, which follow the OWASP recommendation.
 */
const ARGON2ID = 2 as Algorithm;

const OPTIONS = { algorithm: ARGON2ID } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Checks a password against a stored hash. A stored value that is not an Argon2
 * hash cannot match anything, so it fails like a wrong password instead of
 * throwing and turning a bad row into a server error.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    return false;
  }
}
