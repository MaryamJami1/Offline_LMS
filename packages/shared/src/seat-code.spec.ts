import { describe, it, expect } from 'vitest';
import { normalizeSeatCode } from './seat-code.js';

describe('normalizeSeatCode', () => {
  it('trims whitespace and uppercases', () => {
    expect(normalizeSeatCode(' b4 ')).toBe('B4');
  });

  it('handles already-uppercase codes', () => {
    expect(normalizeSeatCode('A1')).toBe('A1');
  });

  it('trims tabs and mixed whitespace', () => {
    expect(normalizeSeatCode('\t c12\n')).toBe('C12');
  });

  it('throws on empty input', () => {
    expect(() => normalizeSeatCode('')).toThrow();
  });

  it('throws on whitespace-only input', () => {
    expect(() => normalizeSeatCode('   ')).toThrow();
  });
});
