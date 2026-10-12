'use client'

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { localDateKey, formatDate, formatTime, greeting } from '../utils/dates';
import { visibleUpdates, canEditUpdate, canDeleteUpdate } from '../utils/updates';
import { isClosedIssueStatus, isActiveClientStatus } from '../utils/issues';
import { buildReport, sheetToCsvFile, reportToXlsx, type SheetKey } from '../utils/report';
import { priorityBadgeClass } from '../utils/priorities';
import { softClass } from '../utils/colors';
import { formatRupees } from '../utils/money';
import { activeClients, clientLabel } from '../utils/clients';
import { useUpdateEditing } from '../hooks/useUpdateEditing';
import { PageHeader } from './PageHeader';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, CARD, SECTION_TITLE } from '../utils/styles';
import { Pagination } from './Pagination';
import { downloadBlob, downloadCsv } from '../utils/download';
import { URGENT_FILTER, ACTIVE_FILTER } from '../utils/filters';
import { MyDayPanel, NeedsAttentionPanel } from './DashboardPanels';

// A counter card that opens what it counts.
// (A flex column, so its text starts at the top when the card is taller than its text.)
const STAT_CARD = `${CARD} p-4 text-left w-full h-full flex flex-col hover:border-sky-300 hover:bg-sky-50/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`;

