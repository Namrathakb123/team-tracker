// Compares two table values for sorting. Numbers are compared by size. Anything else is compared as
// text, alphabetically without regard to capital letters, and with numbers inside the text in number
// order ('Client 2' before 'Client 10'). Returns a negative number when a comes first.
export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return String(a ?? '').trim().localeCompare(String(b ?? '').trim(), 'en', { sensitivity: 'base', numeric: true });
}
