// Shared helpers for issues.
import { withDefaultSettings } from './defaults';
import { parseDate } from './dates';
import type { Issue, Settings, TeamMember } from '../types';

// The name of the person an issue is assigned to. Issues made on the Issues page store the team member's id
// (assigneeId); issues made on a client's page also store the name (assignee). The id is looked up first, so a
// renamed team member shows their current name. Returns 'Unassigned' when there is neither.
export function issueAssigneeName(issue: Issue | null | undefined, team: TeamMember[] | undefined): string {
  if (issue?.assigneeId) {
    const member = (Array.isArray(team) ? team : []).find((t) => t && t.id === issue.assigneeId);
    if (member?.name) return member.name;
  }
  if (typeof issue?.assignee === 'string' && issue.assignee.trim()) return issue.assignee.trim();
  return 'Unassigned';
}

// Whether a status means the issue is finished: the statuses ticked "Closed" in Customize.
export function isClosedIssueStatus(status: string | undefined, settings: Settings | undefined): boolean {
  if (!status) return false;
  const closed = Array.isArray(settings?.closedIssueStatuses) ? settings.closedIssueStatuses : withDefaultSettings(settings).closedIssueStatuses;
  return closed.includes(status);
}

// Whether a client status counts as active: the statuses ticked "Active" in Customize.
export function isActiveClientStatus(status: string | undefined, settings: Settings | undefined): boolean {
  if (!status) return false;
  const active = Array.isArray(settings?.activeClientStatuses) ? settings.activeClientStatuses : withDefaultSettings(settings).activeClientStatuses;
  return active.includes(status);
}

// An issue with a new status. Closing it records the day it was resolved; reopening it clears that day.
export function withIssueStatus(issue: Issue, newStatus: string, settings: Settings | undefined, today: string): Issue {
  const wasClosed = isClosedIssueStatus(issue?.status, settings);
  const nowClosed = isClosedIssueStatus(newStatus, settings);
  const next = { ...issue, status: newStatus };
  if (nowClosed && !wasClosed) next.resolvedDate = today;
  if (!nowClosed) delete next.resolvedDate;
  return next;
}

// Issues used to be saved in two formats: the Issues page used createdAt, assigneeId and description, while a
// client's page used created (a plain date), assignee (a name) and notes. This returns the one format used everywhere.
// Nothing is thrown away: a name that matches no team member is kept, and so is a date that can't be read.
// Running it again changes nothing, and an issue that is already in the right format is returned as it is.
export function normalizeIssue(issue: any, team: TeamMember[] | undefined): any {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return issue;
  const members = Array.isArray(team) ? team : [];
  const next: any = { ...issue };

  // Date: a timestamp in createdAt.
  if (next.created !== undefined) {
    if (!next.createdAt) {
      const d = parseDate(next.created);
      if (d) next.createdAt = d.toISOString();
    }
    if (next.createdAt) delete next.created;
  }

  // Assignee: a team member's id in assigneeId.
  if (next.assignee !== undefined) {
    const name = typeof next.assignee === 'string' ? next.assignee.trim() : '';
    const byId = next.assigneeId ? members.find((t) => t && t.id === next.assigneeId) : null;
    const byName = !byId && name ? members.find((t) => t && t.name === name) : null;
    if (byId) delete next.assignee;
    else if (byName) { next.assigneeId = byName.id; delete next.assignee; }
    else if (!name) { delete next.assignee; if (next.assigneeId === undefined) next.assigneeId = null; }
    // Otherwise the name matches no team member: keep it, so it can still be shown.
  }

  // Text: description (a client's page stored it in notes).
  if (typeof next.notes === 'string') {
    const notes = next.notes.trim();
    const description = typeof next.description === 'string' ? next.description.trim() : '';
    next.description = description && notes && description !== notes ? `${description}\n\n${notes}` : (description || notes);
    delete next.notes;
  }

  // Notes history: always a list.
  if (!Array.isArray(next.notesHistory)) next.notesHistory = [];

  return JSON.stringify(next) === JSON.stringify(issue) ? issue : next;
}

export function normalizeIssues(issues: any, team: TeamMember[] | undefined): any {
  return Array.isArray(issues) ? issues.map((i) => normalizeIssue(i, team)) : issues;
}
