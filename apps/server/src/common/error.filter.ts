import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { AppError } from './app-error.js';
import type { HttpResponse } from './http.js';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'RULE_BROKEN',
};

/**
 * Turns every error into the documented body. Nothing from the request body is
 * logged or returned, so passwords and tokens cannot reach the log through a
 * failure (NFR-13).
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Request');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();

    if (exception instanceof AppError) {
      response.status(exception.getStatus()).json({
        error: { code: exception.code, message: exception.message, details: exception.details },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: {
          code: CODE_BY_STATUS[status] ?? 'ERROR',
          message: exception.message,
          details: {},
        },
      });
      return;
    }

    // The message only: a stack or a request body could carry a secret.
    this.logger.error(
      `Unhandled error: ${exception instanceof Error ? exception.message : 'unknown'}`,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: {} },
    });
  }
}
