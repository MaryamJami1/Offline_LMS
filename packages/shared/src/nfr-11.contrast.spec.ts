import { describe, it, expect } from 'vitest';
import {
  MIN_TEXT_CONTRAST,
  contrastRatio,
  derivePalette,
  isUsableBrandColour,
  mix,
} from './contrast.js';

/**
 * T-NFR-11a, the arithmetic: the WCAG 2 contrast ratio that every text colour
 * of the UI kit, and every main colour the institute picks, is held to.
 */

describe('T-NFR-11a the contrast ratio', () => {
  it('is 21:1 for black on white, and the same either way round', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for a colour on itself', () => {
    expect(contrastRatio('#1D4ED8', '#1d4ed8')).toBeCloseTo(1, 5);
  });

  it('matches the published figures around the 4.5:1 line', () => {
    // #777777 on white is the classic near miss; #767676 is the lightest grey that passes.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('refuses something that is not a six-digit hex colour', () => {
    expect(() => contrastRatio('blue', '#FFFFFF')).toThrow(/hex colour/);
    expect(() => contrastRatio('#FFF', '#FFFFFF')).toThrow(/hex colour/);
  });
});

describe('T-NFR-11a a main colour the institute may pick', () => {
  it('accepts the default blue', () => {
    expect(isUsableBrandColour('#1D4ED8')).toBe(true);
  });

  it('accepts a dark colour that white text can sit on', () => {
    expect(isUsableBrandColour('#0F5132')).toBe(true);
  });

  it('refuses a colour too light for white button text', () => {
    expect(isUsableBrandColour('#FACC15')).toBe(false);
    expect(isUsableBrandColour('#60A5FA')).toBe(false);
  });

  it('refuses something that is not a colour at all', () => {
    expect(isUsableBrandColour('red')).toBe(false);
    expect(isUsableBrandColour('')).toBe(false);
  });
});

describe('T-NFR-11a the shades made from a main colour', () => {
  it('blends one colour toward another', () => {
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('makes a darker hover and lighter tints, all still readable with the colour', () => {
    const palette = derivePalette('#0f5132');

    expect(palette.primary).toBe('#0F5132');
    expect(contrastRatio('#FFFFFF', palette.hover)).toBeGreaterThan(
      contrastRatio('#FFFFFF', palette.primary),
    );
    expect(contrastRatio(palette.primary, palette.tint)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(palette.primary, palette.selected)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });
});
