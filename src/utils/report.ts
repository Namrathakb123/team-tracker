// The Dashboard report. One set of sheets is built here and used for both the on-screen preview
// and the downloaded files, so the two always match.
import { visibleUpdates, updateOwner } from './updates';
import { issueAssigneeName, isClosedIssueStatus } from './issues';
import { parseDate, toDateKey, startOfDay, endOfDay } from './dates';
import { buildXlsx } from './xlsx';
import { teamMemberName } from './clients';
import { formatRupees } from './money';

export type SheetKey = 'summary' | 'clients' | 'team' | 'issues' | 'updates';
export type Cell = string | number;
export type Sheet = { key: SheetKey; title: string; headers: string[]; rows: Cell[][] };
export type Report = Record<SheetKey, Sheet>;

export const SHEET_ORDER: SheetKey[] = ['summary', 'clients', 'team', 'issues', 'updates'];

export type ReportOptions = {
  from?: string;   // "YYYY-MM-DD" or empty
  to?: string;     // "YYYY-MM-DD" or empty
  owner?: string;  // who the report is for
};


export function buildReport(data: any, { from = '', to = '', owner = '' }: ReportOptions = {}): Report {
  const hasRange = !!(from || to);
  const fromTs = from ? startOfDay(from) : -Infinity;
  const toTs = to ? endOfDay(to) : Infinity;
  const inRange = (ts: number) => ts >= fromTs && ts <= toTs;

  const allClients: any[] = Array.isArray(data?.clients) ? data.clients : [];
  const allTeam: any[] = Array.isArray(data?.team) ? data.team : [];
  const activeTeam = allTeam.filter((t: any) => t && !t.deleted);
  const settings = data?.settings;
  const issueStatuses: string[] = Array.isArray(settings?.issueStatuses) ? settings.issueStatuses : [];
  const clientStatuses: string[] = Array.isArray(data?.settings?.clientStatuses) ? data.settings.clientStatuses : [];

  // Updates in the period, by the date each update is for (an update can be logged for an earlier day).
  // Deleted updates are never included.
  const updates = visibleUpdates(data?.updates).filter((u: any) => {
    const day = toDateKey(u.date) || toDateKey(u.timestamp);
    if (!day) return !hasRange;
    return (!from || day >= from) && (!to || day <= to);
  });
  // Issues created in the period. Issues without a creation date are always included.
  const issues = (Array.isArray(data?.issues) ? data.issues : []).filter((i: any) => {
    const ts = parseDate(i.created || i.createdAt)?.getTime() || 0;
    return ts === 0 || inRange(ts);
  });

  // Clients: with a date range, only those with updates or issues in the period.
  const clientActivity = (c: any) => ({
    updates: updates.filter((u: any) => u.clientId === c.id).length,
    issues: issues.filter((i: any) => i.clientId === c.id).length,
  });
  // Archived clients are left out, unless a date range is chosen and they had activity in it.
  const clients = allClients
    .map((c: any) => ({ client: c, activity: clientActivity(c) }))
    .filter(({ client, activity }) => {
      const active = activity.updates > 0 || activity.issues > 0;
      if (client.archived) return hasRange && active;
      return !hasRange || active;
    });

  // Team: everyone, with what they did in the period.
  const team = activeTeam.map((t: any) => {
    const email = typeof t.email === 'string' ? t.email.trim().toLowerCase() : '';
    return {
      member: t,
      issues: issues.filter((i: any) => i.assigneeId ? i.assigneeId === t.id : i.assignee === t.name).length,
      updates: email ? updates.filter((u: any) => updateOwner(u) === email).length : 0,
    };
  });

  const inPeriod = hasRange ? ' in period' : '';
  // A record whose client was deleted says so; a record without a client shows a dash.
  const clientName = (id: string) => (id ? (allClients.find((c: any) => c.id === id)?.name || 'Deleted client') : '');

  // Deal value per client status (adding Lost and Paused clients into one total was misleading).
  const statusNames = [...clientStatuses];
  for (const { client } of clients) {
    const s = client.status || 'Active';
    if (!statusNames.includes(s)) statusNames.push(s);
  }
  const dealRows: Cell[][] = statusNames.map(s => [
    `Deal Value — ${s} clients (₹)`,
    formatRupees(clients.filter(({ client }) => (client.status || 'Active') === s).reduce((sum, { client }) => sum + (Number(client.dealValue) || 0), 0)),
  ]);

  // How many issues have each status (every status from Customize, plus any other found on issues).
  const statusList = [...issueStatuses];
  for (const i of issues) if (i.status && !statusList.includes(i.status)) statusList.push(i.status);
  const issueStatusRows: Cell[][] = statusList.map(s => [`Tasks with status "${s}"`, issues.filter((i: any) => i.status === s).length]);

  const period = hasRange ? `${from || 'the beginning'} to ${to || 'today'}` : 'All dates';

  return {
    summary: {
      key: 'summary',
      title: 'Summary',
      headers: ['Summary Metric', 'Value'],
      rows: [
        ['Client Delivery Dashboard — Summary', ''],
        ['Period', period],
        ['Owner', owner],
        [hasRange ? 'Clients with activity in period' : 'Total Clients', clients.length],
        ['Total Team Members', activeTeam.length],
        [`Total Tasks${inPeriod}`, issues.length],
        ['Open Tasks', issues.filter((i: any) => !isClosedIssueStatus(i.status, settings)).length],
        ['Closed Tasks', issues.filter((i: any) => isClosedIssueStatus(i.status, settings)).length],
        ...issueStatusRows,
        [`Total Updates Logged${inPeriod}`, updates.length],
        ...dealRows,
      ],
    },
    clients: {
      key: 'clients',
      title: 'Clients',
      headers: ['Client Name', 'Category', 'Status', 'Deal Value (₹)', 'Delivery Status', 'Services', 'Team Members', `Updates${inPeriod}`, `Tasks${inPeriod}`],
      rows: clients.map(({ client: c, activity }) => [
        c.name || '',
        c.category || '—',
        c.status || 'Active',
        Number(c.dealValue) || 0,
        c.deliveryStatus || 'Planned',
        (c.services || []).join(', ') || '—',
        (c.team || []).map((t: string) => teamMemberName(t, allTeam)).join(', ') || '—',
        activity.updates,
        activity.issues,
      ]),
    },
    team: {
      key: 'team',
      title: 'Team',
      headers: ['Name', 'Role', `Tasks given${inPeriod}`, `Updates logged${inPeriod}`],
      rows: team.map(({ member: t, issues: n, updates: u }) => [
        t.name || '',
        t.role || 'Team Member',
        n,
        u,
      ]),
    },
    issues: {
      key: 'issues',
      title: 'Tasks',
      headers: ['Title', 'Client', 'Assignee', 'Priority', 'Status', 'Created', 'Resolved Date', 'Notes'],
      rows: issues.map((i: any) => [
        i.title || '',
        clientName(i.clientId) || i.client || '—',
        issueAssigneeName(i, allTeam),
        i.priority || 'Medium',
        i.status || 'Open',
        toDateKey(i.created || i.createdAt) || '—',
        isClosedIssueStatus(i.status, settings) ? (i.resolvedDate || 'Not recorded') : '—',
        i.notes || i.description || '—',
      ]),
    },
    updates: {
      key: 'updates',
      title: 'Updates',
      headers: ['Client', 'Date', 'Author/Source', 'Update Text'],
      rows: updates.map((u: any) => [
        clientName(u.clientId) || '—',
        u.date || toDateKey(u.timestamp) || '—',
        u.author || 'System/Team',
        u.text || '',
      ]),
    },
  };
}

