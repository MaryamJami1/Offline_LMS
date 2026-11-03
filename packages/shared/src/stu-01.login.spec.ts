import { describe, it, expect } from 'vitest';
import { loginResponseSchema } from './auth.js';
import { deviceMeResponseSchema } from './labs.js';

/**
 * STU-01: a student's login names the seat it recorded, and a lab PC can ask
 * where it is before anyone logs in.
 */

const ID = '0190f5a0-0000-7000-8000-000000000001';
const user = {
  id: ID,
  username: 'S-1001',
  fullName: 'Ayesha Khan',
  role: 'student',
  mustChangePassword: false,
};

describe('STU-01 the login answer', () => {
  it('names the seat for a student, and none for staff', () => {
    const seat = { seatCode: 'A1', labRoomName: 'Lab 1' };

    expect(
      loginResponseSchema.parse({ accessToken: 'a', refreshToken: 'r', user, seat }).seat,
    ).toEqual(seat);
    expect(
      loginResponseSchema.parse({ accessToken: 'a', refreshToken: 'r', user, seat: null }).seat,
    ).toBeNull();
    expect(
      loginResponseSchema.safeParse({ accessToken: 'a', refreshToken: 'r', user }).success,
    ).toBe(false);
  });
});

describe('STU-01 a lab PC asks where it is', () => {
  it('has a name and a seat, or no seat yet', () => {
    expect(deviceMeResponseSchema.parse({ deviceId: ID, hostname: 'LAB1-A1', seat: null })).toEqual(
      { deviceId: ID, hostname: 'LAB1-A1', seat: null },
    );
  });
});
