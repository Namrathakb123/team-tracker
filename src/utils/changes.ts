// What a save changed, worked out on the server by comparing the data before and after, so the audit log shows
// real before and after values instead of only the sentence the browser wrote. One entry per added record, per
// removed record, and per changed field. Team member and client ids are shown by name.

export type Change = { section: string; record: string; field: string; before?: string; after?: string };

const SECTIONS = ['clients', 'leads', 'issues', 'team', 'updates'];
export const MAX_CHANGES = 100;
const MAX_VALUE = 200;
// Fields that are internal or change together with others, so listing them adds nothing.
const SKIP_FIELDS = new Set(['id', 'timestamp', 'createdAt', 'editedAt', 'authorEmail']);
const PERSON_FIELDS = new Set(['team', 'assignedTo', 'assigneeId']);

const cut = (text: string) => (text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text);
// A value as it looks on screen: invisible marks removed, special dashes and spaces made plain, spaces collapsed.
const looks = (text: string) => text
  .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

function recordName(section: string, r: any): string {
  if (!r || typeof r !== 'object') return '';
  if (section === 'issues') return String(r.title || r.id || '');
  if (section === 'updates') return cut(String(r.text || r.id || '').split('\n')[0]).slice(0, 60);
  return String(r.name || r.id || '');
}

type Lookup = { people: Map<string, string>; clients: Map<string, string> };

function show(field: string, value: any, lookup: Lookup): string {
  if (value === undefined || value === null || value === '') return '';
  const person = (id: any) => lookup.people.get(String(id)) || String(id);
  if (PERSON_FIELDS.has(field)) {
    return Array.isArray(value) ? value.map(person).join(', ') : person(value);
  }
  if (field === 'clientId') return lookup.clients.get(String(value)) || String(value);
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) return cut(value.join(', '));
    return `${value.length} ${value.length === 1 ? 'entry' : 'entries'}`;
  }
  if (typeof value === 'object') return 'details';
  return cut(String(value));
}

// The changes between two versions of the data (either may be missing, for example before the first save).
export function describeChanges(before: any, after: any): Change[] {
  const changes: Change[] = [];
  const lookup: Lookup = { people: new Map(), clients: new Map() };
  for (const state of [before, after]) {
    for (const t of (Array.isArray(state?.team) ? state.team : [])) if (t && t.id) lookup.people.set(String(t.id), String(t.name || t.id));
    for (const c of (Array.isArray(state?.clients) ? state.clients : [])) if (c && c.id) lookup.clients.set(String(c.id), String(c.name || c.id));
  }

  for (const section of SECTIONS) {
    const oldList: any[] = Array.isArray(before?.[section]) ? before[section] : [];
    const newList: any[] = Array.isArray(after?.[section]) ? after[section] : [];
    const oldById = new Map(oldList.filter(r => r && r.id).map(r => [r.id, r]));
    const newById = new Map(newList.filter(r => r && r.id).map(r => [r.id, r]));
    for (const [id, record] of Array.from(newById.entries())) {
      const old = oldById.get(id);
      if (!old) {
        changes.push({ section, record: recordName(section, record), field: 'added' });
        continue;
      }
      for (const field of Array.from(new Set(Object.keys(old).concat(Object.keys(record))))) {
        if (SKIP_FIELDS.has(field) || JSON.stringify(old[field]) === JSON.stringify(record[field])) continue;
        const was = show(field, old[field], lookup);
        const now = show(field, record[field], lookup);
        if (was === now) {
          // A change of format only (such as a team member's name now stored as their id) is not a real change.
          // A list of entries (like a lead's history) or a group of details can be edited without looking different
          // here, so that is still listed, marked as edited.
          const detailed = (v: any) => v !== null && typeof v === 'object' && (!Array.isArray(v) || v.some((x) => x !== null && typeof x === 'object'));
          if (!detailed(old[field]) && !detailed(record[field])) continue;
          changes.push({ section, record: recordName(section, record), field, before: was, after: `${now} (edited)` });
          continue;
        }
        // A change that only tidies spaces or hidden characters looks the same on screen, so it says so.
        const tidiedOnly = looks(was) === looks(now);
        changes.push({ section, record: recordName(section, record), field, before: was, after: tidiedOnly ? `${now} (tidied)` : now });
      }
    }
    for (const [id, record] of Array.from(oldById.entries())) {
      if (!newById.has(id)) changes.push({ section, record: recordName(section, record), field: 'removed' });
    }
  }

  // Settings: which lists (and ticks) changed.
  const oldSettings = before?.settings && typeof before.settings === 'object' ? before.settings : {};
  const newSettings = after?.settings && typeof after.settings === 'object' ? after.settings : {};
  for (const key of Array.from(new Set(Object.keys(oldSettings).concat(Object.keys(newSettings))))) {
    if (JSON.stringify(oldSettings[key]) === JSON.stringify(newSettings[key])) continue;
    changes.push({ section: 'settings', record: key, field: 'items', before: show('items', oldSettings[key], lookup), after: show('items', newSettings[key], lookup) });
  }

  if (changes.length > MAX_CHANGES) {
    const more = changes.length - (MAX_CHANGES - 1);
    return [...changes.slice(0, MAX_CHANGES - 1), { section: '', record: '', field: 'more', after: `${more} more changes` }];
  }
  return changes;
}

const SECTION_LABELS: Record<string, string> = { clients: 'Client', leads: 'Lead', issues: 'Issue', team: 'Team member', updates: 'Update', settings: 'Setting' };
const FIELD_LABELS: Record<string, string> = {
  name: 'Name', status: 'Status', deliveryStatus: 'Delivery status', dealValue: 'Deal value', category: 'Category',
  assignedTo: 'Assigned to', assigneeId: 'Assigned to', team: 'Team', services: 'Services', priority: 'Priority',
  phone: 'Phone', source: 'Source', businessName: 'Business name', history: 'History', notesHistory: 'Notes',
  description: 'Description', title: 'Title', clientId: 'Client', archived: 'Archived', archivedAt: 'Archived on',
  archivedBy: 'Archived by', deletedAt: 'Deleted on', deletedBy: 'Deleted by', text: 'Text', email: 'Email',
  role: 'Job role', meetingGroup: 'Meeting group', deleted: 'Removed', resolvedDate: 'Resolved on', date: 'Date', author: 'Author', fromLead: 'From lead',
};

// One change as a line of text, for the Audit Logs page and its export.
export function formatChange(change: Change): string {
  if (change.field === 'more') return `…and ${change.after}`;
  const what = `${SECTION_LABELS[change.section] || change.section} “${change.record}”`;
  if (change.field === 'added') return `${what} added`;
  if (change.field === 'removed') return `${what} removed`;
  const field = change.section === 'settings' ? '' : `${FIELD_LABELS[change.field] || change.field}: `;
  return `${what} — ${field}${change.before || '(empty)'} → ${change.after || '(empty)'}`;
}
