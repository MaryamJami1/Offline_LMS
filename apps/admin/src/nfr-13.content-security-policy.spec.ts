import { describe, it, expect } from 'vitest';
import { caddyfilePolicy, directivesOf, policyIn } from './csp.js';
import viteConfig from '../vite.config.js';

/**
 * NFR-13 for the admin panel: the refresh token sits in sessionStorage, so a
 * script injected into the page could read it. Caddy sends a strict
 * Content-Security-Policy that lets the page run only the panel's own scripts.
 * The policy is written once, in infra/Caddyfile; `vite preview`, which the
 * end-to-end journey runs against, sends the same header read from there, so
 * the journey proves the panel works under the policy the lab server sends.
 */

describe('NFR-13 the admin panel runs under a strict Content-Security-Policy', () => {
  it('is set in infra/Caddyfile', () => {
    expect(caddyfilePolicy()).toMatch(/default-src 'self'/);
  });

  it("runs only the panel's own scripts: no inline code, no eval, no other address", () => {
    const directives = directivesOf(caddyfilePolicy());

    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('default-src')).toEqual(["'self'"]);
  });

  it('loads and talks to nothing but its own server', () => {
    const directives = directivesOf(caddyfilePolicy());

    for (const [name, sources] of directives) {
      for (const source of sources) {
        expect(source, `${name} ${source}`).not.toMatch(/^(https?:|wss?:|\*)/);
      }
    }
    expect(directives.get('connect-src')).toEqual(["'self'"]);
  });

  it("allows inline <style> elements only, which Radix's dialogs inject, and nothing else inline", () => {
    const directives = directivesOf(caddyfilePolicy());
    const inline = [...directives]
      .filter(([, sources]) => sources.some((source) => /unsafe|nonce-|sha\d+-/.test(source)))
      .map(([name, sources]) => `${name} ${sources.join(' ')}`);

    expect(inline).toEqual(["style-src-elem 'self' 'unsafe-inline'"]);
  });

  it('cannot be framed, embed plugins, or have its base address or forms sent elsewhere', () => {
    const directives = directivesOf(caddyfilePolicy());

    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
  });

  it('is sent by vite preview exactly as the Caddyfile writes it', () => {
    const headers = viteConfig.preview?.headers ?? {};

    expect(headers['Content-Security-Policy']).toBe(caddyfilePolicy());
  });
});

describe('policyIn reads the policy out of a Caddyfile', () => {
  it('finds the header value', () => {
    const caddyfile = `site {\n\theader Content-Security-Policy "default-src 'self'"\n}\n`;

    expect(policyIn(caddyfile)).toBe("default-src 'self'");
  });

  it('refuses a Caddyfile without one, so the panel is never served unguarded by mistake', () => {
    expect(() => policyIn('site {\n}\n')).toThrow(/Content-Security-Policy/);
  });

  it('splits directives and their sources', () => {
    const directives = directivesOf("default-src 'self'; img-src 'self' data:;");

    expect([...directives.entries()]).toEqual([
      ['default-src', ["'self'"]],
      ['img-src', ["'self'", 'data:']],
    ]);
  });
});
