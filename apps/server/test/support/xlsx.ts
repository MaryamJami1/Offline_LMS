import { strToU8, zipSync } from 'fflate';
import type { Zippable } from 'fflate';

/**
 * Builds a real .xlsx workbook with one sheet, so the import is tested against
 * the file format Excel writes rather than a binary checked into the repo.
 * Strings are written inline; numbers as number cells, the way Excel stores a
 * phone column that was never formatted as text.
 */

type Cell = string | number | null;

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number): string {
  let name = '';
  let rest = index + 1;
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    rest = Math.floor((rest - 1) / 26);
  }
  return name;
}

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((cells, rowIndex) => {
      const row = rowIndex + 1;
      const xml = cells
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${row}`;
          if (cell === null) {
            return '';
          }
          if (typeof cell === 'number') {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escape(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${row}">${xml}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

export function buildXlsx(rows: Cell[][]): Buffer {
  const files: Zippable = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Students" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(rows)),
  };
  return Buffer.from(zipSync(files));
}

/** A zip that claims to unpack to far more than it holds: one large file of zeros. */
export function buildZipOfZeros(bytes: number): Buffer {
  return Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(bytes) }, { level: 9 }));
}

/**
 * A small zip whose directory says its one file unpacks to `bytes`. That size
 * is what the import checks before unpacking, so this stands in for a real zip
 * bomb without spending seconds compressing tens of megabytes in every run.
 */
export function buildZipClaiming(bytes: number): Buffer {
  const zip = buildZipOfZeros(10);
  const endOfDirectory = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const directory = zip.readUInt32LE(endOfDirectory + 16);
  zip.writeUInt32LE(bytes, directory + 24);
  return zip;
}
