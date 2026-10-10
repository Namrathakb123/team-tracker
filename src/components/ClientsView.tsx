'use client'

import { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { visibleUpdates } from '../utils/updates';
import { teamMemberName, clientActiveBetween, tidyName, clientWithName } from '../utils/clients';
import { sheetToCsvFile } from '../utils/report';
import { isClosedIssueStatus, isActiveClientStatus } from '../utils/issues';
import { ACTIVE_FILTER } from '../utils/filters';
import { badgeClass, dotClass } from '../utils/colors';
import { formatRupees } from '../utils/money';
import { compareValues } from '../utils/sort';
import { defaultItem } from '../utils/defaults';
import { localDateKey } from '../utils/dates';
import { PageHeader } from './PageHeader';
import { ClientDetail } from './ClientDetail';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, MEDIUM_BUTTON, LARGE_BUTTON, CARD, SECTION_TITLE } from '../utils/styles';
import { Pagination } from './Pagination';
import { downloadCsv } from '../utils/download';

const ITEMS_PER_PAGE = 15;

export function ClientsView({ routeParams, navigateTo, globalDate }: { routeParams?: any, navigateTo?: any, globalDate?: string }) {
  const { data, saveData } = useData();
  const { user } = useAuth();
  
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [assignedTo, setAssignedTo] = useState(''); // a team member's id
  
  // Which client is open comes from the page address (?page=clients&id=...), so links, Refresh and Back all work.
  // It is looked up in the latest data every time, so it always shows current values.
  const selectedClientId: string | null = routeParams?.selectedClientId || null;
  const selectedClient: any = selectedClientId ? (data.clients || []).find((c: any) => c.id === selectedClientId) || null : null;
  const openClient = (id: string | null) => navigateTo('clients', id ? { selectedClientId: id } : undefined);

  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'} | null>(null);

  // Filter Bar States & Hooks (Declared at top level for React Hooks Rules)
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // A filter asked for from another page (the Dashboard's "Active clients" card) is applied once when it arrives.
  const appliedFilterRef = useRef<any>(null);
  useEffect(() => {
    if (!routeParams || appliedFilterRef.current === routeParams) return;
    appliedFilterRef.current = routeParams;
    if (routeParams.statusFilter) setStatusFilter(routeParams.statusFilter);
  }, [routeParams]);
  const [clientPage, setClientPage] = useState(1);
  // Archived clients are hidden from the list unless asked for.
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = (data.clients || []).filter((c: any) => c && c.archived).length;

  useEffect(() => {
    setClientPage(1);
  }, [searchQuery, fromDate, toDate, categoryFilter, statusFilter, sortConfig, showArchived]);

  const filteredClients = useMemo(() => {
    return (data.clients || []).filter((c: any) => {
      if (c.archived && !showArchived) return false;

      // Search query filter
      const q = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        (c.name || '').toLowerCase().includes(q) || 
        (c.category || '').toLowerCase().includes(q) ||
        (c.team || []).some((t: string) => teamMemberName(t, data.team).toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Category filter
      if (categoryFilter && (c.category || '').toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }

      // Status filter
      if (statusFilter === ACTIVE_FILTER ? !isActiveClientStatus(c.status, data.settings) : statusFilter && (c.status || '').toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Date range: clients that were added, or had an update or an issue logged, in those dates.
      if ((fromDate || toDate) && !clientActiveBetween(c, data.updates, data.issues, fromDate, toDate)) return false;

      return true;
    });
  }, [data.clients, data.updates, data.issues, data.team, data.settings, searchQuery, categoryFilter, statusFilter, fromDate, toDate, showArchived]);

  // The table rows in the chosen order. The page buttons then show one page of these.
  const sortedClients = useMemo(() => {
    if (!sortConfig) return filteredClients;
    const valueOf = (c: any) => {
      if (sortConfig.key === 'issues') return (data.issues || []).filter((i: any) => i.clientId === c.id && !isClosedIssueStatus(i.status, data.settings)).length;
      if (sortConfig.key === 'activity') return visibleUpdates(data.updates).filter((u: any) => u.clientId === c.id).length;
      if (sortConfig.key === 'dealValue') return Number(c.dealValue) || 0;
      return c[sortConfig.key] || '';
    };
    // Each client's value is worked out once, then the list is sorted (text ignores capital letters).
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    return filteredClients
      .map((c: any) => ({ client: c, value: valueOf(c) }))
      .sort((a: any, b: any) => direction * compareValues(a.value, b.value))
      .map((x: any) => x.client);
  }, [filteredClients, sortConfig, data.issues, data.updates, data.settings]);

  const totalClientPages = Math.max(1, Math.ceil(sortedClients.length / ITEMS_PER_PAGE));
  // If the current page no longer exists (its last row was removed), show the last page instead.
  useEffect(() => {
    if (clientPage > totalClientPages) setClientPage(totalClientPages);
  }, [clientPage, totalClientPages]);
  const paginatedClients = sortedClients.slice((clientPage - 1) * ITEMS_PER_PAGE, clientPage * ITEMS_PER_PAGE);

  const handleResetFilters = () => {
    setSearchQuery('');
    setFromDate('');
    setToDate('');
    setCategoryFilter('');
    setStatusFilter('');
    setShowArchived(false);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // A client that already has the name being typed in the Add form.
  const nameClash = clientWithName(data.clients, name);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newName = tidyName(name);
    if (!newName || nameClash) return; // the form says why

    const deal = dealValue.trim() === '' ? 0 : Number(dealValue);
    if (!Number.isFinite(deal) || deal < 0) return; // the box's min="0" tells the user why

    const newClient = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      name: newName,
      category: tidyName(category),
      status: defaultItem(data.settings, 'clientStatuses', 'Active'),
      dealValue: deal,
      deliveryStatus: defaultItem(data.settings, 'deliveryStatuses', 'Planned'),
      assignedTo: assignedTo || null,
      services: [],
      team: assignedTo ? [assignedTo] : []
    };

    saveData({ ...data, clients: [...(data.clients || []), newClient] }, 'CLIENT_ADD', `Added client ${newName}`);
    setName('');
    setCategory('');
    setDealValue('');
    setAssignedTo('');
  };

  // Archiving hides a client from lists and pickers but keeps it and all its updates and issues,
  // so it can be restored (Undo right away, or Restore on its page later).
  const [recentlyArchived, setRecentlyArchived] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!recentlyArchived) return;
    const timer = setTimeout(() => setRecentlyArchived(null), 15000);
    return () => clearTimeout(timer);
  }, [recentlyArchived]);

  const setClientArchived = (clientId: string, archived: boolean) => {
    const client = data.clients.find((c: any) => c.id === clientId);
    if (!client) return Promise.resolve(false);
    const change = (c: any) => {
      if (c.id !== clientId) return c;
      const copy = { ...c };
      if (archived) {
        copy.archived = true;
        copy.archivedAt = new Date().toISOString();
        copy.archivedBy = user?.email || null;
      } else {
        delete copy.archived;
        delete copy.archivedAt;
        delete copy.archivedBy;
      }
      return copy;
    };
    return saveData({ ...data, clients: data.clients.map(change) }, archived ? 'CLIENT_ARCHIVE' : 'CLIENT_RESTORE', `${archived ? 'Archived' : 'Restored'} client ${client.name}`);
  };

  const archiveClient = async (client: { id: string; name: string }) => {
    openClient(null);
    if (await setClientArchived(client.id, true)) setRecentlyArchived({ id: client.id, name: client.name });
  };

  const restoreClient = (clientId: string) => {
    setRecentlyArchived(null);
    setClientArchived(clientId, false);
  };

  if (selectedClient) {
    return (
      <ClientDetail
        key={selectedClient.id}
        client={selectedClient}
        navigateTo={navigateTo}
        globalDate={globalDate}
        onClose={() => openClient(null)}
        onArchive={archiveClient}
        onRestore={restoreClient}
      />
    );
  }

  // Downloads the clients shown (every page, in the order shown) as a CSV file.
  const handleExportCSV = () => {
    const headers = [
      'Client Name',
      'Category',
      'Client Status',
      'Delivery Status',
      'Deal Value (₹)',
      'Assigned Team Members',
      'Services',
      'Open Tasks Count',
      'Total Activity Updates'
    ];
    const rows = sortedClients.map((c: any) => [
      c.name || '',
      c.category || '',
      c.status || '',
      c.deliveryStatus || '',
      Number(c.dealValue) || 0,
      (c.team || []).map((t: string) => teamMemberName(t, data.team)).join(', '),
      (c.services || []).join(', '),
      (data.issues || []).filter((i: any) => i.clientId === c.id && !isClosedIssueStatus(i.status, data.settings)).length,
      visibleUpdates(data.updates).filter((u: any) => u.clientId === c.id).length,
    ]);
    downloadCsv(sheetToCsvFile({ headers, rows }), `velvo-clients-${localDateKey()}.csv`);
  };

  // --- MAIN TABLE VIEW ---
  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8 font-sans">
      <PageHeader title="Clients CRM" subtitle="Everything logged against a client, in one place." />

      {recentlyArchived && (
        <div role="status" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-[13px] font-medium flex items-center justify-between gap-3">
          <span>&ldquo;{recentlyArchived.name}&rdquo; was archived. Its updates and tasks are kept.</span>
          <button onClick={() => restoreClient(recentlyArchived.id)} className="shrink-0 font-bold text-amber-900 hover:underline">Undo</button>
        </div>
      )}

      {/* The address points to a record that isn't in the data (removed, or a wrong link). */}
      {selectedClientId && !selectedClient && (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-[13px] font-medium flex items-center justify-between gap-3">
          <span>This client couldn&apos;t be found. It may have been removed, or the link is wrong.</span>
          <button onClick={() => openClient(null)} className="shrink-0 font-bold text-amber-900 hover:underline">Close</button>
        </div>
      )}

      {/* Reference-Styled Filter Bar */}
      <div className={`${CARD} p-4 flex flex-wrap gap-4 items-end`}>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search</label>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-3 text-slate-400"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input aria-label="Search clients" 
              type="text" 
              placeholder="Search by name, team..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">From Date</label>
          <input 
            type="date" 
            title="Show clients added, or with an update or task logged, from this date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">To Date</label>
          <input 
            type="date" 
            title="Show clients added, or with an update or task logged, up to this date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700"
          />
        </div>

        <div className="w-40">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Category Filter</label>
          <select aria-label="Category filter" 
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700 cursor-pointer"
          >
            <option value="">All Categories</option>
            {Array.from(new Set((data.clients || []).map((c: any) => c.category).filter(Boolean))).map((cat: any) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Status Filter</label>
          <select aria-label="Status filter" 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700 cursor-pointer"
          >
            <option value="">All Statuses</option>
            {(data.settings?.activeClientStatuses || []).length > 0 && <option value={ACTIVE_FILTER}>Active ({data.settings.activeClientStatuses.join(', ')})</option>}
            {(data.settings?.clientStatuses || []).map((st: string) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-[13px] font-medium text-slate-600 cursor-pointer select-none pb-2">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="cursor-pointer" />
            Show archived ({archivedCount})
          </label>
        )}

        <button
          onClick={handleResetFilters}
          className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON} flex items-center gap-1.5 shrink-0`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Reset
        </button>

        <button
          onClick={handleExportCSV}
          disabled={sortedClients.length === 0}
          title="Download the clients shown (all pages) as a CSV file"
          className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON} flex items-center gap-1.5 shrink-0`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>
      
      <div className={CARD}>
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className={SECTION_TITLE}>Add New Client</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Name</label>
            <input aria-label="New client's name" 
              type="text" 
              placeholder="e.g. Kalyan" 
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50" 
              value={name} onChange={e => setName(e.target.value)} required 
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Category</label>
            <input aria-label="New client's category" 
              type="text" 
              placeholder="e.g. Real Estate" 
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50" 
              value={category} onChange={e => setCategory(e.target.value)} 
            />
          </div>
          <div className="w-32">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Deal Value (₹)</label>
            <input aria-label="New client's deal value (₹)"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50"
              value={dealValue} onChange={e => setDealValue(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Assign To</label>
            <select aria-label="Assign the new client to" 
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50"
              value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
            >
              <option value="">Unassigned</option>
              {data.team?.filter((t: any) => !t.deleted).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <button type="submit" disabled={!!nameClash} className={`${PRIMARY_BUTTON} ${LARGE_BUTTON} h-[42px]`}>
              Add client
            </button>
          </div>
          {nameClash && (
            <p role="alert" className="basis-full text-[12px] text-amber-700">
              A client called “{nameClash.name}” already exists{nameClash.archived ? ' (archived)' : ''}.{' '}
              <button type="button" onClick={() => openClient(nameClash.id)} className="font-semibold underline hover:text-amber-900">Open it</button>
              {' '}or choose a different name.
            </p>
          )}
        </form>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[720px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {[
                { key: 'name', label: 'Client Name' },
                { key: 'status', label: 'Status' },
                { key: 'dealValue', label: 'Deal Value' },
                { key: 'issues', label: 'Issues', align: 'center' },
                { key: 'activity', label: 'Activity', align: 'center' },
                { key: 'deliveryStatus', label: 'Delivery', align: 'right' }
              ].map(col => (
                <th 
                  key={col.key}
                  className={`px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px] cursor-pointer hover:bg-slate-100 transition-colors group select-none ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  onClick={() => handleSort(col.key)}
                >
                  <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                    {col.label}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${sortConfig?.key === col.key ? 'text-sky-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'} ${sortConfig?.key === col.key && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClients.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-[13px] italic">No clients matching filters</td></tr>
            ) : (
              paginatedClients.map((client: any) => {
                const badgeColor = badgeClass(data.settings, 'clientStatuses', client.status);
                const dotColor = dotClass(data.settings, 'deliveryStatuses', client.deliveryStatus);
                
                const openIssues = (data.issues || []).filter((i:any) => i.clientId === client.id && !isClosedIssueStatus(i.status, data.settings)).length;
                const activityCount = visibleUpdates(data.updates).filter((u:any) => u.clientId === client.id).length;

                return (
                  <tr key={client.id} onClick={() => openClient(client.id)} tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openClient(client.id); } }} className="transition-colors cursor-pointer hover:bg-slate-50 group focus:outline-none focus-visible:bg-sky-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[13px] text-slate-800 group-hover:text-sky-600 transition-colors">
                        {client.name}
                        {client.archived && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Archived</span>}
                      </div>
                      <div className="text-[11px] font-medium text-slate-400 mt-1">{client.category || '—'} · {(client.team || []).length > 0 ? client.team.map((t: string) => teamMemberName(t, data.team)).join(', ') : 'unassigned'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex items-center border rounded-full px-2.5 py-0.5 ${badgeColor} bg-white`}>
                        <span className="font-bold text-[10px] uppercase tracking-wider">{client.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800 text-[14px]">{formatRupees(client.dealValue)}</td>
                    <td className="px-4 py-3 text-center font-mono text-[11px]">
                      {openIssues > 0 ? <span className="text-red-500 font-bold">{openIssues} open</span> : <span className="text-slate-400">0 open</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-400">
                      {activityCount} updates
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
                        <span className="font-bold text-slate-600 text-[11px]">{client.deliveryStatus || 'Planned'}</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* Pagination Bar */}
        <Pagination page={clientPage} totalPages={totalClientPages} setPage={setClientPage} />
      </div>
    </div>
  );
}
