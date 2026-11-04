/**
 * Design tokens (docs/docs/05-screens-and-ux.md, Design system). The one list
 * of colours, sizes and fonts all three apps use; `theme.css` turns it into
 * the Tailwind theme, and a test keeps the two equal.
 *
 * Only `primary` and the three shades made from it change with branding
 * (BrandingProvider); every other colour is fixed, so contrast always passes.
 */

export const colours = {
  /** Page background. */
  bg: '#F4F6F9',
  /** Cards, panels, seat tiles. */
  surface: '#FFFFFF',
  /** Offline seats, muted badges, progress and meter tracks. */
  muted: '#EEF1F5',
  /** Empty seats. */
  empty: '#FAFBFC',
  /** Card borders. */
  border: '#DDE3EA',
  /** Buttons and inputs. */
  'border-strong': '#CBD3DD',
  /** Hovered buttons, seats and options. */
  'border-hover': '#8D99A8',
  /** Main text; dark bars. */
  ink: '#0E1726',
  /** Secondary text. */
  'ink-muted': '#4A5565',
  /** Tab rail labels. */
  'ink-subtle': '#5A6577',
  /** Text on primary and live buttons. */
  'on-primary': '#FFFFFF',
  /** Main buttons, selection, links, Speaking. Branding replaces it. */
  primary: '#1D4ED8',
  /** Hover on primary buttons. Made from `primary` when branding replaces it. */
  'primary-hover': '#1E40AF',
  /** Selected tabs and controls, info badges. Made from `primary`. */
  'primary-tint': '#E8EEFC',
  /** Selected seats and options. Made from `primary`. */
  selected: '#F5F8FF',
  /** Live controls, End class, on-call, errors. */
  live: '#B42318',
  'live-hover': '#912018',
  'live-tint': '#FDECEA',
  /** Online dot, correct answers, Reading. */
  success: '#157F3D',
  'success-tint': '#E7F5EC',
  /** Hand raised, drafts, Writing: #B45309 for marks, #9A4508 for text. */
  warning: '#B45309',
  'warning-text': '#9A4508',
  'warning-tint': '#FDF1E3',
  /** Listening module. */
  listening: '#6D28D9',
  'listening-tint': '#F1EAFD',
  /** Offline and empty seat dots. Never used for text. */
  offline: '#A7B1BE',
} as const;

export type ColourToken = keyof typeof colours;

/** The CSS variables BrandingProvider replaces, by the shade of the main colour. */
export const BRAND_VARIABLES = {
  primary: '--color-primary',
  hover: '--color-primary-hover',
  tint: '--color-primary-tint',
  selected: '--color-selected',
} as const;

export interface TextPair {
  text: ColourToken;
  on: ColourToken;
  usedFor: string;
  /** 24 px and larger, held to 3:1. */
  large?: true;
}

/**
 * Every text colour the components put on a background. The contrast test
 * checks each one, and fails if a component uses a pair that is not listed.
 */
export const TEXT_PAIRS: readonly TextPair[] = [
  { text: 'ink', on: 'bg', usedFor: 'page text' },
  { text: 'ink', on: 'surface', usedFor: 'cards, buttons, inputs' },
  { text: 'ink', on: 'selected', usedFor: 'selected seat or option' },
  { text: 'ink', on: 'muted', usedFor: 'offline seat' },
  { text: 'ink', on: 'empty', usedFor: 'empty seat' },
  { text: 'ink', on: 'success-tint', usedFor: 'right answer' },
  { text: 'ink', on: 'live-tint', usedFor: 'wrong answer' },
  { text: 'ink-muted', on: 'surface', usedFor: 'secondary text, card headings' },
  { text: 'ink-muted', on: 'bg', usedFor: 'secondary text on the page' },
  { text: 'ink-muted', on: 'muted', usedFor: 'muted badge, offline seat' },
  { text: 'ink-muted', on: 'empty', usedFor: 'empty seat' },
  { text: 'ink-muted', on: 'selected', usedFor: 'selected seat' },
  { text: 'ink-subtle', on: 'surface', usedFor: 'tab rail labels' },
  { text: 'ink-subtle', on: 'bg', usedFor: 'hovered tab' },
  { text: 'on-primary', on: 'primary', usedFor: 'primary button' },
  { text: 'on-primary', on: 'primary-hover', usedFor: 'hovered primary button' },
  { text: 'on-primary', on: 'live', usedFor: 'danger button' },
  { text: 'on-primary', on: 'live-hover', usedFor: 'hovered danger button' },
  { text: 'on-primary', on: 'ink', usedFor: 'toast, side navigation' },
  { text: 'on-primary', on: 'ink-muted', usedFor: 'hovered side navigation item' },
  { text: 'primary', on: 'surface', usedFor: 'links' },
  { text: 'primary', on: 'primary-tint', usedFor: 'selected tab and control, info badge' },
  { text: 'primary', on: 'selected', usedFor: 'option letter when chosen' },
  { text: 'live', on: 'surface', usedFor: 'field errors' },
  { text: 'live', on: 'live-tint', usedFor: 'live badge, running control' },
  { text: 'success', on: 'surface', usedFor: 'online label' },
  { text: 'success', on: 'success-tint', usedFor: 'ok badge' },
  { text: 'warning-text', on: 'surface', usedFor: 'hand raised label' },
  { text: 'warning-text', on: 'warning-tint', usedFor: 'warn badge' },
  { text: 'listening', on: 'listening-tint', usedFor: 'Listening module badge' },
];

/** Sizes in px, from the 4 px grid of 05. */
export const sizes = {
  /** Buttons and every touch target. */
  control: 40,
  /** Primary controls of the teacher console and the student app. */
  controlLarge: 44,
  radius: 8,
  cardRadius: 12,
  /** Smallest text anywhere, labels and badges included (NFR-11). */
  minText: 13,
} as const;

export const fonts = {
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'IBM Plex Serif', Georgia, serif",
} as const;
