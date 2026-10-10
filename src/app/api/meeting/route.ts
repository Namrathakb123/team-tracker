import { NextResponse, NextRequest } from 'next/server';
import { verifyToken, logAction, requireAppAccess, errorResponse } from '../utils';
import { deleteNote, findNotes, getMeeting, readAppState, saveNotes, type NoteFilter, type StoredMeetingRecord } from '../store';
import { DAILY_MEETING_ID, meetingSetup, meetingClock } from '../../../utils/meeting';
import { absenceDays, absenceId, informDaysProblem, inMeeting, reasonProblem, toAbsence, withdrawProblem, type Absence, type Schedule } from '../../../utils/absences';
import { attendeeIds, canSeeMeeting } from '../../../utils/meetings';
import { teamMemberForEmail } from '../../../utils/team';
import { formatDate } from '../../../utils/dates';
import type { Meeting, Settings, TeamMember } from '../../../types';

// Notes from people who can't attend a meeting: one per person per meeting per day, with a reason (see
// utils/absences.ts). `meetingId` says which meeting (left out: the daily meeting). They are kept in their own
// collection, so several people can write one at the same moment without getting in each other's way (the shared
// app data is saved as one record and allows one save at a time).
//   GET    ?date=YYYY-MM-DD[&meetingId=…]   that meeting's notes for the day. Everyone who may see the meeting sees
//                             today's; on other days only admins see everyone's (others get just their own).
//   GET    ?mine=1            the signed-in person's own notes for every meeting, newest first.
//   GET    ?month=YYYY-MM     admins only: everyone's notes for every meeting in that month.
//   POST   { meetingId?, from, to?, reason, memberId? }   "I can't attend": a note for each day of the meeting from
//                             `from` to `to`. People in the meeting write their own, before it ends that day; admins can
//                             write anyone's in it.
//   DELETE ?date=YYYY-MM-DD[&meetingId=…][&memberId=…]   takes a note back ("I can attend after all"), same rules.
// A meeting someone may not see (see canSeeMeeting) is answered as if it didn't exist.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOT_ON_TEAM = "Your email isn't on the Team page, so you aren't on the meeting list. Ask an admin to add it.";
const NOT_FOUND = 'That meeting was not found. It may have been removed, or you may not be in it.';

// The team and the settings (for the daily meeting's days and times), from the shared app data.
async function readState(): Promise<{ team: TeamMember[]; settings: Settings }> {
  const state = await readAppState();
  return { team: Array.isArray(state.team) ? state.team : [], settings: state.settings || {} };
}

// The signed-in person's own team record. Only an email Google has confirmed counts (as for signing in).
function ownMember(team: TeamMember[], user: { email?: string; email_verified?: boolean }): TeamMember | null {
  return user.email_verified === true ? teamMemberForEmail(team, user.email) : null;
}

// The meeting a request is about.
interface Target {
  /** null for the daily meeting. */
  meetingId: string | null;
  /** How the Audit Log names it. */
  name: string;
  schedule: Schedule;
  /** Whether a team member is in it. */
  includes: (member: TeamMember) => boolean;
}

// The daily meeting, or a meeting from the Meetings page the person may see (null otherwise, or if there is none).
async function readTarget(meetingId: unknown, settings: Settings, team: TeamMember[], viewer: { isAdmin: boolean; member: TeamMember | null; email?: string }): Promise<Target | null> {
  if (typeof meetingId !== 'string' || !meetingId || meetingId === DAILY_MEETING_ID) {
    return { meetingId: null, name: 'the daily meeting', schedule: meetingSetup(settings), includes: (m) => inMeeting(m) };
  }
  const doc = await getMeeting<StoredMeetingRecord>(meetingId);
  if (!doc) return null;
  const meeting = { ...(doc as unknown as Omit<Meeting, 'id'>), id: doc._id } as Meeting;
  if (!canSeeMeeting(meeting, { isAdmin: viewer.isAdmin, member: viewer.member, email: viewer.email }, team)) return null;
  const ids = attendeeIds(meeting, team);
  return { meetingId: meeting.id, name: `“${meeting.title}”`, schedule: meeting, includes: (m) => ids.includes(m.id) };
}

function refuse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function failure(error: unknown) {
  return errorResponse(error, '/meeting');
}

const asAbsences = (records: unknown[]) => records.map(toAbsence).filter((a): a is Absence => !!a);

