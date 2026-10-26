export function normalizeSeatCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('Seat code cannot be empty');
  }
  return trimmed.toUpperCase();
}
