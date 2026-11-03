import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge.js';
import { sizes } from '../tokens.js';

/**
 * T-NFR-11a, text size: NFR-11 says text is at least 13 px, everywhere,
 * labels and badges included.
 */

const DIR = import.meta.dirname;

/** Tailwind's default sizes in px, for the named classes a component might use. */
const NAMED_SIZES: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };

/** Every font size a component's classes ask for, as [class, px]. */
function fontSizes(source: string): [string, number][] {
  const found: [string, number][] = [];
  for (const match of source.matchAll(/(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g)) {
    found.push([match[0], Number(match[1])]);
  }
  for (const match of source.matchAll(/(?<![\w-])text-(xs|sm|base|lg|xl)(?![\w-])/g)) {
    found.push([match[0], NAMED_SIZES[match[1] ?? ''] ?? 0]);
  }
  return found;
}

describe('T-NFR-11a no text under 13 px', () => {
  it('holds the kit to 13 px', () => {
    expect(sizes.minText).toBe(13);
  });

  it('prints a badge at 13 px', () => {
    render(<Badge tone="live">On call</Badge>);

    expect(screen.getByText('On call')).toHaveClass('text-[13px]');
    expect(screen.getByText('On call')).not.toHaveClass('text-xs');
  });

  it('reads the sizes it checks, so a pass means something', () => {
    expect(fontSizes("'text-xs text-[11px] text-sm text-ink-muted'")).toEqual([
      ['text-[11px]', 11],
      ['text-xs', 12],
      ['text-sm', 14],
    ]);
  });

  const files = readdirSync(DIR).filter(
    (file) => file.endsWith('.tsx') && !file.includes('.spec.'),
  );

  for (const file of files) {
    it(`${file} uses no font size under 13 px`, () => {
      const tooSmall = fontSizes(readFileSync(join(DIR, file), 'utf8')).filter(
        ([, px]) => px < sizes.minText,
      );

      expect(tooSmall.map(([name]) => name)).toEqual([]);
    });
  }
});
