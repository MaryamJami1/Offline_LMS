// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { STUDENT_CSP, withPolicy } from './content-security-policy.js';

/**
 * STU-06 and NFR-01: the student app's screens run under a strict
 * Content-Security-Policy, set in the built page itself since it is loaded
 * from a file, not served by Caddy. They talk to the server only through the
 * main process, so they may connect nowhere; images are the app's own or the
 * logo the main process hands over as a data URL. As in the admin panel, the
 * one inline exception is Radix's <style> elements (infra/Caddyfile).
 */

function directives(): Map<string, string[]> {
  return new Map(
    STUDENT_CSP.split(';').map((part) => {
      const [name = '', ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe('STU-06 the screens’ Content-Security-Policy', () => {
  it('runs only the app’s own scripts, with nothing inline and no eval', () => {
    expect(directives().get('script-src')).toEqual(["'self'"]);
    expect(directives().get('default-src')).toEqual(["'self'"]);
  });

  it('connects nowhere: every server call goes through the main process', () => {
    expect(directives().get('connect-src')).toEqual(["'none'"]);
  });

  it('allows the logo as a data URL and nothing from another host', () => {
    expect(directives().get('img-src')).toEqual(["'self'", 'data:']);
    expect(STUDENT_CSP).not.toMatch(/https?:/);
  });

  it('allows inline <style> elements only, for Radix, as the admin panel does', () => {
    expect(directives().get('style-src')).toEqual(["'self'"]);
    expect(directives().get('style-src-elem')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('allows no plugins, no base change and no form posts', () => {
    expect(directives().get('object-src')).toEqual(["'none'"]);
    expect(directives().get('base-uri')).toEqual(["'none'"]);
    expect(directives().get('form-action')).toEqual(["'none'"]);
  });

  it('is written into the built page’s head, before anything else loads', () => {
    const html = '<!doctype html><html><head><meta charset="utf-8" /><title></title></head></html>';

    expect(withPolicy(html)).toBe(
      `<!doctype html><html><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${STUDENT_CSP}" /><title></title></head></html>`,
    );
  });
});
