'use client'

// The admins' window for adding or changing a meeting: what it is, when (one time or repeating), who is in it
// (whole groups and/or particular people, and a client), where, and the agenda. Clashes with other meetings are
// pointed out while filling it in.
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '../context/DataContext';
import { useMeetings } from '../context/MeetingsContext';
import { useMeetingClock } from '../hooks/useMeetingClock';
import { activeClients } from '../utils/clients';
import { formatDate } from '../utils/dates';
import { CAMERA_CHOICES, WEEKDAYS, dayName, formatTimeRange } from '../utils/meeting';
import { MEETING_GROUPS, NOT_IN_MEETING, inMeeting, memberGroup } from '../utils/absences';
import { MEETING_TYPES, REPEATS, cleanMeeting, dailyMeeting, meetingClashes, MAX_AGENDA, MAX_TITLE, type MeetingDraft } from '../utils/meetings';
import type { Meeting, TeamMember } from '../types';
import { DIALOG, DIALOG_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../utils/styles';

const FIELD = 'w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium';
const LABEL = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1';
const GROUP_CHOICES: Record<string, string> = { Admin: 'All admins', Team: 'All team members', Intern: 'All interns' };
// Who a new meeting of a type starts with, when nobody has been chosen yet.
const TYPE_GROUPS: Record<string, string[]> = { Team: [...MEETING_GROUPS], Interns: ['Intern'] };

// One part of the form ("What", "When", …), named for screen readers.
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="space-y-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 min-w-0">
      <p id={id} className="text-[12px] font-bold text-slate-700">{title}</p>
      {children}
    </div>
  );
}

// The form's starting values: the meeting being changed, or a new one on `day`.
function startingDraft(meeting: Meeting | undefined, day: string): MeetingDraft {
  if (meeting) {
    const { title, type, repeat, date, until, days, start, end, link, place, camera, groups, people, clientId, contactName, contactPhone, agenda } = meeting;
    return { title, type, repeat, date, until, days, start, end, link, place, camera, groups, people, clientId, contactName, contactPhone, agenda };
  }
  return { title: '', type: 'Team', repeat: 'none', date: day, start: '11:00', end: '11:30', camera: 'Optional', groups: [], people: [] };
}

