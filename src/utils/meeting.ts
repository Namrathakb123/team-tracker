// The daily meeting: its details (set by admins, stored with the Customize settings) and where it stands at a given
// moment. Meeting times are India time, whatever the clock on the device is set to.
import type { Meeting, Settings } from '../types';

// Every setting is a list of text, so single values are stored as one-item lists.
export const MEETING_SETTINGS = {
  link: 'meetingLink', // [link], or [] until an admin adds it
  time: 'meetingTime', // [start, end] as "HH:MM", 24-hour
  days: 'meetingDays', // ['Mon', 'Tue', ...]
  camera: 'meetingCamera', // ['Optional'] or ['On']
  notes: 'meetingNotes', // one note per item
  daysOff: 'meetingDaysOff', // "YYYY-MM-DD reason", one per day with no meeting
} as const;

export const MEETING_TIME_ZONE = 'Asia/Kolkata';
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
export const CAMERA_CHOICES: { value: Camera; label: string }[] = [
  { value: 'Optional', label: 'Optional' },
  { value: 'On', label: 'Please keep it on' },
];
// The reminder at the top of every page shows from this many minutes before the start.
export const REMINDER_MINUTES = 15;
export const MAX_NOTES = 10;
export const MAX_NOTE_LENGTH = 200;
export const MAX_DAY_OFF_REASON = 60;
export const MAX_LINK_LENGTH = 300;
// Shown (greyed out, not clickable) until the real link is added.
export const PLACEHOLDER_LINK = 'meet.google.com/xxx-xxxx-xxx';

export type Camera = 'Optional' | 'On';
export interface DayOff { date: string; note: string }
export interface MeetingSetup {
  /** The meeting link, or '' until an admin adds it. */
  link: string;
  /** Start and end, "HH:MM" (24-hour, India time). */
  start: string;
  end: string;
  /** The weekdays with a meeting ('Mon' … 'Sun'), in week order. */
  days: string[];
  camera: Camera;
  notes: string[];
  /** Days with no meeting (holidays and the like), by date. */
  daysOff: DayOff[];
}

