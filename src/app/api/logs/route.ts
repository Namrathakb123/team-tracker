import { NextResponse, NextRequest } from 'next/server';
import { verifyToken, requireAdmin, errorResponse } from '../utils';
import { findLogs } from '../store';

// Audit log entries, newest first, one page at a time, searched on the server so every entry can be found (not
// only the newest ones). Optional filters in the address:
//   q         text to look for in the user, action, details or changes (capitals don't matter)
//   from, to  ISO date-times (the page sends the start and end of the chosen days in the admin's own time zone)
//   page, pageSize   which page (from 1) and how many per page (at most 500)
// A search looks through the newest 5,000 entries in the chosen dates; `limited` says when there were more.
const MAX_PAGE_SIZE = 500;
const readDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

export async function GET(req: NextRequest) {
  try {
    const user = await verifyToken(req);

    // The audit log is for admins only, matching the Audit Logs page.
    requireAdmin(user);

    const params = new URL(req.url).searchParams;
    const q = (params.get('q') || '').trim().slice(0, 200);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(params.get('pageSize')) || 50)));
    const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));

    const { logs, total, limited } = await findLogs({ q, from: readDate(params.get('from')), to: readDate(params.get('to')), page, pageSize });
    return NextResponse.json({ logs, total, page, pageSize, limited });
  } catch (error) {
    return errorResponse(error, '/logs', 'Access denied. Audit logs are for admins only.');
  }
}
