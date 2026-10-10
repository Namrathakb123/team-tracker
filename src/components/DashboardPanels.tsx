'use client'

// The Dashboard's "My day" and "Needs attention" panels. Every row opens the lead, task or client it is about.
import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { localDateKey } from '../utils/dates';
import { clientLabel, teamMemberName } from '../utils/clients';
import { issueAssigneeName } from '../utils/issues';
import { priorityBadgeClass } from '../utils/priorities';
import { myDay, lateFollowUps, quietClients, oldOpenIssues, dayCount, QUIET_CLIENT_DAYS, OLD_ISSUE_DAYS } from '../utils/attention';
import { useMeetings } from '../context/MeetingsContext';
import { useMeetingClock } from '../hooks/useMeetingClock';
import { formatClock } from '../utils/meeting';
import { inMeeting } from '../utils/absences';
import { dailyMeeting, isMyMeeting, meetingsOn, occurrenceStatus } from '../utils/meetings';
import { compareTasks, dueLabel, dueState } from '../utils/tasks';
import { CARD, SECTION_TITLE } from '../utils/styles';
import type { Issue, Lead } from '../types';

type NavigateTo = (view: string, params?: Record<string, string>) => void;

// How many rows a "Needs attention" list shows before "Show N more".
const SHOWN_ROWS = 5;

const ROW = 'w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors';
const TAG = 'shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border';
const LATE_TAG = `${TAG} bg-red-50 text-red-600 border-red-100`;
const WAIT_TAG = `${TAG} bg-amber-50 text-amber-700 border-amber-100`;
const MEETING_TAG = `${TAG} bg-sky-50 text-sky-700 border-sky-100`;
const DONE_TAG = `${TAG} bg-slate-50 text-slate-400 border-slate-200`;
const COUNT = 'text-[10px] font-bold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full';

// One clickable row: a name, a line of details, and a tag on the right.
function Row({ title, details, tag, tagClass, onClick, hint }: { title: string; details: string; tag: string; tagClass: string; onClick: () => void; hint: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} title={hint} className={ROW}>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-slate-800 truncate">{title}</span>
          {details && <span className="block text-[11px] text-slate-500 truncate">{details}</span>}
        </span>
        <span className={tagClass}>{tag}</span>
      </button>
    </li>
  );
}

