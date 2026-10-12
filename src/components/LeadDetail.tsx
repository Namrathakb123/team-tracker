'use client'

import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import { badgeClass } from '../utils/colors';
import { defaultItem, listOptions } from '../utils/defaults';
import { tidyName, clientWithName, teamMemberName } from '../utils/clients';
import { formatDate, formatTime } from '../utils/dates';
import { isClosedLeadStatus, nextFollowUp, phoneOwner } from '../utils/leads';
import { formatRupees } from '../utils/money';
import { cleanPhone, phoneProblem, phoneLink } from '../utils/phone';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_OUTLINE_BUTTON, MEDIUM_BUTTON, CARD, DIALOG, SECTION_TITLE, DIALOG_TITLE } from '../utils/styles';

// One lead's page: contact details, logging an interaction, the history, and the Convert and Edit windows.
// LeadsView shows it with key={lead.id}, so everything typed or opened here starts fresh for each lead.
export function LeadDetail({ lead: selectedLead, navigateTo, onClose }: {
  lead: any;
  navigateTo: any;
  // Back to the list.
  onClose: () => void;
}) {
  const { data, saveData } = useData();
  const confirm = useConfirm();
  const { user } = useAuth();
  // Where leads come from (a list managed in Customize), for the Edit window's Source box.
  const leadSources: string[] = data.settings?.leadSources || [];

  // A client that already has this lead's name (converting would make a second client with the same name).
  const leadNameClash = selectedLead ? clientWithName(data.clients, selectedLead.name) : null;

  const [updateStatus, setUpdateStatus] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [notes, setNotes] = useState('');

  // Edit Info Modal State
  const [isEditing, setIsEditing] = useState(false);
  // Converting a lead: a small window asks for the client's category and deal value.
  const [converting, setConverting] = useState(false);
  const [convertCategory, setConvertCategory] = useState('');
  const [convertDeal, setConvertDeal] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [phoneCopied, setPhoneCopied] = useState<'yes' | 'failed' | null>(null);

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(cleanPhone(selectedLead?.phone));
      setPhoneCopied('yes');
    } catch {
      setPhoneCopied('failed');
    }
    setTimeout(() => setPhoneCopied(null), 2000);
  };

  useEffect(() => {
    if (selectedLead && !updateStatus) {
      setUpdateStatus(selectedLead.status);
    }
  }, [selectedLead, updateStatus]);

  // A closed status (ticked "Closed" in Customize) needs no next follow-up.
  const closingLead = isClosedLeadStatus(updateStatus, data.settings);

  const handleUpdateStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateStatus) return;
    if (!closingLead && !nextActionDate) return; // the date box says it's needed

    const newHistoryItem = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      actionBy: user?.email?.split('@')[0] || 'System',
      notes,
      status: updateStatus,
      nextActionDate: closingLead ? '' : nextActionDate
    };

    const newLeadData = {
      ...selectedLead,
      status: updateStatus,
      history: [newHistoryItem, ...(selectedLead.history || [])]
    };

    const newData = {
      ...data,
      leads: data.leads.map((l: any) => l.id === selectedLead.id ? newLeadData : l)
    };

    saveData(newData, 'LEAD_UPDATE', `Logged interaction for ${selectedLead.name}. Status: ${updateStatus}`);
    
    setNotes('');
    setNextActionDate('');
  };

  const convertToClient = () => {
    if (leadNameClash) return; // the page says why
    setConvertCategory('');
    setConvertDeal('');
    setConverting(true);
  };

  const confirmConvert = (e: React.FormEvent) => {
    e.preventDefault();
    if (leadNameClash) return;
    const deal = convertDeal.trim() === '' ? 0 : Number(convertDeal);
    if (!Number.isFinite(deal) || deal < 0) return; // the box's min="0" tells the user why

    const now = new Date();
    const leadOwnerId = selectedLead.assignedTo || null; // a team member's id
    const convertedEntry = {
      id: `${now.getTime()}c`,
      date: now.toISOString(),
      actionBy: user?.email?.split('@')[0] || 'System',
      notes: 'Converted to client',
      status: selectedLead.status,
      nextActionDate: ''
    };
    const newClient = {
      id: String(now.getTime()),
      createdAt: now.toISOString(),
      name: tidyName(selectedLead.name),
      category: tidyName(convertCategory),
      status: defaultItem(data.settings, 'clientStatuses', 'Active'),
      dealValue: deal,
      deliveryStatus: defaultItem(data.settings, 'deliveryStatuses', 'Planned'),
      assignedTo: leadOwnerId,
      services: [],
      team: leadOwnerId ? [leadOwnerId] : [],
      // Everything the lead had (phone, business name, source, priority, when it was added and its whole history).
      fromLead: { ...selectedLead, history: [convertedEntry, ...(selectedLead.history || [])] }
    };

    const newData = {
      ...data,
      leads: data.leads.filter((l: any) => l.id !== selectedLead.id),
      clients: [...(data.clients || []), newClient]
    };

    saveData(newData, 'LEAD_CONVERT', `Converted lead ${selectedLead.name} to client${deal ? ` (deal value ${formatRupees(deal)})` : ''}`);
    setConverting(false);
    navigateTo('clients', { selectedClientId: newClient.id });
  };

  const deleteLead = async () => {
    const ok = await confirm({
      title: `Delete the lead “${selectedLead.name}”?`,
      message: 'The lead and its whole history are removed. This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const newData = {
      ...data,
      leads: data.leads.filter((l: any) => l.id !== selectedLead.id)
    };
    saveData(newData, 'LEAD_DELETE', `Deleted lead ${selectedLead.name}`);
    onClose();
  };

  const openEditModal = () => {
    setEditName(selectedLead.name);
    setEditPhone(selectedLead.phone || '');
    setEditSource(selectedLead.source || '');
    setEditBusinessName(selectedLead.businessName || '');
    setEditAssignee(selectedLead.assignedTo || '');
    setEditPriority(selectedLead.priority || '');
    setIsEditing(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneProblem(editPhone)) return; // the window says what's wrong
    const updated = {
      name: editName.trim() || selectedLead.name,
      phone: cleanPhone(editPhone),
      source: editSource,
      businessName: editBusinessName.trim(),
      assignedTo: editAssignee,
      priority: editPriority || selectedLead.priority
    };
    // What changed, for the lead's history and the audit log.
    const changes: string[] = [];
    const compare = (label: string, before: any, after: any) => {
      if ((before || '') !== (after || '')) changes.push(`${label}: ${before || '—'} → ${after || '—'}`);
    };
    compare('Name', selectedLead.name, updated.name);
    compare('Phone', selectedLead.phone, updated.phone);
    compare('Source', selectedLead.source, updated.source);
    compare('Business name', selectedLead.businessName, updated.businessName);
    compare('Assigned to', selectedLead.assignedTo && teamMemberName(selectedLead.assignedTo, data.team), updated.assignedTo && teamMemberName(updated.assignedTo, data.team));
    compare('Priority', selectedLead.priority, updated.priority);
    if (changes.length === 0) {
      setIsEditing(false);
      return;
    }
    // The entry keeps the status and next follow-up: the newest entry is what the follow-up views read.
    const editEntry = {
      id: `${Date.now()}e`,
      date: new Date().toISOString(),
      actionBy: user?.email?.split('@')[0] || 'System',
      notes: `Edited details. ${changes.join('; ')}`,
      status: selectedLead.status,
      nextActionDate: nextFollowUp(selectedLead) || ''
    };
    const newData = {
      ...data,
      leads: data.leads.map((l: any) => l.id === selectedLead.id ? { ...l, ...updated, history: [editEntry, ...(l.history || [])] } : l)
    };
    saveData(newData, 'LEAD_EDIT', `Edited details for ${updated.name}: ${changes.join('; ')}`);
    setIsEditing(false);
  };

  const history = selectedLead.history || [];

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-12 font-sans">
      <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2 text-[13px] font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        Back to Leads
      </button>

      <div className={`${CARD} p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div>
          <div className="text-[10px] font-bold text-sky-500 tracking-widest uppercase mb-1">Lead Profile (ID: LEADS-{selectedLead.id.slice(-4)})</div>
          <h1 className="text-xl font-extrabold text-slate-800 tracking-tight mb-3">{selectedLead.name}</h1>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeClass(data.settings, 'leadStatuses', selectedLead.status)}`}>
              {selectedLead.status}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:justify-end md:max-w-md">
          <button onClick={convertToClient} disabled={!!leadNameClash} className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
            Convert
          </button>
          <button onClick={openEditModal} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON} flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Edit
          </button>
          <button onClick={deleteLead} className={`${DANGER_OUTLINE_BUTTON} ${MEDIUM_BUTTON}`}>
            Delete
          </button>
          {leadNameClash && (
            <p role="alert" className="basis-full text-[12px] text-amber-700 md:text-right">
              A client called “{leadNameClash.name}” already exists{leadNameClash.archived ? ' (archived)' : ''}, so this lead can’t be converted.{' '}
              <button type="button" onClick={() => navigateTo('clients', { selectedClientId: leadNameClash.id })} className="font-semibold underline hover:text-amber-900">Open the client</button>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contact Information Card */}
        <div className={`${CARD} flex flex-col h-full`}>
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Contact Information
            </h3>
          </div>
          
          <div className="p-4 grid grid-cols-2 gap-4 flex-1">
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Lead Source</div>
              <div className="text-[13px] font-medium text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{selectedLead.source || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Business Name</div>
              <div className="text-[13px] font-medium text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{selectedLead.businessName || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Priority Level</div>
              <div className="text-[13px] font-medium text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{selectedLead.priority || 'Medium'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Assigned To</div>
              <div className="text-[13px] font-medium text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{selectedLead.assignedTo ? teamMemberName(selectedLead.assignedTo, data.team) : 'Unassigned'}</div>
            </div>
          </div>
          
          <div className="m-4 mt-0 bg-sky-50 rounded-lg p-3 border border-sky-100">
            <div className="text-[10px] font-bold text-sky-600 tracking-widest uppercase mb-1">Direct Phone</div>
            {selectedLead.phone ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a href={phoneLink(selectedLead.phone)} title="Call this number" className="text-[15px] font-bold text-sky-900 hover:underline flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  {selectedLead.phone}
                </a>
                <button type="button" onClick={copyPhone} className={`${SECONDARY_BUTTON} px-2.5 py-1 text-[12px]`}>
                  {phoneCopied === 'yes' ? 'Copied' : phoneCopied === 'failed' ? 'Couldn’t copy' : 'Copy'}
                </button>
              </div>
            ) : (
              <div className="text-[13px] text-slate-500">No phone number yet. Add one with Edit.</div>
            )}
          </div>
        </div>

        {/* Update Lead Status Card */}
        <div className={`${CARD} flex flex-col h-full`}>
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Log an Interaction
            </h3>
          </div>
          
          <form onSubmit={handleUpdateStatus} className="p-4 space-y-4 flex-1 flex flex-col">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">New Status</label>
                <select aria-label="New status"
                  value={updateStatus}
                  onChange={e => {
                    setUpdateStatus(e.target.value);
                    if (isClosedLeadStatus(e.target.value, data.settings)) setNextActionDate('');
                  }} 
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50 font-medium text-slate-700"
                >
                  {listOptions(data.settings?.leadStatuses, selectedLead.status).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                  Next Follow-up {closingLead ? null : <span className="text-red-500">*</span>}
                </label>
                <input aria-label="Next follow-up"
                  type="date"
                  value={nextActionDate}
                  onChange={e=>setNextActionDate(e.target.value)}
                  required={!closingLead}
                  disabled={closingLead}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50 text-slate-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {closingLead && <p className="mt-1 text-[11px] text-slate-500">Not needed: this status closes the lead.</p>}
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Interaction Notes</label>
              <textarea aria-label="Interaction notes" 
                value={notes} 
                onChange={e=>setNotes(e.target.value)}
                placeholder="e.g. Left a voicemail. Will try again on Monday."
                className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50 min-h-[100px] flex-1 text-slate-700 resize-none font-medium"
                required
              ></textarea>
            </div>

            <button type="submit" className={`w-full ${PRIMARY_BUTTON} py-2.5 text-[13px] mt-auto`}>
              Save Interaction
            </button>
          </form>
        </div>
      </div>

      {/* Interaction History Full-Width Card */}
      <div className={`${CARD} mt-4`}>
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Activity History
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]">Date & Time</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]">Action By</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]">Interaction Notes</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]">Status Log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {history.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-[13px] text-slate-400 italic bg-white">No history yet.</td></tr>
              ) : (
                history.map((h: any) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-[13px] text-slate-600 whitespace-nowrap">
                      {formatDate(h.date)}
                      <div className="text-[11px] text-slate-400 mt-0.5">{formatTime(h.date)}</div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-800 font-bold capitalize">
                      {h.actionBy}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 italic">
                      &quot;{h.notes}&quot;
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5 items-start">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border ${badgeClass(data.settings, 'leadStatuses', h.status)}`}>
                          {h.status}
                        </div>
                        {h.nextActionDate && (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-sky-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            Next: {formatDate(h.nextActionDate)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal Overlay */}
      {converting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setConverting(false); }}
          onKeyDown={e => { if (e.key === 'Escape') setConverting(false); }}
        >
          <div role="dialog" aria-modal="true" aria-label="Convert to client" className={`${DIALOG} w-full max-w-md overflow-hidden`}>
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
              <h3 className={DIALOG_TITLE}>Convert {selectedLead.name} to a client</h3>
              <p className="text-[12px] text-slate-500 mt-1">The lead moves to Clients. Its phone, business name, source, priority and whole history are kept on the client&apos;s page.</p>
            </div>
            <form onSubmit={confirmConvert} className="p-4 space-y-4">
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Category</span>
                <input autoFocus value={convertCategory} onChange={e => setConvertCategory(e.target.value)} placeholder="e.g. Real Estate" className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium" />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Deal value ($)</span>
                <input type="number" min="0" step="any" placeholder="0" value={convertDeal} onChange={e => setConvertDeal(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium" />
              </label>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setConverting(false)} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
                <button type="submit" className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>Convert to client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setIsEditing(false); }}
          onKeyDown={e => { if (e.key === 'Escape') setIsEditing(false); }}
        >
          <div role="dialog" aria-modal="true" aria-label="Edit lead details" className={`${DIALOG} w-full max-w-lg overflow-hidden`}>
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className={DIALOG_TITLE}>Edit Lead Details</h3>
              <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Lead Name *</label>
                <input aria-label="Lead name" type="text" value={editName} onChange={e=>setEditName(e.target.value)} required autoFocus className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Phone Number</label>
                <input aria-label="Phone number" type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)} aria-invalid={!!phoneProblem(editPhone)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium" />
                {phoneProblem(editPhone)
                  ? <p role="alert" className="mt-1 text-[12px] text-red-600">{phoneProblem(editPhone)}</p>
                  : phoneOwner(data, editPhone, selectedLead.id) && <p role="alert" className="mt-1 text-[12px] text-amber-700">{phoneOwner(data, editPhone, selectedLead.id)}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Lead Source</label>
                  <select aria-label="Lead source" value={editSource} onChange={e=>setEditSource(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium">
                    <option value="">Not set</option>
                    {leadSources.map((s: string) => <option key={s} value={s}>{s}</option>)}
                    {editSource && !leadSources.includes(editSource) && <option value={editSource}>{editSource} (not in the list)</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Business Name</label>
                  <input aria-label="Business name" type="text" value={editBusinessName} onChange={e=>setEditBusinessName(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Priority</label>
                  <select aria-label="Priority" value={editPriority} onChange={e=>setEditPriority(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium">
                    {!editPriority && <option value="">Not set</option>}
                    {(data.settings?.priorities || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
                    {editPriority && !(data.settings?.priorities || []).includes(editPriority) && <option value={editPriority}>{editPriority} (not in the list)</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Assigned To</label>
                  <select aria-label="Assigned to" value={editAssignee} onChange={e=>setEditAssignee(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium">
                    <option value="">Unassigned</option>
                    {data.team?.filter((t: any) => !t.deleted).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    {editAssignee && !(data.team || []).some((t: any) => !t.deleted && t.id === editAssignee) && (
                      <option value={editAssignee}>
                        {teamMemberName(editAssignee, data.team)}{(data.team || []).some((t: any) => t.id === editAssignee) ? '' : ' (not on the team)'}
                      </option>
                    )}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsEditing(false)} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
                <button type="submit" className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