// The whole report as one Excel workbook, one sheet per tab (header row in bold).
// Rupee columns keep real numbers (so they can be added up) and are shown grouped the Indian way.
export function reportToXlsx(report: Report, when: Date = new Date()): Uint8Array {
  return buildXlsx(SHEET_ORDER.map(key => ({
    name: report[key].title,
    rows: [report[key].headers, ...report[key].rows],
    boldFirstRow: true,
    indianGroupingColumns: report[key].headers.flatMap((h, i) => (h.endsWith('(₹)') ? [i] : [])),
  })), when);
}

// A CSV file for one sheet, as downloaded. It starts with a byte-order mark: without it Excel on Windows
// doesn't know the file is UTF-8 and shows ₹ as "â‚¹".
export function sheetToCsvFile(sheet: { headers: string[]; rows: Cell[][] }): string {
  return '\uFEFF' + sheetToCsv(sheet);
}

// One sheet as CSV text. Every value is quoted when needed, so commas, quotes and line breaks are safe.
// Text starting with = + - @ (or a tab or carriage return) would run as a formula when the file opens in Excel,
// so it gets an apostrophe in front. Numbers are left alone.
export function sheetToCsv(sheet: { headers: string[]; rows: Cell[][] }): string {
  const cell = (v: Cell) => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [sheet.headers, ...sheet.rows].map(row => row.map(cell).join(',')).join('\n');
}
