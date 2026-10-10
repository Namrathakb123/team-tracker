'use client'

// The people side of the Daily Meeting page: telling the team you can't attend (with a reason), today's list of who
// is in the meeting (grouped Admin, Team, Intern), your own notes, and the admins' monthly list.
import { useState, type FormEvent, type ReactNode } from 'react';
import { formatDate, formatDateTime, formatTime, toDateKey } from '../utils/dates';
import { emailKey } from '../utils/team';
import { formatClock, meetingDay, type MeetingClock, type MeetingSetup } from '../utils/meeting';
import {
  NOT_IN_MEETING, REASON_SUGGESTIONS, MAX_REASON_LENGTH, absenceDays, informDaysProblem, meetingGroups, memberGroup, reasonProblem,
  withdrawProblem, type Absence, type Schedule,
} from '../utils/absences';
import type { TeamMember } from '../types';
import { CARD, DIALOG, DIALOG_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_TITLE, SMALL_BUTTON } from '../utils/styles';

const FIELD = 'w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium';
const LABEL = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1';
const COUNT = 'text-[10px] font-bold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full';
const CANT_TAG = 'shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PEOPLE_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
const NOTE_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>;

function CardHeader({ title, icon, right }: { title: string; icon: ReactNode; right?: ReactNode }) {
  return (
    <div className="px-4 py-2 min-h-14 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
      <h2 className={`${SECTION_TITLE} flex items-center gap-2`}>{icon}{title}</h2>
      {right}
    </div>
  );
}

// "Written by Boss" when an admin wrote someone's note for them; '' when they wrote it themself.
function writtenBy(note: Absence, team: TeamMember[] | undefined): string {
  const member = (team || []).find((t) => t && t.id === note.memberId);
  if (!note.createdBy || emailKey(note.createdBy) === emailKey(member?.email)) return '';
  const writer = (team || []).find((t) => t && emailKey(t.email) === emailKey(note.createdBy));
  return `Written by ${writer?.name || note.createdBy.split('@')[0]}`;
}

// When they told us: the time only if it was on the meeting day itself, otherwise the date and time.
function toldUs(note: Absence): string {
  if (!note.createdAt) return '';
  return toDateKey(note.createdAt) === note.date ? `Told us at ${formatTime(note.createdAt)}` : `Told us on ${formatDateTime(note.createdAt)}`;
}

