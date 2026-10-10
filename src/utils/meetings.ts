// All the meetings: the daily team meeting (its details are settings; see meeting.ts) and the ones admins add on the
// Meetings page, one time or repeating. When each one happens, who is in it, who may see it, how it is described,
// clashes between meetings, and the checks on what an admin types. Used by both the pages and the server.
import type { Client, Meeting, Settings, TeamMember } from '../types';
import { addDays, formatDate } from './dates';
import { emailKey } from './team';
import { cleanPhone, phoneProblem } from './phone';
import { MEETING_GROUPS, inMeeting, memberGroup } from './absences';
import {
  DAILY_MEETING_ID, MAX_DAY_OFF_REASON, REMINDER_MINUTES, WEEKDAYS, dayName, daysLabel, linkProblem, meetingSetup, occursOn, timeProblem, toMinutes,
  weekdayOf, type MeetingClock, type MeetingStatus,
} from './meeting';

// Where a meeting happens on a day, and the daily meeting's id, are in meeting.ts (the "I can't attend" rules use them too).
export { DAILY_MEETING_ID, occursOn };

export const MEETING_TYPES = ['Team', 'Interns', 'Client', 'One-on-one', 'Other'];
export const REPEATS: { value: Meeting['repeat']; label: string }[] = [
  { value: 'none', label: 'One time' },
  { value: 'weekdays', label: 'Every weekday (Monday to Friday)' },
  { value: 'weekly', label: 'Weekly, on chosen days' },
];
export const MAX_TITLE = 100;
export const MAX_AGENDA = 2000;
export const MAX_PLACE = 100;
export const MAX_CONTACT_NAME = 60;
export const MAX_PEOPLE = 100;
// How far ahead a meeting is checked against the others for clashes.
export const CLASH_DAYS = 28;

const GROUP_WORDS: Record<string, string> = { Admin: 'Admins', Team: 'Team members', Intern: 'Interns' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: string) => DAY.test(value) && !!weekdayOf(value);

// The daily team meeting, as a meeting like the others: everyone on the meeting list is in it.
export function dailyMeeting(settings: Settings | undefined | null): Meeting {
  const s = meetingSetup(settings);
  return {
    id: DAILY_MEETING_ID, title: 'Daily team meeting', type: 'Team', repeat: 'weekly', date: '', days: s.days,
    start: s.start, end: s.end, link: s.link, camera: s.camera, groups: [...MEETING_GROUPS], people: [],
    agenda: s.notes.join('\n'), skip: s.daysOff, builtIn: true,
  };
}

// The first day from `from` on (looking up to a year ahead) when the meeting happens, or null.
export function nextOccurrence(m: Meeting, from: string): string | null {
  if (!isDay(from)) return null;
  let day = from;
  for (let i = 0; i <= 366; i++, day = addDays(day, 1)) {
    if (occursOn(m, day)) return day;
    if (m.repeat === 'none' && day > m.date) return null;
    if (m.until && day > m.until) return null;
  }
  return null;
}

// The meetings on a day, earliest first.
export function meetingsOn(meetings: Meeting[], date: string): Meeting[] {
  return meetings
    .filter((m) => occursOn(m, date))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end) || a.title.localeCompare(b.title));
}

// Where a meeting on `date` stands at the moment `clock` (as for the daily meeting; see meeting.ts).
export function occurrenceStatus(m: Meeting, date: string, clock: MeetingClock): MeetingStatus {
  if (!occursOn(m, date)) return { kind: 'none', weekday: weekdayOf(date), dayOff: (m.skip || []).find((d) => d.date === date) || null };
  if (date < clock.date) return { kind: 'past' };
  if (date > clock.date) return { kind: 'future' };
  const start = toMinutes(m.start), end = toMinutes(m.end);
  if (clock.minutes < start) return { kind: 'upcoming', minutes: start - clock.minutes };
  if (clock.minutes < end) return { kind: 'live', minutes: end - clock.minutes };
  return { kind: 'ended' };
}

