'use client'

import { useState, useEffect, useRef, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { badgeClass } from '../utils/colors';
import { toDateKey, localDateKey, formatDate, formatTime } from '../utils/dates';
import { withIssueStatus, isClosedIssueStatus, issueAssigneeName } from '../utils/issues';
import { priorityDotClass, defaultPriority } from '../utils/priorities';
import { defaultItem, listOptions } from '../utils/defaults';
import { activeClients, clientLabel } from '../utils/clients';
import { teamMemberForEmail } from '../utils/team';
import { TASK_VIEWS, canDeleteTask, compareTasks, dueFilterMatches, dueLabel, dueState, inTaskView, DUE_TAG, type DueFilter, type TaskView, type TaskViewer } from '../utils/tasks';
import { useConfirm } from './ConfirmDialog';
import { PageHeader } from './PageHeader';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, MEDIUM_BUTTON, CARD, DIALOG, DIALOG_TITLE, PANEL_TITLE } from '../utils/styles';
import { Pagination } from './Pagination';
import { URGENT_FILTER } from '../utils/filters';

const FIELD = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-800 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20';
const LABEL = 'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1';
const FILTER = 'border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-sky-500';
// "Internal" tasks are about no client.
const INTERNAL = 'none';

// The small coloured "Due …" tag.
function DueTag({ task, today, settings }: { task: any; today: string; settings: any }) {
  const state = dueState(task, today, settings);
  if (!state) return null;
  return <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${DUE_TAG[state]}`}>{dueLabel(task, today)}</span>;
}

// The "New task" window.
function NewTaskDialog({ initial, viewer, onCreate, onClose }: {
  initial: { description?: string; clientId?: string };
  viewer: TaskViewer;
  onCreate: (task: { title: string; description: string; clientId: string | null; assigneeId: string | null; priority: string; dueDate: string }) => void;
  onClose: () => void;
}) {
  const { data } = useData();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(initial.description || '');
  const [clientId, setClientId] = useState(initial.clientId || '');
  // A new task is yours unless you give it to someone else.
  const [assigneeId, setAssigneeId] = useState(viewer.memberId || '');
  const [priority, setPriority] = useState(defaultPriority(data.settings));
  const [dueDate, setDueDate] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title: title.trim(), description: description.trim(), clientId: clientId || null, assigneeId: assigneeId || null, priority, dueDate });
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="new-task-title" className={`${DIALOG} w-full max-w-lg max-h-[92vh] overflow-y-auto`}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <h2 id="new-task-title" className={DIALOG_TITLE}>New task</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <label className="block">
            <span className={LABEL}>What needs doing</span>
            <input aria-label="Task title" autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Send the logo drafts to the client" className={FIELD} />
          </label>
          <label className="block">
            <span className={LABEL}>Details (optional)</span>
            <textarea aria-label="Details" value={description} onChange={e => setDescription(e.target.value)} placeholder="Anything that helps" className={`${FIELD} min-h-[72px]`} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className={LABEL}>Client</span>
              <select aria-label="Client" value={clientId} onChange={e => setClientId(e.target.value)} className={FIELD}>
                <option value="">Internal work (no client)</option>
                {activeClients(data.clients).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Give it to</span>
              <select aria-label="Assign to" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={FIELD}>
                <option value="">Nobody yet</option>
                {(data.team || []).filter((t: any) => !t.deleted).map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.id === viewer.memberId ? ' (me)' : ''}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Priority</span>
              <select aria-label="Priority" value={priority} onChange={e => setPriority(e.target.value)} className={FIELD}>
                {(data.settings?.priorities || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Due (optional)</span>
              <input aria-label="Due date" type="date" value={dueDate} min={localDateKey()} onChange={e => setDueDate(e.target.value)} className={FIELD} />
            </label>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
            <button type="submit" disabled={!title.trim()} className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>Create task</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TasksView({ routeParams, navigateTo }: { routeParams?: any, navigateTo?: any }) {
  const { data, saveData } = useData();
  const confirm = useConfirm();
  const { user, isAdmin } = useAuth();
  const today = localDateKey();
  const viewer: TaskViewer = useMemo(() => ({
    memberId: teamMemberForEmail(data.team, user?.email)?.id || null,
    email: (user?.email || '').trim().toLowerCase(),
  }), [data.team, user?.email]);
  const nameOf = (email?: string) => (email ? teamMemberForEmail(data.team, email)?.name || email : '');

  // Which task's details are open comes from the page address (?page=issues&id=...), so links, Refresh and Back work.
  // It is looked up in the latest data every time, so the panel always shows current values.
  const selectedIssueId: string | null = routeParams?.selectedIssueId || null;
  const selectedIssue: any = selectedIssueId ? (data.issues || []).find((i: any) => i.id === selectedIssueId) || null : null;
  const openIssue = (id: string | null) => navigateTo('issues', id ? { selectedIssueId: id } : undefined);

  const [newNoteText, setNewNoteText] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  // Tasks raised on a client's page keep their description in `notes`; others in `description`.
  const descriptionOf = (issue: any) => issue?.description || (typeof issue?.notes === 'string' ? issue.notes : '') || '';

  // A different task starts with an empty note box and no edit in progress.
  useEffect(() => {
    setNewNoteText('');
    setEditingDetails(false);
  }, [selectedIssueId]);

  // Escape cancels an edit, or else closes the details panel.
  useEffect(() => {
    if (!selectedIssueId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingDetails) setEditingDetails(false);
      else navigateTo('issues');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIssueId, editingDetails, navigateTo]);

  const startEditDetails = () => {
    setEditTitle(selectedIssue?.title || '');
    setEditDescription(descriptionOf(selectedIssue));
    setEditingDetails(true);
  };

  const saveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    const newTitle = editTitle.trim();
    if (!newTitle || !selectedIssue) return;
    const newDescription = editDescription.trim();
    const keptInNotes = !selectedIssue.description && typeof selectedIssue.notes === 'string' && selectedIssue.notes.trim() !== '';
    const updated = { ...selectedIssue, title: newTitle, ...(keptInNotes ? { notes: newDescription } : { description: newDescription }) };
    const renamed = newTitle !== selectedIssue.title ? ` (was "${selectedIssue.title}")` : '';
    saveData({
      ...data,
      issues: data.issues.map((i: any) => i.id === selectedIssue.id ? updated : i)
    }, 'TASK_EDIT', `Edited task "${newTitle}"${renamed}`);
    setEditingDetails(false);
  };

  // The "New task" window, opened by its button or by "Make a task" on another page (with the text filled in).
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskInitial, setNewTaskInitial] = useState<{ description?: string; clientId?: string }>({});
  const appliedParamsRef = useRef<any>(null);
  useEffect(() => {
    if (!routeParams || appliedParamsRef.current === routeParams) return;
    appliedParamsRef.current = routeParams;
    if (routeParams.prefillNotes || routeParams.selectedClientId) {
      setNewTaskInitial({ description: routeParams.prefillNotes || '', clientId: routeParams.selectedClientId || '' });
      setNewTaskOpen(true);
    }
    if (routeParams.priorityFilter) setPriorityFilter(routeParams.priorityFilter);
    if (routeParams.taskView) setView(routeParams.taskView);
  }, [routeParams]);

  // Views, layout, search and filters. Users start on their own tasks; admins on everything.
  const [view, setView] = useState<TaskView>(isAdmin ? 'all' : 'mine');
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const [searchText, setSearchText] = useState('');
  const [showFilter, setShowFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [dueFilter, setDueFilter] = useState<DueFilter>('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');     // a client id, or INTERNAL
  const [assigneeFilter, setAssigneeFilter] = useState(''); // a team member id, or 'none' for nobody
  const filtersActive = !!(searchText.trim() || showFilter !== 'open' || dueFilter || priorityFilter || clientFilter || assigneeFilter);
  const clearFilters = () => {
    setSearchText('');
    setShowFilter('open');
    setDueFilter('');
    setPriorityFilter('');
    setClientFilter('');
    setAssigneeFilter('');
  };

  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 15;
  useEffect(() => {
    setPage(1);
  }, [view, searchText, showFilter, dueFilter, priorityFilter, clientFilter, assigneeFilter]);

  const allTasks = (data.issues || []).slice().sort(compareTasks);
  const isOpen = (i: any) => !isClosedIssueStatus(i.status, data.settings);
  const viewCount = (v: TaskView) => allTasks.filter((i: any) => isOpen(i) && inTaskView(i, v, viewer)).length;

  // Everything but the open/done choice (the board shows every status as its own column).
  const matchesFilters = (i: any) => {
    if (!inTaskView(i, view, viewer)) return false;
    if (!dueFilterMatches(i, dueFilter, today, data.settings)) return false;
    if (priorityFilter === URGENT_FILTER ? !(data.settings?.urgentPriorities || []).includes(i.priority) : priorityFilter && i.priority !== priorityFilter) return false;
    if (clientFilter === INTERNAL ? !!i.clientId : clientFilter && i.clientId !== clientFilter) return false;
    const assignee = issueAssigneeName(i, data.team);
    if (assigneeFilter === 'none') {
      if (assignee !== 'Unassigned') return false;
    } else if (assigneeFilter) {
      const member = data.team?.find((t: any) => t.id === assigneeFilter);
      if (!(i.assigneeId === assigneeFilter || (!i.assigneeId && member && i.assignee === member.name))) return false;
    }
    const q = searchText.trim().toLowerCase();
    if (q) {
      const clientName = data.clients?.find((c: any) => c.id === i.clientId)?.name || '';
      const text = [i.title, i.description, i.notes, clientName, assignee, i.status, i.priority].filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  };
  const boardTasks = allTasks.filter(matchesFilters);
  const listTasks = boardTasks.filter((i: any) => showFilter === 'all' || (showFilter === 'open' ? isOpen(i) : !isOpen(i)));

  const totalPages = Math.max(1, Math.ceil(listTasks.length / ITEMS_PER_PAGE));
  // If the current page no longer exists (its last row was removed), show the last page instead.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const paginated = listTasks.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const createTask = (task: { title: string; description: string; clientId: string | null; assigneeId: string | null; priority: string; dueDate: string }) => {
    const newIssue = {
      id: Date.now().toString(),
      title: task.title,
      description: task.description,
      status: defaultItem(data.settings, 'issueStatuses', 'Open'),
      priority: task.priority || defaultPriority(data.settings),
      clientId: task.clientId,
      assigneeId: task.assigneeId,
      ...(task.dueDate ? { dueDate: task.dueDate } : {}),
      createdAt: new Date().toISOString(),
      createdBy: viewer.email,
      notesHistory: []
    };
    const forWhom = task.assigneeId ? data.team?.find((t: any) => t.id === task.assigneeId)?.name : null;
    saveData({ ...data, issues: [newIssue, ...(data.issues || [])] }, 'TASK_CREATE', `Created task: "${task.title}"${forWhom ? ` for ${forWhom}` : ''}`);
    setNewTaskOpen(false);
    setNewTaskInitial({});
    setPage(1);
  };

  const update = (issue: any, change: (i: any) => any, action: string, details: string) =>
    saveData({ ...data, issues: data.issues.map((i: any) => i.id === issue.id ? change(i) : i) }, action, details);

  // Closing a task records the day it was finished (used by the Dashboard report).
  const handleStatusChange = (issue: any, newStatus: string) =>
    update(issue, (i) => withIssueStatus(i, newStatus, data.settings, localDateKey()), 'TASK_UPDATE', `Changed task "${issue.title}" status to ${newStatus}`);
  const handlePriorityChange = (issue: any, newPriority: string) =>
    update(issue, (i) => ({ ...i, priority: newPriority }), 'TASK_UPDATE', `Changed task "${issue.title}" priority to ${newPriority}`);
  const handleDueDateChange = (issue: any, newDue: string) =>
    update(issue, (i) => { const next = { ...i, dueDate: newDue }; if (!newDue) delete next.dueDate; return next; }, 'TASK_UPDATE',
      newDue ? `Set task "${issue.title}" due ${formatDate(newDue)}` : `Removed the due date of task "${issue.title}"`);
  const handleAssigneeChange = (issue: any, newAssigneeId: string) => {
    // Only the team member's id is stored (an older task's name is dropped); names are looked up when shown.
    const member = data.team?.find((t: any) => t.id === newAssigneeId);
    update(issue, (i) => { const next = { ...i, assigneeId: newAssigneeId || null }; delete next.assignee; return next; },
      'TASK_UPDATE', `Gave task "${issue.title}" to ${member?.name || 'nobody'}`);
  };
  const handleClientChange = (issue: any, newClientId: string) =>
    update(issue, (i) => ({ ...i, clientId: newClientId || null }), 'TASK_UPDATE', `Updated client link for task "${issue.title}"`);

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedIssue) return;
    const noteItem = {
      id: Date.now().toString(),
      text: newNoteText.trim(),
      author: user?.displayName || user?.email?.split('@')[0] || 'Team Member',
      createdAt: new Date().toISOString()
    };
    update(selectedIssue, (i) => ({ ...i, notesHistory: [...(i.notesHistory || []), noteItem] }), 'TASK_NOTE_ADD', `Added a progress note to task "${selectedIssue.title}"`);
    setNewNoteText('');
  };

  const handleDeleteIssue = async (issue: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: `Delete the task “${issue.title}”?`,
      message: 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    if (selectedIssueId === issue.id) openIssue(null);
    saveData({ ...data, issues: data.issues.filter((i: any) => i.id !== issue.id) }, 'TASK_DELETE', `Deleted task: "${issue.title}"`);
  };

  const formatDateStr = (isoOrDate: string) => (isoOrDate ? formatDate(isoOrDate) || isoOrDate : 'recent');
  // A plain date ("YYYY-MM-DD") has no time of day, so none is shown for it.
  const formatTimeStr = (isoOrDate: string) => (!isoOrDate || toDateKey(isoOrDate) === isoOrDate ? '' : formatTime(isoOrDate));

  const statusSelect = (issue: any, compact = false) => (
    <select
      value={issue.status}
      onChange={e => handleStatusChange(issue, e.target.value)}
      onClick={e => e.stopPropagation()}
      aria-label={`Status of ${issue.title}`}
      className={`rounded-lg ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} font-extrabold uppercase tracking-wider border focus:outline-none focus:ring-2 focus:ring-sky-500/30 cursor-pointer max-w-full ${badgeClass(data.settings, 'issueStatuses', issue.status)}`}
    >
      {listOptions(data.settings?.issueStatuses, issue.status).map(o => <option key={o.value} value={o.value} className="bg-white text-slate-700 normal-case">{o.label}</option>)}
      {!(data.settings?.issueStatuses || []).includes(issue.status) && <option value={issue.status} className="bg-white text-slate-700">{issue.status}</option>}
    </select>
  );

  // Board columns: every status in Customize, plus any other status a task still has.
  const statuses: string[] = [...(data.settings?.issueStatuses || [])];
  for (const t of boardTasks) if (t.status && !statuses.includes(t.status)) statuses.push(t.status);

  const emptyText = allTasks.length === 0
    ? 'No tasks yet. Use “New task” to add the first one.'
    : !allTasks.some((i: any) => inTaskView(i, view, viewer))
      ? (view === 'mine' ? 'Nothing is given to you right now.' : view === 'raised' ? 'You haven’t raised any tasks yet.' : 'No tasks.')
      : filtersActive ? 'No tasks match your search and filters.' : 'No open tasks here. Choose “Closed” or “All” under Show to see finished ones.';

  return (
    <>
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Tasks" subtitle="Work given out, followed up and finished: for a client, or internal." />
        <button type="button" onClick={() => { setNewTaskInitial({}); setNewTaskOpen(true); }} className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON} shrink-0`}>
          + New task
        </button>
      </div>

      {/* Views and layout */}
      <div className={`${CARD} px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
        <div role="tablist" aria-label="Which tasks" className="flex flex-wrap gap-1.5">
          {TASK_VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${view === v.id ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {v.label} <span className="ml-1 text-[11px] font-bold opacity-70">{viewCount(v.id)}</span>
            </button>
          ))}
        </div>
        <div role="group" aria-label="Layout" className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {(['list', 'board'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              aria-pressed={layout === l}
              className={`px-3 py-1.5 text-[13px] font-semibold ${layout === l ? 'bg-sky-50 text-sky-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {l === 'list' ? 'List' : 'Board'}
            </button>
          ))}
        </div>
      </div>

      {/* Search and filters */}
      <div className={`${CARD} px-4 py-3 flex flex-wrap gap-3 items-end`}>
        <label className="flex-1 min-w-[180px]">
          <span className={LABEL}>Search</span>
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Title, notes, client or person..." className={`${FILTER} w-full`} />
        </label>
        {layout === 'list' && (
          <label>
            <span className={LABEL}>Show</span>
            <select value={showFilter} onChange={e => setShowFilter(e.target.value as 'open' | 'closed' | 'all')} className={FILTER}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </label>
        )}
        <label>
          <span className={LABEL}>Due</span>
          <select value={dueFilter} onChange={e => setDueFilter(e.target.value as DueFilter)} className={FILTER}>
            <option value="">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today (and overdue)</option>
            <option value="week">Due this week</option>
            <option value="none">No due date</option>
          </select>
        </label>
        <label>
          <span className={LABEL}>Priority</span>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className={FILTER}>
            <option value="">Any priority</option>
            {(data.settings?.urgentPriorities || []).length > 0 && <option value={URGENT_FILTER}>Urgent ({data.settings.urgentPriorities.join(', ')})</option>}
            {(data.settings?.priorities || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          <span className={LABEL}>Client</span>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className={`${FILTER} max-w-[180px]`}>
            <option value="">Any client</option>
            <option value={INTERNAL}>Internal (no client)</option>
            {(data.clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>)}
          </select>
        </label>
        {view !== 'mine' && (
          <label>
            <span className={LABEL}>Given to</span>
            <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className={`${FILTER} max-w-[180px]`}>
              <option value="">Anyone</option>
              <option value="none">Nobody yet</option>
              {(data.team || []).filter((t: any) => !t.deleted).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {filtersActive && (
          <button onClick={clearFilters} className="text-xs font-bold text-red-500 hover:underline py-2.5">Clear</button>
        )}
      </div>

      {layout === 'list' ? (
        <div className={`w-full ${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider">{TASK_VIEWS.find((v) => v.id === view)?.label}</h2>
            <span className="text-xs font-semibold text-slate-500 bg-slate-200/60 px-3 py-1 rounded-full">
              {listTasks.length} shown · {boardTasks.filter(isOpen).length} open
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {listTasks.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm font-medium">{emptyText}</div>
            ) : (
              paginated.map((issue: any) => {
                const assignee = data.team?.find((t: any) => t.id === issue.assigneeId);
                const assigneeLabel = assignee?.name || issue.assignee || 'Nobody yet';
                const clientName = issue.clientId ? clientLabel(data.clients, issue.clientId) : 'Internal';
                return (
                  <div key={issue.id} className={`p-4 sm:px-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors hover:bg-slate-50 ${issue.id === selectedIssueId ? 'bg-sky-50' : ''}`}>
                    <button type="button" onClick={() => openIssue(issue.id)} title="Open details" className="flex items-start gap-3 flex-1 min-w-0 text-left group/row">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${priorityDotClass(issue.priority, data.settings)}`} aria-hidden="true"></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm group-hover/row:text-sky-600 transition-colors">{issue.title}</span>
                          <DueTag task={issue} today={today} settings={data.settings} />
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">
                          {issue.priority || 'Medium'} priority · {clientName} · for {assigneeLabel}
                          {issue.createdBy ? ` · raised by ${nameOf(issue.createdBy)}` : ''} · {formatDateStr(issue.createdAt || issue.created)}
                        </div>
                        {descriptionOf(issue) && <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{descriptionOf(issue)}</div>}
                      </div>
                    </button>
                    <div className="flex items-center gap-3 shrink-0">
                      {statusSelect(issue)}
                      {canDeleteTask(issue, viewer, isAdmin) && (
                        <button onClick={(e) => handleDeleteIssue(issue, e)} className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors px-1">
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="grid gap-3 auto-cols-[minmax(240px,1fr)] grid-flow-col min-w-full" aria-label="Task board">
            {statuses.map((status) => {
              const column = boardTasks.filter((t: any) => t.status === status);
              const closed = isClosedIssueStatus(status, data.settings);
              return (
                <section key={status} aria-label={`${status} (${column.length})`} className={`${CARD} flex flex-col min-h-[160px] ${closed ? 'bg-slate-50' : ''}`}>
                  <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-extrabold uppercase tracking-wider ${badgeClass(data.settings, 'issueStatuses', status)}`}>{status}</span>
                    <span className="text-[11px] font-bold text-slate-400">{column.length}</span>
                  </div>
                  <div className="p-2 space-y-2 flex-1 max-h-[65vh] overflow-y-auto">
                    {column.length === 0 && <p className="text-[12px] text-slate-400 italic px-1 py-2">Nothing here.</p>}
                    {column.map((issue: any) => {
                      const assignee = data.team?.find((t: any) => t.id === issue.assigneeId);
                      return (
                        <div key={issue.id} className="rounded-lg border border-slate-200 bg-white p-2.5 hover:border-sky-300 transition-colors">
                          <button type="button" onClick={() => openIssue(issue.id)} className="text-left w-full">
                            <span className="flex items-start gap-2">
                              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${priorityDotClass(issue.priority, data.settings)}`} aria-hidden="true"></span>
                              <span className="text-[13px] font-semibold text-slate-800 leading-snug">{issue.title}</span>
                            </span>
                            <span className="block mt-1 text-[11px] text-slate-500">
                              {issue.clientId ? clientLabel(data.clients, issue.clientId) : 'Internal'} · {assignee?.name || issue.assignee || 'Nobody yet'}
                            </span>
                          </button>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <DueTag task={issue} today={today} settings={data.settings} />
                            {statusSelect(issue, true)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>

      {newTaskOpen && (
        <NewTaskDialog initial={newTaskInitial} viewer={viewer} onCreate={createTask} onClose={() => setNewTaskOpen(false)} />
      )}

      {/* Details panel for one task (opened from a row, a card, or a link from another page). */}
      {selectedIssueId && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => openIssue(null)} aria-hidden="true" />
          <aside role="dialog" aria-modal="true" aria-label="Task details" className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Task</div>
                <h2 className={`${PANEL_TITLE} break-words`}>{selectedIssue ? selectedIssue.title : 'Task not found'}</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedIssue && !editingDetails && (
                  <button onClick={startEditDetails} className="text-xs font-bold text-sky-600 hover:underline px-1">Edit</button>
                )}
                <button onClick={() => openIssue(null)} aria-label="Close details" autoFocus className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-1">×</button>
              </div>
            </div>

            {!selectedIssue ? (
              <div className="p-5 text-sm text-slate-600">This task couldn&apos;t be found. It may have been removed, or the link is wrong.</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {editingDetails && (
                  <form onSubmit={saveDetails} className="space-y-3 bg-sky-50/50 border border-sky-100 rounded-lg p-3">
                    <label className="block">
                      <span className={LABEL}>Title</span>
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)} required className={FIELD} />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Details</span>
                      <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} className={`${FIELD} min-h-[80px]`} />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={!editTitle.trim()} className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON}`}>Save</button>
                      <button type="button" onClick={() => setEditingDetails(false)} className={`${SECONDARY_BUTTON} ${MEDIUM_BUTTON}`}>Cancel</button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL}>Status</span>
                    <select value={selectedIssue.status} onChange={e => handleStatusChange(selectedIssue, e.target.value)} className={FIELD}>
                      {(data.settings?.issueStatuses || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
                      {!(data.settings?.issueStatuses || []).includes(selectedIssue.status) && <option value={selectedIssue.status}>{selectedIssue.status}</option>}
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL}>Priority</span>
                    <select value={selectedIssue.priority || ''} onChange={e => handlePriorityChange(selectedIssue, e.target.value)} className={FIELD}>
                      {(data.settings?.priorities || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
                      {!(data.settings?.priorities || []).includes(selectedIssue.priority) && <option value={selectedIssue.priority || ''}>{selectedIssue.priority || 'None'}</option>}
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL}>Given to</span>
                    <select
                      value={selectedIssue.assigneeId || data.team?.find((t: any) => t.name === selectedIssue.assignee)?.id || ''}
                      onChange={e => handleAssigneeChange(selectedIssue, e.target.value)}
                      className={FIELD}
                    >
                      <option value="">Nobody yet</option>
                      {(data.team || []).filter((t: any) => !t.deleted || t.id === selectedIssue.assigneeId).map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}{t.deleted ? ' (removed)' : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL}>Due</span>
                    <input type="date" aria-label="Due date" value={selectedIssue.dueDate || ''} onChange={e => handleDueDateChange(selectedIssue, e.target.value)} className={FIELD} />
                  </label>
                  <label className="block col-span-2">
                    <span className={LABEL}>Client</span>
                    <select value={selectedIssue.clientId || ''} onChange={e => handleClientChange(selectedIssue, e.target.value)} className={FIELD}>
                      <option value="">Internal work (no client)</option>
                      {(data.clients || []).filter((c: any) => !c.archived || c.id === selectedIssue.clientId).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>
                      ))}
                      {selectedIssue.clientId && !(data.clients || []).some((c: any) => c.id === selectedIssue.clientId) && (
                        <option value={selectedIssue.clientId}>Deleted client</option>
                      )}
                    </select>
                  </label>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <div>
                    Raised {formatDateStr(selectedIssue.createdAt || selectedIssue.created)} {formatTimeStr(selectedIssue.createdAt || selectedIssue.created)}
                    {selectedIssue.createdBy ? ` by ${nameOf(selectedIssue.createdBy)}` : ''}
                  </div>
                  {dueLabel(selectedIssue, today) && !isClosedIssueStatus(selectedIssue.status, data.settings) && <div><DueTag task={selectedIssue} today={today} settings={data.settings} /></div>}
                  {isClosedIssueStatus(selectedIssue.status, data.settings) && (
                    <div>Closed {selectedIssue.resolvedDate ? formatDateStr(selectedIssue.resolvedDate) : '(date not recorded)'}</div>
                  )}
                </div>

                {!editingDetails && descriptionOf(selectedIssue) && (
                  <div>
                    <div className={LABEL}>Details</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{descriptionOf(selectedIssue)}</p>
                  </div>
                )}

                <div>
                  <div className={`${LABEL} mb-2`}>Progress notes</div>
                  <div className="space-y-2">
                    {(selectedIssue.notesHistory || []).map((n: any) => (
                      <div key={n.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                        <div className="text-sm text-slate-700 whitespace-pre-wrap">{n.text}</div>
                        <div className="text-[11px] text-slate-400 mt-1">{n.author || 'Unknown'} · {formatDateStr(n.createdAt)} {formatTimeStr(n.createdAt)}</div>
                      </div>
                    ))}
                    {!(selectedIssue.notesHistory || []).length && (
                      <div className="text-sm text-slate-400 italic">No notes yet.</div>
                    )}
                  </div>
                  <form onSubmit={handleAddNote} className="mt-3 space-y-2">
                    <textarea
                      value={newNoteText}
                      onChange={e => setNewNoteText(e.target.value)}
                      placeholder="What was done, or what is still needed"
                      aria-label="New note"
                      className={`${FIELD} min-h-[80px]`}
                    />
                    <button type="submit" disabled={!newNoteText.trim()} className={`${PRIMARY_BUTTON} ${MEDIUM_BUTTON}`}>Add note</button>
                  </form>
                </div>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
