'use client'

import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { visibleUpdates, authorLabel, canEditUpdate, canDeleteUpdate } from '../utils/updates';
import { useUpdateEditing } from '../hooks/useUpdateEditing';
import { teamMemberName, tidyName, sameName, clientWithName } from '../utils/clients';
import { issueAssigneeName, isClosedIssueStatus } from '../utils/issues';
import { badgeClass } from '../utils/colors';
import { defaultPriority } from '../utils/priorities';
import { formatRupees } from '../utils/money';
import { defaultItem, listOptions } from '../utils/defaults';
import { localDateKey, parseDate, formatDate, formatDateTime } from '../utils/dates';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON, DANGER_OUTLINE_BUTTON, SMALL_BUTTON, MEDIUM_BUTTON, LARGE_BUTTON, CARD, SECTION_TITLE } from '../utils/styles';

const ITEMS_PER_PAGE = 15;

// The arrow on a collapsible section of a client's page (points up when the section is open).
function Chevron({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? 'rotate-180 text-sky-500' : 'text-slate-400'}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
  );
}

// One client's page: status and delivery, deal value, services, team, the updates feed and the open tasks.
// ClientsView shows it with key={client.id}, so everything typed or opened here starts fresh for each client.
export function ClientDetail({ client: selectedClient, navigateTo, globalDate, onClose, onArchive, onRestore }: {
  client: any;
  navigateTo: any;
  globalDate?: string;
  // Back to the list.
  onClose: () => void;
  // Archive this client (goes back to the list, which offers Undo) / restore an archived one.
  onArchive: (client: { id: string; name: string }) => void;
  onRestore: (clientId: string) => void;
}) {
  const { data, saveData } = useData();
  const { user, isAdmin } = useAuth();

  // Deal value on a client's page: typed into a draft and saved once, when the box loses focus or Enter is pressed.
  const [dealDraft, setDealDraft] = useState('');
  const [dealFocused, setDealFocused] = useState(false);
  const [dealError, setDealError] = useState<string | null>(null);
  const cancelDealRef = useRef(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  // Show the saved value whenever the box isn't being typed in (someone else may have changed it).
  const savedDeal = String(Number(selectedClient.dealValue) || 0);
  useEffect(() => {
    if (!dealFocused) setDealDraft(savedDeal);
  }, [savedDeal, dealFocused]);

  // Editing the client's name and category.
  const [editingClient, setEditingClient] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientCategory, setEditClientCategory] = useState('');
  const startEditClient = () => {
    setEditClientName(selectedClient?.name || '');
    setEditClientCategory(selectedClient?.category || '');
    setEditingClient(true);
  };
  const saveClientDetails = (e: React.FormEvent) => {
    e.preventDefault();
    const newName = tidyName(editClientName);
    if (!newName || !selectedClient) return;
    if (renameClash) return; // the form says why
    const newCategory = tidyName(editClientCategory);
    const renamed = newName !== selectedClient.name ? ` (was "${selectedClient.name}")` : '';
    saveData({
      ...data,
      clients: data.clients.map((c) => c.id === selectedClient.id ? { ...c, name: newName, category: newCategory } : c)
    }, 'CLIENT_EDIT', `Edited client "${newName}"${renamed}`);
    setEditingClient(false);
  };
  // A new name that another client already has (only checked when the name itself is changed, so a client
  // that already shares its name with another can still have its category edited).
  const renameClash = editingClient && selectedClient && !sameName(editClientName, selectedClient.name)
    ? clientWithName(data.clients, editClientName, selectedClient.id)
    : null;

  // Editing and deleting updates in the client's feed (same rules as the Dashboard).
  const updateEditing = useUpdateEditing();

  // Detail View Form States
  const [updateText, setUpdateText] = useState('');
  
  const [issueTitle, setIssueTitle] = useState('');
  const [issueAssignee, setIssueAssignee] = useState(''); // a team member's id
  const [issuePriority, setIssuePriority] = useState(() => defaultPriority(data.settings));

  // Collapse States
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    'status': true,
    'logUpdate': true,
    'updates': true,
    'raiseIssue': true,
    'issues': true,
  });

  const toggleExpand = (panel: string) => {
    setExpanded(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  // Detail View Sub-Pagination States
  const [updatesPage, setUpdatesPage] = useState(1);
  const [issuesPage, setIssuesPage] = useState(1);


  const handleStatusChange = (client: any, newStatus: string) => {
    const newData = { ...data, clients: data.clients.map((c) => c.id === client.id ? { ...c, status: newStatus } : c) };
    saveData(newData, 'CLIENT_UPDATE', `Changed status of ${client.name} to ${newStatus}`);
  };
  
  const handleDeliveryStatusChange = (client: any, newStatus: string) => {
    const newData = { ...data, clients: data.clients.map((c) => c.id === client.id ? { ...c, deliveryStatus: newStatus } : c) };
    saveData(newData, 'DELIVERY_UPDATE', `Changed delivery status of ${client.name} to ${newStatus}`);
  };

  const updateDeal = (client: any, newDealValue: number) => {
    const newData = { ...data, clients: data.clients.map((c) => c.id === client.id ? { ...c, dealValue: newDealValue } : c) };
    saveData(newData, 'CLIENT_UPDATE', `Updated deal value for ${client.name} to ${newDealValue}`);
  };

  // Saves the typed deal value if it is valid and has changed. An empty box means 0.
  const commitDeal = () => {
    if (!selectedClient) return;
    const text = dealDraft.trim();
    const value = text === '' ? 0 : Number(text);
    if (!Number.isFinite(value) || value < 0) {
      setDealError("Deal value must be 0 or more. It wasn't saved.");
      return;
    }
    setDealError(null);
    if (value !== (Number(selectedClient.dealValue) || 0)) updateDeal(selectedClient, value);
  };

  // Deleting for good (admins, archived clients only): with or without the client's updates and tasks.
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteClientForever = (withRecords: boolean) => {
    if (!selectedClient) return;
    const client = selectedClient;
    const updateCount = (data.updates || []).filter((u) => u.clientId === client.id).length;
    const issueCount = (data.issues || []).filter((i) => i.clientId === client.id).length;
    const newData = {
      ...data,
      clients: data.clients.filter((c) => c.id !== client.id),
      ...(withRecords ? {
        updates: (data.updates || []).filter((u) => u.clientId !== client.id),
        issues: (data.issues || []).filter((i) => i.clientId !== client.id),
      } : {}),
    };
    onClose();
    saveData(newData, 'CLIENT_DELETE', withRecords
      ? `Deleted client ${client.name} with its ${updateCount} updates and ${issueCount} tasks`
      : `Deleted client ${client.name} (its ${updateCount} updates and ${issueCount} tasks were kept)`);
  };

  const addService = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const serviceName = tidyName((form as any).service.value);
    if (!serviceName) return;
    const existing = (selectedClient.services || []).find((s: string) => sameName(s, serviceName));
    if (existing) {
      setServiceError(`“${existing}” is already listed.`);
      return;
    }
    setServiceError(null);
    const newData = { ...data, clients: data.clients.map((c) => c.id === selectedClient.id ? { ...c, services: [...(c.services || []), serviceName] } : c) };
    saveData(newData, 'SERVICE_ADD', `Added service ${serviceName} to ${selectedClient.name}`);
    form.reset();
  };

  // Removes only the service that was clicked (an older record may list the same service twice).
  const removeService = (serviceName: string, index: number) => {
    const newData = { ...data, clients: data.clients.map((c) => {
      if (c.id !== selectedClient.id) return c;
      const services = [...(c.services || [])];
      const at = services[index] === serviceName ? index : services.indexOf(serviceName);
      if (at >= 0) services.splice(at, 1);
      return { ...c, services };
    }) };
    saveData(newData, 'SERVICE_REMOVE', `Removed service ${serviceName} from ${selectedClient.name}`);
  };

  // Ticks or unticks a team member (by id; an older unmatched name can only be unticked).
  const toggleTeamMember = (memberId: string) => {
    const client = data.clients.find((c) => c.id === selectedClient.id);
    if (!client) return;
    const hasMember = (client.team || []).includes(memberId);
    const newTeam = hasMember ? (client.team || []).filter((n: string) => n !== memberId) : [...(client.team || []), memberId];
    const newData = { ...data, clients: data.clients.map((c) => c.id === selectedClient.id ? { ...c, team: newTeam } : c) };
    saveData(newData, 'CLIENT_TEAM_UPDATE', `${hasMember ? 'Removed' : 'Added'} ${teamMemberName(memberId, data.team)} ${hasMember ? 'from' : 'to'} the team for ${selectedClient.name}`);
  };

  const updateDate = globalDate || localDateKey();
  const handleAddUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateText.trim()) return;
    // Posted as the signed-in person, for the date picked in the sidebar (as on the Dashboard).
    const newUpdate = {
      id: Date.now().toString(),
      clientId: selectedClient.id,
      author: user?.email || 'Unknown',
      // Who is signed in, so only they (or an admin) can change or delete it later.
      authorEmail: user?.email ? user.email.toLowerCase() : null,
      text: updateText,
      date: updateDate,
      timestamp: Date.now()
    };
    saveData({ ...data, updates: [...(data.updates || []), newUpdate] }, 'UPDATE_ADD', `Logged update for ${selectedClient.name}`);
    setUpdateText('');
    setExpanded(prev => ({ ...prev, updates: true })); // Auto-expand feed
    setUpdatesPage(1); // Reset to page 1
  };

  const handleAddIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if(!issueTitle.trim()) return;
    // The same format as tasks made on the Tasks page (remembering who raised it).
    const newIssue = {
      id: Date.now().toString(),
      title: issueTitle.trim(),
      description: '',
      clientId: selectedClient.id,
      assigneeId: issueAssignee || null,
      priority: issuePriority,
      status: defaultItem(data.settings, 'issueStatuses', 'Open'),
      createdAt: new Date().toISOString(),
      createdBy: (user?.email || '').trim().toLowerCase(),
      notesHistory: []
    };
    saveData({ ...data, issues: [...(data.issues || []), newIssue] }, 'TASK_CREATE', `Added a task for ${selectedClient.name}: "${newIssue.title}"`);
    setIssueTitle('');
    setExpanded(prev => ({ ...prev, issues: true })); // Auto-expand issues
    setIssuesPage(1);
  };

  const clientUpdates = visibleUpdates(data.updates).filter((u) => u.clientId === selectedClient.id).sort((a:any, b:any) => b.timestamp - a.timestamp);
  const clientIssues = (data.issues || []).filter((i) => i.clientId === selectedClient.id).sort((a:any, b:any) => (parseDate(b.createdAt || b.created)?.getTime() || 0) - (parseDate(a.createdAt || a.created)?.getTime() || 0));
  // The panel shows open tasks only; closed ones are counted and can be seen on the Tasks page.
  const openClientIssues = clientIssues.filter((i) => !isClosedIssueStatus(i.status, data.settings));
  const openIssuesCount = openClientIssues.length;
  const closedIssuesCount = clientIssues.length - openIssuesCount;

  // Pagination Logic
  // The page shown is never past the last one (when a feed's last row on its last page is removed).
  const updatesTotalPages = Math.max(1, Math.ceil(clientUpdates.length / ITEMS_PER_PAGE));
  const shownUpdatesPage = Math.min(updatesPage, updatesTotalPages);
  const paginatedUpdates = clientUpdates.slice((shownUpdatesPage - 1) * ITEMS_PER_PAGE, shownUpdatesPage * ITEMS_PER_PAGE);

  const issuesTotalPages = Math.max(1, Math.ceil(openClientIssues.length / ITEMS_PER_PAGE));
  const shownIssuesPage = Math.min(issuesPage, issuesTotalPages);
  const paginatedIssues = openClientIssues.slice((shownIssuesPage - 1) * ITEMS_PER_PAGE, shownIssuesPage * ITEMS_PER_PAGE);

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-12 font-sans">
      <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2 text-[13px] font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        Back to clients
      </button>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-4">
        {editingClient ? (
          <form
            onSubmit={saveClientDetails}
            onKeyDown={e => { if (e.key === 'Escape') setEditingClient(false); }}
            className="flex flex-wrap items-end gap-3 w-full md:w-auto"
          >
            <label className="block">
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Client name</span>
              <input
                value={editClientName}
                onChange={e => setEditClientName(e.target.value)}
                required
                autoFocus
                className="border border-slate-200 rounded-lg p-2 text-[14px] font-bold text-slate-800 focus:outline-none focus:border-sky-500 bg-white min-w-[220px]"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Category</span>
              <input
                value={editClientCategory}
                onChange={e => setEditClientCategory(e.target.value)}
                placeholder="e.g. Real Estate"
                className="border border-slate-200 rounded-lg p-2 text-[13px] text-slate-700 focus:outline-none focus:border-sky-500 bg-white"
              />
            </label>
            <button type="submit" disabled={!editClientName.trim() || !!renameClash} className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON}`}>Save</button>
            <button type="button" onClick={() => setEditingClient(false)} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>Cancel</button>
            {renameClash && (
              <p role="alert" className="basis-full text-[12px] text-amber-700">
                Another client is already called “{renameClash.name}”{renameClash.archived ? ' (archived)' : ''}. Choose a different name.
              </p>
            )}
          </form>
        ) : (
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">{selectedClient.name}</h1>
            <p className="text-slate-500 mt-1 text-[13px] uppercase tracking-widest font-bold">{selectedClient.category || 'No Category'}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
        {!editingClient && (
          <button onClick={startEditClient} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>
            Edit
          </button>
        )}
        {!selectedClient.archived && (
          <button onClick={() => onArchive(selectedClient)} className={`${DANGER_OUTLINE_BUTTON} ${MEDIUM_BUTTON}`}>
            Archive client
          </button>
        )}
        </div>
      </div>

      {selectedClient.archived && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-[13px] font-medium flex flex-wrap items-center justify-between gap-3">
          <span>
            This client is archived{selectedClient.archivedAt ? ` since ${formatDate(selectedClient.archivedAt)}` : ''}.
            It is hidden from lists and pickers; its updates and tasks are kept.
          </span>
          <div className="flex items-center gap-4 shrink-0">
            <button onClick={() => onRestore(selectedClient.id)} className="font-bold text-amber-900 hover:underline">Restore</button>
            {isAdmin && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} className="font-bold text-red-600 hover:underline">Delete permanently…</button>
            )}
          </div>
        </div>
      )}

      {selectedClient.archived && isAdmin && confirmDelete && (() => {
        const updateCount = (data.updates || []).filter((u) => u.clientId === selectedClient.id).length;
        const issueCount = (data.issues || []).filter((i) => i.clientId === selectedClient.id).length;
        return (
          <div role="alertdialog" aria-label="Delete client permanently" className="bg-white border border-red-200 rounded-lg p-4 space-y-3">
            <div className="font-bold text-red-700 text-[14px]">Delete &ldquo;{selectedClient.name}&rdquo; permanently?</div>
            <p className="text-[13px] text-slate-600">
              This can&apos;t be undone. It has {updateCount} update{updateCount === 1 ? '' : 's'} and {issueCount} task{issueCount === 1 ? '' : 's'}.
              Archiving (as it is now) already hides it everywhere.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => deleteClientForever(true)} className={`${DANGER_BUTTON} ${MEDIUM_BUTTON}`}>
                Delete the client, its updates and its tasks
              </button>
              <button onClick={() => deleteClientForever(false)} className={`${DANGER_OUTLINE_BUTTON} ${MEDIUM_BUTTON}`}>
                Delete only the client (keep its updates and tasks)
              </button>
              <button onClick={() => setConfirmDelete(false)} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Deal value', value: formatRupees(selectedClient.dealValue) },
          { label: 'Open issues', value: openIssuesCount, isDanger: openIssuesCount > 0 },
          { label: 'Updates', value: clientUpdates.length },
          { label: 'Team', value: (selectedClient.team || []).length }
        ].map((stat, idx) => (
          <div key={idx} className={`bg-white border border-slate-200 rounded-lg p-3`}>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{stat.label}</div>
            <div className={`text-xl font-bold ${stat.isDanger ? 'text-red-500' : 'text-slate-800'}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Vertical Stack Layout (Collapsible Panels) */}
      <div className="flex flex-col gap-4">
        
        {/* Status & Delivery Panel */}
        <div className={CARD}>
          <button onClick={() => toggleExpand('status')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
            <h3 className={SECTION_TITLE}>Status & delivery</h3>
            <Chevron open={expanded['status']} />
          </button>
          
          {expanded['status'] && (
            <div className="p-4 pt-0 border-t border-slate-100 mt-2 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Client Status</label>
                  <select aria-label="Client status" 
                    value={selectedClient.status} 
                    onChange={e => handleStatusChange(selectedClient, e.target.value)} 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] bg-slate-50 font-medium text-slate-700 outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  >
                    {listOptions(data.settings?.clientStatuses, selectedClient.status).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Delivery Status</label>
                  <select aria-label="Delivery status" 
                    value={selectedClient.deliveryStatus || 'Planned'} 
                    onChange={e => handleDeliveryStatusChange(selectedClient, e.target.value)} 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] bg-slate-50 font-medium text-slate-700 outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  >
                    {listOptions(data.settings?.deliveryStatuses, selectedClient.deliveryStatus).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Deal value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-label="Deal value"
                    className={`w-full border rounded-lg p-2.5 text-[13px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-slate-50 font-medium text-slate-700 ${dealError ? 'border-red-300' : 'border-slate-200'}`}
                    value={dealDraft}
                    onFocus={() => { cancelDealRef.current = false; setDealFocused(true); }}
                    onChange={e => { setDealDraft(e.target.value); setDealError(null); }}
                    onBlur={() => {
                      if (!cancelDealRef.current) commitDeal();
                      cancelDealRef.current = false;
                      setDealFocused(false);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') { cancelDealRef.current = true; setDealError(null); e.currentTarget.blur(); }
                    }}
                  />
                  {dealError && <p role="alert" className="text-[12px] text-red-600 mt-1">{dealError}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Services</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(selectedClient.services || []).map((s: string, i: number) => (
                      <span key={`${i}-${s}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 font-medium text-[12px] rounded">
                        {s}
                        <button onClick={() => removeService(s, i)} aria-label={`Remove ${s}`} title={`Remove ${s}`} className="text-slate-400 hover:text-red-500 ml-1">✕</button>
                      </span>
                    ))}
                    {(!selectedClient.services || selectedClient.services.length === 0) && <span className="text-[13px] text-slate-400 italic">None added</span>}
                  </div>
                  <form onSubmit={addService} className="flex gap-2">
                    <input aria-label="New service" name="service" type="text" placeholder="Add service..." onChange={() => setServiceError(null)} className="flex-1 border border-slate-200 p-2 text-[13px] rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-slate-50" />
                    <button type="submit" className={`${PRIMARY_BUTTON} px-4 text-[13px]`}>Add</button>
                  </form>
                  {serviceError && <p role="alert" className="mt-1.5 text-[12px] text-amber-700">{serviceError}</p>}
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Team Assigned</label>
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg max-h-[160px] overflow-y-auto space-y-2">
                    {(() => {
                      // Current team members, plus anyone still assigned here who was removed from the team
                      // (or an older name that matches nobody), so they can be unticked.
                      const assigned: string[] = selectedClient.team || [];
                      const options = [
                        ...(data.team || []).filter((t) => !t.deleted || assigned.includes(t.id)).map((t) => ({ id: t.id, label: teamMemberName(t.id, data.team) })),
                        ...assigned.filter(a => !(data.team || []).some((t) => t.id === a)).map(a => ({ id: a, label: `${a} (not on the team)` })),
                      ];
                      return options.length > 0 ? options.map(o => (
                        <label key={o.id} className="flex items-center gap-3 text-[13px] font-medium text-slate-700 cursor-pointer p-1">
                          <input
                            type="checkbox"
                            checked={assigned.includes(o.id)}
                            onChange={() => toggleTeamMember(o.id)}
                            className="rounded border-slate-300 w-3.5 h-3.5 text-sky-500 focus:ring-sky-500/20"
                          />
                          {o.label}
                        </label>
                      )) : <div className="text-[13px] text-slate-400 italic">No team members available.</div>;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* From lead: everything the lead had when it was converted into this client. */}
        {selectedClient.fromLead && (() => {
          const lead = selectedClient.fromLead;
          const leadHistory: any[] = Array.isArray(lead.history) ? lead.history : [];
          const when = (value: any, withTime = false) => (withTime ? formatDateTime(value) : formatDate(value)) || '—';
          const details: [string, React.ReactNode][] = [
            ['Phone', lead.phone ? <a href={`tel:${lead.phone}`} className="text-sky-600 hover:underline">{lead.phone}</a> : '—'],
            ['Business name', lead.businessName || '—'],
            ['Source', lead.source || '—'],
            ['Priority', lead.priority || '—'],
            ['Lead added', when(lead.createdAt)],
          ];
          return (
            <div className={CARD}>
              <button onClick={() => toggleExpand('fromLead')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                <h3 className={SECTION_TITLE}>From lead <span className="normal-case tracking-normal font-medium text-slate-500">· {leadHistory.length} {leadHistory.length === 1 ? 'entry' : 'entries'} in its history</span></h3>
                <Chevron open={!!expanded['fromLead']} />
              </button>
              {expanded['fromLead'] && (
                <div className="p-4 pt-0 border-t border-slate-100 mt-2">
                  <dl className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 text-[13px]">
                    {details.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</dt>
                        <dd className="font-medium text-slate-800 break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">History</div>
                    {leadHistory.length === 0 ? (
                      <p className="text-[13px] text-slate-400 italic">Nothing was logged for this lead.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                        {leadHistory.map((h: any, i: number) => (
                          <li key={h.id || i} className="p-3 text-[13px]">
                            <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                              <span>{when(h.date, true)}{h.actionBy ? ` · ${h.actionBy}` : ''}</span>
                              {h.status && <span className="font-bold uppercase tracking-wider">{h.status}</span>}
                            </div>
                            {h.notes && <p className="mt-1 text-slate-700 whitespace-pre-wrap break-words">{h.notes}</p>}
                            {h.nextActionDate && <p className="mt-1 text-[11px] text-slate-500">Next follow-up: {when(h.nextActionDate)}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Log Update Panel */}
        <div className={CARD}>
          <button onClick={() => toggleExpand('logUpdate')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
            <h3 className={SECTION_TITLE}>Log an update</h3>
            <Chevron open={expanded['logUpdate']} />
          </button>
          {expanded['logUpdate'] && (
            <div className="p-4 pt-0 border-t border-slate-100 mt-2">
              <form onSubmit={handleAddUpdate} className="space-y-4 pt-4">
                <div>
                  <textarea aria-label="New update" placeholder="e.g. Sent revised quotation, awaiting approval." className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] min-h-[100px] focus:outline-none focus:border-sky-500 bg-slate-50 resize-y" value={updateText} onChange={e=>setUpdateText(e.target.value)} required></textarea>
                </div>
                <p className="text-[12px] text-slate-500">
                  Posting as <span className="font-semibold text-slate-700">{user?.displayName || authorLabel({ author: user?.email })}</span>
                  {' '}for {formatDate(updateDate)}
                  {updateDate === localDateKey() ? ' (today)' : ' (the date picked in the sidebar)'}
                </p>
                <button type="submit" className={`${PRIMARY_BUTTON} ${LARGE_BUTTON}`}>Post Update</button>
              </form>
            </div>
          )}
        </div>

        {/* Updates Feed with Pagination */}
        <div className={CARD}>
          <button onClick={() => toggleExpand('updates')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <h3 className={SECTION_TITLE}>Updates Feed</h3>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{clientUpdates.length}</span>
            </div>
            <Chevron open={expanded['updates']} />
          </button>
          {expanded['updates'] && (
            <div className="border-t border-slate-100">
              {updateEditing.recentlyDeleted && (
                <div role="status" className="px-4 py-2.5 border-b border-amber-100 bg-amber-50 text-amber-800 text-[13px] font-medium flex items-center justify-between gap-3">
                  <span>Update deleted.</span>
                  <button onClick={() => updateEditing.handleRestoreUpdate(updateEditing.recentlyDeleted!)} className="font-bold text-amber-900 hover:underline">Undo</button>
                </div>
              )}
              <div className="max-h-[500px] overflow-y-auto">
                {clientUpdates.length === 0 ? (
                  <div className="p-8 text-center text-[13px] text-slate-400 italic">No updates logged for this client yet.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {paginatedUpdates.map((update) => (
                      <div key={update.id} className="p-4 hover:bg-slate-50/50 transition-colors group">
                        <div className="flex justify-between items-baseline mb-2">
                          <div className="font-bold text-[13px] text-slate-800 capitalize">{authorLabel(update)}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {formatDateTime(update.timestamp || update.date)}
                            {update.editedAt && <span className="font-sans italic"> (edited)</span>}
                          </div>
                        </div>
                        {updateEditing.editingId === update.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={updateEditing.editText}
                              onChange={e => updateEditing.setEditText(e.target.value)}
                              aria-label="Update text"
                              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-[13px] min-h-[80px] focus:outline-none focus:border-sky-500 text-slate-700"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => updateEditing.saveEdit(update)} disabled={!updateEditing.editText.trim()} className={`${PRIMARY_BUTTON} ${SMALL_BUTTON}`}>Save</button>
                              <button onClick={() => updateEditing.setEditingId(null)} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON}`}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{update.text}</p>
                        )}
                        {updateEditing.editingId !== update.id && (canEditUpdate(update, user?.email) || canDeleteUpdate(update, user?.email, isAdmin)) && (
                          // Always shown on touch screens. With a mouse they appear on hover, or when reached with the keyboard.
                          <div className="flex gap-4 mt-2 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
                            {canEditUpdate(update, user?.email) && (
                              <button onClick={() => updateEditing.startEdit(update)} className="text-[11px] font-bold text-slate-400 hover:text-sky-600 transition-colors">EDIT</button>
                            )}
                            {canDeleteUpdate(update, user?.email, isAdmin) && (
                              <button onClick={() => updateEditing.handleDeleteUpdate(update)} className="text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors">DELETE</button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Pagination Controls */}
              {updatesTotalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50">
                  <span className="text-[11px] text-slate-500 font-medium">Page {shownUpdatesPage} of {updatesTotalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setUpdatesPage(Math.max(1, shownUpdatesPage - 1))} disabled={shownUpdatesPage === 1} className={`${SECONDARY_BUTTON} px-3 py-1 text-[12px]`}>Prev</button>
                    <button onClick={() => setUpdatesPage(Math.min(updatesTotalPages, shownUpdatesPage + 1))} disabled={shownUpdatesPage === updatesTotalPages} className={`${SECONDARY_BUTTON} px-3 py-1 text-[12px]`}>Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Raise Issue Panel */}
        <div className={CARD}>
          <button onClick={() => toggleExpand('raiseIssue')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
            <h3 className={SECTION_TITLE}>Add a task</h3>
            <Chevron open={expanded['raiseIssue']} />
          </button>
          {expanded['raiseIssue'] && (
            <div className="p-4 pt-0 border-t border-slate-100 mt-2">
              <form onSubmit={handleAddIssue} className="space-y-4 pt-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <input aria-label="Task title" type="text" placeholder="What needs doing" className="flex-1 border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-slate-50" value={issueTitle} onChange={e=>setIssueTitle(e.target.value)} required />
                  <select aria-label="Give the task to" className="md:w-48 border border-slate-200 rounded-lg p-2.5 text-[13px] bg-slate-50 outline-none focus:border-sky-500" value={issueAssignee} onChange={e=>setIssueAssignee(e.target.value)} required>
                    <option value="" disabled>Assign to...</option>
                    {data.team?.filter((t) => !t.deleted).map((t:any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select aria-label="Task priority" className="md:w-32 border border-slate-200 rounded-lg p-2.5 text-[13px] bg-slate-50 outline-none focus:border-sky-500" value={issuePriority} onChange={e=>setIssuePriority(e.target.value)}>
                    {data.settings?.priorities?.map((p:string) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button type="submit" className={`${PRIMARY_BUTTON} ${LARGE_BUTTON}`}>Create</button>
                </div>
              </form>
            </div>
          )}
        </div>
        
        {/* Issues List with Pagination */}
        <div className={CARD}>
          <button onClick={() => toggleExpand('issues')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <h3 className={SECTION_TITLE}>Open tasks</h3>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{openIssuesCount}</span>
            </div>
            <Chevron open={expanded['issues']} />
          </button>
          {expanded['issues'] && (
            <div className="border-t border-slate-100">
              <div className="max-h-[500px] overflow-y-auto p-4">
                {openIssuesCount === 0 ? (
                  <div className="text-center p-8 text-[13px] text-slate-400 italic">{clientIssues.length === 0 ? 'No tasks yet.' : 'No open tasks.'}</div>
                ) : (
                  <div className="space-y-3">
                    {paginatedIssues.map((issue) => (
                      <button
                        type="button"
                        key={issue.id}
                        onClick={() => navigateTo('issues', { selectedIssueId: issue.id })}
                        title="Open this task"
                        className={`w-full text-left p-3 border border-slate-200 rounded-lg bg-white flex items-center justify-between hover:border-sky-300 hover:bg-sky-50/40 transition-colors group/issue`}
                      >
                        <div>
                          <div className="font-bold text-[13px] text-slate-800 group-hover/issue:text-sky-600 transition-colors">{issue.title}</div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                            <span className="font-medium text-slate-600">{issue.priority || 'Medium'}</span>
                            <span>•</span>
                            <span>{issueAssigneeName(issue, data.team)}</span>
                          </div>
                        </div>
                        <div className={`relative inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 transition-colors ${badgeClass(data.settings, 'issueStatuses', issue.status)} bg-white`}>
                          <div className={`w-1.5 h-1.5 rounded-full bg-current opacity-70`}></div>
                          <span className="font-bold text-[10px] uppercase tracking-wide">{issue.status}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {closedIssuesCount > 0 && (
                  <p className="text-[12px] text-slate-500 mt-3">
                    {closedIssuesCount} closed task{closedIssuesCount === 1 ? '' : 's'} not shown.{' '}
                    <button type="button" onClick={() => navigateTo('issues')} className="font-bold text-sky-600 hover:underline">See all tasks</button>
                  </p>
                )}
              </div>
              {/* Pagination Controls */}
              {issuesTotalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50">
                  <span className="text-[11px] text-slate-500 font-medium">Page {shownIssuesPage} of {issuesTotalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setIssuesPage(Math.max(1, shownIssuesPage - 1))} disabled={shownIssuesPage === 1} className={`${SECONDARY_BUTTON} px-3 py-1 text-[12px]`}>Prev</button>
                    <button onClick={() => setIssuesPage(Math.min(issuesTotalPages, shownIssuesPage + 1))} disabled={shownIssuesPage === issuesTotalPages} className={`${SECONDARY_BUTTON} px-3 py-1 text-[12px]`}>Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
