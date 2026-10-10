// Who sees what: admins see everything; a user sees their own work. Used by the server to send each user only
// their part of the shared data, and to fit their saves back into the whole (see src/app/api/data/route.ts).
//
// A user's own work (they are the team member whose email is their login's):
//   clients   they are on the client's team or are its main person, plus the clients of their issues
//   issues    assigned to them, raised by them, or about one of their clients
//   leads     assigned to them, or added by them
//   updates   written by them, or about a client they can see
// Everyone sees the team list and the settings (names and dropdowns). Meetings have their own rules (meetings.ts).
import { teamMemberForEmail } from './team';

export const OWN_WORK_SECTIONS = ['clients', 'issues', 'updates', 'leads'] as const;
export type OwnWorkSection = typeof OWN_WORK_SECTIONS[number];

// The signed-in user: their email and, if they are on the team, their team member id.
export interface Viewer {
  email: string;
  memberId: string | null;
}

export function viewerFor(team: unknown, email: string): Viewer {
  const member = teamMemberForEmail(Array.isArray(team) ? team : [], email);
  return { email: email.trim().toLowerCase(), memberId: member ? member.id : null };
}

const list = (value: unknown): any[] => (Array.isArray(value) ? value.filter((r) => r && typeof r === 'object') : []);
const sameEmail = (a: unknown, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b;

// The ids of the records in each section that this user may see.
export function visibleIds(state: any, viewer: Viewer): Record<OwnWorkSection, Set<string>> {
  const me = viewer.memberId;
  const mine = (id: unknown) => !!me && id === me;
  const myClients = new Set(list(state?.clients).filter((c) => (Array.isArray(c.team) && me && c.team.includes(me)) || mine(c.assignedTo)).map((c) => c.id));
  const issues = new Set(list(state?.issues)
    .filter((i) => mine(i.assigneeId) || sameEmail(i.createdBy, viewer.email) || (i.clientId && myClients.has(i.clientId)))
    .map((i) => i.id));
  const clients = new Set(myClients);
  for (const i of list(state?.issues)) if (issues.has(i.id) && i.clientId) clients.add(i.clientId);
  const leads = new Set(list(state?.leads).filter((l) => mine(l.assignedTo) || sameEmail(l.createdBy, viewer.email)).map((l) => l.id));
  const updates = new Set(list(state?.updates)
    .filter((u) => sameEmail(u.authorEmail, viewer.email) || (u.clientId && clients.has(u.clientId)))
    .map((u) => u.id));
  return { clients, issues, updates, leads };
}

// The shared data as this user sees it: everything except the records of others' work.
export function filterForViewer<T extends Record<string, any>>(state: T, viewer: Viewer): T {
  const ids = visibleIds(state, viewer);
  const out: Record<string, any> = { ...state };
  for (const section of OWN_WORK_SECTIONS) {
    if (Array.isArray(state[section])) out[section] = state[section].filter((r: any) => r && ids[section].has(r.id));
  }
  return out as T;
}

// A user's save, fitted back into the whole data: the records they can see are taken from their save (changed, or
// left out = deleted), new records are added where they put them, and everyone else's records stay exactly as
// stored. Returns a problem instead when the save touches a record they can't see.
// New records are made theirs, so they don't vanish from their own screen: a new client gets them on its team, and a
// new lead without anyone gets them; a new issue or lead remembers who added it.
export function mergeUserSave(oldState: any, newState: any, viewer: Viewer): { state: any } | { problem: string } {
  const ids = visibleIds(oldState, viewer);
  const merged: Record<string, any> = { ...newState };
  for (const section of OWN_WORK_SECTIONS) {
    const before = list(oldState?.[section]);
    if (!Array.isArray(newState?.[section])) continue; // (a missing section is refused elsewhere)
    const stored = new Set(before.map((r) => r.id));
    const storedById = new Map(before.map((r) => [r.id, r]));
    const visible = ids[section];
    // Someone else's record may only come back unchanged (then it is simply left as stored); changing it is refused.
    const submitted: any[] = [];
    for (const r of list(newState[section])) {
      if (stored.has(r.id) && !visible.has(r.id)) {
        if (JSON.stringify(r) !== JSON.stringify(storedById.get(r.id))) return { problem: 'This change touches work that isn’t yours, so it wasn’t saved. Reload the page and try again.' };
        continue;
      }
      submitted.push(r);
    }
    const byId = new Map(submitted.map((r) => [r.id, r]));
    // Stored order: others' records stay, yours are replaced or (when left out) removed.
    const result: any[] = [];
    for (const r of before) {
      if (!visible.has(r.id)) result.push(r);
      else if (byId.has(r.id)) result.push(byId.get(r.id));
    }
    // New records go right after the record they follow in the user's list (or first).
    let anchor: string | null = null;
    for (const r of submitted) {
      if (!stored.has(r.id)) {
        const at = anchor === null ? 0 : result.findIndex((x) => x.id === anchor) + 1;
        result.splice(at, 0, makeOwn(section, r, viewer));
      }
      anchor = r.id;
    }
    merged[section] = result;
  }
  return { state: merged };
}

function makeOwn(section: OwnWorkSection, record: any, viewer: Viewer): any {
  const me = viewer.memberId;
  if (section === 'clients' && me) {
    const team: string[] = Array.isArray(record.team) ? record.team : [];
    return team.includes(me) || record.assignedTo === me ? record : { ...record, team: [...team, me] };
  }
  if (section === 'leads') {
    return { ...record, ...(record.createdBy ? {} : { createdBy: viewer.email }), ...(!record.assignedTo && me ? { assignedTo: me } : {}) };
  }
  if (section === 'issues') return record.createdBy ? record : { ...record, createdBy: viewer.email };
  return record;
}
