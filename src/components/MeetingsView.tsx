'use client'

// The Meetings page: today's meetings, the next few days, and the list of meetings (the daily team meeting and the
// ones admins add). Each meeting has its own page (/?page=meeting&id=…); the daily meeting's page is MeetingView.
// Everyone sees only the meetings they are in; admins see all of them.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useMeetings } from '../context/MeetingsContext';
import { useConfirm } from './ConfirmDialog';
import { useMeetingClock } from '../hooks/useMeetingClock';
import { useAbsences, useAbsenceActions } from '../hooks/useAbsences';
import { addDays, formatDate } from '../utils/dates';
import { teamMemberForEmail } from '../utils/team';
import { phoneLink } from '../utils/phone';
import { clientLabel } from '../utils/clients';
import { MAX_DAY_OFF_REASON, durationLabel, formatClock, formatTimeRange, isGoogleMeet, linkLabel, meetingCode, meetingSetup, type MeetingClock } from '../utils/meeting';
import { MEETING_GROUPS, firstInformDay, isDailyNote, memberGroup, withdrawProblem, type Absence } from '../utils/absences';
import {
  DAILY_MEETING_ID, MEETING_TYPES, attendeeIds, dailyMeeting, meetingsOn, nextOccurrence, occurrenceStatus, occursOn, repeatLabel, skipProblem,
  whoLabel,
} from '../utils/meetings';
import type { Meeting } from '../types';
import { MeetingView } from './MeetingView';
import { MeetingForm } from './MeetingForm';
import { CantAttendDialog, MonthlyNotesCard, MyNotesCard } from './MeetingPeople';
import { PageHeader } from './PageHeader';
import { CARD, DANGER_OUTLINE_BUTTON, MEDIUM_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_TITLE } from '../utils/styles';

type NavigateTo = (view: string, params?: Record<string, string>) => void;

const COUNT = 'text-[10px] font-bold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full';
const CANT_TAG = 'shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200';
const FIELD = 'w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium';
// The colour of each type's tag.
const TYPE_TAG: Record<string, string> = {
  Team: 'bg-sky-50 text-sky-700 border-sky-200',
  Interns: 'bg-violet-50 text-violet-700 border-violet-200',
  Client: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'One-on-one': 'bg-amber-50 text-amber-700 border-amber-200',
  Other: 'bg-slate-50 text-slate-600 border-slate-200',
};
const CALENDAR_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const LIST_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>;
const PEOPLE_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;

function CardHeader({ title, icon, right }: { title: string; icon: ReactNode; right?: ReactNode }) {
  return (
    <div className="px-4 py-2 min-h-14 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
      <h2 className={`${SECTION_TITLE} flex items-center gap-2`}>{icon}{title}</h2>
      {right}
    </div>
  );
}

export function TypeTag({ type }: { type: string }) {
  return <span className={`shrink-0 inline-flex px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${TYPE_TAG[type] || TYPE_TAG.Other}`}>{type}</span>;
}

// "Starts in 20 min", "On now", "Ended" for a meeting on today; nothing for other days.
function StatusTag({ meeting, date, clock }: { meeting: Meeting; date: string; clock: MeetingClock }) {
  const status = occurrenceStatus(meeting, date, clock);
  if (status.kind === 'live') return <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600"><span className="w-2 h-2 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden="true"></span>On now</span>;
  if (status.kind === 'upcoming') return <span className="shrink-0 text-[11px] font-semibold text-sky-700">Starts in {durationLabel(status.minutes)}</span>;
  if (status.kind === 'ended') return <span className="shrink-0 text-[11px] text-slate-400">Ended</span>;
  return null;
}

// One meeting on a day: its time, title, type and who is in it; Join while it's on or about to start.
function MeetingRow({ meeting, date, clock, who, onOpen }: { meeting: Meeting; date: string; clock: MeetingClock; who: string; onOpen: () => void }) {
  const status = occurrenceStatus(meeting, date, clock);
  const joinable = !!meeting.link && (status.kind === 'live' || status.kind === 'upcoming');
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-sky-50/60 transition-colors">
      <button type="button" onClick={onOpen} title="Open this meeting" className="flex-1 min-w-0 flex items-start gap-3 text-left px-3 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        <span className="w-24 shrink-0 text-[12px] font-bold text-slate-700 pt-0.5">{formatTimeRange(meeting.start, meeting.end)}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-slate-800">{meeting.title}</span>
            <TypeTag type={meeting.type} />
          </span>
          <span className="block text-[12px] text-slate-500 truncate">{who}</span>
        </span>
      </button>
      <span className="flex items-center gap-3 pr-3 shrink-0">
        <StatusTag meeting={meeting} date={date} clock={clock} />
        {joinable && <a href={meeting.link} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-sky-600 hover:underline">Join</a>}
      </span>
    </li>
  );
}

