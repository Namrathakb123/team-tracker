// Tasks: work given to someone, about a client or internal. They are stored in the "issues" list (the app called
// them issues before), so older records keep working. This file holds the rules the Tasks page and others share:
// due dates, the "My tasks / Raised by me / All" views, and who may delete a task.
import { addDays, formatDate } from './dates';
import { isClosedIssueStatus } from './issues';
import type { Issue, Settings } from '../types';

// Where a task stands against its due date. Null when it has none, or is done.
export type DueState = 'overdue' | 'today' | 'soon' | 'later';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const validDueDate = (value: unknown): value is string => typeof value === 'string' && DAY.test(value);

export function dueState(task: Pick<Issue, 'status'> & { dueDate?: string }, today: string, settings?: Settings): DueState | null {
  if (!validDueDate(task.dueDate) || isClosedIssueStatus(task.status, settings)) return null;
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  if (task.dueDate <= addDays(today, 3)) return 'soon';
  return 'later';
}

// "Overdue (9 Oct 2026)", "Due today", "Due tomorrow", "Due 14 Oct 2026"; empty when there is no due date.
export function dueLabel(task: { dueDate?: string }, today: string): string {
  if (!validDueDate(task.dueDate)) return '';
  if (task.dueDate < today) return `Overdue (${formatDate(task.dueDate)})`;
  if (task.dueDate === today) return 'Due today';
  if (task.dueDate === addDays(today, 1)) return 'Due tomorrow';
  return `Due ${formatDate(task.dueDate)}`;
}

// Colours for the due-date badge.
export const DUE_TAG: Record<DueState, string> = {
  overdue: 'bg-red-50 text-red-700 border-red-200',
  today: 'bg-amber-50 text-amber-800 border-amber-200',
  soon: 'bg-sky-50 text-sky-700 border-sky-200',
  later: 'bg-slate-50 text-slate-600 border-slate-200',
};

// The signed-in person, for "mine" and "raised by me".
export interface TaskViewer {
  memberId: string | null;
  email: string;
}

export const TASK_VIEWS = [
  { id: 'mine', label: 'My tasks' },
  { id: 'raised', label: 'Raised by me' },
  { id: 'all', label: 'All' },
] as const;
export type TaskView = typeof TASK_VIEWS[number]['id'];

const sameEmail = (a: unknown, b: string) => typeof a === 'string' && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function inTaskView(task: Pick<Issue, 'assigneeId'> & { createdBy?: string }, view: TaskView, viewer: TaskViewer): boolean {
  if (view === 'mine') return !!viewer.memberId && task.assigneeId === viewer.memberId;
  if (view === 'raised') return sameEmail(task.createdBy, viewer.email);
  return true;
}

// The "Due" filter: '' any, 'overdue', 'today' (today or overdue), 'week' (within 7 days, or overdue), 'none'.
export type DueFilter = '' | 'overdue' | 'today' | 'week' | 'none';
export function dueFilterMatches(task: Pick<Issue, 'status'> & { dueDate?: string }, filter: DueFilter, today: string, settings?: Settings): boolean {
  if (!filter) return true;
  if (filter === 'none') return !validDueDate(task.dueDate);
  const state = dueState(task, today, settings);
  if (!state) return false;
  if (filter === 'overdue') return state === 'overdue';
  if (filter === 'today') return state === 'overdue' || state === 'today';
  return state === 'overdue' || (task.dueDate as string) <= addDays(today, 7);
}

// Admins may delete any task; anyone else only the ones they raised themselves (not ones given to them).
export function canDeleteTask(task: { createdBy?: string }, viewer: TaskViewer, isAdmin: boolean): boolean {
  return isAdmin || sameEmail(task.createdBy, viewer.email);
}

// The server's check for a save by someone who isn't an admin: tasks they didn't raise may not disappear.
// Returns a message saying why the save is refused, or null when it is fine.
export function findForbiddenTaskDeletes(oldTasks: unknown, newTasks: unknown, email: string): string | null {
  const before = Array.isArray(oldTasks) ? oldTasks : [];
  const after = new Set((Array.isArray(newTasks) ? newTasks : []).map((t: any) => t && t.id));
  const gone = before.filter((t: any) => t && !after.has(t.id) && !sameEmail(t.createdBy, email));
  return gone.length ? 'Only the person who raised a task, or an admin, can delete it.' : null;
}

// Due first (earliest due date first, no date last), then newest first.
export function compareTasks(a: Issue & { dueDate?: string }, b: Issue & { dueDate?: string }): number {
  const da = validDueDate(a.dueDate) ? a.dueDate : '9999-99-99';
  const db = validDueDate(b.dueDate) ? b.dueDate : '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  return String(b.createdAt || b.created || '').localeCompare(String(a.createdAt || a.created || ''));
}
