import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'tailwindcss';
import {
  DEFAULT_BRANDING,
  MIN_LARGE_TEXT_CONTRAST,
  MIN_TEXT_CONTRAST,
  contrastRatio,
} from '@lingualab/shared';
import { TEXT_PAIRS, colours, type ColourToken } from './tokens.js';

/**
 * T-NFR-11a, the design system: every text colour the UI kit puts on a
 * background reads at 4.5:1 (3:1 at 24 px and up), and the Tailwind theme is
 * the token list, never a second copy that can drift from it.
 */

const SRC = import.meta.dirname;

function read(name: string): string {
  return readFileSync(join(SRC, name), 'utf8');
}

/** `--color-ink-muted: #4A5565;` lines of the @theme block, as { 'ink-muted': '#4A5565' }. */
function themeColours(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of read('theme.css').matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)) {
    found[match[1] ?? ''] = (match[2] ?? '').toUpperCase();
  }
  return found;
}

/** Every component source file, to see which colours they actually use. */
function componentSources(): string {
  const dir = join(SRC, 'components');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.tsx') && !file.includes('.spec.'))
    .map((file) => readFileSync(join(dir, file), 'utf8'))
    .join('\n');
}

const TOKENS = Object.keys(colours) as ColourToken[];

describe('T-NFR-11a the colour tokens', () => {
  it('has the colours of docs/docs/05-screens-and-ux.md', () => {
    expect(colours).toMatchObject({
      bg: '#F4F6F9',
      surface: '#FFFFFF',
      border: '#DDE3EA',
      'border-strong': '#CBD3DD',
      ink: '#0E1726',
      'ink-muted': '#4A5565',
      'ink-raised': '#1B2638',
      primary: '#1D4ED8',
      'primary-tint': '#E8EEFC',
      live: '#B42318',
      'live-tint': '#FDECEA',
      success: '#157F3D',
      'success-tint': '#E7F5EC',
      warning: '#B45309',
      'warning-text': '#9A4508',
      'warning-tint': '#FDF1E3',
      listening: '#6D28D9',
      'listening-tint': '#F1EAFD',
      offline: '#A7B1BE',
    });
  });

  it('starts from the same main colour as the default branding', () => {
    expect(colours.primary).toBe(DEFAULT_BRANDING.primaryColour);
  });

  it('is exactly what the Tailwind theme holds, colour for colour', () => {
    expect(themeColours()).toEqual(colours);
  });
});

describe('T-NFR-11a the Tailwind theme', () => {
  async function build(candidates: string[]): Promise<string> {
    const compiler = await compile(`${read('theme.css')}
@tailwind utilities;`);
    return compiler.build(candidates);
  }

  it('compiles, and makes a class of every token that reads the CSS variable', async () => {
    const css = await build(['bg-primary', 'text-ink-muted', 'border-border-strong']);

    expect(css).toContain('var(--color-primary)');
    expect(css).toContain('var(--color-ink-muted)');
    expect(css).toContain('var(--color-border-strong)');
  });

  it("has none of Tailwind's own colours, so a screen cannot step outside the design", async () => {
    const css = await build(['bg-blue-500', 'text-gray-700', 'bg-primary']);

    expect(css).not.toMatch(/blue-500|gray-700/);
    expect(css).toContain('.bg-primary');
  });
});

describe('T-NFR-11a every text colour on its background', () => {
  for (const pair of TEXT_PAIRS) {
    const minimum = pair.large === true ? MIN_LARGE_TEXT_CONTRAST : MIN_TEXT_CONTRAST;

    it(`${pair.text} on ${pair.on} reads at ${minimum}:1 or more (${pair.usedFor})`, () => {
      expect(contrastRatio(colours[pair.text], colours[pair.on])).toBeGreaterThanOrEqual(minimum);
    });
  }

  it('lists every text colour and background the components use', () => {
    const source = componentSources();
    const used = (prefix: string) =>
      TOKENS.filter((token) => new RegExp(`\\b${prefix}-${token}(?![\\w-])`).test(source));

    const texts = new Set(TEXT_PAIRS.map((pair) => pair.text));
    const backgrounds = new Set(TEXT_PAIRS.map((pair) => pair.on));

    expect(used('text').filter((token) => !texts.has(token))).toEqual([]);
    expect(used('bg').filter((token) => !backgrounds.has(token) && !DECORATIVE.has(token))).toEqual(
      [],
    );
  });
});

/** Backgrounds that never carry text: status dots, meter and progress fills. */
const DECORATIVE = new Set<ColourToken>(['offline', 'success', 'warning', 'live', 'listening']);
