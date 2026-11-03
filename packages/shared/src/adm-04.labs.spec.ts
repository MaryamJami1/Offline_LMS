import { describe, it, expect } from 'vitest';
import {
  createLabRequestSchema,
  macSchema,
  registerDeviceRequestSchema,
  updateDeviceRequestSchema,
  updateLabRequestSchema,
} from './labs.js';

/**
 * ADM-04: the shapes the admin panel sends to set up labs and approve PCs,
 * and the one a lab PC sends to register (docs/docs/04-api-and-events.md,
 * Lab, devices and sessions).
 */

const ID = '0190f5a0-0000-7000-8000-000000000001';

describe('ADM-04 labs', () => {
  it('takes a lab of rows and seats, laid out in pairs with an aisle', () => {
    expect(
      createLabRequestSchema.parse({
        name: ' Lab 2 ',
        rows: 5,
        seatsPerRow: 6,
        layout: { pairs: true, aisles: [3] },
      }),
    ).toEqual({ name: 'Lab 2', rows: 5, seatsPerRow: 6, layout: { pairs: true, aisles: [3] } });
  });

  it('gives a lab with no layout single seats and no aisle', () => {
    expect(createLabRequestSchema.parse({ name: 'Lab 2', rows: 2, seatsPerRow: 3 })).toEqual({
      name: 'Lab 2',
      rows: 2,
      seatsPerRow: 3,
      layout: { pairs: false, aisles: [] },
    });
  });

  it('refuses more rows than there are letters, or no seats', () => {
    expect(createLabRequestSchema.safeParse({ name: 'L', rows: 27, seatsPerRow: 6 }).success).toBe(
      false,
    );
    expect(createLabRequestSchema.safeParse({ name: 'L', rows: 5, seatsPerRow: 0 }).success).toBe(
      false,
    );
  });

  it('refuses an aisle listed twice', () => {
    expect(
      createLabRequestSchema.safeParse({
        name: 'L',
        rows: 5,
        seatsPerRow: 6,
        layout: { pairs: false, aisles: [3, 3] },
      }).success,
    ).toBe(false);
  });

  it('changes a lab only when something is given', () => {
    expect(updateLabRequestSchema.safeParse({}).success).toBe(false);
    expect(updateLabRequestSchema.parse({ rows: 6 })).toEqual({ rows: 6 });
  });
});

describe('ADM-04 lab PCs', () => {
  it('writes a MAC address one way, whatever way the PC sent it', () => {
    for (const raw of [
      'AA:BB:CC:00:11:22',
      'aa-bb-cc-00-11-22',
      'AABBCC001122',
      ' aa:bb:cc:00:11:22 ',
    ]) {
      expect(macSchema.parse(raw), raw).toBe('aa:bb:cc:00:11:22');
    }
    expect(macSchema.safeParse('aa:bb:cc:00:11').success).toBe(false);
    expect(macSchema.safeParse('gg:bb:cc:00:11:22').success).toBe(false);
  });

  it('takes a registration of a host name and a MAC, with the versions if known', () => {
    expect(
      registerDeviceRequestSchema.parse({
        hostname: 'LAB1-A1',
        mac: 'AA-BB-CC-00-11-22',
        appVersion: '1.0.0',
      }),
    ).toEqual({ hostname: 'LAB1-A1', mac: 'aa:bb:cc:00:11:22', appVersion: '1.0.0' });
    expect(
      registerDeviceRequestSchema.safeParse({ hostname: 'LAB 1', mac: 'AABBCC001122' }).success,
    ).toBe(false);
  });

  it('takes one action on a PC at a time', () => {
    expect(updateDeviceRequestSchema.parse({ action: 'approve', seatId: ID })).toEqual({
      action: 'approve',
      seatId: ID,
    });
    expect(updateDeviceRequestSchema.parse({ action: 'bind', seatId: null })).toEqual({
      action: 'bind',
      seatId: null,
    });
    expect(updateDeviceRequestSchema.parse({ action: 'retire' })).toEqual({ action: 'retire' });
    expect(updateDeviceRequestSchema.parse({ action: 'reset' })).toEqual({ action: 'reset' });
    expect(updateDeviceRequestSchema.safeParse({ action: 'rename' }).success).toBe(false);
    expect(updateDeviceRequestSchema.safeParse({ action: 'delete' }).success).toBe(false);
  });
});
