import type { INestApplication } from '@nestjs/common';
import { ErrorFilter } from './common/error.filter.js';

/**
 * Proxies between a lab PC and the server: exactly one, Caddy. Port 3000 is
 * never open to the lab (docs/docs/02-architecture.md), so every request comes
 * through Caddy, which replaces any X-Forwarded-For a PC sends with the address
 * it saw. Trusting that one hop makes `request.ip` the PC's own address, which
 * is what the audit log records.
 */
export const TRUSTED_PROXY_HOPS = 1;

/**
 * Everything the HTTP app needs beyond its modules, in one place so the tests
 * run the application the lab server runs.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ErrorFilter());
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: unknown): void;
  };
  express.set('trust proxy', TRUSTED_PROXY_HOPS);
}