// The meetings to remind someone of now: today's that start within REMINDER_MINUTES, or are on. The ones on now come
// first, then the soonest.
export function meetingReminders(meetings: Meeting[], clock: MeetingClock): { meeting: Meeting; status: Extract<MeetingStatus, { kind: 'upcoming' | 'live' }> }[] {
  const result: { meeting: Meeting; status: Extract<MeetingStatus, { kind: 'upcoming' | 'live' }> }[] = [];
  for (const meeting of meetings) {
    const status = occurrenceStatus(meeting, clock.date, clock);
    if (status.kind === 'live' || (status.kind === 'upcoming' && status.minutes <= REMINDER_MINUTES)) result.push({ meeting, status });
  }
  return result.sort((a, b) => Number(b.status.kind === 'live') - Number(a.status.kind === 'live') || toMinutes(a.meeting.start) - toMinutes(b.meeting.start));
}

// The team members in a meeting, by id: everyone on the meeting list in its groups, and the people picked by name
// (someone picked by name is in it even if they aren't on the daily meeting list). Removed members are left out.
export function attendeeIds(m: Pick<Meeting, 'groups' | 'people'>, team: TeamMember[] | undefined): string[] {
  const members = (Array.isArray(team) ? team : []).filter((t) => t && !t.deleted);
  const groups = m.groups || [];
  const ids = new Set<string>();
  for (const t of members) if (inMeeting(t) && groups.includes(memberGroup(t))) ids.add(t.id);
  for (const id of m.people || []) if (members.some((t) => t.id === id)) ids.add(id);
  return Array.from(ids);
}

// Whether a meeting is one of someone's own: they are in it (`member`, matched by email), or they added it.
export function isMyMeeting(m: Meeting, team: TeamMember[] | undefined, member: TeamMember | null, email: string | null | undefined): boolean {
  if (m.host && emailKey(m.host) === emailKey(email) && emailKey(email)) return true;
  return !!member && attendeeIds(m, team).includes(member.id);
}

// Who may see a meeting: admins see all of them; everyone else only their own.
export function canSeeMeeting(m: Meeting, viewer: { isAdmin: boolean; member: TeamMember | null; email: string | null | undefined }, team: TeamMember[] | undefined): boolean {
  return viewer.isAdmin || isMyMeeting(m, team, viewer.member, viewer.email);
}

