// Colours for list items (statuses, priorities and so on). An item's colour follows its meaning (Resolved is
// green, Blocked is red), unless an admin picks one in Customize. Never its position in the list, so reordering
// or adding items doesn't change colours. Every class name is written out in full so Tailwind includes it.
import { withDefaultSettings } from './defaults';

export type ColorName = 'green' | 'teal' | 'blue' | 'indigo' | 'purple' | 'amber' | 'orange' | 'red' | 'grey';
export const COLOR_NAMES: ColorName[] = ['green', 'teal', 'blue', 'indigo', 'purple', 'amber', 'orange', 'red', 'grey'];
export const COLOR_LABELS: Record<ColorName, string> = {
  green: 'Green', teal: 'Teal', blue: 'Blue', indigo: 'Indigo', purple: 'Purple',
  amber: 'Amber', orange: 'Orange', red: 'Red', grey: 'Grey',
};

const BADGE: Record<ColorName, string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  blue: 'bg-sky-100 text-sky-700 border-sky-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  red: 'bg-rose-100 text-rose-700 border-rose-200',
  grey: 'bg-slate-100 text-slate-700 border-slate-200',
};
const DOT: Record<ColorName, string> = {
  green: 'bg-emerald-500', teal: 'bg-teal-500', blue: 'bg-sky-500', indigo: 'bg-indigo-500', purple: 'bg-purple-500',
  amber: 'bg-amber-500', orange: 'bg-orange-500', red: 'bg-rose-500', grey: 'bg-slate-400',
};
// A lighter version, for table cells (the Dashboard report preview).
const SOFT: Record<ColorName, string> = {
  green: 'bg-emerald-50 text-emerald-800', teal: 'bg-teal-50 text-teal-800', blue: 'bg-sky-50 text-sky-800',
  indigo: 'bg-indigo-50 text-indigo-800', purple: 'bg-purple-50 text-purple-800', amber: 'bg-amber-50 text-amber-900',
  orange: 'bg-orange-50 text-orange-900', red: 'bg-rose-50 text-rose-800', grey: 'bg-slate-50 text-slate-700',
};

// Colours an admin picked are kept in settings.itemColors as "list:item=colour" (every setting is a list of text).
export function chosenColor(settings: any, list: string, item: string): ColorName | null {
  const entries: any[] = Array.isArray(settings?.itemColors) ? settings.itemColors : [];
  const prefix = `${list}:${item}=`;
  for (const entry of entries) {
    if (typeof entry !== 'string' || !entry.startsWith(prefix)) continue;
    const color = entry.slice(prefix.length) as ColorName;
    if (COLOR_NAMES.includes(color)) return color;
  }
  return null;
}

// settings.itemColors with the colour of one item set (or taken away, to go back to automatic).
export function withItemColor(settings: any, list: string, item: string, color: ColorName | null): string[] {
  const prefix = `${list}:${item}=`;
  const kept = (Array.isArray(settings?.itemColors) ? settings.itemColors : [])
    .filter((entry: any) => typeof entry === 'string' && !(entry.startsWith(prefix) && COLOR_NAMES.includes(entry.slice(prefix.length) as ColorName)));
  return color ? [...kept, `${prefix}${color}`] : kept;
}

// The colour an item gets from its meaning.
export function automaticColor(settings: any, list: string, item: string): ColorName {
  const s = withDefaultSettings(settings);
  const text = String(item || '').toLowerCase();
  if (list === 'priorities') {
    if (/critical|urgent|blocker|emergency|high/.test(text)) return 'red';
    if (/medium|normal/.test(text)) return 'amber';
    if (/low/.test(text)) return 'green';
    return 'grey';
  }
  if (/lost|cancel|reject|block|stuck|fail|not respond|no response|overdue|churn/.test(text)) return 'red';
  if (/pause|hold|wait|inactive|dormant|later/.test(text)) return 'grey';
  if (/won|resolved|done|complete|closed|deliver|active|paid|live|success/.test(text)) return 'green';
  if (list === 'issueStatuses' && (s.closedIssueStatuses || []).includes(item)) return 'green';
  if (list === 'clientStatuses' && (s.activeClientStatuses || []).includes(item)) return 'green';
  if (list === 'leadStatuses' && (s.closedLeadStatuses || []).includes(item)) return 'grey';
  if (/progress|working|contact|schedul|follow|review|test|meeting|negotiat|proposal|quot|call/.test(text)) return 'blue';
  if (/open|new|todo|to do|plan|pending|not started|backlog|lead/.test(text)) return 'amber';
  // Anything else gets a steady colour from its name (it doesn't change when the list changes).
  const others: ColorName[] = ['purple', 'indigo', 'teal', 'orange'];
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return others[hash % others.length];
}

// The colour an item shows: the one an admin picked, or else the automatic one.
export function itemColor(settings: any, list: string, item: string): ColorName {
  return chosenColor(settings, list, item) || automaticColor(settings, list, item);
}

// Class names for a badge (background, text and border), a small dot, or a lightly coloured table cell.
export function badgeClass(settings: any, list: string, item: string): string {
  return BADGE[itemColor(settings, list, item)];
}
export function dotClass(settings: any, list: string, item: string): string {
  return DOT[itemColor(settings, list, item)];
}
export function softClass(settings: any, list: string, item: string): string {
  return SOFT[itemColor(settings, list, item)];
}
export function colorBadgeClass(color: ColorName): string {
  return BADGE[color];
}
export function colorDotClass(color: ColorName): string {
  return DOT[color];
}
