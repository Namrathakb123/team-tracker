// Priorities: which colour each one gets, and which one new issues start with.
// Colours follow the meaning of the name, not its position in the list, so Critical is always red.
import { defaultItem } from './defaults';
import { chosenColor, colorBadgeClass, colorDotClass } from './colors';

type Tone = 'critical' | 'high' | 'medium' | 'low' | 'other';

export function priorityTone(priority: string, settings?: any): Tone {
  const p = (priority || '').toLowerCase();
  if (/critical|urgent|blocker|emergency/.test(p)) return 'critical';
  if (/high/.test(p)) return 'high';
  if (/med|normal/.test(p)) return 'medium';
  if (/low|minor/.test(p)) return 'low';
  // A name we don't recognise: red if an admin ticked it Urgent, otherwise neutral.
  return Array.isArray(settings?.urgentPriorities) && settings.urgentPriorities.includes(priority) ? 'high' : 'other';
}

const DOT: Record<Tone, string> = {
  critical: 'bg-red-700',
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
  other: 'bg-slate-400',
};

const BADGE: Record<Tone, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-rose-100 text-rose-700 border-rose-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

// A small coloured dot for a priority.
export function priorityDotClass(priority: string, settings?: any): string {
  const chosen = chosenColor(settings, 'priorities', priority); // a colour picked in Customize
  return chosen ? colorDotClass(chosen) : DOT[priorityTone(priority, settings)];
}

// Background, text and border colours for a priority badge.
export function priorityBadgeClass(priority: string, settings?: any): string {
  const chosen = chosenColor(settings, 'priorities', priority); // a colour picked in Customize
  return chosen ? colorBadgeClass(chosen) : BADGE[priorityTone(priority, settings)];
}

// The priority new issues start with: the one marked Default in Customize, or else the first one not ticked
// Urgent (usually Medium), or else the first one.
export function defaultPriority(settings: any): string {
  return defaultItem(settings, 'priorities', 'Medium');
}
