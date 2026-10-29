import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from './app-error.js';

/**
 * Checks a request body against a schema from packages/shared. Only the field
 * path and the rule that failed are reported back: the value itself never
 * leaves the server, so a mistyped password cannot come back in an error.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(400, 'VALIDATION_FAILED', 'The request body is not valid', {
        issues: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
