/** Row letters A to Z: a lab cannot have more rows than there are letters. */
const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface SeatMapSize {
  rows: number;
  seatsPerRow: number;
}

export interface SeatMapEntry {
  /** Row letter and position, as students and teachers read it: A1, E6. */
  code: string;
  row: string;
  position: number;
}

function requireCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a whole number of at least 1`);
  }
}

/**
 * Lays out a lab's seats in room order: row A first, left to right, then row B.
 * Lab 1 is 5 rows of 6 seats (A1 to E6); the design target is 60 seats.
 */
export function buildSeatMap({ rows, seatsPerRow }: SeatMapSize): SeatMapEntry[] {
  requireCount(rows, 'Rows');
  requireCount(seatsPerRow, 'Seats per row');
  if (rows > ROW_LETTERS.length) {
    throw new Error(`A lab cannot have more than ${ROW_LETTERS.length} rows`);
  }

  const seats: SeatMapEntry[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = ROW_LETTERS[rowIndex] as string;
    for (let position = 1; position <= seatsPerRow; position += 1) {
      seats.push({ code: `${row}${position}`, row, position });
    }
  }
  return seats;
}
