// What the Dashboard's "My day" and "Needs attention" panels show, worked out from the shared data.
import type { AppData, Client, Issue, Lead, Settings, TeamMember } from '../types';
import { activeClients, clientCreatedAt } from './clients';
import { isActiveClientStatus, isClosedIssueStatus } from './issues';
import { followUpsDue, nextFollowUp } from './leads';
import { updateOwner, visibleUpdates } from './updates';
import { parseDate, toDateKey } from './dates';
import { emailKey, teamMemberForEmail } from './team';

// An active client with no update for this many days needs attention; so does an issue open this long.
export const QUIET_CLIENT_DAYS = 7;
export const OLD_ISSUE_DAYS = 7;

// Whole days from one "YYYY-MM-DD" day to another (positive when `to` is later; 0 if either can't be read).
export function daysBetween(from: string, to: string): number {
  const a = parseDate(from), b = parseDate(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

// "1 day", "3 days".
export function dayCount(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

// Active clients (an active status, not archived) with no update for `minDays` or more on `today`, quietest first.
// A client that never had an update counts from the day it was added. Deleted updates don't count.
export function quietClients(data: Pick<AppData, 'clients' | 'updates' | 'settings'>, today: string, minDays = QUIET_CLIENT_DAYS): { client: Client; days: number; neverUpdated: boolean }[] {
  const lastUpdate = new Map<string, string>();
  for (const u of visibleUpdates(data.updates)) {
    if (!u.clientId) continue;
    const day = toDateKey(u.date) || toDateKey(u.timestamp);
    const known = lastUpdate.get(u.clientId);
    if (day && (!known || day > known)) lastUpdate.set(u.clientId, day);
  }
  const result: { client: Client; days: number; neverUpdated: boolean }[] = [];
  for (const client of activeClients(data.clients)) {
    if (!isActiveClientStatus(client.status, data.settings)) continue;
    const last = lastUpdate.get(client.id);
    const since = last || toDateKey(clientCreatedAt(client));
    if (!since) continue;
    const days = daysBetween(since, today);
    if (days >= minDays) result.push({ client, days, neverUpdated: !last });
  }
  return result.sort((a, b) => b.days - a.days);
}

// Open leads whose next follow-up day is before `today`, most overdue first, with how many days late.
export function lateFollowUps(leads: Lead[] | undefined, today: string, settings: Settings | undefined): { lead: Lead; days: number }[] {
  return followUpsDue(leads, today, settings).overdue.map((lead) => ({ lead, days: daysBetween(nextFollowUp(lead) || today, today) }));
}

// Open issues logged `minDays` or more days before `today`, oldest first.
export function oldOpenIssues(issues: Issue[] | undefined, settings: Settings | undefined, today: string, minDays = OLD_ISSUE_DAYS): { issue: Issue; days: number }[] {
  const result: { issue: Issue; days: number }[] = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (!issue || isClosedIssueStatus(issue.status, settings)) continue;
    const since = toDateKey(issue.createdAt || issue.created);
    if (!since) continue;
    const days = daysBetween(since, today);
    if (days >= minDays) result.push({ issue, days });
  }
  return result.sort((a, b) => b.days - a.days);
}

// One person's day, or the whole team's when the signed-in account isn't on the team.
export interface DaySummary {
  // The team member it is for; null for the whole team.
  member: TeamMember | null;
  // Follow-ups due that day or earlier: late ones first (with how many days late), then the ones due that day.
  followUps: { lead: Lead; late: number }[];
  // Open issues assigned to the person; for the whole team, open issues nobody is assigned to.
  issues: Issue[];
  // Updates posted for that day: by the person, or by everyone.
  updatesPosted: number;
}

function followUpsFor(leads: Lead[], day: string, settings: Settings | undefined) {
  const { due, overdue } = followUpsDue(leads, day, settings);
  return [
    ...overdue.map((lead) => ({ lead, late: daysBetween(nextFollowUp(lead) || day, day) })),
    ...due.map((lead) => ({ lead, late: 0 })),
  ];
}

// "My day": the follow-ups, open issues and updates of the team member with the signed-in email, for `day`.
// Someone whose email isn't on the Team page gets the whole team's day instead.
export function myDay(data: AppData, email: string | null | undefined, day: string): DaySummary {
  const member = teamMemberForEmail(data.team, email);
  if (!member) return teamDay(data, day);
  const key = emailKey(email);
  return {
    member,
    followUps: followUpsFor((data.leads || []).filter((l) => l && l.assignedTo === member.id), day, data.settings),
    issues: (data.issues || []).filter((i) => i && i.assigneeId === member.id && !isClosedIssueStatus(i.status, data.settings)),
    updatesPosted: visibleUpdates(data.updates).filter((u) => u.date === day && updateOwner(u) === key).length,
  };
}

// The whole team's day: every follow-up due, the open issues nobody is assigned to, and every update posted.
export function teamDay(data: AppData, day: string): DaySummary {
  return {
    member: null,
    followUps: followUpsFor(data.leads || [], day, data.settings),
    issues: (data.issues || []).filter((i) => i && !i.assigneeId && !(typeof i.assignee === 'string' && i.assignee.trim()) && !isClosedIssueStatus(i.status, data.settings)),
    updatesPosted: visibleUpdates(data.updates).filter((u) => u.date === day).length,
  };
}
