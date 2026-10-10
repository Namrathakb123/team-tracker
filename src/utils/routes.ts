// Each page has its own web address, so Refresh, the browser Back button and shared links all work.
// Examples: "/" is the Dashboard, "/?page=clients" is the Clients list, "/?page=clients&id=123" is one client.

export type Route = { view: string; params?: any };

export const DEFAULT_VIEW = 'dashboard';

// Pages that can open one record, and the name the page uses for that record's id.
const RECORD_PARAMS: Record<string, string> = {
  clients: 'selectedClientId',
  leads: 'selectedLeadId',
  issues: 'selectedIssueId',
  meeting: 'selectedMeetingId',
  work: 'selectedMemberId',
};

// Reads the page (and the open record, if any) from the query part of the address, e.g. "page=clients&id=123".
export function routeFromQuery(query: string): Route {
  const q = new URLSearchParams(query);
  const view = q.get('page') || DEFAULT_VIEW;
  const id = q.get('id');
  const recordParam = RECORD_PARAMS[view];
  return recordParam && id ? { view, params: { [recordParam]: id } } : { view };
}

// The query part of the address for a page, e.g. "page=clients&id=123". Empty for the Dashboard.
export function queryFor(view: string, params?: any): string {
  const q = new URLSearchParams();
  if (view !== DEFAULT_VIEW) q.set('page', view);
  const recordParam = RECORD_PARAMS[view];
  if (recordParam && params?.[recordParam]) q.set('id', String(params[recordParam]));
  return q.toString();
}

// Values passed to a page that don't belong in its address (for example the text to start a new issue with).
export function extraParams(view: string, params?: any): any {
  if (!params) return null;
  const recordParam = RECORD_PARAMS[view];
  const rest: any = {};
  for (const key of Object.keys(params)) {
    if (key !== recordParam && params[key] !== undefined && params[key] !== null) rest[key] = params[key];
  }
  return Object.keys(rest).length ? rest : null;
}