export async function GET(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    const isAdmin = dbUser.role === 'admin';
    const params = new URL(req.url).searchParams;
    const { team, settings } = await readState();
    const me = ownMember(team, user);

    let filter: NoteFilter;
    if (params.get('mine')) {
      if (!me) return NextResponse.json({ absences: [] });
      filter = { memberId: me.id };
    } else if (params.get('month')) {
      if (!isAdmin) return refuse('Only admins can see the monthly list.', 403);
      const month = params.get('month') || '';
      if (!/^\d{4}-\d{2}$/.test(month)) return refuse('Pick a month.');
      filter = { from: `${month}-01`, to: `${month}-31` };
    } else {
      const date = params.get('date') || '';
      if (!DAY.test(date)) return refuse('Pick a day.');
      const target = await readTarget(params.get('meetingId'), settings, team, { isAdmin, member: me, email: user.email });
      if (!target) return refuse(NOT_FOUND, 404);
      // (The daily meeting's notes are the ones without a meeting.)
      filter = { date, meetingId: target.meetingId };
      // Everyone who may see the meeting sees today's notes. On other days, only admins see everyone's.
      if (!isAdmin && date !== meetingClock().date) {
        if (!me) return NextResponse.json({ absences: [] });
        filter.memberId = me.id;
      }
    }
    return NextResponse.json({ absences: asAbsences(await findNotes(filter)) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    const isAdmin = dbUser.role === 'admin';
    const body = await req.json().catch(() => null);
    const from = typeof body?.from === 'string' ? body.from : '';
    const to = typeof body?.to === 'string' && body.to ? body.to : from;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    const { team, settings } = await readState();
    const me = ownMember(team, user);
    const target = await readTarget(body?.meetingId, settings, team, { isAdmin, member: me, email: user.email });
    if (!target) return refuse(NOT_FOUND, 404);
    const memberId = typeof body?.memberId === 'string' && body.memberId ? body.memberId : me?.id;
    if (!memberId) return refuse(NOT_ON_TEAM, 403);
    if (memberId !== me?.id && !isAdmin) return refuse('Only admins can write a note for someone else.', 403);
    const member = team.find((t) => t && t.id === memberId);
    if (!member || member.deleted || !target.includes(member)) {
      return refuse(target.meetingId ? "That person isn't in this meeting." : "That person isn't on the meeting list.");
    }

    const reasonIssue = reasonProblem(reason);
    if (reasonIssue) return refuse(reasonIssue);
    const range = absenceDays(target.schedule, from, to);
    if ('problem' in range) return refuse(range.problem);
    const timeIssue = informDaysProblem(target.schedule, range.days, meetingClock(), isAdmin);
    if (timeIssue) return refuse(timeIssue);

    // One note per person per meeting per day: writing again for the same day changes its reason.
    const writer = (user.email || '').trim().toLowerCase();
    const ids = range.days.map((date) => absenceId(memberId, date, target.meetingId));
    const saved = await saveNotes(ids, range.days, { memberId, reason, meetingId: target.meetingId }, writer, new Date());

    const first = formatDate(range.days[0], { weekday: true });
    const last = formatDate(range.days[range.days.length - 1], { weekday: true });
    const which = !target.meetingId
      ? (range.days.length === 1 ? `the daily meeting on ${first}` : `${range.days.length} daily meetings, ${first} to ${last}`)
      : (range.days.length === 1 ? `${target.name} on ${first}` : `${target.name} on ${range.days.length} days, ${first} to ${last}`);
    await logAction('MEETING_ABSENCE', dbUser.name || user.email || 'unknown', `${member.name} can't attend ${which}: ${reason}`);

    return NextResponse.json({ absences: asAbsences(saved) });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    const isAdmin = dbUser.role === 'admin';
    const params = new URL(req.url).searchParams;
    const date = params.get('date') || '';
    if (!DAY.test(date)) return refuse('Pick a day.');

    const { team, settings } = await readState();
    const me = ownMember(team, user);
    const target = await readTarget(params.get('meetingId'), settings, team, { isAdmin, member: me, email: user.email });
    if (!target) return refuse(NOT_FOUND, 404);
    const memberId = params.get('memberId') || me?.id;
    if (!memberId) return refuse(NOT_ON_TEAM, 403);
    if (memberId !== me?.id && !isAdmin) return refuse("Only admins can take back someone else's note.", 403);
    const timeIssue = withdrawProblem(target.schedule, date, meetingClock(), isAdmin);
    if (timeIssue) return refuse(timeIssue);

    if (!(await deleteNote(absenceId(memberId, date, target.meetingId)))) return refuse('There is no note for that day.', 404);
    const name = team.find((t) => t && t.id === memberId)?.name || 'Someone';
    await logAction('MEETING_ABSENCE_WITHDRAWN', dbUser.name || user.email || 'unknown', `${name} can attend ${target.name} on ${formatDate(date, { weekday: true })} after all (note taken back)`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
