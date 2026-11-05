import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NFR-01 for the admin panel: it is served by the institute's own server and
 * loads nothing from the internet. Fonts come from @fontsource through the UI
 * kit's stylesheet; no page or stylesheet of the panel names a web address.
 */

const APP = join(import.meta.dirname, '..');

function read(path: string): string {
  return readFileSync(join(APP, path), 'utf8');
}

describe('NFR-01 the admin panel works offline', () => {
  it('has a page that loads only its own script', () => {
    const page = read('index.html');

    expect(page).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(page).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
  });

  it("takes its fonts and colours from the UI kit's stylesheet, and its own classes from its source", () => {
    const styles = read('src/styles.css');

    expect(styles).toContain("@import '@lingualab/ui/styles.css';");
    expect(styles).toContain("@source '.';");
    expect(styles).not.toMatch(/https?:\/\//);
  });

  it('names no web address anywhere in its source', () => {
    const sources = ['src/main.tsx', 'src/app.tsx', 'vite.config.ts'].filter((path) =>
      existsSync(join(APP, path)),
    );

    expect(sources).toHaveLength(3);
    for (const path of sources) {
      expect(read(path), path).not.toMatch(/https?:\/\/(?!localhost|127\.0\.0\.1)/);
    }
  });

  it('puts no title in the page: the software name comes from the branding (rule 8)', () => {
    expect(read('index.html')).toMatch(/<title><\/title>/);
  });
});