export function MeetingForm({ meeting, day, onClose, onSaved }: { meeting?: Meeting; day: string; onClose: () => void; onSaved: (m: Meeting) => void }) {
  const { data } = useData();
  const { meetings, saveMeeting } = useMeetings();
  const clock = useMeetingClock();
  const [draft, setDraft] = useState<MeetingDraft>(() => startingDraft(meeting, day >= clock.date ? day : clock.date));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const set = (change: Partial<MeetingDraft>) => { setDraft((d) => ({ ...d, ...change })); setProblem(null); };

  const team = useMemo(() => (data.team || []).filter((t) => t && !t.deleted), [data.team]);
  const clients = useMemo(() => activeClients(data.clients), [data.clients]);
  const groups = draft.groups || [];
  const people = draft.people || [];
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  // Choosing a type fills in the usual people, if nobody has been chosen yet.
  const pickType = (type: string) => set({ type, ...(!groups.length && !people.length && TYPE_GROUPS[type] ? { groups: TYPE_GROUPS[type] } : {}) });

  // People to pick from, grouped by their meeting group; the search box narrows the list.
  const peopleByGroup = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = team.filter((t) => !q || (t.name || '').toLowerCase().includes(q) || (t.role || '').toLowerCase().includes(q));
    const order = [...MEETING_GROUPS, NOT_IN_MEETING];
    const names = Array.from(new Set(matches.map(memberGroup)));
    return [...order.filter((g) => names.includes(g)), ...names.filter((g) => !order.includes(g)).sort()].map((g) => ({
      group: g,
      members: matches.filter((t) => memberGroup(t) === g).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }));
  }, [team, search]);
  const groupCount = (g: string) => team.filter((t) => inMeeting(t) && memberGroup(t) === g).length;

  const others = useMemo(() => [dailyMeeting(data.settings), ...(meetings || [])], [data.settings, meetings]);
  const clashes = useMemo(() => meetingClashes({ ...draft, id: meeting?.id }, others, data.team, clock.date), [draft, meeting?.id, others, data.team, clock.date]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const checked = cleanMeeting(draft, { team: data.team || [], clients: data.clients || [], today: clock.date, keepDate: meeting?.date });
    if ('problem' in checked) { setProblem(checked.problem); return; }
    setSaving(true);
    const result = await saveMeeting(checked.meeting, meeting?.id);
    setSaving(false);
    if (result.problem || !result.meeting) { setProblem(result.problem || 'The meeting was not saved. Please try again.'); return; }
    onSaved(result.meeting);
  };

  const nameOf = (m: TeamMember) => `${m.name}${m.role ? ` · ${m.role}` : ''}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={meeting ? 'Change meeting' : 'New meeting'} className={`${DIALOG} w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col`}>
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <h3 className={DIALOG_TITLE}>{meeting ? 'Change meeting' : 'New meeting'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <form onSubmit={save} noValidate className="p-4 space-y-4 overflow-y-auto">
          <Section title="What">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className={LABEL}>Title</span>
                <input type="text" aria-label="Meeting title" maxLength={MAX_TITLE} placeholder="For example: Weekly review with Acme" value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus className={FIELD} />
              </label>
              <label className="block sm:w-44">
                <span className={LABEL}>Type</span>
                <select aria-label="Meeting type" value={draft.type} onChange={(e) => pickType(e.target.value)} className={FIELD}>
                  {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
          </Section>

          <Section title="When (India time)">
            <label className="block">
              <span className={LABEL}>Repeats</span>
              <select aria-label="Repeats" value={draft.repeat} onChange={(e) => set({ repeat: e.target.value as MeetingDraft['repeat'], ...(e.target.value === 'weekly' && !(draft.days || []).length ? { days: [WEEKDAYS[(new Date(draft.date + 'T00:00:00Z').getUTCDay() + 6) % 7] || 'Mon'] } : {}) })} className={FIELD}>
                {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            {draft.repeat === 'weekly' && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Days of the week">
                {WEEKDAYS.map((d) => (
                  <label key={d} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold cursor-pointer select-none transition-colors ${(draft.days || []).includes(d) ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                    <input type="checkbox" checked={(draft.days || []).includes(d)} onChange={() => set({ days: toggle(draft.days || [], d) })} aria-label={dayName(d)} className="accent-sky-500" />
                    {d}
                  </label>
                ))}
              </div>
            )}
            <div className={`grid gap-3 ${draft.repeat === 'none' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
              <label className="block">
                <span className={LABEL}>{draft.repeat === 'none' ? 'Day' : 'First day'}</span>
                <input type="date" aria-label={draft.repeat === 'none' ? 'Day of the meeting' : 'First day'} value={draft.date} onChange={(e) => set({ date: e.target.value })} className={FIELD} />
              </label>
              {draft.repeat !== 'none' && (
                <label className="block">
                  <span className={LABEL}>Last day (optional)</span>
                  <input type="date" aria-label="Last day" value={draft.until || ''} min={draft.date || undefined} onChange={(e) => set({ until: e.target.value })} className={FIELD} />
                </label>
              )}
              <label className="block">
                <span className={LABEL}>Starts</span>
                <input type="time" aria-label="Starts" value={draft.start} onChange={(e) => set({ start: e.target.value })} className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Ends</span>
                <input type="time" aria-label="Ends" value={draft.end} onChange={(e) => set({ end: e.target.value })} className={FIELD} />
              </label>
            </div>
          </Section>

          <Section title="Who">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Whole groups">
              {MEETING_GROUPS.map((g) => (
                <label key={g} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold cursor-pointer select-none transition-colors ${groups.includes(g) ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                  <input type="checkbox" checked={groups.includes(g)} onChange={() => set({ groups: toggle(groups, g) })} aria-label={GROUP_CHOICES[g]} className="accent-sky-500" />
                  {GROUP_CHOICES[g]} <span className="text-slate-400 font-normal">({groupCount(g)})</span>
                </label>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100">
                <span className="text-[12px] text-slate-600">{people.length ? `${people.length} picked by name` : 'Or pick people by name'}</span>
                {team.length > 8 && (
                  <input type="text" aria-label="Search people" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-36 border border-slate-200 rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:border-sky-500" />
                )}
              </div>
              <div className="max-h-44 overflow-y-auto p-2 space-y-2">
                {peopleByGroup.length === 0 && <p className="text-[12px] text-slate-400 italic px-1">{team.length ? 'No one matches.' : 'No one is on the Team page yet.'}</p>}
                {peopleByGroup.map(({ group, members }) => (
                  <div key={group}>
                    <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group === NOT_IN_MEETING ? 'Not on the daily meeting list' : group}</p>
                    {members.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 text-[13px] text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={people.includes(m.id)} onChange={() => set({ people: toggle(people, m.id) })} className="accent-sky-500" />
                        <span className="truncate">{nameOf(m)}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={LABEL}>Client{draft.type === 'Client' ? '' : ' (optional)'}</span>
                <select aria-label="Client" value={draft.clientId || ''} onChange={(e) => set({ clientId: e.target.value || null })} className={FIELD}>
                  <option value="">No client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {draft.clientId && !clients.some((c) => c.id === draft.clientId) && <option value={draft.clientId}>(a removed or archived client)</option>}
                </select>
              </label>
              {draft.clientId && (
                <>
                  <label className="block">
                    <span className={LABEL}>Contact person</span>
                    <input type="text" aria-label="Contact person" placeholder="Name at the client" value={draft.contactName || ''} onChange={(e) => set({ contactName: e.target.value })} className={FIELD} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Contact phone</span>
                    <input type="tel" aria-label="Contact phone" placeholder="+91 …" value={draft.contactPhone || ''} onChange={(e) => set({ contactPhone: e.target.value })} className={FIELD} />
                  </label>
                </>
              )}
            </div>
          </Section>

          <Section title="Where">
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <label className="block">
                <span className={LABEL}>Google Meet link (optional)</span>
                <input type="text" inputMode="url" aria-label="Meeting link" placeholder="https://meet.google.com/abc-defg-hij" value={draft.link || ''} onChange={(e) => set({ link: e.target.value })} className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Place (optional)</span>
                <input type="text" aria-label="Place" placeholder="For example: Office" value={draft.place || ''} onChange={(e) => set({ place: e.target.value })} className={FIELD} />
              </label>
            </div>
            <label className="block sm:w-60">
              <span className={LABEL}>Camera</span>
              <select aria-label="Camera" value={draft.camera || 'Optional'} onChange={(e) => set({ camera: e.target.value as MeetingDraft['camera'] })} className={FIELD}>
                {CAMERA_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </Section>

          <Section title="Agenda">
            <textarea aria-label="Agenda" rows={3} maxLength={MAX_AGENDA} placeholder="What the meeting is about (optional)" value={draft.agenda || ''} onChange={(e) => set({ agenda: e.target.value })} className={`${FIELD} resize-y`} />
          </Section>

          {clashes.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 space-y-1">
              <p className="font-bold">Heads-up: this overlaps other meetings</p>
              <ul className="space-y-0.5" aria-label="Clashes">
                {clashes.map((c) => (
                  <li key={c.meetingId}>
                    {c.names.join(', ')} {c.names.length === 1 ? 'is' : 'are'} also in “{c.title}” ({formatTimeRange(c.start, c.end)}) on {formatDate(c.date, { weekday: true })}
                    {c.more > 0 ? ` and ${c.more} more ${c.more === 1 ? 'day' : 'days'}` : ''}.
                  </li>
                ))}
              </ul>
              <p className="text-amber-700">You can still save it.</p>
            </div>
          )}
          {problem && <p role="alert" className="text-[12px] text-red-600">{problem}</p>}
          <div className="pt-1 flex gap-3">
            <button type="button" onClick={onClose} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
            <button type="submit" disabled={saving} className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>{saving ? 'Saving…' : meeting ? 'Save changes' : 'Add meeting'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
