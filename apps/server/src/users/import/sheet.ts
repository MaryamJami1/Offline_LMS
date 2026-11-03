import { IMPORT_MAX_BYTES } from '@lingualab/shared';
import { InvalidInputError, readSheet } from 'read-excel-file/node';
import { CsvError, parseCsv } from './csv.js';
import { ImportFileError } from './import-file-error.js';

/** The little of an uploaded file the import reads. */
export interface ImportUpload {
  buffer: Buffer;
  originalname: string;
}

/**
 * Most a workbook may unpack to. A 2 MB .xlsx of real students unpacks to a few
 * megabytes; a file that claims far more is refused before it is unpacked, so
 * a zip of zeros cannot fill the server's memory.
 */
const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
/** Excel 97–2003 (.xls) files are OLE compound documents. */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return (
    buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte)
  );
}

/**
 * The total size the zip's own directory says its files unpack to, or
 * Infinity when the directory cannot be read or uses 64-bit sizes.
 */
export function declaredUnpackedSize(zip: Buffer): number {
  const END_OF_DIRECTORY = 0x06054b50;
  const DIRECTORY_ENTRY = 0x02014b50;
  const smallest = Math.max(0, zip.length - 22 - 0xffff);

  let end = -1;
  for (let at = zip.length - 22; at >= smallest; at -= 1) {
    if (zip.readUInt32LE(at) === END_OF_DIRECTORY) {
      end = at;
      break;
    }
  }
  if (end < 0) {
    return Infinity;
  }

  const entries = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  let total = 0;
  for (let entry = 0; entry < entries; entry += 1) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== DIRECTORY_ENTRY) {
      return Infinity;
    }
    const size = zip.readUInt32LE(at + 24);
    if (size === 0xffffffff) {
      return Infinity;
    }
    total += size;
    at += 46 + zip.readUInt16LE(at + 28) + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return total;
}

function asText(cell: unknown): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  if (cell instanceof Date) {
    return cell.toISOString().slice(0, 10);
  }
  return String(cell);
}

async function readWorkbook(buffer: Buffer): Promise<string[][]> {
  if (declaredUnpackedSize(buffer) > MAX_UNPACKED_BYTES) {
    throw new ImportFileError('too_large');
  }
  try {
    // Numbers come back as the text the cell holds, so a phone column Excel
    // stored as a number keeps its digits instead of becoming 3001234567.0.
    const rows = await readSheet<string>(buffer, { parseNumber: (text: string) => text });
    return rows.map((cells) => cells.map(asText));
  } catch (error) {
    if (error instanceof InvalidInputError && error.code === 'XLS_FILE_NOT_SUPPORTED') {
      throw new ImportFileError('unsupported_type');
    }
    throw new ImportFileError('unreadable');
  }
}

/**
 * Reads an uploaded student list into rows of text, the first row being the
 * header. An .xlsx is recognised by its contents, whatever it is called; a CSV
 * by its name, because plain text has no signature of its own.
 */
export async function readImportFile(upload: ImportUpload): Promise<string[][]> {
  const { buffer, originalname } = upload;
  if (buffer.length > IMPORT_MAX_BYTES) {
    throw new ImportFileError('too_large');
  }
  if (startsWith(buffer, ZIP_SIGNATURE)) {
    return readWorkbook(buffer);
  }
  if (startsWith(buffer, OLE_SIGNATURE) || !originalname.toLowerCase().endsWith('.csv')) {
    throw new ImportFileError('unsupported_type');
  }
  try {
    return parseCsv(buffer);
  } catch (error) {
    if (error instanceof CsvError) {
      throw new ImportFileError('unreadable');
    }
    throw error;
  }
}
