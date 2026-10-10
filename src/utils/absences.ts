// Who is on the daily meeting list, and the notes from people who can't attend a meeting ("I can't attend", with a
// reason): the daily meeting or any other meeting. Used by both the pages and the server, so they always agree.
import type { Meeting, TeamMember } from '../types';
import { DAILY_MEETING_ID, meetingDay, occursOn, toMinutes, weekdayOf, formatClock, type MeetingClock, type MeetingSetup } from './meeting';

// When a meeting happens: the daily meeting's details (MeetingSetup), or another meeting.
export type Schedule = MeetingSetup | Pick<Meeting, 'repeat' | 'date' | 'until' | 'days' | 'skip' | 'end'>;

// Whether there is a meeting on a day ("YYYY-MM-DD").
export function heldOn(schedule: Schedule, date: string): boolean {
  return 'daysOff' in schedule ? meetingDay(schedule, date).held : occursOn(schedule, date);
}

// The groups on the meeting list, in this order. A team member's group is set on the Team page; someone with no
// group set is in "Team". "None" means they don't take part in the daily meeting.
export const MEETING_GROUPS = ['Admin', 'Team', 'Intern'];
export const DEFAULT_MEETING_GROUP = 'Team';
export const NOT_IN_MEETING = 'None';

// Suggestions shown under the reason box (the reason can be anything).
export const REASON_SUGGESTIONS = ['Sick', 'On leave', 'Client meeting', 'Travelling', 'Family matter'];
export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 200;
// The longest stretch one note can cover (for leave), in calendar days.
export const MAX_ABSENCE_DAYS = 31;

/** A note saying someone can't attend a meeting on one day. */
export interface Absence {
  /** The meeting, by id; not set for the daily meeting. */
  meetingId?: string;
  /** The team member, by id. */
  memberId: string;
  /** The meeting day, "YYYY-MM-DD". */
  date: string;
  reason: string;
  /** When they told us (ISO date and time, from the server's clock). */
  createdAt: string;
  /** Who wrote the note: the person themself, or an admin on their behalf (an email). */
  createdBy: string;
  /** When the reason was last changed, if it was. */
  updatedAt?: string;
}

// A team member's meeting group: 'Admin', 'Team', 'Intern' (or another name an admin used), or 'None'.
export function memberGroup(member: Pick<TeamMember, 'meetingGroup'> | null | undefined): string {
  const group = typeof member?.meetingGroup === 'string' ? member.meetingGroup.trim() : '';
  return group || DEFAULT_MEETING_GROUP;
}

// Whether a team member takes part in the daily meeting (on the team and not set to "None").
export function inMeeting(member: TeamMember | null | undefined): boolean {
  return !!member && !member.deleted && memberGroup(member) !== NOT_IN_MEETING;
}

