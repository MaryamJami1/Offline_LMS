import { describe, it, expect } from 'vitest';
import {
  createUserRequestSchema,
  fullNameSchema,
  listUsersQuerySchema,
  phoneSchema,
  updateUserRequestSchema,
  usernameSchema,
} from './users.js';

/**
 * ADM-01 and ADM-02: the field rules for accounts. The server checks requests
 * with them, the student import checks each row with them, and the admin panel
 * will check its forms with them, so a name the form accepts is one the server
 * accepts.
 */

describe('ADM-01 full name', () => {
  it('trims and folds runs of spaces', () => {
    expect(fullNameSchema.parse('  Ayesha   Khan ')).toBe('Ayesha Khan');
  });

  it('refuses a blank name', () => {
    expect(fullNameSchema.safeParse('   ').success).toBe(false);
  });

  it('refuses a name over 100 characters', () => {
    expect(fullNameSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });

  it('accepts Urdu script', () => {
    expect(fullNameSchema.parse('عائشہ خان')).toBe('عائشہ خان');
  });
});

describe('ADM-01 phone', () => {
  it.each(['0300-1234567', '+92 300 1234567', '(042) 3576 1234', '03001234567'])(
    'accepts %s',
    (phone) => {
      expect(phoneSchema.safeParse(phone).success).toBe(true);
    },
  );

  it.each(['12345', 'call me', '0300-12345678901234', '+-+', '0300 123456x'])(
    'refuses %s',
    (phone) => {
      expect(phoneSchema.safeParse(phone).success).toBe(false);
    },
  );
});

describe('ADM-01 username', () => {
  it.each(['S-1001', 'sara.iqbal', 'imran_ali'])('accepts %s', (username) => {
    expect(usernameSchema.safeParse(username).success).toBe(true);
  });

  it.each(['ab', 'sara iqbal', '.sara', 'a'.repeat(41), 'sära'])('refuses %s', (username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false);
  });
});

describe('ADM-01 create request', () => {
  it('lets a student be created with a name only', () => {
    expect(
      createUserRequestSchema.safeParse({ role: 'student', fullName: 'Ayesha Khan' }).success,
    ).toBe(true);
  });

  it('needs a username for a teacher', () => {
    expect(
      createUserRequestSchema.safeParse({ role: 'teacher', fullName: 'Sara Iqbal' }).success,
    ).toBe(false);
  });

  it('refuses an admin: admin accounts are not made here', () => {
    expect(
      createUserRequestSchema.safeParse({
        role: 'admin',
        fullName: 'New Admin',
        username: 'admin2',
      }).success,
    ).toBe(false);
  });

  it('refuses a first password under 8 characters', () => {
    expect(
      createUserRequestSchema.safeParse({
        role: 'student',
        fullName: 'Ayesha Khan',
        password: 'short',
      }).success,
    ).toBe(false);
  });

  it('refuses fields it does not know, so nothing else can be set through it', () => {
    expect(
      createUserRequestSchema.safeParse({
        role: 'student',
        fullName: 'Ayesha Khan',
        mustChangePassword: false,
      }).success,
    ).toBe(false);
  });
});

describe('ADM-01 update request', () => {
  it('accepts a status change on its own', () => {
    expect(updateUserRequestSchema.parse({ status: 'inactive' })).toEqual({ status: 'inactive' });
  });

  it('clears the phone with null', () => {
    expect(updateUserRequestSchema.parse({ phone: null })).toEqual({ phone: null });
  });

  it('refuses an empty change', () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a role or username change', () => {
    expect(updateUserRequestSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ username: 'S-2000' }).success).toBe(false);
  });
});

describe('ADM-01 list query', () => {
  it('defaults to the first page of 50, sorted by name', () => {
    expect(listUsersQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50, sort: 'name' });
  });

  it('reads numbers from the query string', () => {
    expect(listUsersQuerySchema.parse({ page: '2', pageSize: '10' })).toMatchObject({
      page: 2,
      pageSize: 10,
    });
  });

  it('refuses a page size over 200 and a sort it does not know', () => {
    expect(listUsersQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(listUsersQuerySchema.safeParse({ sort: 'password_hash' }).success).toBe(false);
  });
});
