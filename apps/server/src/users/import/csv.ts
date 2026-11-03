/**
 * A CSV reader for the student import (ADM-02), written here rather than taken
 * from a library because the import needs only this: RFC 4180 quoting, the
 * byte order mark Excel writes, any line end, and a semicolon separator where
 * Windows uses one. Every record is returned, blank ones included, so record n
 * is row n of the spreadsheet the file came from.
 */

/** The file cannot be read as CSV at all; the import reports it as unreadable. */
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

const BOM = '﻿';

function decode(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.startsWith(BOM) ? text.slice(BOM.length) : text;
  } catch {
    throw new CsvError('The file is not UTF-8 text. Save it again as "CSV UTF-8".');
  }
}

/** A semicolon only when the first line has one and no comma. */
function separatorOf(text: string): string {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  return !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
}

export function parseCsv(bytes: Uint8Array): string[][] {
  const text = decode(bytes);
  if (text.length === 0) {
    return [];
  }
  const separator = separatorOf(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  /** A quoted field has just closed: only a separator or a line end may follow. */
  let closed = false;

  const endField = (): void => {
    row.push(field);
    field = '';
    closed = false;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        closed = true;
      }
      continue;
    }

    if (char === separator) {
      endField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      endRow();
    } else if (closed) {
      throw new CsvError(`Text after a closing quote on row ${rows.length + 1}.`);
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new CsvError(`A quote on row ${rows.length + 1} is never closed.`);
  }
  // A file that ends with a line break has no last record to close.
  const last = text[text.length - 1];
  if (last !== '\n' && last !== '\r') {
    endRow();
  }
  return rows;
}
