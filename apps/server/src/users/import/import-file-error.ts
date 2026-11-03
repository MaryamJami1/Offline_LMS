import type { ImportFileReason } from '@lingualab/shared';
import { AppError } from '../../common/app-error.js';

const MESSAGES: Record<ImportFileReason, string> = {
  no_file: 'Choose a file to import',
  too_large: 'The file is too large; import at most 2 MB at a time',
  unsupported_type:
    'Import an Excel workbook (.xlsx) or a CSV file. Save an older .xls file as .xlsx first',
  unreadable: 'The file could not be read. Save it again as .xlsx or "CSV UTF-8"',
  missing_columns: 'The first row must name the columns: name, class and phone',
  no_rows: 'The file has no students in it',
  too_many_rows: 'Import at most 1000 students at a time',
};

/**
 * The whole file is refused and nothing is created: 400 IMPORT_FILE_INVALID,
 * with the reason, and for missing columns which ones, in `details`. Both come
 * from the server's own list, never from the file.
 */
export class ImportFileError extends AppError {
  constructor(
    readonly reason: ImportFileReason,
    readonly missing?: string[],
  ) {
    super(
      400,
      'IMPORT_FILE_INVALID',
      MESSAGES[reason],
      missing === undefined ? { reason } : { reason, missing },
    );
  }
}
