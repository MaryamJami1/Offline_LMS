import { describe, it, expect } from 'vitest';
import { FIRST_PASSWORD_ALPHABET, generateFirstPassword } from './generate-password.js';

/**
 * ADM-01: first passwords the server makes up for the slip. Ten characters
 * from an alphabet without look-alikes (0/O, 1/l/I), so a student can type
 * what is printed.
 */
describe('ADM-01 generated first passwords', () => {
  it('is ten characters from the alphabet', () => {
    const password = generateFirstPassword();

    expect(password).toHaveLength(10);
    expect([...password].every((char) => FIRST_PASSWORD_ALPHABET.includes(char))).toBe(true);
  });

  it('leaves out characters that are easy to misread', () => {
    expect(FIRST_PASSWORD_ALPHABET).not.toMatch(/[0O1lI]/);
  });

  it('is different every time', () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateFirstPassword()));

    expect(passwords.size).toBe(200);
  });
});
