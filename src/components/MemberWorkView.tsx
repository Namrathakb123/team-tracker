'use client'

// One person's work on one page: their tasks, follow-ups, clients, meetings and recent updates.
// "My work" (?page=work) shows your own; admins open anyone's from the Team page (?page=work&id=<team member id>).
import { useMemo, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useMeetings } from '../context/MeetingsContext';
import { addDays, formatDate, localDateKey, toDateKey } from '../utils/dates';
import { isActiveClientStatus, isClosedIssueStatus } from '../utils/issues';
import { activeClients, clientLabel } from '../utils/clients';
import { followUpsDue, nextFollowUp } from '../utils/leads';
import { updateOwner, visibleUpdates } from '../utils/updates';
import { emailKey, teamMemberForEmail } from '../utils/team';
import { compareTasks, dueLabel, dueState, DUE_TAG } from '../utils/tasks';
import { daysBetween, dayCount } from '../utils/attention';
import { formatClock } from '../utils/meeting';
import { inMeeting } from '../utils/absences';
import { dailyMeeting, isMyMeeting, nextOccurrence } from '../utils/meetings';
import { ACCESS_LABELS } from '../utils/accounts';
import { PageHeader } from './PageHeader';
import { CARD, SECTION_TITLE, PRIMARY_BUTTON, MEDIUM_BUTTON } from '../utils/styles';
import type { Issue, Lead, TeamMember } from '../types';

type NavigateTo = (view: string, params?: any) => void;

const ROW = 'w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors';
const TAG = 'shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border';
const STAT = `${CARD} p-4 text-left w-full h-full flex flex-col`;

