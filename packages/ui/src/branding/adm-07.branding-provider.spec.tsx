import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_BRANDING, derivePalette, type Branding } from '@lingualab/shared';
import { BrandingProvider, useBranding } from './branding-provider.js';
import { colours } from '../tokens.js';

/**
 * ADM-07 and rule 8 in CLAUDE.md: the software name, logo and main colour come
 * from `GET /settings/branding`, never from the code. Until the server
 * answers, or when it cannot, the app shows the "Lab" defaults; a main colour
 * that would make text hard to read is not applied (NFR-11).
 */

function Shows() {
  const branding = useBranding();
  return (
    <>
      <h1>{branding.softwareName}</h1>
      <p data-testid="institute">{branding.instituteName}</p>
      <p data-testid="logo">{branding.logoUrl ?? 'no logo'}</p>
      <p data-testid="status">{branding.status}</p>
    </>
  );
}

const root = () => document.documentElement;

function variable(name: string): string {
  return root().style.getPropertyValue(name);
}

const SPEAK_LAB: Branding = {
  softwareName: 'Speak Lab',
  instituteName: 'Al-Noor Institute',
  logoUrl: '/api/settings/branding/logo',
  primaryColour: '#0F5132',
};

describe('ADM-07 BrandingProvider', () => {
  it('shows "Lab" before the server answers', () => {
    render(
      <BrandingProvider fetchBranding={() => new Promise(() => {})}>
        <Shows />
      </BrandingProvider>,
    );

    expect(screen.getByRole('heading')).toHaveTextContent('Lab');
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(document.title).toBe('Lab');
  });

  it("shows the institute's name, logo and colour once it answers", async () => {
    render(
      <BrandingProvider fetchBranding={async () => SPEAK_LAB}>
        <Shows />
      </BrandingProvider>,
    );

    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('Speak Lab'));
    expect(screen.getByTestId('institute')).toHaveTextContent('Al-Noor Institute');
    expect(screen.getByTestId('logo')).toHaveTextContent('/api/settings/branding/logo');
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(document.title).toBe('Speak Lab');

    const palette = derivePalette('#0F5132');
    expect(variable('--color-primary')).toBe(palette.primary);
    expect(variable('--color-primary-hover')).toBe(palette.hover);
    expect(variable('--color-primary-tint')).toBe(palette.tint);
    expect(variable('--color-selected')).toBe(palette.selected);
  });

  it('keeps the exact design shades for the default colour', async () => {
    render(
      <BrandingProvider fetchBranding={async () => ({ ...DEFAULT_BRANDING, softwareName: 'X' })}>
        <Shows />
      </BrandingProvider>,
    );

    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('X'));
    expect(variable('--color-primary')).toBe(colours.primary);
    expect(variable('--color-primary-hover')).toBe(colours['primary-hover']);
    expect(variable('--color-primary-tint')).toBe(colours['primary-tint']);
    expect(variable('--color-selected')).toBe(colours.selected);
  });

  it('keeps the default colour when the chosen one would be hard to read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <BrandingProvider fetchBranding={async () => ({ ...SPEAK_LAB, primaryColour: '#FACC15' })}>
        <Shows />
      </BrandingProvider>,
    );

    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('Speak Lab'));
    expect(variable('--color-primary')).toBe(colours.primary);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/#FACC15.*contrast/));
    warn.mockRestore();
  });

  it('stays on "Lab" when the server cannot be reached', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <BrandingProvider fetchBranding={() => Promise.reject(new Error('ECONNREFUSED'))}>
        <Shows />
      </BrandingProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('fallback'));
    expect(screen.getByRole('heading')).toHaveTextContent('Lab');
    expect(variable('--color-primary')).toBe(colours.primary);
    warn.mockRestore();
  });

  it('stays on "Lab" when the answer is not branding', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <BrandingProvider fetchBranding={async () => ({ softwareName: '' }) as unknown as Branding}>
        <Shows />
      </BrandingProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('fallback'));
    expect(screen.getByRole('heading')).toHaveTextContent('Lab');
    warn.mockRestore();
  });

  it('asks the server once, and ignores an answer that comes after it is gone', async () => {
    let answer: (branding: Branding) => void = () => {};
    const fetchBranding = vi.fn(
      () =>
        new Promise<Branding>((resolve) => {
          answer = resolve;
        }),
    );
    const { unmount } = render(
      <BrandingProvider fetchBranding={fetchBranding}>
        <Shows />
      </BrandingProvider>,
    );

    unmount();
    answer(SPEAK_LAB);
    await Promise.resolve();

    expect(fetchBranding).toHaveBeenCalledOnce();
    expect(variable('--color-primary')).toBe('');
  });

  it('asks only at start-up, even when the app renders again with a new function', async () => {
    const calls = vi.fn();
    const fetchFresh = () => {
      calls();
      return Promise.resolve(SPEAK_LAB);
    };
    const { rerender } = render(
      <BrandingProvider fetchBranding={fetchFresh}>
        <Shows />
      </BrandingProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('Speak Lab'));

    rerender(
      <BrandingProvider fetchBranding={() => fetchFresh()}>
        <Shows />
      </BrandingProvider>,
    );
    await Promise.resolve();

    expect(calls).toHaveBeenCalledOnce();
  });

  it('gives the defaults to a component outside any provider', () => {
    render(<Shows />);

    expect(screen.getByRole('heading')).toHaveTextContent(DEFAULT_BRANDING.softwareName);
  });
});
