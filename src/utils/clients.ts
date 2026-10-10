// Shared helpers for clients.
import { visibleUpdates } from './updates';
import { toDateKey, parseDate, timeFromId } from './dates';
import type { Client, DailyUpdate, Issue, TeamMember } from '../types';

// Clients that aren't archived. Archived clients keep all their updates and issues, and can be restored.
export function activeClients(clients: Client[] | undefined): Client[] {
  return (Array.isArray(clients) ? clients : []).filter((c) => c && !c.archived);
}

// The name to show for a record's client: its name, "Deleted client" when the client no longer exists,
// or `none` when the record has no client at all.
export function clientLabel(clients: Client[] | undefined, clientId: string | null | undefined, none = 'General'): string {
  if (!clientId) return none;
  const client = (Array.isArray(clients) ? clients : []).find((c) => c && c.id === clientId);
  return client ? client.name : 'Deleted client';
}

// A team member's name from their id (marked "removed" if they were removed from the team).
// Older records stored the name itself; a name that matches no team member is shown as it is.
export function teamMemberName(idOrName: string, team: TeamMember[] | undefined): string {
  const member = (Array.isArray(team) ? team : []).find((t) => t && t.id === idOrName);
  if (member) return member.deleted ? `${member.name} (removed)` : member.name;
  return idOrName;
}

// Clients used to store their team members (and the person they're assigned to) by name. This returns the client
// with team member ids instead. Names that match no team member are kept, so nothing is lost. Running it again
// changes nothing, and a client already in this form is returned as it is.
export function normalizeClient(client: any, team: TeamMember[] | undefined): any {
  if (!client || typeof client !== 'object' || Array.isArray(client)) return client;
  const members = Array.isArray(team) ? team : [];
  const toId = (value: any) => {
    if (typeof value !== 'string' || !value) return value;
    if (members.some((t) => t && t.id === value)) return value;
    const byName = members.find((t) => t && t.name === value);
    return byName ? byName.id : value;
  };
  const next: any = { ...client };
  if (Array.isArray(next.team)) next.team = Array.from(new Set(next.team.map(toId)));
  if (next.assignedTo) next.assignedTo = toId(next.assignedTo);
  // Names and services are kept without stray spaces, and each service is listed once.
  if (typeof next.name === 'string' && next.name !== next.name.trim()) next.name = next.name.trim();
  if (Array.isArray(next.services)) {
    const services: any[] = [];
    for (const s of next.services) {
      if (typeof s !== 'string') { services.push(s); continue; }
      const tidy = tidyName(s);
      if (tidy && !services.some((x) => sameName(x, tidy))) services.push(tidy);
    }
    next.services = services;
  }
  // Older clients have no created date; it is worked out from the id (see clientCreatedAt).
  if (!next.createdAt) {
    const created = clientCreatedAt(next);
    if (created) next.createdAt = created;
  }
  return JSON.stringify(next) === JSON.stringify(client) ? client : next;
}

// When the client was added (an ISO date and time), or null if that isn't known.
// New clients store it; for older clients it comes from the id (ids were made with Date.now()).
export function clientCreatedAt(client: Client | null | undefined): string | null {
  if (!client) return null;
  if (client.createdAt && parseDate(client.createdAt)) return client.createdAt;
  return timeFromId(client.id);
}

// Whether a client was added, or had an update or an issue logged, between two "YYYY-MM-DD" dates
// (either can be empty). Deleted updates don't count. A client with no known dates never matches a range.
export function clientActiveBetween(client: Client | null | undefined, updates: DailyUpdate[] | undefined, issues: Issue[] | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!client) return false;
  const inRange = (day: string | null) => !!day && (!from || day >= from) && (!to || day <= to);
  if (inRange(toDateKey(clientCreatedAt(client)))) return true;
  if (visibleUpdates(updates).some((u) => u.clientId === client.id && inRange(toDateKey(u.date) || toDateKey(u.timestamp)))) return true;
  return (Array.isArray(issues) ? issues : []).some((i) => i && i.clientId === client.id && inRange(toDateKey(i.createdAt || i.created)));
}

// A name as it should be saved: no spaces at the ends, and one space between words.
export function tidyName(value: unknown): string {
  return String(value ?? '').split(' ').filter(Boolean).join(' ').trim();
}

// Two names are the same if they match without regard to capital letters and extra spaces.
export function sameName(a: unknown, b: unknown): boolean {
  const x = tidyName(a);
  return x !== '' && x.localeCompare(tidyName(b), 'en', { sensitivity: 'accent' }) === 0;
}

// Another client that already has this name (archived ones included), or null.
export function clientWithName(clients: Client[] | undefined, name: unknown, exceptId?: string | null): Client | null {
  return (Array.isArray(clients) ? clients : []).find((c) => c && c.id !== exceptId && sameName(c.name, name)) || null;
}

export function normalizeClients(clients: any, team: TeamMember[] | undefined): any {
  return Array.isArray(clients) ? clients.map((c) => normalizeClient(c, team)) : clients;
}
