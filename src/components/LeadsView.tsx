'use client'

import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { badgeClass } from '../utils/colors';
import { priorityBadgeClass } from '../utils/priorities';
import { compareValues } from '../utils/sort';
import { defaultItem, listOptions } from '../utils/defaults';
import { tidyName, sameName, teamMemberName } from '../utils/clients';
import { localDateKey, endOfWeek, formatDate } from '../utils/dates';
import { leadFilterDate, nextFollowUp, followUpState, phoneOwner } from '../utils/leads';
import { cleanPhone, phoneDigits, phoneProblem } from '../utils/phone';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from './PageHeader';
import { LeadDetail } from './LeadDetail';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, MEDIUM_BUTTON, LARGE_BUTTON, CARD, SECTION_TITLE } from '../utils/styles';
import { Pagination } from './Pagination';

export function LeadsView({ routeParams, navigateTo }: { routeParams?: any, navigateTo?: any }) {
  const { data, saveData } = useData();
  const { user } = useAuth(); 

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilterStart, setDateFilterStart] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('');

  // Which lead is open comes from the page address (?page=leads&id=...), so links, Refresh and Back all work.
  // It is looked up in the latest data every time, so it always shows current values.
  const selectedLeadId: string | null = routeParams?.selectedLeadId || null;
  const selectedLead: any = selectedLeadId ? (data.leads || []).find((l: any) => l.id === selectedLeadId) || null : null;
  const openLead = (id: string | null) => navigateTo('leads', id ? { selectedLeadId: id } : undefined);
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'} | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  const [sourceFilter, setSourceFilter] = useState('');
  // Quick views of follow-ups above the table.
  const [dueView, setDueView] = useState<'all' | 'overdue' | 'today' | 'week'>('all');
  // Where leads come from (a list managed in Customize). The filter also offers any older source still used by a lead.
  const leadSources: string[] = data.settings?.leadSources || [];
  const usedSources = Array.from(new Set((data.leads || []).map((l: any) => tidyName(l.source)).filter(Boolean))) as string[];
  const sourceFilterOptions = [...leadSources, ...usedSources.filter(u => !leadSources.some(s => sameName(s, u)))];
  const [statusFilter, setStatusFilter] = useState('');

  const [leadPage, setLeadPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    setLeadPage(1);
  }, [searchQuery, dateFilterStart, dateFilterEnd, sourceFilter, statusFilter, dueView, sortConfig]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setDateFilterStart('');
    setDateFilterEnd('');
    setSourceFilter('');
    setStatusFilter('');
    setDueView('all');
  };

  // A search that looks like (part of) a phone number also matches by digits, ignoring spaces and dashes.
  const searchDigits = /^[+]?[0-9(). -]+$/.test(cleanPhone(searchQuery)) && phoneDigits(searchQuery).length >= 3 ? phoneDigits(searchQuery) : '';
  const filteredLeads = (data.leads || []).filter((l: any) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
                          (l.name || '').toLowerCase().includes(q) ||
                          (l.phone || '').includes(q) ||
                          (!!searchDigits && phoneDigits(l.phone).includes(searchDigits)) ||
                          (l.businessName || '').toLowerCase().includes(q) ||
                          teamMemberName(l.assignedTo || '', data.team).toLowerCase().includes(q);
    
    if (!matchesSearch) return false;

    if (sourceFilter && !sameName(l.source, sourceFilter)) {
      return false;
    }

    if (statusFilter && (l.status || '').toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }

    // Dates: the lead's next follow-up, or the day it was added if no follow-up is set.
    if (dateFilterStart || dateFilterEnd) {
      const day = leadFilterDate(l);
      if (!day || (dateFilterStart && day < dateFilterStart) || (dateFilterEnd && day > dateFilterEnd)) return false;
    }

    return true;
  });

  // Quick views: overdue, due today, or due this week (today to Sunday). Closed leads are never in them.
  const today = localDateKey();
  const weekEnd = endOfWeek(today);
  const inDueView = {
    all: () => true,
    overdue: (l: any) => followUpState(l, today, data.settings) === 'overdue',
    today: (l: any) => followUpState(l, today, data.settings) === 'today',
    week: (l: any) => ['today', 'upcoming'].includes(followUpState(l, today, data.settings) || '') && (nextFollowUp(l) || '') <= weekEnd,
  };
  const dueCounts = {
    all: filteredLeads.length,
    overdue: filteredLeads.filter(inDueView.overdue).length,
    today: filteredLeads.filter(inDueView.today).length,
    week: filteredLeads.filter(inDueView.week).length,
  };
  const viewLeads = filteredLeads.filter(inDueView[dueView]);

  // Priority and status follow their order in Customize (for example Critical, High, Medium, Low), not the alphabet.
  // Leads with no follow-up date, or a value that isn't in the list, always come last, whichever way it's sorted.
  // Other columns compare text without regard to capital letters.
  const sortedLeads = [...viewLeads].sort((a, b) => {
    // A due view with no column chosen lists the earliest follow-up first.
    if (!sortConfig) return dueView === 'all' ? 0 : compareValues(nextFollowUp(a) || '', nextFollowUp(b) || '');
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    const lastIfMissing = (x: any, y: any, compare: () => number) =>
      x === null || y === null ? (x === null ? (y === null ? 0 : 1) : -1) : direction * compare();
    const position = (list: string[] | undefined, value: string) => {
      const i = (list || []).indexOf(value);
      return i === -1 ? null : i;
    };

    if (sortConfig.key === 'nextActionDate') {
      const aDay = nextFollowUp(a), bDay = nextFollowUp(b);
      return lastIfMissing(aDay, bDay, () => compareValues(aDay, bDay));
    }
    if (sortConfig.key === 'priority' || sortConfig.key === 'status') {
      const list = sortConfig.key === 'priority' ? data.settings?.priorities : data.settings?.leadStatuses;
      const valueOf = (lead: any) => sortConfig.key === 'priority' ? (lead.priority || 'Medium') : lead.status;
      const aPos = position(list, valueOf(a)), bPos = position(list, valueOf(b));
      return lastIfMissing(aPos, bPos, () => (aPos as number) - (bPos as number));
    }
    const textOf = (lead: any) => sortConfig.key === 'assignedTo' ? teamMemberName(lead.assignedTo || '', data.team) : (lead[sortConfig.key] || '');
    return direction * compareValues(textOf(a), textOf(b));
  });

  const totalLeadPages = Math.max(1, Math.ceil(sortedLeads.length / ITEMS_PER_PAGE));
  // If the current page no longer exists (its last row was removed), show the last page instead.
  useEffect(() => {
    if (leadPage > totalLeadPages) setLeadPage(totalLeadPages);
  }, [leadPage, totalLeadPages]);
  const paginatedLeads = sortedLeads.slice((leadPage - 1) * ITEMS_PER_PAGE, leadPage * ITEMS_PER_PAGE);

  const addPhoneProblem = phoneProblem(phone);
  const addPhoneOwner = addPhoneProblem ? null : phoneOwner(data, phone, null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (addPhoneProblem) return; // the form says what's wrong

    const initialStatus = defaultItem(data.settings, 'leadStatuses', 'New');
    
    const newLead = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      name,
      phone: cleanPhone(phone),
      source,
      businessName,
      status: initialStatus,
      assignedTo: assignedTo || null,
      priority,
      history: [{
        id: Date.now().toString() + '1',
        date: new Date().toISOString(),
        actionBy: user?.email?.split('@')[0] || 'System',
        notes: 'Lead created',
        status: initialStatus,
        nextActionDate: ''
      }]
    };

    saveData({ ...data, leads: [...(data.leads || []), newLead] }, 'LEAD_ADD', `Added new lead ${name}`);
    setName(''); setPhone(''); setSource(''); setBusinessName(''); setAssignedTo(''); setPriority('');
  };

  const handlePriorityChange = (lead: any, newPriority: string) => {
    const newData = {
      ...data,
      leads: data.leads.map((l: any) => l.id === lead.id ? { ...l, priority: newPriority } : l)
    };
    saveData(newData, 'LEAD_PRIORITY_UPDATE', `Updated priority for lead ${lead.name}`);
  };

  if (selectedLead) {
    return <LeadDetail key={selectedLead.id} lead={selectedLead} navigateTo={navigateTo} onClose={() => openLead(null)} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-8">
      <PageHeader title="Lead Followups & Pipeline" subtitle="Track lead interactions, schedule followups, and convert leads into clients." />

      {/* The address points to a record that isn't in the data (removed, or a wrong link). */}
      {selectedLeadId && !selectedLead && (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-[13px] font-medium flex items-center justify-between gap-3">
          <span>This lead couldn&apos;t be found. It may have been converted to a client or removed, or the link is wrong.</span>
          <button onClick={() => openLead(null)} className="shrink-0 font-bold text-amber-900 hover:underline">Close</button>
        </div>
      )}
      
      <div className={CARD}>
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className={SECTION_TITLE}>Add New Lead</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Lead Name *</label>
            <input aria-label="New lead's name" 
              type="text" 
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium" 
              value={name} onChange={e => setName(e.target.value)} required 
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Phone Number</label>
            <input aria-label="New lead's phone number"
              type="tel"
              aria-invalid={!!addPhoneProblem}
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium"
              value={phone} onChange={e => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Business Name</label>
            <input aria-label="New lead's business name"
              type="text"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium"
              value={businessName} onChange={e => setBusinessName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Source</label>
            <select aria-label="New lead's source"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white font-medium text-slate-800"
              value={source} onChange={e => setSource(e.target.value)}
            >
              <option value="">Not set</option>
              {leadSources.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Priority *</label>
            <select aria-label="New lead's priority" 
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white font-medium text-slate-800"
              value={priority} onChange={e => setPriority(e.target.value)} required
            >
              <option value="" disabled>Select...</option>
              {data.settings?.priorities?.map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Assign To</label>
            <select aria-label="Assign the new lead to" 
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white font-medium text-slate-800"
              value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
            >
              <option value="">Unassigned</option>
              {data.team?.filter((t: any) => !t.deleted).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <button type="submit" className={`w-full ${PRIMARY_BUTTON} ${LARGE_BUTTON} h-[42px]`}>
              Add Lead
            </button>
          </div>
          {(addPhoneProblem || addPhoneOwner) && (
            <p role="alert" className={`sm:col-span-2 lg:col-span-4 text-[12px] ${addPhoneProblem ? 'text-red-600' : 'text-amber-700'}`}>
              {addPhoneProblem ? `Phone number: ${addPhoneProblem}` : addPhoneOwner}
            </p>
          )}
        </form>
      </div>

      {/* Reference-Styled Filter Bar */}
      <div className={`${CARD} p-4 flex flex-wrap gap-4 items-end`}>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search</label>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-3 text-slate-400"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input aria-label="Search leads" 
              type="text" 
              placeholder="Search by name or phone..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Follow-up from</label>
          <input
            type="date"
            title="Uses each lead's next follow-up date, or the day it was added if no follow-up is set"
            value={dateFilterStart}
            onChange={e => setDateFilterStart(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Follow-up to</label>
          <input
            type="date"
            title="Uses each lead's next follow-up date, or the day it was added if no follow-up is set"
            value={dateFilterEnd}
            onChange={e => setDateFilterEnd(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700"
          />
        </div>

        <div className="w-40">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Source Filter</label>
          <select aria-label="Source filter" 
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-medium text-slate-700 cursor-pointer"
          >
            <option value="">All Sources</option>
            {sourceFilterOptions.map((src: string) => (
              <option key={src} value={src}>{src}</option>
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
            {(data.settings?.leadStatuses || []).map((st: string) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={handleResetFilters}
          className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON} flex items-center gap-1.5 shrink-0`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Reset
        </button>

        {(dateFilterStart || dateFilterEnd) && (
          <p className="basis-full text-[12px] text-slate-500">
            Dates use each lead&apos;s next follow-up, or the day the lead was added if no follow-up is set.
          </p>
        )}
      </div>

      {/* Quick views of follow-ups (closed leads are left out). */}
      <div role="tablist" aria-label="Follow-ups" className="flex flex-wrap gap-2">
        {([
          ['all', 'All leads'],
          ['overdue', 'Overdue'],
          ['today', 'Today'],
          ['week', 'This week'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={dueView === key}
            onClick={() => setDueView(key)}
            title={key === 'week' ? 'Follow-ups due from today to Sunday' : undefined}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${dueView === key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {label}
            <span className={`ml-1.5 ${dueView !== key && key === 'overdue' && dueCounts.overdue > 0 ? 'text-red-600' : dueView === key ? 'text-slate-300' : 'text-slate-400'}`}>{dueCounts[key]}</span>
          </button>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[720px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {[
                { key: 'name', label: 'Lead Name' },
                { key: 'phone', label: 'Phone' },
                { key: 'priority', label: 'Priority' },
                { key: 'status', label: 'Status' },
                { key: 'assignedTo', label: 'Assigned To' },
                { key: 'nextActionDate', label: 'Next Action', align: 'right' }
              ].map(col => (
                <th 
                  key={col.key}
                  className={`px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px] cursor-pointer hover:bg-slate-100 transition-colors group select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => handleSort(col.key)}
                >
                  <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.label}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${sortConfig?.key === col.key ? 'text-sky-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'} ${sortConfig?.key === col.key && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedLeads.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-[13px] font-medium italic">{
                dueView === 'overdue' ? 'No overdue follow-ups.'
                : dueView === 'today' ? 'No follow-ups due today.'
                : dueView === 'week' ? 'No follow-ups due this week.'
                : 'No leads match your criteria.'
              }</td></tr>
            ) : (
              paginatedLeads.map((lead: any) => {
                const nextDate = nextFollowUp(lead);
                // Overdue (red) once the follow-up day has passed, due today (amber); closed leads are never flagged.
                const followUp = followUpState(lead, today, data.settings);
                const prioColorClasses = priorityBadgeClass(lead.priority || 'Medium', data.settings);

                return (
                  <tr key={lead.id} onClick={() => openLead(lead.id)} tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLead(lead.id); } }} className="transition-colors cursor-pointer hover:bg-slate-50 group focus:outline-none focus-visible:bg-sky-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[13px] text-slate-800 group-hover:text-sky-600 transition-colors">{lead.name}</div>
                      <div className="text-[11px] font-medium text-slate-400 mt-1">{lead.businessName || lead.source || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium text-[13px]">
                      {lead.phone || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className={`relative inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 ${prioColorClasses} bg-white`} onClick={e => e.stopPropagation()}>
                        <div className={`w-1.5 h-1.5 rounded-full bg-current opacity-70`}></div>
                        <span className="font-bold text-[10px] uppercase tracking-wider">{lead.priority || 'Medium'}</span>
                        <select
                          value={lead.priority || 'Medium'}
                          onChange={e => handlePriorityChange(lead, e.target.value)}
                          title="Change priority"
                          aria-label={`Priority for ${lead.name}`}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        >
                          {listOptions(data.settings?.priorities, lead.priority || 'Medium').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeClass(data.settings, 'leadStatuses', lead.status)}`}>
                        {lead.status}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium text-[13px]">
                      {lead.assignedTo ? teamMemberName(lead.assignedTo, data.team) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {nextDate ? (
                        <div
                          title={followUp === 'overdue' ? 'Overdue' : followUp === 'today' ? 'Due today' : undefined}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold ${
                            followUp === 'overdue' ? 'bg-red-50 text-red-600 border border-red-100'
                            : followUp === 'today' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                          {followUp === 'today' ? 'Today' : formatDate(nextDate)}
                          {followUp === 'overdue' && <span className="font-semibold">· Overdue</span>}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No date set</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* Pagination Bar */}
        <Pagination page={leadPage} totalPages={totalLeadPages} setPage={setLeadPage} />
      </div>
    </div>
  );
}