// A list that shows its first rows, with a button to show the rest.
function ShortList({ rows, label }: { rows: ReactNode[]; label: string }) {
  const [all, setAll] = useState(false);
  const hidden = rows.length - SHOWN_ROWS;
  return (
    <>
      <ul className="space-y-0.5" aria-label={label}>{all ? rows : rows.slice(0, SHOWN_ROWS)}</ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 px-3 text-[12px] font-bold text-sky-600 hover:underline">
          {all ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

function PanelHeader({ icon, title, right }: { icon: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
      <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>{icon}{title}</h3>
      {right}
    </div>
  );
}

const leadDetails = (lead: Lead, extra: (string | null | undefined)[]) => [lead.businessName, ...extra].filter(Boolean).join(' · ');

// "My day": the signed-in person's follow-ups, open tasks and updates for the day picked in the sidebar.
// Someone whose email isn't on the Team page sees the whole team's day instead.
export function MyDayPanel({ day, navigateTo }: { day: string; navigateTo: NavigateTo }) {
  const { user } = useAuth();
  const { data } = useData();
  const summary = useMemo(() => myDay(data, user?.email, day), [data, user?.email, day]);
  // Meetings that day: your own (the daily meeting if you're on its list), or, for the team's day, all of them.
  const { meetings } = useMeetings();
  const clock = useMeetingClock();
  const dayMeetings = useMemo(() => {
    const all = [dailyMeeting(data.settings), ...(meetings || [])];
    const member = summary.member;
    return meetingsOn(member ? all.filter((m) => (m.builtIn ? inMeeting(member) : isMyMeeting(m, data.team, member, user?.email))) : all, day);
  }, [data.settings, data.team, meetings, summary.member, user?.email, day]);
  const mine = !!summary.member;
  const isToday = day === localDateKey();
  const urgent = data.settings?.urgentPriorities || [];
  // Overdue and due tasks first (soonest first), then urgent ones, then the rest.
  const dueRank = (i: Issue) => { const s = dueState(i, day, data.settings); return s === 'overdue' ? 0 : s === 'today' ? 1 : 2; };
  const issues = [...summary.issues].sort((a, b) => dueRank(a) - dueRank(b) || Number(urgent.includes(b.priority || '')) - Number(urgent.includes(a.priority || '')) || compareTasks(a, b));
  const late = summary.followUps.filter((f) => f.late > 0).length;
  const overdueCount = summary.issues.filter((i) => dueState(i, day, data.settings) === 'overdue').length;

  const rows = [
    ...dayMeetings.map((m) => {
      const status = occurrenceStatus(m, day, clock);
      return (
        <Row
          key={`meeting-${m.id}`}
          title={m.title}
          details={`Meeting · ${m.type}`}
          tag={status.kind === 'live' ? 'On now' : status.kind === 'ended' ? 'Ended' : formatClock(m.start)}
          tagClass={status.kind === 'live' ? LATE_TAG : status.kind === 'ended' ? DONE_TAG : MEETING_TAG}
          onClick={() => navigateTo('meeting', { selectedMeetingId: m.id })}
          hint="Open this meeting"
        />
      );
    }),
    ...summary.followUps.map(({ lead, late: days }) => (
      <Row
        key={`lead-${lead.id}`}
        title={lead.name || 'Unnamed lead'}
        details={leadDetails(lead, ['Follow-up', mine ? null : (lead.assignedTo ? teamMemberName(lead.assignedTo, data.team) : 'Not assigned')])}
        tag={days > 0 ? `${dayCount(days)} late` : isToday ? 'Due today' : 'Due'}
        tagClass={days > 0 ? LATE_TAG : WAIT_TAG}
        onClick={() => navigateTo('leads', { selectedLeadId: lead.id })}
        hint="Open this lead"
      />
    )),
    ...issues.map((issue: Issue) => (
      <Row
        key={`issue-${issue.id}`}
        title={issue.title || 'Untitled task'}
        details={['Task', clientLabel(data.clients, issue.clientId, 'Internal'), issue.priority].filter(Boolean).join(' · ')}
        tag={dueRank(issue) < 2 ? dueLabel(issue, day).replace(/ \(.*\)$/, '') : issue.priority || 'No priority'}
        tagClass={dueRank(issue) === 0 ? LATE_TAG : dueRank(issue) === 1 ? WAIT_TAG : `${TAG} ${priorityBadgeClass(issue.priority || '', data.settings)}`}
        onClick={() => navigateTo('issues', { selectedIssueId: issue.id })}
        hint="Open this task"
      />
    )),
  ];

  // Short labels, so three fit side by side on a phone.
  const tiles = [
    { label: 'Follow-ups', value: summary.followUps.length, note: late ? `${late} late` : 'None late', warn: late > 0 },
    { label: mine ? 'Open tasks' : 'Unassigned', value: summary.issues.length, note: mine ? (overdueCount ? `${overdueCount} overdue` : 'Given to you') : 'Open tasks', warn: overdueCount > 0 },
    { label: 'Updates', value: summary.updatesPosted, note: `${mine ? 'By you' : 'Posted'} ${isToday ? 'today' : 'that day'}`, warn: false },
  ];

  return (
    <div className={`${CARD} flex flex-col min-w-0 lg:h-[400px]`}>
      <PanelHeader
        title={mine ? 'MY DAY' : "THE TEAM'S DAY"}
        icon={<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>}
        right={<span className={`${COUNT} truncate max-w-[50%]`}>{mine ? summary.member!.name : 'Whole team'}</span>}
      />
      <div className="p-4 flex-1 flex flex-col gap-3 min-h-0">
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg bg-slate-50 border border-slate-100 p-3 min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight">{t.label}</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{t.value}</p>
              <p className={`text-[11px] leading-snug ${t.warn ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>{t.note}</p>
            </div>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="flex-1 flex items-center justify-center text-center text-[13px] text-slate-400 italic py-4">
            {mine ? 'Nothing due and no open tasks. You are all caught up.' : 'No follow-ups due and no unassigned tasks.'}
          </p>
        ) : (
          // The list scrolls inside the panel, so the panel stays as tall as the one beside it.
          <ul className="flex-1 min-h-0 max-h-[320px] lg:max-h-none overflow-y-auto -mx-1 space-y-0.5" aria-label={mine ? 'Your follow-ups and tasks' : 'Follow-ups due and unassigned tasks'}>
            {rows}
          </ul>
        )}
        {!mine && (
          <p className="text-[11px] text-slate-400">Your email isn&apos;t on the Team page, so this shows the whole team.</p>
        )}
      </div>
    </div>
  );
}

// "Needs attention": late follow-ups, overdue tasks, active clients with no recent update, and tasks open for a while
// (as of today).
export function NeedsAttentionPanel({ navigateTo }: { navigateTo: NavigateTo }) {
  const { data } = useData();
  const today = localDateKey();
  const late = useMemo(() => lateFollowUps(data.leads, today, data.settings), [data.leads, data.settings, today]);
  const quiet = useMemo(() => quietClients(data, today), [data, today]);
  const oldIssues = useMemo(() => oldOpenIssues(data.issues, data.settings, today), [data.issues, data.settings, today]);
  const overdue = useMemo(() => (data.issues || []).filter((i) => dueState(i, today, data.settings) === 'overdue').sort(compareTasks), [data.issues, data.settings, today]);
  const overdueIds = new Set(overdue.map((i) => i.id));
  // (An overdue task is listed once, under Overdue.)
  const oldNotOverdue = oldIssues.filter(({ issue }) => !overdueIds.has(issue.id));
  const total = late.length + overdue.length + quiet.length + oldNotOverdue.length;

  const groups = [
    {
      title: 'Late follow-ups',
      rows: late.map(({ lead, days }) => (
        <Row
          key={lead.id}
          title={lead.name || 'Unnamed lead'}
          details={leadDetails(lead, [lead.assignedTo ? teamMemberName(lead.assignedTo, data.team) : 'Not assigned'])}
          tag={`${dayCount(days)} late`}
          tagClass={LATE_TAG}
          onClick={() => navigateTo('leads', { selectedLeadId: lead.id })}
          hint="Open this lead"
        />
      )),
    },
    {
      title: 'Overdue tasks',
      rows: overdue.map((issue) => (
        <Row
          key={issue.id}
          title={issue.title || 'Untitled task'}
          details={[clientLabel(data.clients, issue.clientId, 'Internal'), issueAssigneeName(issue, data.team)].filter(Boolean).join(' · ')}
          tag={dueLabel(issue, today).replace(/^Overdue \((.*)\)$/, 'Due $1')}
          tagClass={LATE_TAG}
          onClick={() => navigateTo('issues', { selectedIssueId: issue.id })}
          hint="Open this task"
        />
      )),
    },
    {
      title: `No update for ${QUIET_CLIENT_DAYS}+ days`,
      rows: quiet.map(({ client, days, neverUpdated }) => (
        <Row
          key={client.id}
          title={client.name || 'Unnamed client'}
          details={[neverUpdated ? 'No updates yet' : null, client.status, client.assignedTo ? teamMemberName(client.assignedTo, data.team) : null].filter(Boolean).join(' · ')}
          tag={dayCount(days)}
          tagClass={WAIT_TAG}
          onClick={() => navigateTo('clients', { selectedClientId: client.id })}
          hint="Open this client"
        />
      )),
    },
    {
      title: `Tasks open ${OLD_ISSUE_DAYS}+ days`,
      rows: oldNotOverdue.map(({ issue, days }) => (
        <Row
          key={issue.id}
          title={issue.title || 'Untitled task'}
          details={[issue.priority, clientLabel(data.clients, issue.clientId, 'Internal'), issueAssigneeName(issue, data.team)].filter(Boolean).join(' · ')}
          tag={dayCount(days)}
          tagClass={WAIT_TAG}
          onClick={() => navigateTo('issues', { selectedIssueId: issue.id })}
          hint="Open this task"
        />
      )),
    },
  ];

  return (
    <div className={`${CARD} flex flex-col min-w-0 lg:h-[680px]`}>
      <PanelHeader
        title="NEEDS ATTENTION"
        icon={<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>}
        right={<span className={COUNT}>{total}</span>}
      />
      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20 6 9 17l-5-5"></path></svg>
          <p className="text-[13px] font-semibold text-slate-700">All clear</p>
          <p className="text-[12px] text-slate-400">No late follow-ups, overdue tasks, quiet clients or old tasks.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {groups.filter((g) => g.rows.length > 0).map((g) => (
            <section key={g.title}>
              <h4 className="px-3 mb-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                {g.title} <span className="text-slate-400">{g.rows.length}</span>
              </h4>
              <ShortList rows={g.rows} label={g.title} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
