'use client'

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { startOfDay, endOfDay, localDateKey, formatDateTime } from '../utils/dates';
import { sheetToCsvFile } from '../utils/report';
import { formatChange } from '../utils/changes';
import { PageHeader } from './PageHeader';
import { SECONDARY_BUTTON, CARD } from '../utils/styles';
import { Pagination } from './Pagination';
import { downloadCsv } from '../utils/download';

const PAGE_SIZE = 15;
const EXPORT_PAGE_SIZE = 500;
const EXPORT_LIMIT = 20000; // the most entries one export will fetch

// "YYYY-MM-DD HH:MM:SS" in the admin's own time zone (sorts correctly in Excel).
const pad = (n: number) => String(n).padStart(2, '0');
const exportTime = (value: any) => {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : `${localDateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// The audit log is searched and filtered on the server, so every entry can be found, not only the newest ones.
export function AuditLogsView() {
  const { authToken, getToken } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [query, setQuery] = useState(''); // the search as sent, a moment after typing stops
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  // Entries whose full list of changes is open (the first few are always shown).
  const [openChanges, setOpenChanges] = useState<Record<string, boolean>>({});
  const CHANGES_SHOWN = 4;

  // Search once typing stops, rather than on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // New filters start again from the first page.
  useEffect(() => {
    setPage(1);
  }, [query, fromDate, toDate]);

  // The filters as sent to the server. The dates are whole days in the admin's own time zone.
  const filterParams = () => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (fromDate) params.set('from', new Date(startOfDay(fromDate)).toISOString());
    if (toDate) params.set('to', new Date(endOfDay(toDate)).toISOString());
    return params;
  };

  const fetchPage = async (pageNumber: number, pageSize: number) => {
    const params = filterParams();
    params.set('page', String(pageNumber));
    params.set('pageSize', String(pageSize));
    const res = await fetch(`/api/logs?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${await getToken()}` }
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'The audit log could not be loaded.');
    return res.json();
  };

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    setLoading(true);
    fetchPage(page, PAGE_SIZE)
      .then(json => {
        if (cancelled) return;
        setLogs(json.logs || []);
        setTotal(typeof json.total === 'number' ? json.total : (json.logs || []).length);
        setLoadError(null);
      })
      .catch(e => { if (!cancelled) setLoadError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authToken, page, query, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // If the current page no longer exists (fewer entries than before), show the last page instead.
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [page, totalPages, loading]);
  const hasFilters = !!(searchQuery || fromDate || toDate);
  const clearFilters = () => {
    setSearchQuery('');
    setQuery('');
    setFromDate('');
    setToDate('');
  };

  // Everything that matches the filters (not only this page), as a CSV file that Excel opens correctly.
  const handleExport = async () => {
    setExporting(true);
    try {
      const rows: any[] = [];
      for (let p = 1; rows.length < EXPORT_LIMIT; p++) {
        const json = await fetchPage(p, EXPORT_PAGE_SIZE);
        const batch = json.logs || [];
        rows.push(...batch);
        if (batch.length < EXPORT_PAGE_SIZE) break;
      }
      const csv = sheetToCsvFile({
        headers: ['Date and time', 'User', 'Action', 'Details', 'Changes'],
        rows: rows.slice(0, EXPORT_LIMIT).map(log => [
          exportTime(log.timestamp), log.userName || log.userEmail || '', log.action || '', log.details || '',
          (Array.isArray(log.changes) ? log.changes : []).map(formatChange).join('; '),
        ]),
      });
      downloadCsv(csv, `audit-log-${localDateKey()}.csv`);
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="max-w-7xl mx-auto space-y-5 font-sans pb-8">
      <PageHeader title="Audit Logs" subtitle="Immutable record of all system modifications." />

      <div className={`${CARD} overflow-hidden flex flex-col`}>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search</label>
            <input aria-label="Search the audit log"
              type="text"
              placeholder="Search by user, action, or details..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all bg-white font-medium"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">From</label>
            <input aria-label="From" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border border-slate-200 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">To</label>
            <input aria-label="To" type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border border-slate-200 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:border-sky-500" />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className={`${SECONDARY_BUTTON} px-4 py-2.5 text-[13px]`}>
              Clear
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || total === 0}
            title="Download every entry that matches the search and dates as a CSV file"
            className={`${SECONDARY_BUTTON} px-4 py-2.5 text-[13px]`}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100" aria-live="polite">
          {loading ? 'Loading…' : total === 0 ? 'No entries' : `Showing ${firstShown}–${lastShown} of ${total} ${total === 1 ? 'entry' : 'entries'}`}
        </div>
        {loadError && (
          <div role="alert" className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{loadError}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs w-48">Timestamp</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs w-48">User</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs w-40">Action</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && logs.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">{hasFilters ? 'No logs found matching your search.' : 'Nothing has been logged yet.'}</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log._id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="p-4 font-medium text-slate-800">{log.userName || log.userEmail}</td>
                    <td className="p-4">
                      <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-semibold font-mono border border-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600">
                      <div>{log.details}</div>
                      {Array.isArray(log.changes) && log.changes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500" aria-label="What changed">
                          {(openChanges[log._id] ? log.changes : log.changes.slice(0, CHANGES_SHOWN)).map((change: any, i: number) => (
                            <li key={i}>{formatChange(change)}</li>
                          ))}
                          {log.changes.length > CHANGES_SHOWN && (
                            <li>
                              <button onClick={() => setOpenChanges(prev => ({ ...prev, [log._id]: !prev[log._id] }))} className="text-sky-600 hover:underline font-medium">
                                {openChanges[log._id] ? 'Show fewer' : `Show all ${log.changes.length} changes`}
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </div>
  );
}
