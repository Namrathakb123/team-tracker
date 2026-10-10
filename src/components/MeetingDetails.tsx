'use client'

// The top of the Daily Meeting page: the meeting card (when, where, how to join) and the days with no meeting.
// Admins change the details and the days off; everyone else sees them.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { formatDate } from '../utils/dates';
import {
  CAMERA_CHOICES, MAX_DAY_OFF_REASON, PLACEHOLDER_LINK, WEEKDAYS, dayName, dayOffProblem, daysLabel, daysWithoutMeetingLabel,
  durationLabel, formatClock, formatTimeRange, isGoogleMeet, linkLabel, linkProblem, meetingChangeSummary, meetingCode,
  meetingStatus, nextMeetingDate, notesFromText, notesProblem, timeProblem, upcomingDaysOff,
  type Camera, type DayOff, type MeetingClock, type MeetingSetup, type MeetingStatus,
} from '../utils/meeting';
import { withdrawProblem, type Absence } from '../utils/absences';
import { CARD, DIALOG, DIALOG_TITLE, MEDIUM_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_TITLE, SMALL_BUTTON } from '../utils/styles';

// Saves new meeting details; `details` is the line for the Audit Log.
type SaveSetup = (next: MeetingSetup, details: string) => void;

const FIELD = 'w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium';
const LABEL = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1';
const COUNT = 'text-[10px] font-bold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full';

const VIDEO_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 8-6 4 6 4V8Z"></path><rect x="2" y="6" width="14" height="12" rx="2" ry="2"></rect></svg>;

function CardHeader({ title, icon, right }: { title: string; icon: ReactNode; right?: ReactNode }) {
  return (
    <div className="px-4 py-2 min-h-14 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
      <h2 className={`${SECTION_TITLE} flex items-center gap-2`}>{icon}{title}</h2>
      {right}
    </div>
  );
}

// The big line at the top of the card: where the meeting stands, and a smaller line under it.
function statusText(status: MeetingStatus, setup: MeetingSetup, day: string, isToday: boolean): { dot: string; main: string; sub: string } {
  const at = (date: string | null) => (date ? `${formatDate(date, { weekday: true })}, ${formatClock(setup.start)}` : '');
  const next = nextMeetingDate(setup, day);
  const nextLine = next ? `Next meeting: ${at(next)}` : '';
  switch (status.kind) {
    case 'none':
      return {
        dot: 'bg-slate-300',
        main: isToday ? 'No meeting today' : 'No meeting on this day',
        sub: [status.dayOff ? `Day off${status.dayOff.note ? `: ${status.dayOff.note}` : ''}.` : `There is no meeting on ${dayName(status.weekday)}s.`, nextLine].filter(Boolean).join(' '),
      };
    case 'upcoming':
      return { dot: 'bg-sky-500', main: `Starts in ${durationLabel(status.minutes)}`, sub: `Today at ${formatClock(setup.start)}` };
    case 'live':
      return { dot: 'bg-red-500 motion-safe:animate-pulse', main: 'On now', sub: `Until ${formatClock(setup.end)} (${durationLabel(status.minutes)} left)` };
    case 'ended':
      return { dot: 'bg-slate-300', main: 'Ended for today', sub: [`It finished at ${formatClock(setup.end)}.`, nextLine].filter(Boolean).join(' ') };
    case 'past':
      return { dot: 'bg-slate-300', main: 'This day has passed', sub: at(day) };
    case 'future':
      return { dot: 'bg-sky-500', main: 'Coming up', sub: at(day) };
  }
}

