import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('NFR-13 password hashing', () => {
  it('hashes with Argon2id, never keeping the password', async () => {
    const hash = await hashPassword('Lab-2026');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Lab-2026');
  });

  it('salts every hash, so two accounts with one password look different', async () => {
    const [first, second] = await Promise.all([hashPassword('Lab-2026'), hashPassword('Lab-2026')]);

    expect(first).not.toBe(second);
  });

  it('accepts the right password', async () => {
    const hash = await hashPassword('Lab-2026');

    expect(await verifyPassword(hash, 'Lab-2026')).toBe(true);
  });

  it('refuses a wrong password', async () => {
    const hash = await hashPassword('Lab-2026');

    expect(await verifyPassword(hash, 'lab-2026')).toBe(false);
  });

  it('refuses a stored value that is not an Argon2 hash', async () => {
    expect(await verifyPassword('not-a-hash', 'Lab-2026')).toBe(false);
  });
});
