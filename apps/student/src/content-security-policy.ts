/**
 * The student app's screens are loaded from a file, not served by Caddy, so
 * their Content-Security-Policy is written into the built page (STU-06,
 * NFR-01). Only the built page gets it: Vite's dev server injects inline
 * scripts for hot reload, as with the admin panel. Node-only: the screens'
 * own bundle never imports this file.
 */
export const STUDENT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // Radix's dialogs add <style> elements; nothing else inline (infra/Caddyfile).
  "style-src-elem 'self' 'unsafe-inline'",
  // The logo arrives from the main process as a data URL.
  "img-src 'self' data:",
  "font-src 'self'",
  // Every server call goes through the main process.
  "connect-src 'none'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** The page with the policy as the first thing after its charset. */
export function withPolicy(html: string): string {
  return html.replace(
    /(<meta charset="utf-8" \/>)/,
    `$1<meta http-equiv="Content-Security-Policy" content="${STUDENT_CSP}" />`,
  );
}