export function DashboardView({ globalDate, navigateTo }: { globalDate: string; navigateTo: (view: string, params?: any) => void }) {
  const { user, isAdmin } = useAuth();
  const { data, saveData } = useData();
  // The greeting uses the first name from the Google account (none while sign-in is skipped on this computer).
  const firstName = (user?.displayName || '').trim().split(/\s+/)[0];
  const feedRef = useRef<HTMLDivElement>(null);
  // "Updates today" shows those updates in the feed below.
  const showDayInFeed = () => {
    setFeedDateFilter(globalDate);
    feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [updateText, setUpdateText] = useState('');
  const [clientId, setClientId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedDateFilter, setFeedDateFilter] = useState('');

  const defaultClientId = clientId || (activeClients(data.clients)[0]?.id || '');

  const filteredData = useMemo(() => {
    // Deleted updates are kept (so they can be restored) but not shown or counted.
    const shownUpdates = visibleUpdates(data.updates);
    const updatesForDate = shownUpdates.filter((u: any) => u.date === globalDate);
    // "Closed" and "Active" follow the ticks in Customize.
    const openIssues = (data.issues || []).filter((i: any) => !isClosedIssueStatus(i.status, data.settings));
    // Open issues with a priority an admin marked as urgent in Customize (by default Critical and High).
    const urgentIssues = openIssues.filter((i: any) => (data.settings?.urgentPriorities || []).includes(i.priority));
    // Archived clients don't count as active.
    const activeClientList = activeClients(data.clients).filter((c: any) => isActiveClientStatus(c.status, data.settings));

    return {
      updatesOnDate: updatesForDate.length,
      openIssues: openIssues.length,
      urgentIssues: urgentIssues.length,
      activeClients: activeClientList.length,
      updates: shownUpdates
    };
  }, [data, globalDate]);

  const handleAddUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateText.trim() || !defaultClientId) return;

    const newUpdate = {
      id: Date.now().toString(),
      clientId: defaultClientId,
      author: user?.email || 'Unknown',
      authorEmail: user?.email ? user.email.toLowerCase() : null,
      text: updateText,
      date: globalDate,
      timestamp: Date.now()
    };

    saveData({
      ...data,
      updates: [...(data.updates || []), newUpdate]
    }, 'DASHBOARD_UPDATE', `Added daily update for client ${defaultClientId}`);
    setUpdateText('');
  };

  // Editing, deleting (with Undo) and restoring updates: shared with a client's page.
  const { recentlyDeleted, handleDeleteUpdate, handleRestoreUpdate, editingId, setEditingId, editText, setEditText, startEdit, saveEdit } = useUpdateEditing();

  // Admins can switch the feed to deleted updates and restore them.
  const [showDeleted, setShowDeleted] = useState(false);
  const deletedUpdates = useMemo(() => (data.updates || []).filter((u: any) => u && u.deletedAt), [data.updates]);

  const feedUpdates = useMemo(() => {
    let sorted = [...(showDeleted ? deletedUpdates : filteredData.updates)].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      sorted = sorted.filter(u =>
        (u.text || '').toLowerCase().includes(q) ||
        (u.author || '').toLowerCase().includes(q) ||
        (data.clients?.find((c: any) => c.id === u.clientId)?.name || '').toLowerCase().includes(q)
      );
    }
    if (feedDateFilter) {
      sorted = sorted.filter(u => u.date === feedDateFilter);
    }
    return sorted;
  }, [filteredData.updates, deletedUpdates, showDeleted, searchQuery, feedDateFilter, data.clients]);

  // Feed Pagination
  const [feedPage, setFeedPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    setFeedPage(1);
  }, [searchQuery, feedDateFilter, showDeleted]);

  const totalFeedPages = Math.max(1, Math.ceil(feedUpdates.length / ITEMS_PER_PAGE));
  // If the current page no longer exists (its last row was removed), show the last page instead.
  useEffect(() => {
    if (feedPage > totalFeedPages) setFeedPage(totalFeedPages);
  }, [feedPage, totalFeedPages]);
  const paginatedFeedUpdates = feedUpdates.slice((feedPage - 1) * ITEMS_PER_PAGE, feedPage * ITEMS_PER_PAGE);

  // Report & Sheet Preview States
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<'summary' | 'clients' | 'team' | 'issues' | 'updates'>('summary');

  // One set of sheets for both the preview and the downloads (see utils/report.ts).
  const report = useMemo(() => buildReport(data, {
    from: reportFromDate,
    to: reportToDate,
    // The person who is signed in (their Google name, or the first part of their email); blank if unknown.
    owner: user?.displayName || (user?.email ? user.email.split('@')[0] : ''),
  }), [data, reportFromDate, reportToDate, user]);

  // One tab as a CSV file.
  const handleDownloadSheet = (key: SheetKey) => {
    downloadCsv(sheetToCsvFile(report[key]), `velvo-report-${key}-${localDateKey()}.csv`);
  };

  // The whole report as one Excel workbook (browsers often block several downloads started at once).
  const handleDownloadAllReport = () => {
    downloadBlob(
      new Blob([reportToXlsx(report) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `velvo-report-${localDateKey()}.xlsx`
    );
  };

  // Preview styling, per column (the downloaded files have no styling).
  const hasReportRange = !!(reportFromDate || reportToDate);
  const emptySheetText: Record<SheetKey, string> = {
    summary: '',
    clients: hasReportRange ? 'No clients with activity in this period' : 'No clients found',
    team: 'No team members found',
    issues: 'No tasks found for criteria',
    updates: 'No updates found for criteria',
  };
  const summaryValueClass = (label: string) => {
    if (label.startsWith('Deal Value')) return 'text-slate-900 font-black font-mono';
    if (label === 'Open Tasks') return 'text-red-600 font-bold';
    if (label === 'Closed Tasks') return 'text-emerald-600 font-bold';
    if (label === 'Owner' || label === 'Period') return 'text-slate-700 font-medium';
    return 'text-slate-700 font-bold';
  };
  const previewCellClass = (sheet: SheetKey, header: string, value: string | number) => {
    if (header === 'Client Name' || header === 'Name' || header === 'Title' || (sheet === 'updates' && header === 'Client')) return 'font-bold text-slate-800';
    // Statuses are coloured by meaning (or the colour picked in Customize), not by their place in the list.
    if (header === 'Status') return `font-bold ${softClass(data.settings, sheet === 'clients' ? 'clientStatuses' : 'issueStatuses', String(value))}`;
    if (header === 'Priority') return `font-medium ${priorityBadgeClass(String(value), data.settings)}`;
    if (header === 'Deal Value ($)' || header === 'Deal Value (₹)') return 'font-mono font-bold';
    if (header === 'Delivery Status') return `font-medium ${softClass(data.settings, 'deliveryStatuses', String(value))}`;
    if (header === 'Services') return 'text-slate-600 font-mono text-[11px]';
    if (header === 'Created' || header === 'Resolved Date' || header === 'Date') return 'font-mono text-slate-600';
    if (header === 'Notes') return 'text-slate-600 max-w-xs truncate';
    if (header === 'Category') return 'text-slate-600';
    if (typeof value === 'number') return 'font-mono text-slate-700 text-center';
    return 'text-slate-700';
  };

  // The first counter follows the date picked in the sidebar; the other three are current totals.
  const isToday = globalDate === localDateKey();
  const pickedDay = formatDate(globalDate) || globalDate;

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8 font-sans">
      <PageHeader title={`${greeting()}${firstName ? `, ${firstName}` : ''}`} subtitle={`Viewing data for ${formatDate(globalDate, { weekday: true })}`} />

      {/* Row 1: the four counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button type="button" onClick={showDayInFeed} title="Show these updates in the feed below" className={STAT_CARD}>
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isToday ? 'Updates today' : `Updates on ${pickedDay}`}</span>
          <span className="block text-2xl font-extrabold text-slate-800 mt-2">{filteredData.updatesOnDate}</span>
          <span className="block text-[11px] text-slate-400 mt-1">For the date picked in the sidebar</span>
        </button>
        <button type="button" onClick={() => navigateTo('issues')} title="Open the Tasks page" className={STAT_CARD}>
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Open tasks</span>
          <span className={`block text-2xl font-extrabold mt-2 ${filteredData.openIssues > 0 ? 'text-red-500' : 'text-slate-800'}`}>
            {filteredData.openIssues}
          </span>
          <span className="block text-[11px] text-slate-400 mt-1">Current total</span>
        </button>
        <button type="button" onClick={() => navigateTo('issues', { priorityFilter: URGENT_FILTER })} title="See the urgent tasks" className={STAT_CARD}>
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Urgent tasks</span>
          <span className={`block text-2xl font-extrabold mt-2 ${filteredData.urgentIssues > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
            {filteredData.urgentIssues}
          </span>
          <span className="block text-[11px] text-slate-400 mt-1">
            Current total · {(data.settings?.urgentPriorities || []).length ? data.settings.urgentPriorities.join(', ') : 'no priority is marked urgent'}
          </span>
        </button>
        <button type="button" onClick={() => navigateTo('clients', { statusFilter: ACTIVE_FILTER })} title="See the active clients" className={STAT_CARD}>
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Clients</span>
          <span className="block text-2xl font-extrabold text-slate-800 mt-2">{filteredData.activeClients}</span>
          <span className="block text-[11px] text-slate-400 mt-1">
            Current total · {(data.settings?.activeClientStatuses || []).length ? data.settings.activeClientStatuses.join(', ') : 'no client status is marked active'}
          </span>
        </button>
      </div>

      {/* Row 2: log an update, and the day ahead */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} h-full flex flex-col min-w-0`}>
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              LOG A DAILY UPDATE
            </h3>
          </div>
          <form onSubmit={handleAddUpdate} className="p-4 space-y-3 flex-1 flex flex-col">
            <div>
              <select aria-label="Client" 
                value={clientId} 
                onChange={e => setClientId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 transition-all font-medium text-slate-700"
                required
              >
                <option value="" disabled>Select a client...</option>
                {activeClients(data.clients).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex-1 flex flex-col">
              <textarea aria-label="New update" 
                value={updateText}
                onChange={e => setUpdateText(e.target.value)}
                placeholder="What happened today?"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-[13px] min-h-[100px] resize-none focus:outline-none focus:border-sky-500 transition-all flex-1 text-slate-700"
                required
              />
            </div>
            <button 
              type="submit" 
              className={`w-full ${PRIMARY_BUTTON} py-2.5 text-[13px] mt-2`}
            >
              Add Update
            </button>
          </form>
        </div>
        <MyDayPanel day={globalDate} navigateTo={navigateTo} />
      </div>

      {/* Row 3: the updates feed, and what needs attention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div ref={feedRef} className={`${CARD} scroll-mt-4 flex flex-col min-w-0 lg:h-[680px]`}>
          <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              {showDeleted ? 'DELETED UPDATES' : 'RECENT UPDATES'}
            </h3>
            <div className="flex items-center gap-3">
              {isAdmin && (deletedUpdates.length > 0 || showDeleted) && (
                <button
                  onClick={() => setShowDeleted(v => !v)}
                  className="text-[11px] font-bold text-slate-500 hover:text-sky-600 transition-colors"
                >
                  {showDeleted ? 'Back to updates' : `Deleted (${deletedUpdates.length})`}
                </button>
              )}
              <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full">{feedUpdates.length} {showDeleted ? 'deleted' : 'total'}</span>
            </div>
          </div>

          {recentlyDeleted && (
            <div role="status" className="px-4 py-2.5 border-b border-amber-100 bg-amber-50 text-amber-800 text-[13px] font-medium flex items-center justify-between gap-3">
              <span>Update deleted.</span>
              <button onClick={() => handleRestoreUpdate(recentlyDeleted)} className="font-bold text-amber-900 hover:underline">Undo</button>
            </div>
          )}
        
          <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row gap-3 bg-white">
            <div className="relative">
              <input aria-label="Show updates for a day" 
                type="date" 
                value={feedDateFilter}
                onChange={e => setFeedDateFilter(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg p-2 text-[12px] font-medium text-slate-700 focus:outline-none focus:border-sky-500"
              />
              {feedDateFilter && (
                <button onClick={() => setFeedDateFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              )}
            </div>
            <div className="flex-1 relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input aria-label="Search updates" 
                type="text" 
                placeholder="Search updates..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full border border-slate-200 rounded-lg py-2 pl-9 pr-4 text-[13px] focus:outline-none focus:border-sky-500 placeholder:text-slate-400"
              />
            </div>
          </div>
        
          <div className="divide-y divide-slate-100 max-h-[800px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto">
            {feedUpdates.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-[13px] font-medium italic">{showDeleted ? 'No deleted updates.' : 'No updates found for your criteria.'}</div>
            ) : (
              paginatedFeedUpdates.map((u: any) => {
                return (
                  <div key={u.id} className="p-4 hover:bg-slate-50/50 transition-colors group">
                    <div className="flex justify-between items-start gap-4 mb-2">
                      {u.clientId ? (
                        <button type="button" onClick={() => navigateTo('clients', { selectedClientId: u.clientId })} title="Open this client" className="font-extrabold text-slate-800 text-[14px] text-left hover:text-sky-600 transition-colors flex items-center gap-2">
                          {clientLabel(data.clients, u.clientId, 'No client')}
                        </button>
                      ) : (
                        <div className="font-extrabold text-slate-800 text-[14px]">No client</div>
                      )}
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                        {/* Older records may have no author or no time; show what is known instead of failing. */}
                        <span className="font-sans font-bold text-slate-500 capitalize">{u.author ? String(u.author).split('@')[0] : 'Unknown'}</span>
                        <span className="opacity-50">•</span>
                        {formatDate(u.date || u.timestamp)}{u.timestamp ? `, ${formatTime(u.timestamp)}` : ''}
                        {u.editedAt && <span className="font-sans italic">(edited)</span>}
                      </div>
                    </div>
                  
                    {editingId === u.id ? (
                      <div className="mb-3 space-y-2">
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          aria-label="Update text"
                          className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-[13px] min-h-[80px] focus:outline-none focus:border-sky-500 text-slate-700"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(u)} disabled={!editText.trim()} className={`${PRIMARY_BUTTON} ${SMALL_BUTTON}`}>Save</button>
                          <button onClick={() => setEditingId(null)} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON}`}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-700 text-[13px] leading-relaxed mb-3 whitespace-pre-wrap">
                        {u.text}
                      </div>
                    )}

                    {showDeleted ? (
                      <div className="flex gap-4 items-center text-[11px]">
                        <span className="text-slate-400">
                          Deleted{u.deletedBy ? ` by ${String(u.deletedBy).split('@')[0]}` : ''} on {formatDate(u.deletedAt)}
                        </span>
                        <button onClick={() => handleRestoreUpdate(u.id)} className="font-bold text-sky-600 hover:underline">RESTORE</button>
                      </div>
                    ) : editingId !== u.id && (
                    // Always shown on touch screens. With a mouse they appear on hover, or when reached with the keyboard.
                    <div className="flex gap-4 items-center transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
                      <button 
                        onClick={() => navigateTo('issues', { selectedClientId: u.clientId, prefillNotes: u.text })}
                        className="text-[11px] font-bold text-slate-400 hover:text-amber-600 flex items-center gap-1 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        MAKE A TASK
                      </button>
                      {canEditUpdate(u, user?.email) && (
                        <button
                          onClick={() => startEdit(u)}
                          className="text-[11px] font-bold text-slate-400 hover:text-sky-600 flex items-center gap-1 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                          EDIT
                        </button>
                      )}
                      {canDeleteUpdate(u, user?.email, isAdmin) && (
                        <button
                          onClick={() => handleDeleteUpdate(u)}
                          className="text-[11px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          DELETE
                        </button>
                      )}
                    </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Bar */}
          <Pagination page={feedPage} totalPages={totalFeedPages} setPage={setFeedPage} />
        </div>
        <NeedsAttentionPanel navigateTo={navigateTo} />
      </div>

      {/* Row 4: the report (preview and Excel download) */}
      <div className={`${CARD} p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div>
          <h2 className={`${SECTION_TITLE} flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Client Delivery Dashboard Report
          </h2>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">Filter date range to preview sheets or export worksheets.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">FROM:</span>
            <input aria-label="Report from" 
              type="date" 
              value={reportFromDate}
              onChange={e => setReportFromDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 text-slate-700 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">TO:</span>
            <input aria-label="Report to" 
              type="date" 
              value={reportToDate}
              onChange={e => setReportToDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 text-slate-700 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>
          {(reportFromDate || reportToDate) && (
            <button onClick={() => { setReportFromDate(''); setReportToDate(''); }} className="text-xs text-red-500 font-bold hover:underline px-1">Reset</button>
          )}

          {/* Eye SVG Preview Button (Blue) */}
          <button 
            onClick={() => setShowReportPreview(!showReportPreview)}
            title={showReportPreview ? "Hide Report Preview" : "Preview Client Delivery Dashboard Report"}
            className={`${PRIMARY_BUTTON} p-2 shadow-sm flex items-center justify-center ml-1`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>

          {/* Download SVG Icon Button (Green) */}
          <button 
            onClick={handleDownloadAllReport}
            title="Download the report as one Excel workbook"
            className="p-2 bg-[#00a86b] hover:bg-[#00965e] text-white rounded-lg transition-colors shadow-sm flex items-center justify-center cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
      </div>

       {/* --- EXCEL REPORT & PREVIEW SECTION (Toggleable via Eye Button) --- */}
      {showReportPreview && (
        <div className={`${CARD} overflow-hidden font-sans`}>
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className={`${SECTION_TITLE} flex items-center gap-2`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Client Delivery Dashboard Report
              </h2>
              <p className="text-slate-500 text-xs mt-0.5 font-medium">Live sheet preview & downloadable Excel workbook format.</p>
            </div>

            <button 
              onClick={() => setShowReportPreview(false)}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              title="Close Preview"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Tab Header (Styled like Excel Worksheets) */}
          <div className="flex border-b border-slate-200 bg-slate-100/70 overflow-x-auto text-xs font-medium">
            <button 
              onClick={() => setActiveReportTab('summary')}
              className={`px-5 py-2.5 border-r border-slate-200 flex items-center gap-2 transition-colors ${activeReportTab === 'summary' ? 'bg-white font-extrabold text-emerald-700 border-t-2 border-t-emerald-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              Summary
            </button>
            <button 
              onClick={() => setActiveReportTab('clients')}
              className={`px-5 py-2.5 border-r border-slate-200 flex items-center gap-2 transition-colors ${activeReportTab === 'clients' ? 'bg-white font-extrabold text-emerald-700 border-t-2 border-t-emerald-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              Clients
            </button>
            <button 
              onClick={() => setActiveReportTab('team')}
              className={`px-5 py-2.5 border-r border-slate-200 flex items-center gap-2 transition-colors ${activeReportTab === 'team' ? 'bg-white font-extrabold text-emerald-700 border-t-2 border-t-emerald-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              Team
            </button>
            <button 
              onClick={() => setActiveReportTab('issues')}
              className={`px-5 py-2.5 border-r border-slate-200 flex items-center gap-2 transition-colors ${activeReportTab === 'issues' ? 'bg-white font-extrabold text-emerald-700 border-t-2 border-t-emerald-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              Issues
            </button>
            <button 
              onClick={() => setActiveReportTab('updates')}
              className={`px-5 py-2.5 border-r border-slate-200 flex items-center gap-2 transition-colors ${activeReportTab === 'updates' ? 'bg-white font-extrabold text-emerald-700 border-t-2 border-t-emerald-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              Updates
            </button>
            
            <div className="flex-1 bg-slate-100/70 flex items-center justify-end px-4">
              <button 
                onClick={() => handleDownloadSheet(activeReportTab)}
                title={`Download ${activeReportTab.toUpperCase()} Sheet CSV`}
                className="text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </div>
          </div>

          {/* Tab Content Preview (Excel Grid Styling) */}
          <div className="p-4 overflow-x-auto bg-white min-h-[260px]">
            {activeReportTab === 'summary' ? (
              <div className="space-y-4 max-w-xl font-sans">
                <h3 className="text-lg font-bold text-[#1b4965] border-b-2 border-[#1b4965] pb-1 inline-block">
                  Client Delivery Dashboard — Summary
                </h3>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {report.summary.rows.slice(1).map(row => {
                      const label = String(row[0]);
                      const isDeal = label.startsWith('Deal Value');
                      return (
                        <tr key={label} className={`border-b border-slate-200 ${isDeal ? 'bg-slate-50' : ''}`}>
                          <td className={`py-2 w-1/2 ${isDeal ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}`}>{label}</td>
                          <td className={`py-2 ${summaryValueClass(label)}`}>{row[1]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <table className="w-full text-left text-xs border border-slate-200 border-collapse">
                <thead className="bg-[#1b4965] text-white">
                  <tr>
                    {report[activeReportTab].headers.map(h => (
                      <th key={h} className="p-2.5 font-bold border border-slate-300">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report[activeReportTab].rows.length === 0 ? (
                    <tr>
                      <td colSpan={report[activeReportTab].headers.length} className="p-4 text-center text-slate-400 italic">
                        {emptySheetText[activeReportTab]}
                      </td>
                    </tr>
                  ) : (
                    report[activeReportTab].rows.map((row, r) => (
                      <tr key={r} className="hover:bg-slate-50">
                        {row.map((value, c) => {
                          const header = report[activeReportTab].headers[c];
                          return (
                            <td key={c} className={`p-2 border border-slate-200 ${previewCellClass(activeReportTab, header, value)}`}>
                              {(header === 'Deal Value ($)' || header === 'Deal Value (₹)') ? formatRupees(value)
                                : (header === 'Created' || header === 'Resolved Date' || header === 'Date') && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(value)) ? formatDate(String(value))
                                : value}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
