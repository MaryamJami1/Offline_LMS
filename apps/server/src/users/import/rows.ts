import { IMPORT_COLUMNS, IMPORT_MAX_ROWS, fullNameSchema, phoneSchema } from '@lingualab/shared';
import type { ImportRowError } from '@lingualab/shared';
import { ImportFileError } from './import-file-error.js';

/** A class a row may name, looked up by its code without regard to case. */
export interface ImportClass {
  id: string;
  code: string;
}

/** A row that passed every check this file can make on its own. */
export interface ImportCandidate {
  row: number;
  fullName: string;
  classId: string;
  classCode: string;
  phone: string | null;
}

export interface CheckedRows {
  candidates: ImportCandidate[];
  errors: ImportRowError[];
  /** Rows that hold anything at all; blank ones are not counted. */
  rows: number;
}

type Column = (typeof IMPORT_COLUMNS)[number];

/**
 * Two rows are the same student when the name matches, ignoring case and
 * spacing, and the phone digits match. Without a phone, the class has to match
 * instead, so two students of one name in different classes stay two students.
 */
export function duplicateKey(fullName: string, phone: string | null, classCode: string): string {
  const name = fullName.trim().replace(/\s+/g, ' ').toLowerCase();
  const digits = phone === null ? '' : phone.replace(/\D/g, '');
  return digits.length > 0 ? `${name}|phone:${digits}` : `${name}|class:${classCode.toUpperCase()}`;
}

/**
 * Every key a student already known can be matched by: name and phone when
 * there is a phone, and name and class for each of their classes, so a row
 * without a phone still finds them.
 */
export function studentKeys(
  fullName: string,
  phone: string | null,
  classCodes: string[],
): string[] {
  const keys = classCodes.map((code) => duplicateKey(fullName, null, code));
  if (phone !== null && phone.replace(/\D/g, '').length > 0) {
    keys.unshift(duplicateKey(fullName, phone, ''));
  }
  return keys;
}

function columnsOf(header: string[]): Record<Column, number> {
  const names = header.map((cell) => cell.trim().toLowerCase());
  const missing = IMPORT_COLUMNS.filter((column) => !names.includes(column));
  if (missing.length > 0) {
    throw new ImportFileError('missing_columns', missing);
  }
  return {
    name: names.indexOf('name'),
    class: names.indexOf('class'),
    phone: names.indexOf('phone'),
  };
}

/**
 * Splits a file's rows into students to create and rows to refuse. The first
 * row is the header; row numbers are the ones the spreadsheet shows, so the
 * header is row 1 and blank rows still take up a number. What this cannot see
 * is a student already in the database: the service checks that.
 */
export function checkRows(
  rows: string[][],
  classes: ReadonlyMap<string, ImportClass>,
): CheckedRows {
  const [header, ...body] = rows;
  if (header === undefined) {
    throw new ImportFileError('missing_columns', [...IMPORT_COLUMNS]);
  }
  const columns = columnsOf(header);

  const filled = body
    .map((cells, index) => ({ cells, row: index + 2 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim().length > 0));
  if (filled.length === 0) {
    throw new ImportFileError('no_rows');
  }
  if (filled.length > IMPORT_MAX_ROWS) {
    throw new ImportFileError('too_many_rows');
  }

  const candidates: ImportCandidate[] = [];
  const errors: ImportRowError[] = [];
  const firstRowOf = new Map<string, number>();

  for (const { cells, row } of filled) {
    const rawName = (cells[columns.name] ?? '').trim();
    const rawClass = (cells[columns.class] ?? '').trim();
    const rawPhone = (cells[columns.phone] ?? '').trim();

    if (rawName.length === 0) {
      errors.push({ row, field: 'name', code: 'NAME_REQUIRED', message: 'The name is empty' });
      continue;
    }
    const name = fullNameSchema.safeParse(rawName);
    if (!name.success) {
      errors.push({
        row,
        field: 'name',
        code: 'NAME_INVALID',
        message: 'The name is longer than 100 characters',
      });
      continue;
    }
    if (rawClass.length === 0) {
      errors.push({ row, field: 'class', code: 'CLASS_REQUIRED', message: 'The class is empty' });
      continue;
    }
    const taught = classes.get(rawClass.toUpperCase());
    if (taught === undefined) {
      errors.push({
        row,
        field: 'class',
        code: 'CLASS_NOT_FOUND',
        message: 'There is no class with this code',
      });
      continue;
    }
    let phone: string | null = null;
    if (rawPhone.length > 0) {
      const parsed = phoneSchema.safeParse(rawPhone);
      if (!parsed.success) {
        errors.push({
          row,
          field: 'phone',
          code: 'PHONE_INVALID',
          message: 'The phone number needs 7 to 15 digits',
        });
        continue;
      }
      phone = parsed.data;
    }

    const key = duplicateKey(name.data, phone, taught.code);
    const first = firstRowOf.get(key);
    if (first !== undefined) {
      errors.push({
        row,
        field: 'name',
        code: 'DUPLICATE_IN_FILE',
        message: 'The same student is on an earlier row',
        duplicateOfRow: first,
      });
      continue;
    }
    // A student with a phone is also the one of that name in that class, for a
    // later row that has no phone to compare.
    for (const known of studentKeys(name.data, phone, [taught.code])) {
      if (!firstRowOf.has(known)) {
        firstRowOf.set(known, row);
      }
    }
    candidates.push({
      row,
      fullName: name.data,
      classId: taught.id,
      classCode: taught.code,
      phone,
    });
  }

  return { candidates, errors, rows: filled.length };
}
