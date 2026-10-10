import type { AppData } from '../types';

// The one place that defines the default dropdown lists. Used when the database has no saved list yet.
export const DEFAULT_SETTINGS: Record<string, string[]> = {
  clientStatuses: ['Active', 'Won', 'Paused', 'Lost'],
  deliveryStatuses: ['Planned', 'In Progress', 'Delivered'],
  priorities: ['Critical', 'High', 'Medium', 'Low'],
  issueStatuses: ['Open', 'In Progress', 'Blocked', 'Resolved'],
  leadStatuses: ['New', 'Contacted', 'Follow-up Scheduled', 'In Progress', 'Not Responding', 'Closed - Won', 'Closed - Lost'],
  leadSources: ['Referral', 'Website', 'Instagram', 'Facebook', 'WhatsApp', 'Walk-in', 'Cold call', 'Other'],
};

// The first default priority list put Critical last, so it sorted as the lowest priority.
// A saved list that is exactly that old list is put in the right order; lists an admin changed are left alone.
const OLD_DEFAULT_PRIORITIES = ['High', 'Medium', 'Low', 'Critical'];

// Priorities counted as urgent on the Dashboard until an admin chooses others in Customize.
export const DEFAULT_URGENT_PRIORITIES = ['Critical', 'High'];

// Returns the settings with any missing or empty list filled in from the defaults. Saved lists are kept exactly as they are.
export function withDefaultSettings(settings: any): Record<string, any> {
  const result: Record<string, any> = settings && typeof settings === 'object' && !Array.isArray(settings) ? { ...settings } : {};
  for (const [name, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    if (!Array.isArray(result[name]) || result[name].length === 0) {
      result[name] = [...defaults];
    }
  }
  if (JSON.stringify(result.priorities) === JSON.stringify(OLD_DEFAULT_PRIORITIES)) {
    result.priorities = [...DEFAULT_SETTINGS.priorities];
  }
  // Which priorities count as urgent. An empty list is a real choice (nothing urgent), so only a missing list is filled.
  if (!Array.isArray(result.urgentPriorities)) {
    result.urgentPriorities = DEFAULT_URGENT_PRIORITIES.filter(p => result.priorities.includes(p));
  }
  // Which issue statuses mean an issue is finished. Until an admin chooses: "Resolved" if it exists, otherwise the last status.
  if (!Array.isArray(result.closedIssueStatuses)) {
    result.closedIssueStatuses = result.issueStatuses.includes('Resolved') ? ['Resolved'] : result.issueStatuses.slice(-1);
  }
  // Which lead statuses mean a lead is finished. Until an admin chooses: the statuses whose name starts with "Closed".
  if (!Array.isArray(result.closedLeadStatuses)) {
    result.closedLeadStatuses = result.leadStatuses.filter((s: string) => /^closed\b/i.test(s));
  }
  // Which client statuses count as active. Until an admin chooses: "Active" if it exists, otherwise the first status.
  if (!Array.isArray(result.activeClientStatuses)) {
    result.activeClientStatuses = result.clientStatuses.includes('Active') ? ['Active'] : result.clientStatuses.slice(0, 1);
  }
  return result;
}

// The item a list gives a new record (a new client's status, a new issue's priority, and so on), as chosen in
// Customize. Each is stored as a one-item list, because every setting is a list of text.
export const DEFAULT_ITEM_KEYS: Record<string, string> = {
  clientStatuses: 'defaultClientStatus',
  deliveryStatuses: 'defaultDeliveryStatus',
  issueStatuses: 'defaultIssueStatus',
  leadStatuses: 'defaultLeadStatus',
  priorities: 'defaultPriority',
};

// The item a new record gets from a list: the one chosen in Customize if it's still in the list; otherwise the
// first item (for priorities, the first one not counted as urgent); otherwise `fallback`.
export function defaultItem(settings: any, list: string, fallback = ''): string {
  const s = withDefaultSettings(settings);
  const items: string[] = Array.isArray(s[list]) ? s[list] : [];
  const key = DEFAULT_ITEM_KEYS[list];
  const chosen = key && Array.isArray(s[key]) ? s[key][0] : undefined;
  if (chosen && items.includes(chosen)) return chosen;
  if (list === 'priorities') {
    const urgent: string[] = Array.isArray(s.urgentPriorities) ? s.urgentPriorities : [];
    return items.find(p => !urgent.includes(p)) || items[0] || fallback;
  }
  return items[0] || fallback;
}

// A list's items for a record's dropdown. If the record holds a value that isn't in the list any more, it is added
// and marked, so the dropdown shows the real value instead of silently showing the first item (and overwriting the
// value with it on the next change).
export function listOptions(list: string[] | undefined, current?: string | null): { value: string; label: string }[] {
  const items = Array.isArray(list) ? list : [];
  const options = items.map(value => ({ value, label: value }));
  return current && !items.includes(current) ? [...options, { value: current, label: `${current} (not in the list)` }] : options;
}

// True when `newSettings` really changes a setting compared with `oldSettings`.
// Both sides are compared with missing lists filled in, and only settings the browser actually sent count,
// so an older copy of the page (which doesn't know about newer settings) is not mistaken for a change.
export function settingsChanged(oldSettings: any, newSettings: any): boolean {
  const before = withDefaultSettings(oldSettings);
  const after = withDefaultSettings(newSettings);
  const sent = newSettings && typeof newSettings === 'object' && !Array.isArray(newSettings) ? Object.keys(newSettings) : [];
  return sent.some(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

// A brand-new, empty data set (used when nothing has been saved yet).
export function emptyAppData(): AppData {
  return { clients: [], issues: [], team: [], updates: [], leads: [], settings: withDefaultSettings({}) };
}
