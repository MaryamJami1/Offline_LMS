import { HttpException } from '@nestjs/common';

/**
 * An error the apps can act on: the body is always
 * `{ error: { code, message, details } }` (docs/docs/04-api-and-events.md).
 * Messages and details never carry a password, token or hash.
 */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message, status);
  }
}
