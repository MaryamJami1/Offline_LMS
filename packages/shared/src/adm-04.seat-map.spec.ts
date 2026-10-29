import { describe, it, expect } from 'vitest';
import { buildSeatMap } from './seat-map.js';

describe('ADM-04 buildSeatMap', () => {
  it('builds Lab 1: 5 rows of 6 seats, A1 to E6', () => {
    const seats = buildSeatMap({ rows: 5, seatsPerRow: 6 });

    expect(seats).toHaveLength(30);
    expect(seats[0]).toEqual({ code: 'A1', row: 'A', position: 1 });
    expect(seats[29]).toEqual({ code: 'E6', row: 'E', position: 6 });
  });

  it('numbers seats row by row, in room order', () => {
    const seats = buildSeatMap({ rows: 2, seatsPerRow: 3 });

    expect(seats.map((seat) => seat.code)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  });

  it('gives every seat a unique code', () => {
    const codes = buildSeatMap({ rows: 10, seatsPerRow: 6 }).map((seat) => seat.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('builds the 60-seat design target', () => {
    expect(buildSeatMap({ rows: 10, seatsPerRow: 6 })).toHaveLength(60);
  });

  it('refuses a lab with no rows', () => {
    expect(() => buildSeatMap({ rows: 0, seatsPerRow: 6 })).toThrow(/rows/i);
  });

  it('refuses a lab with no seats in a row', () => {
    expect(() => buildSeatMap({ rows: 5, seatsPerRow: 0 })).toThrow(/seats per row/i);
  });

  it('refuses negative sizes', () => {
    expect(() => buildSeatMap({ rows: -1, seatsPerRow: 6 })).toThrow(/rows/i);
    expect(() => buildSeatMap({ rows: 5, seatsPerRow: -6 })).toThrow(/seats per row/i);
  });

  it('refuses fractional sizes', () => {
    expect(() => buildSeatMap({ rows: 2.5, seatsPerRow: 6 })).toThrow(/rows/i);
    expect(() => buildSeatMap({ rows: 5, seatsPerRow: 6.5 })).toThrow(/seats per row/i);
  });

  it('refuses more rows than there are row letters', () => {
    expect(() => buildSeatMap({ rows: 27, seatsPerRow: 6 })).toThrow(/26/);
  });

  it('allows the last row letter', () => {
    const seats = buildSeatMap({ rows: 26, seatsPerRow: 1 });

    expect(seats[25]).toEqual({ code: 'Z1', row: 'Z', position: 1 });
  });
});
