import type { INestApplication } from '@nestjs/common';
import { ErrorFilter } from './common/error.filter.js';

/**
 * Everything the HTTP app needs beyond its modules, in one place so the tests
 * run the application the lab server runs.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ErrorFilter());
}
