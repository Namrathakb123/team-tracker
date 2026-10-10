import { NextResponse, NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { verifyToken, logAction, requireAppAccess, errorResponse } from '../utils';
import { deleteMeeting, getMeeting, listMeetings, putMeeting, readAppState, updateMeeting } from '../store';
import { formatTimeRange, meetingClock } from '../../../utils/meeting';
import { canSeeMeeting, cleanMeeting, repeatLabel, skipProblem } from '../../../utils/meetings';
import { formatDate } from '../../../utils/dates';
import { teamMemberForEmail } from '../../../utils/team';
import type { Client, Meeting, TeamMember } from '../../../types';

// The meetings on the Meetings page (the daily team meeting is not stored here: its details are settings).
// They are kept apart from the shared app data so that each person is only ever sent the meetings they are in:
// a one-on-one with an intern stays between that intern and the admins.
//   GET                admins: every meeting; everyone else: the meetings they are in (see canSeeMeeting).
//   POST   { …meeting }          admins only: adds a meeting.
//   PUT    ?id=…  { …meeting }   admins only: changes a meeting.
//   PATCH  ?id=…  { skip: { date, note } } or { unskip: date }   admins only: one date of a repeating meeting with
//                                no meeting (and a reason), or back on.
//   DELETE ?id=…                 admins only: removes a meeting.
// ("I can't attend" notes for the daily meeting are in /api/meeting.)
const ADMINS_ONLY = 'Only admins can add, change or remove meetings.';

interface StoredMeeting extends Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'> {
  _id: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  [field: string]: unknown;
}

// The team and the clients, from the shared app data.
async function readState(): Promise<{ team: TeamMember[]; clients: Client[] }> {
  const state = await readAppState();
  return { team: Array.isArray(state.team) ? state.team : [], clients: Array.isArray(state.clients) ? state.clients : [] };
}

function refuse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function failure(error: unknown) {
  return errorResponse(error, '/meetings');
}

// A stored meeting as the page gets it (who added or changed it stays in the Audit Log).
function toMeeting(doc: StoredMeeting): Meeting {
  const { _id, createdAt, updatedAt, createdBy, updatedBy, ...rest } = doc;
  void createdBy;
  void updatedBy;
  return { ...(rest as Omit<Meeting, 'id'>), id: _id, ...(createdAt ? { createdAt: createdAt.toISOString() } : {}), ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}) };
}

// "Weekly review with Acme (Every Mon, 6:00–6:30 pm)", for the Audit Log.
const describe = (m: Pick<Meeting, 'title' | 'repeat' | 'date' | 'until' | 'days' | 'start' | 'end'>) =>
  `“${m.title}” (${repeatLabel(m as Meeting)}, ${formatTimeRange(m.start, m.end)})`;

export async function GET(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    const isAdmin = dbUser.role === 'admin';
    const { team } = await readState();
    // Only an email Google has confirmed counts as being that team member.
    const member = user.email_verified === true ? teamMemberForEmail(team, user.email) : null;
    const all = (await listMeetings<StoredMeeting>()).map(toMeeting);
    const visible = all.filter((m) => canSeeMeeting(m, { isAdmin, member, email: user.email }, team));
    return NextResponse.json({ meetings: visible });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    if (dbUser.role !== 'admin') return refuse(ADMINS_ONLY, 403);
    const { team, clients } = await readState();
    const result = cleanMeeting(await req.json().catch(() => null), { team, clients, today: meetingClock().date });
    if ('problem' in result) return refuse(result.problem);
    const writer = (user.email || '').trim().toLowerCase();
    const doc: StoredMeeting = { ...result.meeting, _id: randomUUID(), host: writer, createdAt: new Date(), createdBy: writer };
    await putMeeting(doc);
    await logAction('MEETING_CREATE', dbUser.name || user.email || 'unknown', `Added the meeting ${describe(result.meeting)}`);
    return NextResponse.json({ meeting: toMeeting(doc) });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    if (dbUser.role !== 'admin') return refuse(ADMINS_ONLY, 403);
    const id = new URL(req.url).searchParams.get('id') || '';
    const stored = await getMeeting<StoredMeeting>(id);
    if (!stored) return refuse('That meeting was not found. It may have been removed.', 404);
    const { team, clients } = await readState();
    const result = cleanMeeting(await req.json().catch(() => null), { team, clients, today: meetingClock().date, keepDate: stored.date });
    if ('problem' in result) return refuse(result.problem);
    const writer = (user.email || '').trim().toLowerCase();
    // Replaced as a whole (so parts left empty are removed), keeping who added it and when.
    const doc: StoredMeeting = {
      ...result.meeting, _id: id, host: stored.host, createdAt: stored.createdAt, createdBy: stored.createdBy,
      ...(stored.skip ? { skip: stored.skip } : {}), updatedAt: new Date(), updatedBy: writer,
    };
    await putMeeting(doc);
    await logAction('MEETING_EDIT', dbUser.name || user.email || 'unknown', `Changed the meeting ${describe(result.meeting)}`);
    return NextResponse.json({ meeting: toMeeting(doc) });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    if (dbUser.role !== 'admin') return refuse(ADMINS_ONLY, 403);
    const id = new URL(req.url).searchParams.get('id') || '';
    const stored = await getMeeting<StoredMeeting>(id);
    if (!stored) return refuse('That meeting was not found. It may have been removed already.', 404);
    await deleteMeeting(id);
    await logAction('MEETING_DELETE', dbUser.name || user.email || 'unknown', `Removed the meeting ${describe(stored)}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const dbUser = requireAppAccess(user);
    if (dbUser.role !== 'admin') return refuse(ADMINS_ONLY, 403);
    const id = new URL(req.url).searchParams.get('id') || '';
    const stored = await getMeeting<StoredMeeting>(id);
    if (!stored) return refuse('That meeting was not found. It may have been removed.', 404);
    const body = await req.json().catch(() => null);
    const skipped = stored.skip || [];
    const writer = (user.email || '').trim().toLowerCase();
    let next: { date: string; note: string }[];
    let details: string;
    if (typeof body?.unskip === 'string') {
      if (!skipped.some((d) => d.date === body.unskip)) return refuse('That date is not skipped.', 404);
      next = skipped.filter((d) => d.date !== body.unskip);
      details = `“${stored.title}” is on again on ${formatDate(body.unskip, { weekday: true })}`;
    } else {
      const date = typeof body?.skip?.date === 'string' ? body.skip.date : '';
      const note = typeof body?.skip?.note === 'string' ? body.skip.note.trim() : '';
      const problem = skipProblem(toMeeting(stored), date, note, meetingClock().date);
      if (problem) return refuse(problem);
      next = [...skipped, { date, note }].sort((a, b) => a.date.localeCompare(b.date));
      details = `No “${stored.title}” on ${formatDate(date, { weekday: true })} (${note})`;
    }
    await updateMeeting(id, { skip: next, updatedAt: new Date(), updatedBy: writer });
    await logAction(typeof body?.unskip === 'string' ? 'MEETING_UNSKIP' : 'MEETING_SKIP', dbUser.name || user.email || 'unknown', details);
    return NextResponse.json({ meeting: toMeeting({ ...stored, skip: next }) });
  } catch (error) {
    return failure(error);
  }
}