// When, where and how to join the meeting on `day` (the date picked in the sidebar); "I can't attend", and the
// signed-in person's own note for that day, if they wrote one.
export function MeetingCard({ setup, day, clock, canEdit, onEdit, canInform = false, myNote = null, onCantAttend, onTakeBack }: {
  setup: MeetingSetup;
  day: string;
  clock: MeetingClock;
  canEdit: boolean;
  onEdit: () => void;
  canInform?: boolean;
  myNote?: Absence | null;
  onCantAttend?: () => void;
  onTakeBack?: (note: Absence) => Promise<string | null>;
}) {
  const status = meetingStatus(setup, day, clock);
  const isToday = day === clock.date;
  const { dot, main, sub } = statusText(status, setup, day, isToday);
  const meet = !setup.link || isGoogleMeet(setup.link);
  const code = meetingCode(setup.link);
  const canJoin = !!setup.link && status.kind !== 'none';

  // A short note under the buttons ("Link copied", "Taken back") instead of a pop-up.
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(setup.link);
      setFlash({ text: 'Link copied', ok: true });
    } catch {
      setFlash({ text: "Couldn't copy. Select the link and copy it yourself.", ok: false });
    }
  };
  const takeBack = async () => {
    if (!myNote || !onTakeBack) return;
    const failed = await onTakeBack(myNote);
    setFlash(failed ? { text: failed, ok: false } : { text: "Taken back. You're expected.", ok: true });
  };

  const rows: [string, ReactNode][] = [
    ['When', <>{formatTimeRange(setup.start, setup.end)} <span className="text-slate-400">(India time)</span></>],
    ['Days', daysLabel(setup.days)],
    ['Where', meet ? 'Google Meet' : 'Online meeting'],
    ['Link', setup.link
      ? <span className="font-mono text-[12px] break-all">{linkLabel(setup.link)}</span>
      : <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] text-slate-400 select-none">{PLACEHOLDER_LINK}</span><span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Coming soon</span></span>],
    ...(code ? [['Meeting code', <span key="code" className="font-mono text-[12px]">{code}</span>] as [string, ReactNode]] : []),
    ['Camera', setup.camera === 'On' ? 'Please keep it on' : 'Optional'],
    ...(setup.notes.length ? [['Notes', <ul key="notes" className="list-disc pl-4 space-y-0.5">{setup.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>] as [string, ReactNode]] : []),
  ];

  return (
    <div className={`${CARD} flex flex-col min-w-0`}>
      <CardHeader
        title={isToday ? "Today's meeting" : `Meeting on ${formatDate(day, { weekday: true })}`}
        icon={<span className="text-sky-500">{VIDEO_ICON}</span>}
        right={canEdit && <button type="button" onClick={onEdit} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON} shrink-0`}>Edit details</button>}
      />
      <div className="p-4 flex-1 flex flex-col gap-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold text-slate-800">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} aria-hidden="true"></span>
            {main}
          </p>
          {sub && <p className="text-[13px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {myNote && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900 flex items-start justify-between gap-3">
            <span className="min-w-0 break-words">You told us you can&apos;t attend{isToday ? ' today' : ''}: {myNote.reason}</span>
            {onTakeBack && !withdrawProblem(setup, myNote.date, clock, false) && (
              <button type="button" onClick={takeBack} aria-label={`Take back your note for ${formatDate(myNote.date, { weekday: true })}`} className="shrink-0 font-bold text-amber-900 hover:underline">
                Take back
              </button>
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
        <div className="mt-auto space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {canJoin ? (
              <a href={setup.link} target="_blank" rel="noopener noreferrer" className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} inline-flex items-center gap-2`}>
                {VIDEO_ICON}{meet ? 'Join Google Meet' : 'Join meeting'}
              </a>
            ) : (
              <button type="button" disabled className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} inline-flex items-center gap-2`}>
                {VIDEO_ICON}{meet ? 'Join Google Meet' : 'Join meeting'}
              </button>
            )}
            <button type="button" onClick={copyLink} disabled={!setup.link} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>Copy link</button>
            {canInform && onCantAttend && (
              <button type="button" onClick={onCantAttend} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>I can&apos;t attend</button>
            )}
          </div>
          {flash && <p aria-live="polite" className={`text-[12px] font-semibold ${flash.ok ? 'text-emerald-600' : 'text-red-600'}`}>{flash.text}</p>}
          {!setup.link && (
            <p className="text-[12px] text-slate-500">The meeting link will be added soon.{canEdit ? ' Add it with Edit details.' : ''}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// The days with no meeting: the weekdays that never have one, and the days off an admin has added.
export function DaysOffCard({ setup, today, canEdit, onSave }: { setup: MeetingSetup; today: string; canEdit: boolean; onSave: SaveSetup }) {
  const upcoming = upcomingDaysOff(setup, today);
  const neverOn = daysWithoutMeetingLabel(setup.days);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const reason = dayOffProblem(setup, date, note, today);
    if (reason) { setProblem(reason); return; }
    onSave({ ...setup, daysOff: [...setup.daysOff, { date, note: note.trim() }] }, `Added a day with no meeting: ${formatDate(date, { weekday: true })} (${note.trim()})`);
    setDate('');
    setNote('');
    setProblem(null);
  };
  const remove = (day: DayOff) => {
    setProblem(null);
    onSave({ ...setup, daysOff: setup.daysOff.filter((d) => d.date !== day.date) }, `Removed the day with no meeting on ${formatDate(day.date, { weekday: true })}${day.note ? ` (${day.note})` : ''}`);
  };

  return (
    <div className={`${CARD} flex flex-col min-w-0`}>
      <CardHeader
        title="Days off"
        icon={<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>}
        right={<span className={COUNT} title="Days off coming up">{upcoming.length}</span>}
      />
      <div className="p-4 flex-1 flex flex-col gap-3">
        {neverOn && <p className="text-[13px] text-slate-500">There is never a meeting on {neverOn}.</p>}
        {upcoming.length === 0 ? (
          <p className="text-[13px] text-slate-400 italic">{neverOn ? 'No other days off planned.' : 'No days off planned.'}</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Days off coming up">
            {upcoming.map((d) => (
              <li key={d.date} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-800">{formatDate(d.date, { weekday: true })}</span>
                  {d.note && <span className="block text-[12px] text-slate-500 truncate">{d.note}</span>}
                </span>
                {canEdit && (
                  <button type="button" onClick={() => remove(d)} aria-label={`Remove the day off on ${formatDate(d.date, { weekday: true })}`} className="shrink-0 text-[12px] font-bold text-slate-400 hover:text-red-600 transition-colors">
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form onSubmit={add} noValidate className="mt-auto pt-3 border-t border-slate-100 space-y-2">
            <p className={LABEL}>Add a day off</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="date" aria-label="Day off" value={date} min={today} onChange={(e) => { setDate(e.target.value); setProblem(null); }} className={`${FIELD} sm:w-44`} />
              <input type="text" aria-label="Reason for the day off" placeholder="Reason, e.g. Diwali" value={note} maxLength={MAX_DAY_OFF_REASON} onChange={(e) => { setNote(e.target.value); setProblem(null); }} className={`${FIELD} flex-1 min-w-0`} />
              <button type="submit" className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} shrink-0`}>Add</button>
            </div>
            {problem && <p role="alert" className="text-[12px] text-red-600">{problem}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

// The admin's window for the meeting's time, days, camera rule, link and notes.
export function MeetingDetailsDialog({ setup, onSave, onClose }: { setup: MeetingSetup; onSave: SaveSetup; onClose: () => void }) {
  const [start, setStart] = useState(setup.start);
  const [end, setEnd] = useState(setup.end);
  const [days, setDays] = useState<string[]>(setup.days);
  const [camera, setCamera] = useState<Camera>(setup.camera);
  const [link, setLink] = useState(setup.link);
  const [notes, setNotes] = useState(setup.notes.join('\n'));
  const [problem, setProblem] = useState<string | null>(null);

  // Changing anything clears the message about the last mistake.
  const changed = <T,>(set: (value: T) => void) => (value: T) => { set(value); setProblem(null); };
  const toggleDay = (day: string) => { setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day])); setProblem(null); };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const reason = timeProblem(start, end) || linkProblem(link) || notesProblem(notes);
    if (reason) { setProblem(reason); return; }
    const next: MeetingSetup = { ...setup, start, end, days: WEEKDAYS.filter((d) => days.includes(d)), camera, link: link.trim(), notes: notesFromText(notes) };
    const summary = meetingChangeSummary(setup, next);
    if (summary) onSave(next, summary);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Edit meeting details" className={`${DIALOG} w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <h3 className={DIALOG_TITLE}>Edit meeting details</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <form onSubmit={save} noValidate className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={LABEL}>Starts (India time)</span>
              <input type="time" aria-label="Meeting starts" value={start} onChange={(e) => changed(setStart)(e.target.value)} autoFocus className={FIELD} />
            </label>
            <label className="block">
              <span className={LABEL}>Ends</span>
              <input type="time" aria-label="Meeting ends" value={end} onChange={(e) => changed(setEnd)(e.target.value)} className={FIELD} />
            </label>
          </div>
          <fieldset>
            <legend className={LABEL}>Days with a meeting</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label key={d} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold cursor-pointer select-none transition-colors ${days.includes(d) ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input type="checkbox" checked={days.includes(d)} onChange={() => toggleDay(d)} aria-label={dayName(d)} className="accent-sky-500" />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className={LABEL}>Camera</span>
            <select aria-label="Camera" value={camera} onChange={(e) => changed(setCamera)(e.target.value as Camera)} className={FIELD}>
              {CAMERA_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Google Meet link</span>
            <input type="text" inputMode="url" aria-label="Google Meet link" placeholder="https://meet.google.com/abc-defg-hij" value={link} onChange={(e) => changed(setLink)(e.target.value)} className={FIELD} />
            <span className="block mt-1 text-[12px] text-slate-500">Leave it empty until you have the link. Everyone who signs in can see it.</span>
          </label>
          <label className="block">
            <span className={LABEL}>Notes for the team</span>
            <textarea aria-label="Notes for the team" rows={3} placeholder="One note per line, for example: Have your update ready." value={notes} onChange={(e) => changed(setNotes)(e.target.value)} className={`${FIELD} resize-none`} />
          </label>
          {problem && <p role="alert" className="text-[12px] text-red-600">{problem}</p>}
          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
            <button type="submit" className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>Save details</button>
          </div>
        </form>
      </div>
    </div>
  );
}
