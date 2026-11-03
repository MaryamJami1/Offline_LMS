import { describe, it, expect } from 'vitest';
import { buildXlsx, buildZipClaiming, buildZipOfZeros } from '../../../test/support/xlsx.js';
import { ImportFileError } from './import-file-error.js';
import { readImportFile } from './sheet.js';

/**
 * ADM-02: turning an uploaded .xlsx or .csv into rows of text, and refusing a
 * file that is neither before anything is created.
 */

async function reasonOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
  } catch (error) {
    if (error instanceof ImportFileError) {
      return error.reason;
    }
    throw error;
  }
  return undefined;
}

describe('ADM-02 reading an import file', () => {
  it('reads an Excel workbook into rows of text', async () => {
    const file = buildXlsx([
      ['name', 'class', 'phone'],
      ['Ayesha Khan', 'B-12', '0300-1234567'],
      ['عائشہ خان', 'B-13', null],
    ]);

    expect(await readImportFile({ buffer: file, originalname: 'students.xlsx' })).toEqual([
      ['name', 'class', 'phone'],
      ['Ayesha Khan', 'B-12', '0300-1234567'],
      ['عائشہ خان', 'B-13', ''],
    ]);
  });

  it('keeps a phone stored as a number as its digits, not as 3.0012e9', async () => {
    const file = buildXlsx([
      ['name', 'class', 'phone'],
      ['Ayesha Khan', 'B-12', 3001234567],
    ]);

    const rows = await readImportFile({ buffer: file, originalname: 'students.xlsx' });
    expect(rows[1]?.[2]).toBe('3001234567');
  });

  it('keeps the row numbers when a row in the middle is empty', async () => {
    const file = buildXlsx([['name', 'class', 'phone'], [], ['Ayesha Khan', 'B-12', null]]);

    const rows = await readImportFile({ buffer: file, originalname: 'students.xlsx' });
    expect(rows[2]?.[0]).toBe('Ayesha Khan');
  });

  it('reads a workbook whatever its file name says', async () => {
    const file = buildXlsx([['name', 'class', 'phone']]);

    expect(await readImportFile({ buffer: file, originalname: 'STUDENTS' })).toEqual([
      ['name', 'class', 'phone'],
    ]);
  });

  it('reads a CSV file', async () => {
    const file = Buffer.from('name,class,phone\r\nAyesha Khan,B-12,0300-1234567\r\n');

    expect(await readImportFile({ buffer: file, originalname: 'Students.CSV' })).toEqual([
      ['name', 'class', 'phone'],
      ['Ayesha Khan', 'B-12', '0300-1234567'],
    ]);
  });

  it('refuses a CSV that is not UTF-8 as unreadable', async () => {
    const file = Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x5a, 0x6f, 0xeb]);

    expect(await reasonOf(readImportFile({ buffer: file, originalname: 'students.csv' }))).toBe(
      'unreadable',
    );
  });

  it('refuses an old .xls workbook, which needs saving as .xlsx', async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

    expect(await reasonOf(readImportFile({ buffer: ole, originalname: 'students.xls' }))).toBe(
      'unsupported_type',
    );
  });

  it('refuses a file that is neither', async () => {
    const pdf = Buffer.from('%PDF-1.7 not a spreadsheet');

    expect(await reasonOf(readImportFile({ buffer: pdf, originalname: 'students.pdf' }))).toBe(
      'unsupported_type',
    );
  });

  it('refuses a zip that is not a workbook as unreadable', async () => {
    const zip = buildZipOfZeros(10);

    expect(await reasonOf(readImportFile({ buffer: zip, originalname: 'students.xlsx' }))).toBe(
      'unreadable',
    );
  });

  it('refuses a workbook that would unpack to more than it can hold, before unpacking it', async () => {
    const bomb = buildZipClaiming(60 * 1024 * 1024);

    expect(await reasonOf(readImportFile({ buffer: bomb, originalname: 'students.xlsx' }))).toBe(
      'too_large',
    );
  });

  it('refuses a file over 2 MB', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0x61);

    expect(await reasonOf(readImportFile({ buffer: big, originalname: 'students.csv' }))).toBe(
      'too_large',
    );
  });
});
