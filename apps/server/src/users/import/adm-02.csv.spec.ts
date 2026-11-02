import { describe, it, expect } from 'vitest';
import { CsvError, parseCsv } from './csv.js';

/**
 * ADM-02: the CSV half of the student import. Files come from Excel's "Save as
 * CSV UTF-8" and from Google Sheets, so the parser has to read what those write:
 * a byte order mark, quoted fields, CRLF line ends, and semicolons where the
 * Windows list separator is one.
 */

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('ADM-02 CSV parser', () => {
  it('reads a header and rows', () => {
    expect(parseCsv(utf8('name,class,phone\nAyesha Khan,B-12,0300-1234567\n'))).toEqual([
      ['name', 'class', 'phone'],
      ['Ayesha Khan', 'B-12', '0300-1234567'],
    ]);
  });

  it('reads Windows line ends and a last line with none', () => {
    expect(parseCsv(utf8('name,class\r\nAyesha Khan,B-12\r\nBilal Ahmed,B-13'))).toEqual([
      ['name', 'class'],
      ['Ayesha Khan', 'B-12'],
      ['Bilal Ahmed', 'B-13'],
    ]);
  });

  it('drops the byte order mark Excel puts at the start', () => {
    expect(parseCsv(utf8('﻿name,class\nAyesha Khan,B-12'))[0]).toEqual(['name', 'class']);
  });

  it('keeps commas, quotes and line breaks inside quoted fields', () => {
    expect(
      parseCsv(utf8('name,class\n"Khan, Ayesha",B-12\n"Ali ""Ali"" Raza",B-12\n"two\nlines",B-12')),
    ).toEqual([
      ['name', 'class'],
      ['Khan, Ayesha', 'B-12'],
      ['Ali "Ali" Raza', 'B-12'],
      ['two\nlines', 'B-12'],
    ]);
  });

  it('reads semicolons when the header has no comma', () => {
    expect(parseCsv(utf8('name;class;phone\nAyesha Khan;B-12;0300-1234567'))).toEqual([
      ['name', 'class', 'phone'],
      ['Ayesha Khan', 'B-12', '0300-1234567'],
    ]);
  });

  it('keeps empty fields and blank lines, so row numbers match the spreadsheet', () => {
    expect(parseCsv(utf8('name,class,phone\nAyesha Khan,,\n\nBilal Ahmed,B-13,'))).toEqual([
      ['name', 'class', 'phone'],
      ['Ayesha Khan', '', ''],
      [''],
      ['Bilal Ahmed', 'B-13', ''],
    ]);
  });

  it('reads names in Urdu script', () => {
    expect(parseCsv(utf8('name,class\nعائشہ خان,B-12'))[1]).toEqual(['عائشہ خان', 'B-12']);
  });

  it('refuses a file that is not UTF-8', () => {
    // "Zoë" in Windows-1252: the ë is a lone 0xEB byte.
    expect(() =>
      parseCsv(new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x5a, 0x6f, 0xeb])),
    ).toThrow(CsvError);
  });

  it('refuses a quote that is never closed', () => {
    expect(() => parseCsv(utf8('name,class\n"Ayesha Khan,B-12'))).toThrow(CsvError);
  });

  it('refuses text after a closing quote', () => {
    expect(() => parseCsv(utf8('name,class\n"Ayesha" Khan,B-12'))).toThrow(CsvError);
  });

  it('reads an empty file as no rows', () => {
    expect(parseCsv(utf8(''))).toEqual([]);
  });
});
