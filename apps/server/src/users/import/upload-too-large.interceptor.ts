import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { ImportFileError } from './import-file-error.js';

/**
 * The upload stops at the size limit, before the file is read, and Nest
 * reports that as 413. The import answers every refused file the same way,
 * 400 IMPORT_FILE_INVALID with a reason, so the admin panel has one case to
 * handle. Placed before the file interceptor so it sees that error.
 */
@Injectable()
export class UploadTooLargeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            error instanceof PayloadTooLargeException ? new ImportFileError('too_large') : error,
          ),
        ),
      );
  }
}
