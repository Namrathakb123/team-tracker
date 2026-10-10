// Shared helpers for leads.
import { withDefaultSettings } from './defaults';
import { toDateKey, parseDate, timeFromId } from './dates';
import { cleanPhone, phoneDigits, samePhone } from './phone';
import type { AppData, Lead, Settings, TeamMember } from '../types';

// The day of a lead's next follow-up, "YYYY-MM-DD", from its latest logged interaction (newest first). Null if none.
export function nextFollowUp(lead: Lead | null | undefined): string | null {
  const latest = Array.isArray(lead?.history) ? lead.history[0] : null;
  return toDateKey(latest?.nextActionDate) || null;
}

// When the lead was added (an ISO date and time), or null if that isn't known. New leads store it. Older leads
// use their first logged entry ("Lead created"), an older "date" field, or else their id (made with Date.now()).
export function leadCreatedAt(lead: Lead | null | undefined): string | null {
  if (!lead) return null;
  if (lead.createdAt && parseDate(lead.createdAt)) return lead.createdAt;
  const history = Array.isArray(lead.history) ? lead.history : [];
  const first = history[history.length - 1]; // newest first, so the last entry is the oldest
  const firstDate = first && /lead created/i.test(String(first.notes || '')) ? parseDate(first.date) : null;
  if (firstDate) return firstDate.toISOString();
  const oldDate = parseDate(lead.date);
  return oldDate ? oldDate.toISOString() : timeFromId(lead.id);
}

// Leads get the date they were added (older leads had none), phone numbers pasted with invisible marks or
// special dashes are written plainly, and the assigned person is stored by id (older leads stored the name; a
// name that matches nobody is kept). Running it again changes nothing; a tidy lead is returned as it is.
export function normalizeLead(lead: any, team?: TeamMember[]): any {
  if (!lead || typeof lead !== 'object' || Array.isArray(lead)) return lead;
  let next = lead;
  if (typeof lead.assignedTo === 'string' && lead.assignedTo) {
    const members = Array.isArray(team) ? team : [];
    if (!members.some((t) => t && t.id === lead.assignedTo)) {
      const byName = members.find((t) => t && t.name === lead.assignedTo);
      if (byName) next = { ...next, assignedTo: byName.id };
    }
  }
  if (!lead.createdAt) {
    const created = leadCreatedAt(lead);
    if (created) next = { ...next, createdAt: created };
  }
  if (typeof lead.phone === 'string') {
    const phone = cleanPhone(lead.phone);
    if (phone !== lead.phone) next = { ...next, phone };
  }
  return next;
}

// Who else already has this phone number: another lead, or a client made from a lead. Null if nobody.
export function phoneOwner(data: Pick<AppData, 'leads' | 'clients'>, value: string, exceptLeadId: string | null): string | null {
  if (!phoneDigits(value)) return null;
  const lead = (data.leads || []).find((l) => l.id !== exceptLeadId && samePhone(l.phone, value));
  if (lead) return `Another lead, “${lead.name}”, has this number.`;
  const client = (data.clients || []).find((c) => samePhone(c.fromLead?.phone, value));
  return client ? `The client “${client.name}” has this number.` : null;
}

export function normalizeLeads(leads: any, team?: TeamMember[]): any {
  return Array.isArray(leads) ? leads.map((lead) => normalizeLead(lead, team)) : leads;
}

// The day the Leads date filter uses, "YYYY-MM-DD": the next follow-up, or the day the lead was added if none is set.
export function leadFilterDate(lead: Lead): string | null {
  return nextFollowUp(lead) || toDateKey(leadCreatedAt(lead));
}

// Whether a lead status means the lead is finished: the statuses ticked "Closed" in Customize.
export function isClosedLeadStatus(status: string | undefined, settings: Settings | undefined): boolean {
  if (!status) return false;
  const closed = Array.isArray(settings?.closedLeadStatuses) ? settings.closedLeadStatuses : withDefaultSettings(settings).closedLeadStatuses;
  return closed.includes(status);
}

// Where a lead's next follow-up stands on `today` ("YYYY-MM-DD"): 'overdue' (before today), 'today', or 'upcoming'.
// Null when there is no follow-up date, or the lead is closed (a closed lead needs no follow-up).
export function followUpState(lead: Lead, today: string, settings: Settings | undefined): 'overdue' | 'today' | 'upcoming' | null {
  if (!lead || isClosedLeadStatus(lead.status, settings)) return null;
  const day = nextFollowUp(lead);
  if (!day) return null;
  return day < today ? 'overdue' : day === today ? 'today' : 'upcoming';
}

// Open leads with a follow-up on `day` ("due") or before it ("overdue"), earliest first. Closed leads are left out.
export function followUpsDue(leads: Lead[] | undefined, day: string, settings: Settings | undefined): { due: Lead[]; overdue: Lead[] } {
  const open = (Array.isArray(leads) ? leads : []).filter((l) => l && !isClosedLeadStatus(l.status, settings));
  const withDate = open
    .map((lead) => ({ lead, date: nextFollowUp(lead) }))
    .filter((x): x is { lead: any; date: string } => !!x.date && x.date <= day)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    due: withDate.filter(x => x.date === day).map(x => x.lead),
    overdue: withDate.filter(x => x.date < day).map(x => x.lead),
  };
}
