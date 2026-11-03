import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_BRANDING,
  brandingSchema,
  derivePalette,
  isUsableBrandColour,
  type BrandPalette,
  type Branding,
} from '@lingualab/shared';
import { BRAND_VARIABLES, colours } from '../tokens.js';

/** loading until the server answers; fallback when it could not, or answered nonsense. */
export type BrandingStatus = 'loading' | 'ready' | 'fallback';

export interface BrandingState extends Branding {
  status: BrandingStatus;
}

const DEFAULT_STATE: BrandingState = { ...DEFAULT_BRANDING, status: 'loading' };

const BrandingContext = createContext<BrandingState>(DEFAULT_STATE);

/** The design's own shades for the default colour, so the default looks exactly as designed. */
const DEFAULT_PALETTE: BrandPalette = {
  primary: colours.primary,
  hover: colours['primary-hover'],
  tint: colours['primary-tint'],
  selected: colours.selected,
};

function paletteFor(primaryColour: string): BrandPalette {
  if (primaryColour.toUpperCase() === colours.primary) {
    return DEFAULT_PALETTE;
  }
  if (!isUsableBrandColour(primaryColour)) {
    console.warn(
      `Main colour ${primaryColour} is not used: text on it would fail 4.5:1 contrast. Keeping ${colours.primary}.`,
    );
    return DEFAULT_PALETTE;
  }
  return derivePalette(primaryColour);
}

function apply(branding: Branding): void {
  const palette = paletteFor(branding.primaryColour);
  const style = document.documentElement.style;
  style.setProperty(BRAND_VARIABLES.primary, palette.primary);
  style.setProperty(BRAND_VARIABLES.hover, palette.hover);
  style.setProperty(BRAND_VARIABLES.tint, palette.tint);
  style.setProperty(BRAND_VARIABLES.selected, palette.selected);
  document.title = branding.softwareName;
}

export interface BrandingProviderProps {
  /** GET /settings/branding through the app's own client; this package makes no requests. */
  fetchBranding: () => Promise<Branding>;
  children: ReactNode;
}

/**
 * Loads the software name, logo and main colour once, at start-up, and paints
 * the main colour into the theme (ADM-07; rule 8 in CLAUDE.md). Until then, and
 * whenever the server cannot say, the app is "Lab" in the default blue.
 */
export function BrandingProvider({ fetchBranding, children }: BrandingProviderProps) {
  const [state, setState] = useState<BrandingState>(DEFAULT_STATE);
  // Asked once, at start-up: a rebrand shows at each app's next start
  // (T-ADM-07). The first function is kept, so an app passing a new one on
  // every render does not ask again.
  const fetchOnce = useRef(fetchBranding);

  useEffect(() => {
    let live = true;
    document.title = DEFAULT_BRANDING.softwareName;

    fetchOnce
      .current()
      .then((answer) => {
        const parsed = brandingSchema.safeParse(answer);
        if (!parsed.success) {
          throw new Error('the answer is not branding');
        }
        return parsed.data;
      })
      .then(
        (branding) => {
          if (live) {
            apply(branding);
            setState({ ...branding, status: 'ready' });
          }
        },
        (error: unknown) => {
          if (live) {
            console.warn(`Branding not loaded, showing the defaults: ${String(error)}`);
            apply(DEFAULT_BRANDING);
            setState({ ...DEFAULT_BRANDING, status: 'fallback' });
          }
        },
      );

    return () => {
      live = false;
    };
  }, []);

  return <BrandingContext.Provider value={state}>{children}</BrandingContext.Provider>;
}

/** The branding to show; the defaults outside a provider. */
export function useBranding(): BrandingState {
  return useContext(BrandingContext);
}
