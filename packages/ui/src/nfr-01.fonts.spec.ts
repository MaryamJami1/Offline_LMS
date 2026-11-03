import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * NFR-01: the UI kit works with the internet cable unplugged. IBM Plex comes
 * from @fontsource inside node_modules, and no stylesheet points anywhere off
 * the machine (rule 4 in CLAUDE.md).
 */

const SRC = import.meta.dirname;
const require = createRequire(import.meta.url);

function stylesheets(): string[] {
  return readdirSync(SRC).filter((file) => file.endsWith('.css'));
}

function fontImports(): string[] {
  return [...readFileSync(join(SRC, 'fonts.css'), 'utf8').matchAll(/@import\s+'([^']+)'/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('NFR-01 fonts are bundled, never fetched', () => {
  it('loads every stylesheet from this package, with no address on the internet', () => {
    expect(stylesheets()).toEqual(expect.arrayContaining(['fonts.css', 'styles.css', 'theme.css']));
    for (const file of stylesheets()) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).not.toMatch(/https?:\/\/|\/\/fonts\./i);
    }
  });

  it('takes IBM Plex Sans 400–700, Mono and Serif from @fontsource', () => {
    expect(fontImports()).toEqual(
      expect.arrayContaining([
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-sans/700.css',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-serif/400.css',
      ]),
    );
  });

  it('finds every font it imports installed on this machine', () => {
    for (const path of fontImports()) {
      expect(existsSync(require.resolve(path)), path).toBe(true);
    }
  });

  it('names the three families in the theme', () => {
    const theme = readFileSync(join(SRC, 'theme.css'), 'utf8');

    expect(theme).toMatch(/--font-sans:\s*'IBM Plex Sans'/);
    expect(theme).toMatch(/--font-mono:\s*'IBM Plex Mono'/);
    expect(theme).toMatch(/--font-serif:\s*'IBM Plex Serif'/);
  });
});
