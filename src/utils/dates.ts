// Dates are stored and compared as "YYYY-MM-DD" in the user's own time zone.
// (toISOString() gives the UTC date, which in India is still yesterday until 5:30 AM,
// and new Date("YYYY-MM-DD") reads a plain date as UTC midnight instead of local midnight.)

const pad = (n: number) => String(n).padStart(2, '0');
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// "YYYY-MM-DD" for a moment in local time. Without an argument: today.
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Reads a stored date or time. A plain "YYYY-MM-DD" means the start of that day in local time.
// Returns null for missing or unreadable values.
export function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const m = DATE_ONLY.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// "YYYY-MM-DD" for a stored date or time (a plain date is kept as it is). Null if missing or unreadable.
export function toDateKey(value: string | number | Date | null | undefined): string | null {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value;
  const d = parseDate(value);
  return d ? localDateKey(d) : null;
}

// First and last millisecond of a "YYYY-MM-DD" day in local time.
export function startOfDay(key: string): number {
  const d = parseDate(key);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : NaN;
}
export function endOfDay(key: string): number {
  const d = parseDate(key);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1 : NaN;
}

// Record ids were made with Date.now(), so an id of 13 digits is the exact time the record was added.
// Only times between 2020 and a day from now are trusted. Returns an ISO date and time, or null.
const EARLIEST_ID_TIME = Date.UTC(2020, 0, 1);
export function timeFromId(id: unknown): string | null {
  const text = String(id ?? '');
  if (!/^[0-9]{13}$/.test(text)) return null;
  const time = Number(text);
  return time >= EARLIEST_ID_TIME && time <= Date.now() + 24 * 60 * 60 * 1000 ? new Date(time).toISOString() : null;
}

// The Sunday that ends the week (Monday to Sunday) containing a "YYYY-MM-DD" day.
export function endOfWeek(key: string): string {
  const d = parseDate(key) || new Date();
  return addDays(localDateKey(d), (7 - d.getDay()) % 7);
}

// How dates are shown, the same way everywhere: "24 Sep 2026". With `weekday`: "Thursday, 24 Sep 2026".
// Built by hand rather than with toLocaleDateString, which differs between browsers (some write "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function formatDate(value: string | number | Date | null | undefined, options: { weekday?: boolean } = {}): string {
  const d = parseDate(value);
  if (!d) return '';
  const text = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return options.weekday ? `${WEEKDAYS[d.getDay()]}, ${text}` : text;
}

// A time of day: "2:05 pm".
export function formatTime(value: string | number | Date | null | undefined): string {
  const d = parseDate(value);
  if (!d) return '';
  const hour = d.getHours();
  return `${hour % 12 || 12}:${pad(d.getMinutes())} ${hour < 12 ? 'am' : 'pm'}`;
}

// A date and time: "24 Sep 2026, 2:05 pm". A plain date ("YYYY-MM-DD") has no time of day, so none is shown.
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return formatDate(value);
  const d = parseDate(value);
  return d ? `${formatDate(d)}, ${formatTime(d)}` : '';
}

// A "YYYY-MM-DD" date moved by a number of days.
// "Good morning" before noon, "Good afternoon" before 5 pm, then "Good evening" (local time).
export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function addDays(key: string, days: number): string {
  const d = parseDate(key) || new Date();
  return localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}