export const DEFAULT_MEETING: MeetingSetup = {
  // 8:30 to 9:30 in the evening (pm), Monday to Friday.
  link: '', start: '20:30', end: '21:30', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], camera: 'Optional', notes: [], daysOff: [],
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar day written "YYYY-MM-DD".
function isDay(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

// Minutes after midnight for "HH:MM" (NaN if it can't be read).
export function toMinutes(time: string): number {
  const m = TIME.exec(time || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

// "8:30 am": the same style as times elsewhere in the app. Empty if the time can't be read.
export function formatClock(time: string): string {
  const minutes = toMinutes(time);
  if (Number.isNaN(minutes)) return '';
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// "8:30–9:30 am", or "11:30 am – 12:30 pm" when the meeting crosses noon.
export function formatTimeRange(start: string, end: string): string {
  const a = formatClock(start), b = formatClock(end);
  if (!a || !b) return a || b;
  const [aTime, aHalf] = a.split(' ');
  return aHalf === b.split(' ')[1] ? `${aTime}–${b}` : `${a} – ${b}`;
}

// "5 min", "1 h", "1 h 5 min".
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// The full name of a weekday: 'Mon' -> 'Monday'.
export function dayName(day: string): string {
  return DAY_NAMES[day] || day;
}

// The weekday ('Mon' … 'Sun') of a "YYYY-MM-DD" day, or '' if it isn't one.
export function weekdayOf(date: string): string {
  if (!isDay(date)) return '';
  const m = DATE.exec(date)!;
  return WEEKDAYS[(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() + 6) % 7];
}

// "Monday to Friday", "Every day", "Every Monday", or "Mon, Wed, Fri".
export function daysLabel(days: string[]): string {
  const ordered = WEEKDAYS.filter((d) => days.includes(d));
  if (ordered.length === 0) return 'No meeting days chosen';
  if (ordered.length === 7) return 'Every day';
  if (ordered.length === 1) return `Every ${dayName(ordered[0])}`;
  const first = WEEKDAYS.indexOf(ordered[0]);
  if (ordered.length >= 3 && ordered.every((d, i) => WEEKDAYS.indexOf(d) === first + i)) {
    return `${dayName(ordered[0])} to ${dayName(ordered[ordered.length - 1])}`;
  }
  return ordered.join(', ');
}

// The weekdays that never have a meeting, as words: "Saturdays and Sundays". Empty if there is a meeting every day.
export function daysWithoutMeetingLabel(days: string[]): string {
  const off = WEEKDAYS.filter((d) => !days.includes(d)).map((d) => `${dayName(d)}s`);
  if (off.length <= 1) return off.join('');
  return `${off.slice(0, -1).join(', ')} and ${off[off.length - 1]}`;
}

// A stored day off ("YYYY-MM-DD reason"), or null if it can't be read.
export function parseDayOff(entry: unknown): DayOff | null {
  if (typeof entry !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/.exec(entry.trim());
  if (!m || !isDay(m[1])) return null;
  return { date: m[1], note: (m[2] || '').trim() };
}

// A day off as it is stored.
export function dayOffEntry(day: DayOff): string {
  return `${day.date} ${day.note.trim()}`.trim();
}

// Why a meeting link can't be used, or null when it can (an empty link means "not added yet", which is fine).
export function linkProblem(link: string): string | null {
  const text = (link || '').trim();
  if (!text) return null;
  if (text.length > MAX_LINK_LENGTH) return 'That link is too long.';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return 'Paste the full link, starting with https://';
  }
  if (url.protocol !== 'https:' || !url.hostname) return 'The link must start with https://';
  return null;
}

// Whether the link is a Google Meet link.
export function isGoogleMeet(link: string): boolean {
  try {
    return new URL(link).hostname === 'meet.google.com';
  } catch {
    return false;
  }
}

// The Google Meet code ("abc-defg-hij") from a Meet link, or ''.
export function meetingCode(link: string): string {
  const m = /^https:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:[/?#]|$)/i.exec((link || '').trim());
  return m ? m[1].toLowerCase() : '';
}

// The link without "https://", for showing: "meet.google.com/abc-defg-hij".
export function linkLabel(link: string): string {
  try {
    const url = new URL(link);
    return `${url.host}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return link;
  }
}

// Why a start and end time can't be used, or null.
export function timeProblem(start: string, end: string): string | null {
  const a = toMinutes(start), b = toMinutes(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 'Enter the time the meeting starts and ends.';
  if (b <= a) return 'The meeting must end after it starts.';
  return null;
}

// The notes typed in the details form (one per line, blank lines left out).
export function notesFromText(text: string): string[] {
  return (text || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

// Why the typed notes can't be saved, or null.
export function notesProblem(text: string): string | null {
  const notes = notesFromText(text);
  if (notes.length > MAX_NOTES) return `Keep it to ${MAX_NOTES} notes or fewer.`;
  if (notes.some((n) => n.length > MAX_NOTE_LENGTH)) return `Keep each note under ${MAX_NOTE_LENGTH} characters.`;
  return null;
}

// The meeting details from the settings, with the defaults for anything not set. Values that can't be read are
// ignored (a link that isn't a usable https link counts as not added).
export function meetingSetup(settings: Settings | undefined | null): MeetingSetup {
  const s: Record<string, unknown> = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const list = (key: string): string[] | null => {
    const value = s[key];
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : null;
  };
  const link = ((list(MEETING_SETTINGS.link) || [])[0] || '').trim();
  const time = list(MEETING_SETTINGS.time) || [];
  const timeOk = time.length >= 2 && !timeProblem(time[0], time[1]);
  const days = list(MEETING_SETTINGS.days);
  const daysOff: DayOff[] = [];
  for (const entry of list(MEETING_SETTINGS.daysOff) || []) {
    const day = parseDayOff(entry);
    if (day && !daysOff.some((d) => d.date === day.date)) daysOff.push(day);
  }
  daysOff.sort((a, b) => a.date.localeCompare(b.date));
  return {
    link: linkProblem(link) ? '' : link,
    start: timeOk ? time[0] : DEFAULT_MEETING.start,
    end: timeOk ? time[1] : DEFAULT_MEETING.end,
    // An empty list is a real choice (no meeting days), so only a missing list gets the default days.
    days: days ? WEEKDAYS.filter((d) => days.includes(d)) : [...DEFAULT_MEETING.days],
    camera: (list(MEETING_SETTINGS.camera) || [])[0] === 'On' ? 'On' : 'Optional',
    notes: (list(MEETING_SETTINGS.notes) || []).map((n) => n.trim()).filter(Boolean),
    daysOff,
  };
}

// The meeting details as settings, ready to save.
export function meetingSettings(setup: MeetingSetup): Record<string, string[]> {
  return {
    [MEETING_SETTINGS.link]: setup.link.trim() ? [setup.link.trim()] : [],
    [MEETING_SETTINGS.time]: [setup.start, setup.end],
    [MEETING_SETTINGS.days]: WEEKDAYS.filter((d) => setup.days.includes(d)),
    [MEETING_SETTINGS.camera]: [setup.camera],
    [MEETING_SETTINGS.notes]: setup.notes.map((n) => n.trim()).filter(Boolean),
    [MEETING_SETTINGS.daysOff]: [...setup.daysOff].sort((a, b) => a.date.localeCompare(b.date)).map(dayOffEntry),
  };
}

// Why a day off can't be added, or null. `today` is "YYYY-MM-DD" (India time).
export function dayOffProblem(setup: MeetingSetup, date: string, note: string, today: string): string | null {
  if (!isDay(date)) return 'Pick the date with no meeting.';
  if (date < today) return 'Pick today or a later date.';
  if (!note.trim()) return 'Add the reason, for example "Diwali".';
  if (note.trim().length > MAX_DAY_OFF_REASON) return `Keep the reason under ${MAX_DAY_OFF_REASON} characters.`;
  if (setup.daysOff.some((d) => d.date === date)) return 'That day is already a day off.';
  const weekday = weekdayOf(date);
  if (!setup.days.includes(weekday)) return `There is no meeting on ${dayName(weekday)}s anyway.`;
  return null;
}

// Days off from `today` on, soonest first.
export function upcomingDaysOff(setup: MeetingSetup, today: string): DayOff[] {
  return setup.daysOff.filter((d) => d.date >= today);
}

// What changed in the details, for the Audit Log: "Changed the daily meeting's time (9:00–10:00 am) and link".
// Empty when nothing changed.
export function meetingChangeSummary(before: MeetingSetup, after: MeetingSetup): string {
  const parts: string[] = [];
  if (before.start !== after.start || before.end !== after.end) parts.push(`time (${formatTimeRange(after.start, after.end)})`);
  if (before.days.join() !== after.days.join()) parts.push(`days (${daysLabel(after.days)})`);
  if (before.camera !== after.camera) parts.push(`camera (${after.camera === 'On' ? 'please keep it on' : 'optional'})`);
  if (before.link !== after.link) parts.push(!after.link ? 'link (removed)' : before.link ? 'link' : 'link (added)');
  if (before.notes.join('\n') !== after.notes.join('\n')) parts.push('notes');
  if (!parts.length) return '';
  return `Changed the daily meeting's ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`}`;
}

// The first day after `date` with a meeting (looking up to a year ahead), or null if there is none.
export function nextMeetingDate(setup: MeetingSetup, date: string): string | null {
  if (!isDay(date)) return null;
  const m = DATE.exec(date)!;
  for (let i = 1; i <= 366; i++) {
    const key = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + i)).toISOString().slice(0, 10);
    if (meetingDay(setup, key).held) return key;
  }
  return null;
}

// The day and time now, India time.
export interface MeetingClock {
  /** "YYYY-MM-DD" */
  date: string;
  /** Minutes after midnight. */
  minutes: number;
}

export function meetingClock(now: Date = new Date(), timeZone: string = MEETING_TIME_ZONE): MeetingClock {
  const parts: Record<string, string> = {};
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (const part of format.formatToParts(now)) parts[part.type] = part.value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

// Whether there is a meeting on a day: it must be one of the meeting weekdays and not a day off.
export function meetingDay(setup: MeetingSetup, date: string): { held: boolean; weekday: string; dayOff: DayOff | null } {
  const weekday = weekdayOf(date);
  const dayOff = setup.daysOff.find((d) => d.date === date) || null;
  return { held: !!weekday && setup.days.includes(weekday) && !dayOff, weekday, dayOff };
}

export type MeetingStatus =
  | { kind: 'none'; weekday: string; dayOff: DayOff | null } // no meeting that day
  | { kind: 'past' } // a meeting day before today
  | { kind: 'future' } // a meeting day after today
  | { kind: 'upcoming'; minutes: number } // today, not started yet: minutes until it starts
  | { kind: 'live'; minutes: number } // today, on now: minutes until it ends
  | { kind: 'ended' }; // today, finished

// Where the meeting on `date` stands at the moment `clock`.
export function meetingStatus(setup: MeetingSetup, date: string, clock: MeetingClock): MeetingStatus {
  const day = meetingDay(setup, date);
  if (!day.held) return { kind: 'none', weekday: day.weekday, dayOff: day.dayOff };
  if (date < clock.date) return { kind: 'past' };
  if (date > clock.date) return { kind: 'future' };
  const start = toMinutes(setup.start), end = toMinutes(setup.end);
  if (clock.minutes < start) return { kind: 'upcoming', minutes: start - clock.minutes };
  if (clock.minutes < end) return { kind: 'live', minutes: end - clock.minutes };
  return { kind: 'ended' };
}

// The reminder for the top of every page: from REMINDER_MINUTES before the start until the end, on meeting days.
export function meetingReminder(setup: MeetingSetup, clock: MeetingClock): Extract<MeetingStatus, { kind: 'upcoming' | 'live' }> | null {
  const status = meetingStatus(setup, clock.date, clock);
  if (status.kind === 'live') return status;
  if (status.kind === 'upcoming' && status.minutes <= REMINDER_MINUTES) return status;
  return null;
}

// The daily team meeting's id among all the meetings (its details are the settings above; see meetings.ts).
export const DAILY_MEETING_ID = 'daily';
const MON_TO_FRI = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Whether a meeting from the Meetings page happens on a day ("YYYY-MM-DD"). (Kept here, beside the daily meeting's
// rules, so the "I can't attend" rules in absences.ts can use it for any meeting.)
export function occursOn(m: Pick<Meeting, 'repeat' | 'date' | 'until' | 'days' | 'skip'>, date: string): boolean {
  const weekday = weekdayOf(date);
  if (!weekday) return false;
  if ((m.skip || []).some((d) => d.date === date)) return false;
  if (m.repeat === 'none') return date === m.date;
  if (m.date && date < m.date) return false;
  if (m.until && date > m.until) return false;
  return (m.repeat === 'weekdays' ? MON_TO_FRI : m.days || []).includes(weekday);
}