function Card({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={`${CARD} flex flex-col min-w-0 lg:h-[380px]`} aria-label={title}>
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
        <h2 className={SECTION_TITLE}>{title}</h2>
        <span className="flex items-center gap-2">
          {action}
          {count !== undefined && <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full">{count}</span>}
        </span>
      </div>
      <div className="p-2 flex-1 min-h-0 overflow-y-auto">{children}</div>
    </section>
  );
}

function Row({ title, details, tag, tagClass, onClick, hint }: { title: string; details: string; tag?: string; tagClass?: string; onClick: () => void; hint: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} title={hint} className={ROW}>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-slate-800 truncate">{title}</span>
          {details && <span className="block text-[11px] text-slate-500 truncate">{details}</span>}
        </span>
        {tag && <span className={`${TAG} ${tagClass || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{tag}</span>}
      </button>
    </li>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="p-6 text-center text-[13px] text-slate-400 italic">{children}</p>;

export function MemberWorkView({ memberId, navigateTo }: { memberId?: string | null; navigateTo: NavigateTo }) {
  const { user, isAdmin, role } = useAuth();
  const { data } = useData();
  const { meetings } = useMeetings();
  const today = localDateKey();
  const me = teamMemberForEmail(data.team, user?.email);
  // Someone else's page is for admins only (and only shows what an admin can see anyway).
  const viewingOther = !!memberId && memberId !== me?.id;
  const member: TeamMember | null = viewingOther ? (isAdmin ? (data.team || []).find((t) => t.id === memberId) || null : null) : me;
  const memberEmail = viewingOther ? member?.email || '' : user?.email || '';

  const work = useMemo(() => {
    if (!member) return null;
    const settings = data.settings;
    const tasks = (data.issues || [])
      .filter((i): i is Issue => !!i && i.assigneeId === member.id && !isClosedIssueStatus(i.status, settings))
      .sort(compareTasks);
    const leads = (data.leads || []).filter((l): l is Lead => !!l && l.assignedTo === member.id);
    const { due, overdue } = followUpsDue(leads, today, settings);
    const followUps = [
      ...overdue.map((lead) => ({ lead, late: daysBetween(nextFollowUp(lead) || today, today) })),
      ...due.map((lead) => ({ lead, late: 0 })),
    ];
    const clients = activeClients(data.clients)
      .filter((c) => isActiveClientStatus(c.status, settings) && ((c.team || []).includes(member.id) || c.assignedTo === member.id));
    const lastUpdate = new Map<string, string>();
    for (const u of visibleUpdates(data.updates)) {
      const day = toDateKey(u.date) || toDateKey(u.timestamp);
      if (u.clientId && day && (!lastUpdate.get(u.clientId) || day > (lastUpdate.get(u.clientId) as string))) lastUpdate.set(u.clientId, day);
    }
    const key = emailKey(memberEmail);
    const theirUpdates = key ? visibleUpdates(data.updates).filter((u) => updateOwner(u) === key).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : [];
    const weekAgo = addDays(today, -6);
    const updatesThisWeek = theirUpdates.filter((u) => (toDateKey(u.date) || toDateKey(u.timestamp) || '') >= weekAgo).length;
    // Their meetings in the next 7 days, soonest first.
    const all = [dailyMeeting(settings), ...(meetings || [])];
    const theirs = all.filter((m) => (m.builtIn ? inMeeting(member) : isMyMeeting(m, data.team, member, memberEmail)));
    const upcoming = theirs
      .map((m) => ({ meeting: m, date: nextOccurrence(m, today) }))
      .filter((x): x is { meeting: typeof x.meeting; date: string } => !!x.date && x.date <= addDays(today, 7))
      .sort((a, b) => a.date.localeCompare(b.date) || a.meeting.start.localeCompare(b.meeting.start));
    return { tasks, followUps, clients, lastUpdate, theirUpdates, updatesThisWeek, upcoming };
  }, [member, memberEmail, data, meetings, today]);

  if (!member || !work) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <PageHeader title={viewingOther ? 'Work' : 'My work'} subtitle="One person's tasks, follow-ups, clients and meetings." />
        <div className={`${CARD} p-8 text-center text-slate-500 text-[13px]`}>
          {viewingOther
            ? (isAdmin ? 'That team member wasn’t found. They may have been removed.' : 'Only admins can see someone else’s work.')
            : 'Your email isn’t on the Team page, so there is no work to show yet. Ask an admin to add you to the team with your login’s email.'}
        </div>
      </div>
    );
  }

  const overdueTasks = work.tasks.filter((t) => dueState(t, today, data.settings) === 'overdue').length;
  const lateFollowUps = work.followUps.filter((f) => f.late > 0).length;
  const stats = [
    { label: 'Open tasks', value: work.tasks.length, note: overdueTasks ? `${overdueTasks} overdue` : 'None overdue', warn: overdueTasks > 0 },
    { label: 'Follow-ups due', value: work.followUps.length, note: lateFollowUps ? `${lateFollowUps} late` : 'None late', warn: lateFollowUps > 0 },
    { label: 'Active clients', value: work.clients.length, note: viewingOther ? 'They work on' : 'You work on', warn: false },
    { label: 'Updates this week', value: work.updatesThisWeek, note: 'Last 7 days', warn: false },
  ];
  const subtitle = viewingOther
    ? `${member.role || 'Team member'} · what ${member.name} is working on`
    : `${member.role || 'Team member'}${role ? ` · ${ACCESS_LABELS[role]}` : ''} · everything that is yours, in one place`;

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={viewingOther ? `${member.name}’s work` : 'My work'} subtitle={subtitle} />
        {viewingOther && (
          <button type="button" onClick={() => navigateTo('team')} className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} shrink-0`}>Back to the team</button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={STAT}>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</span>
            <span className="block text-2xl font-extrabold text-slate-800 mt-2">{s.value}</span>
            <span className={`block text-[11px] mt-1 ${s.warn ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>{s.note}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Tasks" count={work.tasks.length}>
          {work.tasks.length === 0 ? <Empty>No open tasks. All done.</Empty> : (
            <ul className="space-y-0.5">
              {work.tasks.map((t) => {
                const state = dueState(t, today, data.settings);
                return (
                  <Row
                    key={t.id}
                    title={t.title || 'Untitled task'}
                    details={[t.clientId ? clientLabel(data.clients, t.clientId) : 'Internal', t.priority, t.status].filter(Boolean).join(' · ')}
                    tag={state ? dueLabel(t, today) : undefined}
                    tagClass={state ? DUE_TAG[state] : undefined}
                    onClick={() => navigateTo('issues', { selectedIssueId: t.id })}
                    hint="Open this task"
                  />
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Follow-ups due" count={work.followUps.length}>
          {work.followUps.length === 0 ? <Empty>No follow-ups due.</Empty> : (
            <ul className="space-y-0.5">
              {work.followUps.map(({ lead, late }) => (
                <Row
                  key={lead.id}
                  title={lead.name || 'Unnamed lead'}
                  details={[lead.businessName, lead.status].filter(Boolean).join(' · ')}
                  tag={late > 0 ? `${dayCount(late)} late` : 'Due today'}
                  tagClass={late > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-700 border-amber-100'}
                  onClick={() => navigateTo('leads', { selectedLeadId: lead.id })}
                  hint="Open this lead"
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Clients" count={work.clients.length}>
          {work.clients.length === 0 ? <Empty>No active clients.</Empty> : (
            <ul className="space-y-0.5">
              {work.clients.map((c) => {
                const last = work.lastUpdate.get(c.id);
                const quiet = last ? daysBetween(last, today) : null;
                return (
                  <Row
                    key={c.id}
                    title={c.name}
                    details={[c.status, c.deliveryStatus, last ? `Last update ${formatDate(last)}` : 'No updates yet'].filter(Boolean).join(' · ')}
                    tag={quiet !== null && quiet >= 7 ? `${dayCount(quiet)} quiet` : undefined}
                    tagClass="bg-amber-50 text-amber-700 border-amber-100"
                    onClick={() => navigateTo('clients', { selectedClientId: c.id })}
                    hint="Open this client"
                  />
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Meetings, next 7 days" count={work.upcoming.length}>
          {work.upcoming.length === 0 ? <Empty>No meetings in the next 7 days.</Empty> : (
            <ul className="space-y-0.5">
              {work.upcoming.map(({ meeting, date }) => (
                <Row
                  key={`${meeting.id}-${date}`}
                  title={meeting.title}
                  details={`${date === today ? 'Today' : formatDate(date, { weekday: true })} · ${formatClock(meeting.start)}`}
                  tag={meeting.type}
                  tagClass="bg-sky-50 text-sky-700 border-sky-100"
                  onClick={() => navigateTo('meeting', { selectedMeetingId: meeting.id })}
                  hint="Open this meeting"
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className={CARD} aria-label="Recent updates">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className={SECTION_TITLE}>Recent updates</h2>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full">{work.theirUpdates.length}</span>
        </div>
        {work.theirUpdates.length === 0 ? <Empty>No updates posted yet.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {work.theirUpdates.slice(0, 10).map((u) => (
              <li key={u.id} className="px-4 py-3">
                <div className="text-[12px] text-slate-500">
                  <span className="font-semibold text-slate-700">{u.clientId ? clientLabel(data.clients, u.clientId) : 'General'}</span> · {formatDate(u.date || toDateKey(u.timestamp) || '')}
                </div>
                <p className="text-[13px] text-slate-700 mt-0.5 whitespace-pre-wrap line-clamp-3">{u.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