// The people in the meeting, by group: Admin, Team, Intern, then any other group names; names A to Z in each.
export function meetingGroups(team: TeamMember[] | undefined): { group: string; members: TeamMember[] }[] {
  const members = (Array.isArray(team) ? team : []).filter(inMeeting);
  const others = Array.from(new Set(members.map(memberGroup).filter((g) => !MEETING_GROUPS.includes(g)))).sort((a, b) => a.localeCompare(b));
  return [...MEETING_GROUPS, ...others]
    .map((group) => ({
      group,
      members: members.filter((m) => memberGroup(m) === group).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .filter((g) => g.members.length > 0);
}

// The id a note is stored under: one note per person per meeting per day. (The daily meeting's notes, the first
// ones there were, have no meeting in their id.)
export function absenceId(memberId: string, date: string, meetingId?: string | null): string {
  return meetingId && meetingId !== DAILY_MEETING_ID ? `${meetingId}|${memberId}|${date}` : `${memberId}|${date}`;
}

// Whether a note is for the daily meeting.
export function isDailyNote(note: Pick<Absence, 'meetingId'>): boolean {
  return !note.meetingId || note.meetingId === DAILY_MEETING_ID;
}

// Why a reason can't be used, or null.
export function reasonProblem(reason: string): string | null {
  const text = (reason || '').trim();
  if (text.length < MIN_REASON_LENGTH) return 'Please give a reason, for example "Sick" or "On leave".';
  if (text.length > MAX_REASON_LENGTH) return `Keep the reason under ${MAX_REASON_LENGTH} characters.`;
  return null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// The meeting days from `from` to `to` (both included, `to` may be left out for one day), or a reason they can't be
// used: dates that can't be read, a range that ends before it starts or is longer than MAX_ABSENCE_DAYS, or no
// meeting on any of the days.
export function absenceDays(schedule: Schedule, from: string, to?: string | null): { days: string[] } | { problem: string } {
  const last = to || from;
  if (!DAY.test(from) || !weekdayOf(from)) return { problem: 'Pick the day you can\'t attend.' };
  if (!DAY.test(last) || !weekdayOf(last)) return { problem: 'Pick the last day you can\'t attend.' };
  if (last < from) return { problem: 'The last day must be on or after the first day.' };
  const days: string[] = [];
  let count = 0;
  for (let day = from; day <= last; day = nextDay(day)) {
    if (++count > MAX_ABSENCE_DAYS) return { problem: `One note can cover at most ${MAX_ABSENCE_DAYS} days. Add another note for the rest.` };
    if (heldOn(schedule, day)) days.push(day);
  }
  if (!days.length) return { problem: from === last ? 'There is no meeting on that day.' : 'There is no meeting on any of those days.' };
  return { days };
}

// Why someone can't (any longer) say they can't attend the meeting on `date`, or null. Team members can tell us
// before the meeting or while it is on; once it has ended, that day is closed. Admins can write a note for any day.
export function informProblem(schedule: Schedule, date: string, clock: MeetingClock, isAdmin: boolean): string | null {
  if (!heldOn(schedule, date)) return 'There is no meeting on that day.';
  if (isAdmin) return null;
  if (date < clock.date) return 'That day has passed.';
  if (date === clock.date && clock.minutes >= toMinutes(schedule.end)) return `Today's meeting has ended (it finished at ${formatClock(schedule.end)}).`;
  return null;
}

// Why someone can't take back their note for `date` ("I can attend after all"), or null. Like writing one: until the
// meeting on that day has ended. Admins can take back any note.
export function withdrawProblem(schedule: Schedule, date: string, clock: MeetingClock, isAdmin: boolean): string | null {
  if (isAdmin) return null;
  if (date < clock.date) return 'That day has passed.';
  if (date === clock.date && clock.minutes >= toMinutes(schedule.end)) return `Today's meeting has ended (it finished at ${formatClock(schedule.end)}).`;
  return null;
}

// The meeting days a note may be written for: the problem with the first one that can't, or null when all can.
export function informDaysProblem(schedule: Schedule, days: string[], clock: MeetingClock, isAdmin: boolean): string | null {
  for (const day of days) {
    const problem = informProblem(schedule, day, clock, isAdmin);
    if (problem) return problem;
  }
  return null;
}

// The day a new note starts on by default: the picked day if a note can still be written for it, otherwise the next
// meeting day that can (looking up to a month ahead), or '' if there is none.
export function firstInformDay(schedule: Schedule, picked: string, clock: MeetingClock): string {
  let day = picked >= clock.date ? picked : clock.date;
  for (let i = 0; i <= MAX_ABSENCE_DAYS; i++, day = nextDay(day)) {
    if (!informProblem(schedule, day, clock, false)) return day;
  }
  return '';
}

// Turns a stored note (from the server) into an Absence, or null if it isn't one.
export function toAbsence(record: unknown): Absence | null {
  if (!record || typeof record !== 'object') return null;
  const r = record as Record<string, unknown>;
  if (typeof r.memberId !== 'string' || typeof r.date !== 'string' || !DAY.test(r.date) || typeof r.reason !== 'string') return null;
  const time = (value: unknown) => (value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : '');
  return {
    ...(typeof r.meetingId === 'string' && r.meetingId && r.meetingId !== DAILY_MEETING_ID ? { meetingId: r.meetingId } : {}),
    memberId: r.memberId,
    date: r.date,
    reason: r.reason,
    createdAt: time(r.createdAt),
    createdBy: typeof r.createdBy === 'string' ? r.createdBy : '',
    ...(r.updatedAt ? { updatedAt: time(r.updatedAt) } : {}),
  };
}
