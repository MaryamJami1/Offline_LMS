import { randomInt } from 'node:crypto';

/** Letters and digits with the look-alikes 0, O, 1, l and I taken out. */
export const FIRST_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const LENGTH = 10;

/**
 * A first-login password for the slip: about 58 bits from the operating
 * system's random source. It only has to last until the first login, which
 * changes it, and five wrong guesses lock the account.
 */
export function generateFirstPassword(): string {
  let password = '';
  for (let index = 0; index < LENGTH; index += 1) {
    password += FIRST_PASSWORD_ALPHABET[randomInt(FIRST_PASSWORD_ALPHABET.length)];
  }
  return password;
}