// Who is in a meeting, in a few words: "Everyone", "Interns · Asha", "Acme Foods (Ramesh) · Ravi".
export function whoLabel(m: Meeting, team: TeamMember[] | undefined, clients: Client[] | undefined): string {
  const parts: string[] = [];
  const groups = MEETING_GROUPS.filter((g) => (m.groups || []).includes(g));
  if (groups.length === MEETING_GROUPS.length) parts.push('Everyone');
  else if (groups.length) parts.push(groups.map((g) => GROUP_WORDS[g] || g).join(', '));
  const names = (m.people || [])
    .map((id) => (Array.isArray(team) ? team : []).find((t) => t && t.id === id))
    .filter((t): t is TeamMember => !!t && !t.deleted)
    .map((t) => t.name);
  if (names.length) parts.push(names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`);
  if (m.clientId) {
    const client = (Array.isArray(clients) ? clients : []).find((c) => c && c.id === m.clientId);
    const name = client ? client.name : 'Deleted client';
    parts.push(m.contactName ? `${name} (${m.contactName})` : name);
  }
  return parts.join(' · ') || 'No one yet';
}

// When a meeting repeats: "Monday, 5 Oct 2026" (one time), "Every weekday", "Every Mon, Thu, until 30 Nov 2026".
export function repeatLabel(m: Meeting): string {
  if (m.builtIn) return daysLabel(m.days || []);
  if (m.repeat === 'none') return formatDate(m.date, { weekday: true });
  const days = m.days || [];
  const weekdaysOnly = days.length === 5 && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].every((d) => days.includes(d));
  const every = m.repeat === 'weekdays' || weekdaysOnly ? 'Every weekday' : days.length === 7 ? 'Every day' : days.length === 1 ? `Every ${dayName(days[0])}` : `Every ${days.join(', ')}`;
  return m.until ? `${every}, until ${formatDate(m.until)}` : every;
}

// What an admin fills in for a meeting (before it is saved).
export type MeetingDraft = Omit<Meeting, 'id' | 'host' | 'builtIn' | 'createdAt' | 'updatedAt' | 'skip'>;

// Checks a meeting an admin filled in and returns it tidied (empty parts left out), or the first problem. `today` is
// "YYYY-MM-DD" in India time: a one-time meeting can't be put on a day that has passed, unless it was already on that
// day (`keepDate`, when changing a meeting).
export function cleanMeeting(input: unknown, ctx: { team: TeamMember[]; clients: Client[]; today: string; keepDate?: string }): { meeting: MeetingDraft } | { problem: string } {
  const r: Record<string, unknown> = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []);

  const title = text(r.title);
  if (!title) return { problem: 'Give the meeting a title.' };
  if (title.length > MAX_TITLE) return { problem: `Keep the title under ${MAX_TITLE} characters.` };
  const type = text(r.type);
  if (!MEETING_TYPES.includes(type)) return { problem: 'Pick the type of meeting.' };
  const repeat = REPEATS.find((x) => x.value === r.repeat)?.value;
  if (!repeat) return { problem: 'Pick whether the meeting repeats.' };

  const date = text(r.date);
  if (!isDay(date)) return { problem: repeat === 'none' ? 'Pick the day of the meeting.' : 'Pick the first day of the meeting.' };
  if (repeat === 'none' && date < ctx.today && date !== ctx.keepDate) return { problem: 'Pick today or a later day.' };
  const until = repeat === 'none' ? '' : text(r.until);
  if (until && !isDay(until)) return { problem: 'Pick the last day, or leave it empty.' };
  if (until && until < date) return { problem: 'The last day must be on or after the first day.' };
  const days = repeat === 'weekly' ? WEEKDAYS.filter((d) => list(r.days).includes(d)) : [];
  if (repeat === 'weekly' && !days.length) return { problem: 'Pick the days of the week it is on.' };

  const start = text(r.start), end = text(r.end);
  const timeIssue = timeProblem(start, end);
  if (timeIssue) return { problem: timeIssue };
  const link = text(r.link);
  const linkIssue = linkProblem(link);
  if (linkIssue) return { problem: linkIssue };
  const place = text(r.place);
  if (place.length > MAX_PLACE) return { problem: `Keep the place under ${MAX_PLACE} characters.` };
  const camera: 'Optional' | 'On' = r.camera === 'On' ? 'On' : 'Optional';

  const groups = MEETING_GROUPS.filter((g) => list(r.groups).includes(g));
  const people = Array.from(new Set(list(r.people)));
  if (people.length > MAX_PEOPLE) return { problem: `A meeting can have at most ${MAX_PEOPLE} people picked by name.` };
  const active = (ctx.team || []).filter((t) => t && !t.deleted);
  if (people.some((id) => !active.some((t) => t.id === id))) return { problem: 'Someone you picked is no longer on the team. Pick the people again.' };
  const clientId = text(r.clientId);
  if (clientId && !(ctx.clients || []).some((c) => c && c.id === clientId)) return { problem: 'That client was not found. Pick the client again.' };
  if (type === 'Client' && !clientId) return { problem: 'Pick the client for a client meeting.' };
  const contactName = clientId ? text(r.contactName) : '';
  if (contactName.length > MAX_CONTACT_NAME) return { problem: `Keep the contact's name under ${MAX_CONTACT_NAME} characters.` };
  const contactPhone = clientId ? cleanPhone(r.contactPhone) : '';
  const phoneIssue = phoneProblem(contactPhone);
  if (phoneIssue) return { problem: `Contact's phone: ${phoneIssue}` };
  if (!groups.length && !people.length && !clientId) return { problem: 'Choose who is in the meeting.' };
  const agenda = text(r.agenda);
  if (agenda.length > MAX_AGENDA) return { problem: `Keep the agenda under ${MAX_AGENDA} characters.` };

  return {
    meeting: {
      title, type, repeat, date,
      ...(until ? { until } : {}),
      ...(repeat === 'weekly' ? { days } : {}),
      start, end,
      ...(link ? { link } : {}),
      ...(place ? { place } : {}),
      camera,
      ...(groups.length ? { groups } : {}),
      ...(people.length ? { people } : {}),
      ...(clientId ? { clientId } : {}),
      ...(contactName ? { contactName } : {}),
      ...(contactPhone ? { contactPhone } : {}),
      ...(agenda ? { agenda } : {}),
    },
  };
}

// Why a date of a repeating meeting can't be skipped ("no meeting that day"), or null: it must be one of its dates,
// today or later, with a reason, and not skipped already. (The daily meeting has its own days off.)
export function skipProblem(m: Meeting, date: string, note: string, today: string): string | null {
  if (m.builtIn) return "Use the daily meeting's days off for that.";
  if (m.repeat === 'none') return 'A one-time meeting can be removed instead.';
  if (!isDay(date)) return 'Pick the date with no meeting.';
  if (date < today) return 'Pick today or a later date.';
  if ((m.skip || []).some((d) => d.date === date)) return 'That date is already skipped.';
  if (!occursOn({ ...m, skip: [] }, date)) return "The meeting isn't on that date anyway.";
  const reason = (note || '').trim();
  if (!reason) return 'Add the reason, for example "Holiday".';
  if (reason.length > MAX_DAY_OFF_REASON) return `Keep the reason under ${MAX_DAY_OFF_REASON} characters.`;
  return null;
}

/** Another meeting at the same time as a meeting being planned, with people in both. */
export interface Clash {
  meetingId: string;
  title: string;
  /** The first day it clashes, and on how many more days in the next CLASH_DAYS days. */
  date: string;
  more: number;
  start: string;
  end: string;
  /** The team members in both. */
  names: string[];
}

// Other meetings that overlap a meeting being planned and share someone with it, from `from` on (CLASH_DAYS ahead),
// one entry per other meeting. Meetings with nobody in common don't clash.
export function meetingClashes(draft: Pick<Meeting, 'repeat' | 'date' | 'until' | 'days' | 'skip' | 'start' | 'end' | 'groups' | 'people'> & { id?: string }, others: Meeting[], team: TeamMember[] | undefined, from: string): Clash[] {
  const mine = attendeeIds(draft, team);
  if (!mine.length || timeProblem(draft.start, draft.end) || !isDay(from)) return [];
  const a = toMinutes(draft.start), b = toMinutes(draft.end);
  const nameOf = (id: string) => (Array.isArray(team) ? team : []).find((t) => t && t.id === id)?.name || 'Someone';
  const found = new Map<string, Clash>();
  let day = draft.repeat === 'none' ? draft.date : draft.date > from ? draft.date : from;
  if (!isDay(day)) return [];
  for (let i = 0; i < CLASH_DAYS; i++, day = addDays(day, 1)) {
    if (draft.repeat === 'none' && i > 0) break;
    if (!occursOn(draft, day)) continue;
    for (const other of others) {
      if (!other || other.id === draft.id || !occursOn(other, day)) continue;
      if (!(a < toMinutes(other.end) && toMinutes(other.start) < b)) continue;
      const shared = attendeeIds(other, team).filter((id) => mine.includes(id));
      if (!shared.length) continue;
      const known = found.get(other.id);
      if (known) known.more++;
      else found.set(other.id, { meetingId: other.id, title: other.title, date: day, more: 0, start: other.start, end: other.end, names: shared.map(nameOf) });
    }
  }
  return Array.from(found.values());
}
