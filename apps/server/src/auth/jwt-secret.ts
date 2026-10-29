/** Long enough that it cannot be guessed, and never defaulted in code. */
const MINIMUM_LENGTH = 32;

/**
 * The secret the access tokens are signed with. There is no built-in fallback:
 * a server with no JWT_SECRET refuses to start, because a default secret in the
 * source would let anyone mint a token for any lab.
 */
export function requireJwtSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env['JWT_SECRET']?.trim();
  if (secret === undefined || secret.length === 0) {
    throw new Error('JWT_SECRET is not set. See docs/docs/07-installation.md.');
  }
  if (secret.length < MINIMUM_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MINIMUM_LENGTH} characters.`);
  }
  return secret;
}