// The window for "I can't attend": which day(s), the reason, and (for admins) who it is for.
export function CantAttendDialog({ setup, clock, firstDay, members, myId, isAdmin, onSend, onClose }: {
  /** The meeting: the daily meeting's details, or another meeting. */
  setup: Schedule;
  clock: MeetingClock;
  firstDay: string;
  members: TeamMember[];
  myId: string | null;
  isAdmin: boolean;
  onSend: (note: { from: string; to?: string; reason: string; memberId?: string }) => Promise<string | null>;
  onClose: () => void;
}) {
  const [memberId, setMemberId] = useState(myId || members[0]?.id || '');
  const [from, setFrom] = useState(firstDay);
  const [several, setSeveral] = useState(false);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const changed = <T,>(set: (value: T) => void) => (value: T) => { set(value); setProblem(null); };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const last = several && to ? to : from;
    const range = absenceDays(setup, from, last);
    const issue = (!memberId ? 'Pick who can\'t attend.' : null) || reasonProblem(reason) || ('problem' in range ? range.problem : informDaysProblem(setup, range.days, clock, isAdmin));
    if (issue) { setProblem(issue); return; }
    setSending(true);
    const failed = await onSend({ from, ...(last !== from ? { to: last } : {}), reason: reason.trim(), ...(memberId !== myId ? { memberId } : {}) });
    setSending(false);
    if (failed) { setProblem(failed); return; }
    onClose();
  };

  const forSomeoneElse = isAdmin && memberId !== myId;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Can't attend the meeting" className={`${DIALOG} w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <h3 className={DIALOG_TITLE}>Can&apos;t attend the meeting</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <form onSubmit={send} noValidate className="p-4 space-y-4 overflow-y-auto">
          {isAdmin && (
            <label className="block">
              <span className={LABEL}>Who can&apos;t attend</span>
              <select aria-label="Who can't attend" value={memberId} onChange={(e) => changed(setMemberId)(e.target.value)} className={FIELD}>
                {!memberId && <option value="">Pick someone</option>}
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === myId ? ' (you)' : ''}</option>)}
              </select>
            </label>
          )}
          <div className={`grid gap-4 ${several ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <label className="block">
              <span className={LABEL}>{several ? 'First day' : 'Day'}</span>
              <input type="date" aria-label={several ? 'First day you can\'t attend' : 'Day you can\'t attend'} value={from} min={isAdmin ? undefined : clock.date} onChange={(e) => changed(setFrom)(e.target.value)} className={FIELD} />
            </label>
            {several && (
              <label className="block">
                <span className={LABEL}>Last day</span>
                <input type="date" aria-label="Last day you can't attend" value={to} min={from || undefined} onChange={(e) => changed(setTo)(e.target.value)} className={FIELD} />
              </label>
            )}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={several} onChange={(e) => { changed(setSeveral)(e.target.checked); if (!e.target.checked) setTo(''); }} className="accent-sky-500" />
            More than one day (for example leave)
          </label>
          <div>
            <label className="block">
              <span className={LABEL}>Reason</span>
              <textarea aria-label="Reason" rows={2} maxLength={MAX_REASON_LENGTH} placeholder="For example: Sick, On leave, Client meeting" value={reason} onChange={(e) => changed(setReason)(e.target.value)} className={`${FIELD} resize-none`} />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REASON_SUGGESTIONS.map((r) => (
                <button key={r} type="button" onClick={() => changed(setReason)(r)} className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-semibold transition-colors">{r}</button>
              ))}
            </div>
          </div>
          <p className="text-[12px] text-slate-500">
            {forSomeoneElse ? 'The team sees this note on the day, with the reason.' : 'The team sees your note on the day, with the reason.'}{' '}
            {isAdmin ? '' : `You can tell us until the meeting ends at ${formatClock(setup.end)}.`}
          </p>
          {problem && <p role="alert" className="text-[12px] text-red-600">{problem}</p>}
          <div className="pt-1 flex gap-3">
            <button type="button" onClick={onClose} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
            <button type="submit" disabled={sending} className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Who is in the meeting on `day`, grouped Admin, Team, Intern, with the notes of anyone who can't attend.
export function MeetingListCard({ setup, day, clock, team, notes, error, isAdmin }: {
  setup: MeetingSetup;
  day: string;
  clock: MeetingClock;
  team: TeamMember[] | undefined;
  notes: Absence[] | null;
  error: string | null;
  isAdmin: boolean;
}) {
  const groups = meetingGroups(team);
  const people = groups.reduce((n, g) => n + g.members.length, 0);
  const isToday = day === clock.date;
  const held = meetingDay(setup, day).held;
  const noteFor = (memberId: string) => (notes || []).find((n) => n.memberId === memberId && n.date === day) || null;
  const cant = groups.reduce((n, g) => n + g.members.filter((m) => noteFor(m.id)).length, 0);

  return (
    <div className={`${CARD} flex flex-col min-w-0`}>
      <CardHeader
        title={isToday ? "Today's list" : `List for ${formatDate(day, { weekday: true })}`}
        icon={PEOPLE_ICON}
        right={<span className={COUNT}>{people} in the meeting</span>}
      />
      <div className="p-4 space-y-3">
        {!held ? (
          <p className="text-[13px] text-slate-400 italic">No meeting on this day.</p>
        ) : people === 0 ? (
          <p className="text-[13px] text-slate-400 italic">No one is on the meeting list yet. Admins choose who joins on the Team page.</p>
        ) : (
          <>
            {/* On other days, team members only get their own note, so a count would be misleading. */}
            {isAdmin || isToday ? (
              <p className="text-[13px] text-slate-600">
                {notes === null
                  ? 'Checking who can\'t attend…'
                  : cant === 0 ? 'No one has said they can\'t attend.' : `${cant} can't attend · ${people - cant} expected`}
              </p>
            ) : (
              <p className="text-[12px] text-slate-400">On other days you see only your own note. Admins see everyone&apos;s.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <section key={g.group} aria-label={`${g.group} group`} className="min-w-0">
                  <h4 className="mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    {g.group} <span className="text-slate-400">{g.members.length}</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {g.members.map((m) => {
                      const note = noteFor(m.id);
                      const by = note ? writtenBy(note, team) : '';
                      return (
                        <li key={m.id} className={`rounded-lg border px-3 py-2 ${note ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-slate-800 truncate">{m.name}</span>
                              {m.role && <span className="block text-[11px] text-slate-500 truncate">{m.role}</span>}
                            </span>
                            {note && <span className={CANT_TAG}>Can&apos;t attend</span>}
                          </div>
                          {note && (
                            <p className="mt-1 text-[12px] text-slate-700 break-words">
                              {note.reason}
                              {(isAdmin || by) && <span className="block text-[11px] text-slate-400">{[isAdmin ? toldUs(note) : '', by].filter(Boolean).join(' · ')}</span>}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}

// The signed-in person's own notes: coming up (which they can take back until the meeting ends) and past ones.
export function MyNotesCard({ me, scheduleFor, titleFor, clock, notes, isAdmin, inList: inListProp, onAdd, onWithdraw }: {
  me: TeamMember | null;
  /** The meeting a note is for (null if it's gone), to know until when it can be taken back. */
  scheduleFor: (note: Absence) => Schedule | null;
  /** The meeting's name, when the notes are for several meetings. */
  titleFor?: (note: Absence) => string;
  clock: MeetingClock;
  notes: Absence[] | null;
  isAdmin: boolean;
  /** Whether they are in the meeting(s); by default, whether they are on the daily meeting list. */
  inList?: boolean;
  onAdd?: () => void;
  onWithdraw: (note: Absence) => Promise<string | null>;
}) {
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const inList = inListProp ?? (!!me && memberGroup(me) !== NOT_IN_MEETING);
  const noteKey = (n: Absence) => `${n.meetingId || 'daily'}|${n.date}`;
  const mine = (notes || []).filter((n) => me && n.memberId === me.id);
  const upcoming = mine.filter((n) => n.date >= clock.date).sort((a, b) => a.date.localeCompare(b.date));
  const past = mine.filter((n) => n.date < clock.date).sort((a, b) => b.date.localeCompare(a.date));

  const takeBack = async (note: Absence) => {
    const failed = await onWithdraw(note);
    setMessage(failed ? { text: failed, failed: true } : { text: `Taken back. You're expected on ${formatDate(note.date, { weekday: true })}.`, failed: false });
  };

  return (
    <div className={`${CARD} flex flex-col min-w-0`}>
      <CardHeader
        title="Your notes"
        icon={NOTE_ICON}
        right={inList && onAdd && <button type="button" onClick={onAdd} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON} shrink-0`}>I can&apos;t attend</button>}
      />
      <div className="p-4 flex-1 flex flex-col gap-3">
        {!me ? (
          <p className="text-[13px] text-slate-500">
            Your email isn&apos;t on the Team page, so you aren&apos;t on the meeting list.
            {isAdmin ? ' As an admin you can still write a note for someone else with “I can’t attend” on the meeting.' : ' Ask an admin to add it.'}
          </p>
        ) : !inList ? (
          <p className="text-[13px] text-slate-500">You aren&apos;t on the meeting list. Admins choose who joins on the Team page.</p>
        ) : notes === null ? (
          <p className="text-[13px] text-slate-400">Loading your notes…</p>
        ) : mine.length === 0 ? (
          <p className="text-[13px] text-slate-400 italic">You haven&apos;t told us about any meeting you can&apos;t attend.</p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section aria-label="Your notes coming up">
                <h4 className="mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Coming up</h4>
                <ul className="space-y-1.5">
                  {upcoming.map((n) => {
                    const schedule = scheduleFor(n);
                    return (
                    <li key={noteKey(n)} className="flex items-start justify-between gap-3 rounded-lg bg-amber-50/60 border border-amber-200 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-800">{formatDate(n.date, { weekday: true })}</span>
                        {titleFor && <span className="block text-[12px] font-semibold text-slate-600 truncate">{titleFor(n)}</span>}
                        <span className="block text-[12px] text-slate-600 break-words">{n.reason}</span>
                      </span>
                      {schedule && !withdrawProblem(schedule, n.date, clock, false) && (
                        <button type="button" onClick={() => takeBack(n)} aria-label={`Take back your note for ${formatDate(n.date, { weekday: true })}`} className="shrink-0 text-[12px] font-bold text-sky-600 hover:underline">
                          Take back
                        </button>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {past.length > 0 && (
              <section aria-label="Your earlier notes">
                <h4 className="mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Earlier</h4>
                <ul className="space-y-1">
                  {past.slice(0, 20).map((n) => (
                    <li key={noteKey(n)} className="flex items-baseline justify-between gap-3 text-[12px] px-1">
                      <span className="text-slate-600 shrink-0">{formatDate(n.date, { weekday: true })}{titleFor ? ` · ${titleFor(n)}` : ''}</span>
                      <span className="text-slate-500 text-right break-words min-w-0">{n.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {message && <p aria-live="polite" className={`text-[12px] ${message.failed ? 'text-red-600' : 'text-emerald-700'}`}>{message.text}</p>}
      </div>
    </div>
  );
}

// Admins: everyone who couldn't attend in a month, with the reasons.
export function MonthlyNotesCard({ month, onMonth, team, notes, error, titleFor }: {
  month: string;
  onMonth: (month: string) => void;
  team: TeamMember[] | undefined;
  notes: Absence[] | null;
  error: string | null;
  /** The meeting's name, when the notes are for several meetings. */
  titleFor?: (note: Absence) => string;
}) {
  const [y, m] = month.split('-').map(Number);
  const label = `${MONTHS[m - 1]} ${y}`;
  const shift = (by: number) => {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    onMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const rows = [...(notes || [])].sort((a, b) => a.date.localeCompare(b.date));
  const memberOf = (id: string) => (team || []).find((t) => t && t.id === id);
  // One block per person: the most days first, then by name.
  const people = Array.from(new Set(rows.map((n) => n.memberId)))
    .map((id) => ({ id, member: memberOf(id), notes: rows.filter((n) => n.memberId === id) }))
    .sort((a, b) => b.notes.length - a.notes.length || (a.member?.name || '').localeCompare(b.member?.name || ''));
  const arrow = 'p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors';

  return (
    <div className={`${CARD} flex flex-col min-w-0`}>
      <CardHeader
        title="Couldn't attend"
        icon={PEOPLE_ICON}
        right={
          <span className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className={arrow}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span className="text-[12px] font-bold text-slate-700 min-w-[7.5rem] text-center">{label}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className={arrow}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </span>
        }
      />
      <div className="p-4 space-y-3">
        {notes === null && !error ? (
          <p className="text-[13px] text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-slate-400 italic">{error ? '' : `Nobody told us they couldn't attend in ${label}.`}</p>
        ) : (
          <>
            <p className="text-[13px] text-slate-600">{rows.length === 1 ? '1 note' : `${rows.length} notes`} from {people.length === 1 ? '1 person' : `${people.length} people`}</p>
            <ul className="space-y-2" aria-label={`Who couldn't attend in ${label}`}>
              {people.map(({ id, member, notes: list }) => (
                <li key={id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-slate-800 truncate">{member?.name || 'Removed member'}</span>
                      {member && <span className="block text-[11px] text-slate-400">{memberGroup(member)}</span>}
                    </span>
                    <span className={`${COUNT} shrink-0`}>{list.length === 1 ? '1 day' : `${list.length} days`}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {list.map((n) => {
                      const by = writtenBy(n, team);
                      return (
                        <li key={`${n.meetingId || 'daily'}|${n.date}`} className="text-[12px] break-words">
                          <span className="font-semibold text-slate-700">{formatDate(n.date, { weekday: true })}</span>
                          {titleFor && <span className="text-slate-500"> · {titleFor(n)}</span>}
                          <span className="text-slate-700"> — {n.reason}</span>
                          <span className="block text-[11px] text-slate-400">{[n.createdAt ? `Told us ${formatDateTime(n.createdAt)}` : '', by].filter(Boolean).join(' · ')}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}