export function MeetingsView({ globalDate, routeParams, navigateTo }: { globalDate: string; routeParams?: { selectedMeetingId?: string }; navigateTo: NavigateTo }) {
  const id = routeParams?.selectedMeetingId;
  const back = () => navigateTo('meeting');
  if (id === DAILY_MEETING_ID) return <MeetingView globalDate={globalDate} onBack={back} />;
  if (id) return <MeetingPage id={id} globalDate={globalDate} onBack={back} />;
  return <MeetingsOverview globalDate={globalDate} navigateTo={navigateTo} />;
}

function MeetingsOverview({ globalDate, navigateTo }: { globalDate: string; navigateTo: NavigateTo }) {
  const { data } = useData();
  const { user, isAdmin } = useAuth();
  const { meetings, error } = useMeetings();
  const clock = useMeetingClock();
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);

  // "I can't attend" notes for every meeting: your own, and (admins) everyone's in a month.
  const me = useMemo(() => teamMemberForEmail(data.team, user?.email), [data.team, user?.email]);
  const [notesVersion, setNotesVersion] = useState(0);
  const { absences: myNotes } = useAbsences(me ? 'mine=1' : null, notesVersion);
  const [month, setMonth] = useState(() => clock.date.slice(0, 7));
  const { absences: monthNotes, error: monthError } = useAbsences(isAdmin ? `month=${month}` : null, notesVersion);
  const { withdraw } = useAbsenceActions();
  const setup = useMemo(() => meetingSetup(data.settings), [data.settings]);
  const meetingOf = (n: Absence) => (isDailyNote(n) ? null : (meetings || []).find((m) => m.id === n.meetingId) || null);
  const scheduleFor = (n: Absence) => (isDailyNote(n) ? setup : meetingOf(n));
  const titleFor = (n: Absence) => (isDailyNote(n) ? 'Daily team meeting' : meetingOf(n)?.title || 'A removed meeting');
  const takeBack = async (n: Absence) => {
    const failed = await withdraw(n.date, undefined, isDailyNote(n) ? undefined : n.meetingId);
    if (!failed) setNotesVersion((v) => v + 1);
    return failed;
  };

  // The daily team meeting first, then the others (the server only sends each person the meetings they're in).
  const all = useMemo(() => [dailyMeeting(data.settings), ...(meetings || [])], [data.settings, meetings]);
  const shown = type ? all.filter((m) => m.type === type) : all;
  const who = (m: Meeting) => whoLabel(m, data.team, data.clients);
  const open = (m: Meeting) => navigateTo('meeting', { selectedMeetingId: m.id });
  const today = meetingsOn(shown, globalDate);
  const nextDays = Array.from({ length: 6 }, (_, i) => addDays(globalDate, i + 1)).map((day) => ({ day, list: meetingsOn(shown, day) })).filter((d) => d.list.length);
  // The list of meetings: the daily one first, then by when each next happens.
  const series = [...shown].sort((a, b) => Number(!!b.builtIn) - Number(!!a.builtIn) || (nextOccurrence(a, clock.date) || '9999').localeCompare(nextOccurrence(b, clock.date) || '9999') || a.start.localeCompare(b.start));
  const isToday = globalDate === clock.date;

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-sans pb-8">
      <PageHeader title="Meetings" subtitle={`${formatDate(globalDate, { weekday: true })} · ${isAdmin ? 'All meetings' : 'Your meetings'}`}>
        {isAdmin && (
          <button type="button" onClick={() => setAdding(true)} className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            New meeting
          </button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show meetings of type">
        {['', ...MEETING_TYPES].map((t) => (
          <button key={t || 'all'} type="button" onClick={() => setType(t)} aria-pressed={type === t}
            className={`px-3 py-1 rounded-full border text-[12px] font-semibold transition-colors ${type === t ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {t || 'All'}
          </button>
        ))}
        {error && <span className="text-[12px] text-red-600">{error}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} flex flex-col min-w-0`}>
          <CardHeader title={isToday ? 'Today' : formatDate(globalDate, { weekday: true })} icon={CALENDAR_ICON} right={<span className={COUNT}>{today.length}</span>} />
          <div className="p-4">
            {today.length === 0 ? (
              <p className="text-[13px] text-slate-400 italic">{meetings === null ? 'Loading meetings…' : 'No meetings on this day.'}</p>
            ) : (
              <ul className="space-y-1.5" aria-label="Meetings on this day">
                {today.map((m) => <MeetingRow key={m.id} meeting={m} date={globalDate} clock={clock} who={who(m)} onOpen={() => open(m)} />)}
              </ul>
            )}
          </div>
        </div>
        <div className={`${CARD} flex flex-col min-w-0`}>
          <CardHeader title="Next 6 days" icon={CALENDAR_ICON} />
          <div className="p-4 space-y-3">
            {nextDays.length === 0 ? (
              <p className="text-[13px] text-slate-400 italic">No meetings in the next 6 days.</p>
            ) : nextDays.map(({ day, list }) => (
              <section key={day} aria-label={formatDate(day, { weekday: true })}>
                <h4 className="mb-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{formatDate(day, { weekday: true })}</h4>
                <ul className="space-y-1">
                  {list.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => open(m)} className="w-full flex items-center gap-3 text-left px-2 py-1 rounded-lg hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                        <span className="w-24 shrink-0 text-[12px] text-slate-500">{formatTimeRange(m.start, m.end)}</span>
                        <span className="text-[13px] text-slate-800 truncate">{m.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      <div className={`${CARD} flex flex-col min-w-0`}>
        <CardHeader title={isAdmin ? 'All meetings' : 'Your meetings'} icon={LIST_ICON} right={<span className={COUNT}>{series.length}</span>} />
        <ul className="divide-y divide-slate-100" aria-label="Meetings">
          {series.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => open(m)} className="w-full text-left px-4 py-3 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-slate-800">{m.title}</span>
                    <TypeTag type={m.type} />
                  </span>
                  <span className="block text-[12px] text-slate-500 truncate">{who(m)}</span>
                </span>
                <span className="text-[12px] text-slate-600 sm:text-right shrink-0">
                  {repeatLabel(m)} · {formatTimeRange(m.start, m.end)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-4`}>
        <MyNotesCard me={me} scheduleFor={scheduleFor} titleFor={titleFor} clock={clock} notes={myNotes} isAdmin={isAdmin} inList={!!me} onWithdraw={takeBack} />
        {isAdmin && <MonthlyNotesCard month={month} onMonth={setMonth} team={data.team} notes={monthNotes} error={monthError} titleFor={titleFor} />}
      </div>

      {adding && (
        <MeetingForm day={globalDate} onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); open(m); }} />
      )}
    </div>
  );
}

// One meeting's own page (not the daily meeting, which has MeetingView).
function MeetingPage({ id, globalDate, onBack }: { id: string; globalDate: string; onBack: () => void }) {
  const { data } = useData();
  const { user, isAdmin } = useAuth();
  const { meetings, removeMeeting } = useMeetings();
  const confirm = useConfirm();
  const clock = useMeetingClock();
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  const meeting = (meetings || []).find((m) => m.id === id) || null;
  // The day shown: the date picked in the sidebar if the meeting is on it, otherwise its next date.
  const day = meeting ? (occursOn(meeting, globalDate) ? globalDate : nextOccurrence(meeting, clock.date)) : null;
  const [notesVersion, setNotesVersion] = useState(0);
  const { absences: dayNotes, error: dayNotesError } = useAbsences(meeting && day ? `date=${day}&meetingId=${encodeURIComponent(meeting.id)}` : null, notesVersion);
  const { inform, withdraw } = useAbsenceActions();
  const [informing, setInforming] = useState(false);
  const backLink = (
    <button type="button" onClick={onBack} className="text-[13px] font-semibold text-sky-600 hover:underline flex items-center gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
      All meetings
    </button>
  );
  if (!meeting) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 font-sans pb-8">
        {backLink}
        <div className={`${CARD} p-8 text-center`}>
          <p className="text-[13px] text-slate-500">{meetings === null ? 'Loading the meeting…' : 'This meeting was not found. It may have been removed, or you may not be in it.'}</p>
        </div>
      </div>
    );
  }

  const me = teamMemberForEmail(data.team, user?.email);
  const ids = attendeeIds(meeting, data.team);
  const people = (data.team || []).filter((t) => t && ids.includes(t.id));
  const groupsOrder = [...MEETING_GROUPS, 'None'];
  const byGroup = Array.from(new Set(people.map(memberGroup)))
    .sort((a, b) => (groupsOrder.indexOf(a) + 1 || 99) - (groupsOrder.indexOf(b) + 1 || 99))
    .map((g) => ({ group: g, members: people.filter((p) => memberGroup(p) === g).sort((a, b) => (a.name || '').localeCompare(b.name || '')) }));
  const status = day ? occurrenceStatus(meeting, day, clock) : null;
  const statusText = !status || !day ? 'No more dates'
    : status.kind === 'live' ? 'On now'
    : status.kind === 'upcoming' ? `Starts in ${durationLabel(status.minutes)}`
    : status.kind === 'ended' ? 'Ended for today'
    : status.kind === 'past' ? `Was on ${formatDate(day, { weekday: true })}`
    : `Next: ${formatDate(day, { weekday: true })}, ${formatClock(meeting.start)}`;
  const meet = !meeting.link || isGoogleMeet(meeting.link);
  const code = meeting.link ? meetingCode(meeting.link) : '';
  const inIt = !!me && ids.includes(me.id);
  const canInform = !!day && (inIt || (isAdmin && people.length > 0));
  const noteFor = (memberId: string) => (dayNotes || []).find((n) => n.memberId === memberId && n.date === day) || null;
  const myNote = me && day ? noteFor(me.id) : null;
  const skippedHere = (meeting.skip || []).find((d) => d.date === globalDate) || null;
  const dayWords = day === clock.date ? 'today' : day ? `on ${formatDate(day, { weekday: true })}` : '';
  const sendNote = async (note: { from: string; to?: string; reason: string; memberId?: string }) => {
    const failed = await inform({ ...note, meetingId: meeting.id });
    if (!failed) setNotesVersion((v) => v + 1);
    return failed;
  };
  const takeBack = async (note: Absence) => {
    const failed = await withdraw(note.date, note.memberId !== me?.id ? note.memberId : undefined, meeting.id);
    if (failed) setFlash({ text: failed, ok: false });
    else { setNotesVersion((v) => v + 1); setFlash({ text: "Taken back. You're expected.", ok: true }); }
  };
  const host = meeting.host ? ((data.team || []).find((t) => t && t.email && t.email.trim().toLowerCase() === meeting.host)?.name || meeting.host) : '';

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(meeting.link || ''); setFlash({ text: 'Link copied', ok: true }); }
    catch { setFlash({ text: "Couldn't copy. Select the link and copy it yourself.", ok: false }); }
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Remove this meeting?', message: `“${meeting.title}” will be removed for everyone in it.`, confirmLabel: 'Remove meeting', danger: true });
    if (!ok) return;
    const failed = await removeMeeting(meeting.id);
    if (failed) setFlash({ text: failed, ok: false });
    else onBack();
  };

  // Skipped dates: shown for repeating meetings to admins, and to everyone when some are coming up.
  const showSkips = meeting.repeat !== 'none' && (isAdmin || (meeting.skip || []).some((d) => d.date >= clock.date));

  const rows: [string, ReactNode][] = [
    ['When', <>{formatTimeRange(meeting.start, meeting.end)} <span className="text-slate-400">(India time)</span></>],
    ['Repeats', meeting.repeat === 'none' ? 'One time' : repeatLabel(meeting)],
    ...(meeting.repeat !== 'none' && meeting.date ? [['From', formatDate(meeting.date, { weekday: true })] as [string, ReactNode]] : []),
    ['Where', meeting.place ? (meeting.link ? `${meet ? 'Google Meet' : 'Online'}, or ${meeting.place}` : meeting.place) : meet ? 'Google Meet' : 'Online meeting'],
    ...(meeting.link ? [['Link', <span key="l" className="font-mono text-[12px] break-all">{linkLabel(meeting.link)}</span>] as [string, ReactNode]] : []),
    ...(code ? [['Meeting code', <span key="c" className="font-mono text-[12px]">{code}</span>] as [string, ReactNode]] : []),
    ['Camera', meeting.camera === 'On' ? 'Please keep it on' : 'Optional'],
    ...(meeting.clientId ? [['Client', <span key="cl">{clientLabel(data.clients, meeting.clientId, 'No client')}{meeting.contactName ? ` · ${meeting.contactName}` : ''}{meeting.contactPhone ? <> · <a href={phoneLink(meeting.contactPhone)} className="text-sky-600 hover:underline">{meeting.contactPhone}</a></> : null}</span>] as [string, ReactNode]] : []),
    ...(host ? [['Added by', host] as [string, ReactNode]] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-4 font-sans pb-8">
      {backLink}
      <PageHeader title={meeting.title} subtitle={`${meeting.type} · ${repeatLabel(meeting)} · ${formatTimeRange(meeting.start, meeting.end)} (India time)`}>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>Change</button>
            <button type="button" onClick={remove} className={`${DANGER_OUTLINE_BUTTON} ${MEDIUM_BUTTON}`}>Remove</button>
          </div>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} flex flex-col min-w-0`}>
          <CardHeader title="Details" icon={CALENDAR_ICON} right={<TypeTag type={meeting.type} />} />
          <div className="p-4 flex-1 flex flex-col gap-4">
            <p className="flex items-center gap-2 text-lg font-extrabold text-slate-800">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${status?.kind === 'live' ? 'bg-red-500 motion-safe:animate-pulse' : status?.kind === 'upcoming' || status?.kind === 'future' ? 'bg-sky-500' : 'bg-slate-300'}`} aria-hidden="true"></span>
              {statusText}
            </p>
            {skippedHere && <p className="text-[13px] text-amber-800 -mt-2">No meeting on {formatDate(globalDate, { weekday: true })}: {skippedHere.note}.</p>}
            {myNote && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900 flex items-start justify-between gap-3">
                <span className="min-w-0 break-words">You told us you can&apos;t attend {dayWords}: {myNote.reason}</span>
                {!withdrawProblem(meeting, myNote.date, clock, false) && (
                  <button type="button" onClick={() => takeBack(myNote)} aria-label={`Take back your note for ${formatDate(myNote.date, { weekday: true })}`} className="shrink-0 font-bold text-amber-900 hover:underline">Take back</button>
                )}
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-500 font-semibold">{label}</dt>
                  <dd className="text-slate-800 min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              {meeting.link ? (
                <a href={meeting.link} target="_blank" rel="noopener noreferrer" className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} inline-flex items-center gap-2`}>{meet ? 'Join Google Meet' : 'Join meeting'}</a>
              ) : (
                <span className="text-[12px] text-slate-500">{meeting.place ? `In person: ${meeting.place}` : 'No link added yet.'}</span>
              )}
              {meeting.link && <button type="button" onClick={copyLink} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>Copy link</button>}
              {canInform && <button type="button" onClick={() => setInforming(true)} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>I can&apos;t attend</button>}
            </div>
            {flash && <p aria-live="polite" className={`text-[12px] font-semibold ${flash.ok ? 'text-emerald-600' : 'text-red-600'}`}>{flash.text}</p>}
          </div>
        </div>

        <div className={`${CARD} flex flex-col min-w-0`}>
          <CardHeader title="Who's in it" icon={PEOPLE_ICON} right={<span className={COUNT}>{people.length + (meeting.clientId ? 1 : 0)}</span>} />
          <div className="p-4 space-y-3">
            {day && (
              <p className="text-[12px] text-slate-500">
                Who can&apos;t attend {dayWords}{!isAdmin && day !== clock.date ? ' (on other days you see only your own note)' : ''}.
              </p>
            )}
            {dayNotesError && <p className="text-[12px] text-red-600">{dayNotesError}</p>}
            {meeting.clientId && (
              <section aria-label="Client">
                <h4 className="mb-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Client</h4>
                <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[13px] text-slate-800">
                  <span className="font-semibold">{clientLabel(data.clients, meeting.clientId, 'No client')}</span>
                  {meeting.contactName && <span className="block text-[12px] text-slate-600">{meeting.contactName}{meeting.contactPhone ? ` · ${meeting.contactPhone}` : ''}</span>}
                </p>
              </section>
            )}
            {byGroup.length === 0 && !meeting.clientId && <p className="text-[13px] text-slate-400 italic">No one from the team yet.</p>}
            {byGroup.map(({ group, members }) => (
              <section key={group} aria-label={`${group === 'None' ? 'Others' : group} in the meeting`}>
                <h4 className="mb-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">{group === 'None' ? 'Others' : group} <span className="text-slate-400">{members.length}</span></h4>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {members.map((p) => {
                    const n = noteFor(p.id);
                    return (
                      <li key={p.id} className={`rounded-lg border px-3 py-2 ${n ? 'bg-amber-50/60 border-amber-200' : p.id === me?.id ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-slate-800 break-words">{p.name}{p.id === me?.id ? ' (you)' : ''}</span>
                            {p.role && <span className="block text-[11px] text-slate-500 truncate">{p.role}</span>}
                          </span>
                          {n && <span className={CANT_TAG}>Can&apos;t attend</span>}
                        </div>
                        {n && <p className="mt-1 text-[12px] text-slate-700 break-words">{n.reason}</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      {(meeting.agenda || showSkips) && (
        <div className={`grid grid-cols-1 ${meeting.agenda && showSkips ? 'lg:grid-cols-2' : ''} gap-4`}>
          {meeting.agenda && (
            <div className={`${CARD} flex flex-col min-w-0`}>
              <CardHeader title="Agenda" icon={LIST_ICON} />
              <p className="p-4 text-[13px] text-slate-700 whitespace-pre-wrap break-words">{meeting.agenda}</p>
            </div>
          )}
          {showSkips && <SkippedDatesCard meeting={meeting} today={clock.date} canEdit={isAdmin} />}
        </div>
      )}
      {informing && day && (
        <CantAttendDialog
          setup={meeting} clock={clock} firstDay={firstInformDay(meeting, globalDate, clock)} members={people}
          myId={inIt && me ? me.id : null} isAdmin={isAdmin} onSend={sendNote} onClose={() => setInforming(false)}
        />
      )}

      {editing && (
        <MeetingForm meeting={meeting} day={globalDate} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setFlash({ text: 'Saved.', ok: true }); }} />
      )}
    </div>
  );
}

// The dates a repeating meeting doesn't happen (a holiday and the like). Admins add and remove them.
function SkippedDatesCard({ meeting, today, canEdit }: { meeting: Meeting; today: string; canEdit: boolean }) {
  const { skipDate, unskipDate } = useMeetings();
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const upcoming = (meeting.skip || []).filter((d) => d.date >= today);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const issue = skipProblem(meeting, date, note, today);
    if (issue) { setProblem(issue); return; }
    const failed = await skipDate(meeting.id, date, note.trim());
    if (failed) { setProblem(failed); return; }
    setDate('');
    setNote('');
    setProblem(null);
  };
  const putBack = async (day: string) => {
    setProblem(null);
    const failed = await unskipDate(meeting.id, day);
    if (failed) setProblem(failed);
  };

  return (
    <div className={`${CARD} flex flex-col min-w-0`}>
      <CardHeader title="Skipped dates" icon={CALENDAR_ICON} right={<span className={COUNT}>{upcoming.length}</span>} />
      <div className="p-4 flex-1 flex flex-col gap-3">
        {upcoming.length === 0 ? (
          <p className="text-[13px] text-slate-400 italic">No dates skipped.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Skipped dates">
            {upcoming.map((d) => (
              <li key={d.date} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-800">{formatDate(d.date, { weekday: true })}</span>
                  {d.note && <span className="block text-[12px] text-slate-500 truncate">{d.note}</span>}
                </span>
                {canEdit && (
                  <button type="button" onClick={() => putBack(d.date)} aria-label={`Put back the meeting on ${formatDate(d.date, { weekday: true })}`} className="shrink-0 text-[12px] font-bold text-slate-400 hover:text-sky-700 transition-colors">
                    Put back
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form onSubmit={add} noValidate className="mt-auto pt-3 border-t border-slate-100 space-y-2">
            <p className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Skip a date</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="date" aria-label="Date to skip" value={date} min={today} onChange={(e) => { setDate(e.target.value); setProblem(null); }} className={`${FIELD} sm:w-44`} />
              <input type="text" aria-label="Reason for skipping" placeholder="Reason, e.g. Holiday" value={note} maxLength={MAX_DAY_OFF_REASON} onChange={(e) => { setNote(e.target.value); setProblem(null); }} className={`${FIELD} flex-1 min-w-0`} />
              <button type="submit" className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} shrink-0`}>Skip</button>
            </div>
          </form>
        )}
        {problem && <p role="alert" className="text-[12px] text-red-600">{problem}</p>}
      </div>
    </div>
  );
}
