import { describe, it, expect } from 'vitest';
import { DEFAULT_BRANDING, brandingSchema } from './settings.js';

/**
 * ADM-07, the read side: what `GET /settings/branding` answers and what every
 * app falls back to before it has an answer (rule 8 in CLAUDE.md).
 */

describe('ADM-07 the branding every app reads', () => {
  it('defaults to "Lab" in the default blue, with no logo', () => {
    expect(DEFAULT_BRANDING).toEqual({
      softwareName: 'Lab',
      instituteName: '',
      logoUrl: null,
      primaryColour: '#1D4ED8',
    });
    expect(brandingSchema.parse(DEFAULT_BRANDING)).toEqual(DEFAULT_BRANDING);
  });

  it('takes a name, a logo address and a six-digit colour', () => {
    const branding = {
      softwareName: 'Speak Lab',
      instituteName: 'Al-Noor Institute',
      logoUrl: '/api/settings/branding/logo',
      primaryColour: '#0f5132',
    };

    expect(brandingSchema.parse(branding)).toEqual(branding);
  });

  it('refuses an empty name or a colour that is not six-digit hex', () => {
    expect(brandingSchema.safeParse({ ...DEFAULT_BRANDING, softwareName: '' }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...DEFAULT_BRANDING, primaryColour: 'blue' }).success).toBe(
      false,
    );
    expect(brandingSchema.safeParse({ ...DEFAULT_BRANDING, primaryColour: '#12f' }).success).toBe(
      false,
    );
  });
});
