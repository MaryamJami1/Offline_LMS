/**
 * WCAG 2 contrast (NFR-11; docs/docs/05-screens-and-ux.md, Accessibility).
 * Used by the UI kit's tests, by every app before it applies the institute's
 * main colour, and by Settings to refuse a colour that would not pass.
 */

/** Body text, and anything under 24 px. */
export const MIN_TEXT_CONTRAST = 4.5;
/** Text of 24 px and larger. */
export const MIN_LARGE_TEXT_CONTRAST = 3;

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: string): boolean {
  return HEX_COLOUR.test(value);
}

function channels(hex: string): [number, number, number] {
  if (!isHexColour(hex)) {
    throw new Error(`Expected a six-digit hex colour like #1D4ED8, got "${hex}"`);
  }
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex(channelsIn: [number, number, number]): string {
  return `#${channelsIn
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Relative luminance, from 0 for black to 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** From 1 (none) to 21 (black on white); the order of the two does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** `colour` blended toward `towards` by `amount`, 0 to 1. */
export function mix(colour: string, towards: string, amount: number): string {
  const from = channels(colour);
  const to = channels(towards);
  return toHex(
    from.map((channel, i) => channel + ((to[i] ?? 0) - channel) * amount) as [
      number,
      number,
      number,
    ],
  );
}

/** The shades the UI kit makes from the main colour. */
export interface BrandPalette {
  primary: string;
  /** Hover on primary buttons. */
  hover: string;
  /** Selected tabs, info badges. */
  tint: string;
  /** Selected seats and options. */
  selected: string;
}

/**
 * Shades for a main colour other than the default; the default keeps the
 * exact values of the design (packages/ui/src/tokens.ts).
 */
export function derivePalette(primary: string): BrandPalette {
  const upper = primary.toUpperCase();
  return {
    primary: upper,
    hover: mix(upper, '#000000', 0.18),
    tint: mix(upper, '#FFFFFF', 0.9),
    selected: mix(upper, '#FFFFFF', 0.96),
  };
}

/**
 * Whether the institute's main colour keeps every text that uses it readable:
 * white on it (primary buttons), and it on white and on its own tint (links,
 * selected tabs, info badges).
 */
export function isUsableBrandColour(colour: string): boolean {
  if (!isHexColour(colour)) {
    return false;
  }
  const { primary, tint } = derivePalette(colour);
  return [contrastRatio('#FFFFFF', primary), contrastRatio(primary, tint)].every(
    (ratio) => ratio >= MIN_TEXT_CONTRAST,
  );
}
