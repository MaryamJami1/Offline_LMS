import { describe, it, expect } from 'vitest';
import { IMPORT_MAX_ROWS } from '@lingualab/shared';
import { ImportFileError } from './import-file-error.js';
import { checkRows, duplicateKey } from './rows.js';

/**
 * ADM-02 / T-ADM-02, the part that needs no database: which rows of a file are
 * students to create, which are refused and why, by the row number the
 * spreadsheet shows.
 */

const CLASSES = new Map([
  ['B-12', { id: 'class-b12', code: 'B-12' }],
  ['B-13', { id: 'class-b13', code: 'B-13' }],
]);

const HEADER = ['name', 'class', 'phone'];

function reasonOf(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error instanceof ImportFileError
      ? { reason: error.reason, missing: error.missing }
      : error;
  }
  return undefined;
}

describe('ADM-02 import rows', () => {
  it('accepts good rows, numbered as the spreadsheet numbers them', () => {
    const result = checkRows(
      [HEADER, ['Ayesha Khan', 'B-12', '0300-1234567'], ['Bilal Ahmed', 'B-13', '']],
      CLASSES,
    );

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      {
        row: 2,
        fullName: 'Ayesha Khan',
        classId: 'class-b12',
        classCode: 'B-12',
        phone: '0300-1234567',
      },
      { row: 3, fullName: 'Bilal Ahmed', classId: 'class-b13', classCode: 'B-13', phone: null },
    ]);
    expect(result.rows).toBe(2);
  });

  it('reads the columns in any order and any case', () => {
    const result = checkRows(
      [
        [' Phone', 'NAME', 'Class '],
        ['0300-1234567', 'Ayesha Khan', 'b-12'],
      ],
      CLASSES,
    );

    expect(result.candidates).toEqual([
      {
        row: 2,
        fullName: 'Ayesha Khan',
        classId: 'class-b12',
        classCode: 'B-12',
        phone: '0300-1234567',
      },
    ]);
  });

  it('reports each bad row with its row number and keeps the good ones', () => {
    const result = checkRows(
      [
        HEADER,
        ['Ayesha Khan', 'B-12', ''],
        ['', 'B-12', ''],
        ['Bilal Ahmed', '', ''],
        ['Fatima Noor', 'B-99', ''],
        ['Hassan Raza', 'B-12', 'call me'],
        ['Zainab Malik', 'B-13', ''],
      ],
      CLASSES,
    );

    expect(result.candidates.map((candidate) => candidate.row)).toEqual([2, 7]);
    expect(result.errors.map(({ row, field, code }) => ({ row, field, code }))).toEqual([
      { row: 3, field: 'name', code: 'NAME_REQUIRED' },
      { row: 4, field: 'class', code: 'CLASS_REQUIRED' },
      { row: 5, field: 'class', code: 'CLASS_NOT_FOUND' },
      { row: 6, field: 'phone', code: 'PHONE_INVALID' },
    ]);
  });

  it('never repeats the value it refused in the message', () => {
    const result = checkRows([HEADER, ['Hassan Raza', 'B-12', 'secret-looking-text']], CLASSES);

    expect(JSON.stringify(result.errors)).not.toContain('secret-looking-text');
  });

  it('refuses a name over 100 characters', () => {
    const result = checkRows([HEADER, ['a'.repeat(101), 'B-12', '']], CLASSES);

    expect(result.errors).toMatchObject([{ row: 2, field: 'name', code: 'NAME_INVALID' }]);
  });

  it('skips blank rows without renumbering the rest', () => {
    const result = checkRows([HEADER, ['', '', ''], [''], ['Ayesha Khan', 'B-12', '']], CLASSES);

    expect(result.errors).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.row)).toEqual([4]);
    expect(result.rows).toBe(1);
  });

  it('refuses a second row for the same student, pointing at the first', () => {
    const result = checkRows(
      [
        HEADER,
        ['Ayesha Khan', 'B-12', '0300-1234567'],
        ['  ayesha   KHAN ', 'B-13', '0300 1234567'],
        ['Bilal Ahmed', 'B-12', ''],
        ['Bilal Ahmed', 'b-12', ''],
      ],
      CLASSES,
    );

    expect(result.candidates.map((candidate) => candidate.row)).toEqual([2, 4]);
    expect(result.errors).toMatchObject([
      { row: 3, code: 'DUPLICATE_IN_FILE', duplicateOfRow: 2 },
      { row: 5, code: 'DUPLICATE_IN_FILE', duplicateOfRow: 4 },
    ]);
  });

  it('takes a row with no phone as the student of that name already in that class', () => {
    const result = checkRows(
      [HEADER, ['Ayesha Khan', 'B-12', '0300-1234567'], ['Ayesha Khan', 'B-12', '']],
      CLASSES,
    );

    expect(result.errors).toMatchObject([{ row: 3, code: 'DUPLICATE_IN_FILE', duplicateOfRow: 2 }]);
  });

  it('takes the same name with a different phone as a different student', () => {
    const result = checkRows(
      [HEADER, ['Ali Raza', 'B-12', '0300-1111111'], ['Ali Raza', 'B-12', '0300-2222222']],
      CLASSES,
    );

    expect(result.candidates).toHaveLength(2);
  });

  it('refuses a file without the three columns, naming the missing ones', () => {
    expect(
      reasonOf(() =>
        checkRows(
          [
            ['name', 'phone'],
            ['Ayesha Khan', ''],
          ],
          CLASSES,
        ),
      ),
    ).toEqual({
      reason: 'missing_columns',
      missing: ['class'],
    });
  });

  it('refuses a file with a header and no students', () => {
    expect(reasonOf(() => checkRows([HEADER, ['', '', '']], CLASSES))).toMatchObject({
      reason: 'no_rows',
    });
    expect(reasonOf(() => checkRows([], CLASSES))).toMatchObject({ reason: 'missing_columns' });
  });

  it(`refuses more than ${IMPORT_MAX_ROWS} rows`, () => {
    const rows = [
      HEADER,
      ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, index) => [
        `Student ${index}`,
        'B-12',
        '',
      ]),
    ];

    expect(reasonOf(() => checkRows(rows, CLASSES))).toMatchObject({ reason: 'too_many_rows' });
  });
});

describe('ADM-02 duplicate key', () => {
  it('matches on name and phone digits when there is a phone', () => {
    expect(duplicateKey('Ayesha  Khan', '+92 (300) 1234567', 'B-12')).toBe(
      duplicateKey('ayesha khan', '923001234567', 'B-13'),
    );
  });

  it('matches on name and class when there is no phone', () => {
    expect(duplicateKey('Ayesha Khan', null, 'B-12')).toBe(
      duplicateKey('AYESHA KHAN', null, 'b-12'),
    );
    expect(duplicateKey('Ayesha Khan', null, 'B-12')).not.toBe(
      duplicateKey('Ayesha Khan', null, 'B-13'),
    );
  });
});
