'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { isClosedIssueStatus, isActiveClientStatus } from '../utils/issues';
import { tidyName, sameName } from '../utils/clients';
import { emailKey } from '../utils/team';
import { formatDate } from '../utils/dates';
import { ACCESS_LABELS, emailProblem, makeStartingPassword, type AccessRole } from '../utils/accounts';
import { MEETING_GROUPS, NOT_IN_MEETING, DEFAULT_MEETING_GROUP, memberGroup } from '../utils/absences';
import { LoginDialog, StartingPasswordResult, callAccounts, type AccountInfo } from './LoginDialog';
import { PageHeader } from './PageHeader';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON, SMALL_BUTTON, CARD, DIALOG, SECTION_TITLE, DIALOG_TITLE } from '../utils/styles';

// The choices for someone's group on the daily meeting list.
const MEETING_GROUP_OPTIONS = [...MEETING_GROUPS.map((g) => ({ value: g, label: g })), { value: NOT_IN_MEETING, label: 'Not in the meeting' }];
const meetingGroupLabel = (group: string) => (group === NOT_IN_MEETING ? 'Not in the meeting' : group);
const MEETING_GROUP_TAG: Record<string, string> = {
  Admin: 'bg-sky-50 text-sky-700 border-sky-200',
  Team: 'bg-slate-50 text-slate-700 border-slate-200',
  Intern: 'bg-violet-50 text-violet-700 border-violet-200',
};
const ACCESS_TAG: Record<AccessRole, string> = {
  admin: 'bg-sky-50 text-sky-700 border-sky-200',
  user: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
// The add form's choice for "no login".
const NO_LOGIN = 'none';

export function TeamView({ navigateTo }: { navigateTo?: (view: string, params?: any) => void } = {}) {
  const { data, saveData } = useData();
  // Only admins can change the team (the server refuses changes from anyone else), so others get a read-only page.
  const { isAdmin, authToken, getToken } = useAuth();

  // Admins see everyone's login (the logins themselves are kept by Firebase; see /api/accounts).
  const [accounts, setAccounts] = useState<AccountInfo[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts', { headers: { Authorization: `Bearer ${await getToken()}` } });
      if (!res.ok) throw new Error();
      setAccounts((await res.json()).accounts || []);
      setAccountsError(null);
    } catch {
      setAccountsError('Couldn’t load who has a login. Reload the page to try again.');
    }
  }, [getToken]);
  useEffect(() => {
    if (isAdmin && authToken) loadAccounts();
  }, [isAdmin, authToken, loadAccounts]);
  const accountFor = (email: string | undefined) => (accounts || []).find((a) => emailKey(a.email) === emailKey(email)) || null;
  const keepAccount = (account: AccountInfo) => setAccounts((list) => [...(list || []).filter((a) => emailKey(a.email) !== emailKey(account.email)), account]);

  const accessCell = (member: any) => {
    if (accounts === null) return <span className="text-slate-300">{accountsError ? '?' : '…'}</span>;
    if (!emailKey(member.email)) return <span className="text-slate-400" title="Add their email (Edit) to give them a login.">No email</span>;
    const account = accountFor(member.email);
    if (!account || !account.role) return <span className="text-slate-400">No login</span>;
    if (account.disabled) return <span className="inline-flex px-2 py-0.5 rounded border text-[11px] font-semibold bg-slate-100 text-slate-500 border-slate-200">Access removed</span>;
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-semibold ${ACCESS_TAG[account.role]}`}>{ACCESS_LABELS[account.role]}</span>
        <span className="text-[10px] text-slate-400">
          {account.mustChangePassword ? 'Not signed in yet' : account.lastSignIn ? `Signed in ${formatDate(account.lastSignIn.slice(0, 10))}` : 'Never signed in'}
        </span>
      </span>
    );
  };

  // A problem with a login, shown above the table.
  const [pageError, setPageError] = useState<string | null>(null);
  // The login window, and the starting password of a login just made from the add form.
  const [loginFor, setLoginFor] = useState<any | null>(null);
  const [newLogin, setNewLogin] = useState<{ name: string; email: string; password: string } | null>(null);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<string>('user');
  const [meetingGroup, setMeetingGroup] = useState(DEFAULT_MEETING_GROUP);
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);

  // Editing a team member in place (admins only).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGroup, setEditGroup] = useState(DEFAULT_MEETING_GROUP);
  const [editError, setEditError] = useState<string | null>(null);
  const startEdit = (member: any) => {
    setEditingId(member.id);
    setEditName(member.name || '');
    setEditRole(member.role || '');
    setEditEmail(member.email || '');
    setEditGroup(memberGroup(member));
    setEditError(null);
  };
  const cancelOnEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditingId(null);
  };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const member = (data.team || []).find((t) => t.id === editingId);
    const updated = { name: tidyName(editName), role: tidyName(editRole), email: editEmail.trim(), meetingGroup: editGroup };
    if (!member || !updated.name || editEmailOwner) return; // a repeated email is refused (the row says why)
    if (updated.email && emailProblem(updated.email)) { setEditError(emailProblem(updated.email)); return; }
    const changes: string[] = [];
    if (updated.name !== (member.name || '')) changes.push(`name: ${member.name} → ${updated.name}`);
    if (updated.role !== (member.role || '')) changes.push(`role: ${member.role || '—'} → ${updated.role || '—'}`);
    if (updated.email !== (member.email || '')) changes.push(`email: ${member.email || '—'} → ${updated.email || '—'}`);
    if (updated.meetingGroup !== memberGroup(member)) changes.push(`meeting group: ${meetingGroupLabel(memberGroup(member))} → ${meetingGroupLabel(updated.meetingGroup)}`);
    // Their login follows their email and name. Someone with a login keeps an email.
    const account = accountFor(member.email);
    const emailChanged = emailKey(updated.email) !== emailKey(member.email);
    if (account && emailChanged && !updated.email) { setEditError('They have a login, so they need an email. Remove their access first if they shouldn’t sign in.'); return; }
    if (account && (emailChanged || updated.name !== account.name)) {
      try {
        keepAccount(await callAccounts(getToken, 'PATCH', { email: account.email, ...(emailChanged ? { newEmail: updated.email } : {}), name: updated.name }));
        if (emailChanged) setAccounts((list) => (list || []).filter((a) => emailKey(a.email) !== emailKey(member.email) || emailKey(a.email) === emailKey(updated.email)));
      } catch (error: any) {
        setEditError(`${error?.message || 'Their login could not be changed.'} Nothing was saved.`);
        return;
      }
    }
    if (changes.length > 0) {
      saveData({
        ...data,
        team: data.team.map((t) => t.id === member.id ? { ...t, ...updated } : t)
      }, 'TEAM_EDIT', `Edited ${member.name}: ${changes.join('; ')}`);
    }
    setEditingId(null);
  };

  // Duplicates: an email belongs to one team member only (it links them to their login), so a repeated email is
  // refused. Two people can share a name, so a repeated name is only pointed out.
  const emailOwner = (value: string, exceptId: string | null): any | null => {
    const key = emailKey(value);
    return key ? (data.team || []).find((t) => t && t.id !== exceptId && emailKey(t.email) === key) || null : null;
  };
  const nameTwin = (value: string, exceptId: string | null): any | null =>
    tidyName(value) ? (data.team || []).find((t) => t && !t.deleted && t.id !== exceptId && sameName(t.name, value)) || null : null;
  const addEmailOwner = emailOwner(email, null);
  const addNameTwin = nameTwin(name, null);
  const addEmailProblem = email.trim() ? emailProblem(email) : null;
  const addNeedsEmail = access !== NO_LOGIN && !email.trim();
  const editEmailOwner = editingId ? emailOwner(editEmail, editingId) : null;
  const editNameTwin = editingId ? nameTwin(editName, editingId) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newName = tidyName(name);
    if (!newName || addEmailOwner || addEmailProblem || addNeedsEmail || adding) return; // the form says why

    const newTeamMember = {
      id: Date.now().toString(),
      name: newName,
      role: tidyName(role),
      email: email.trim(),
      meetingGroup,
      deleted: false
    };
    setAdding(true);
    setPageError(null);
    const saved = await saveData({ ...data, team: [...(data.team || []), newTeamMember] }, 'TEAM_ADD', `Added ${newName} to the team`);
    if (saved && access !== NO_LOGIN) {
      const password = makeStartingPassword();
      try {
        keepAccount(await callAccounts(getToken, 'POST', { email: newTeamMember.email, name: newName, role: access, password }));
        setNewLogin({ name: newName, email: newTeamMember.email, password });
      } catch (error: any) {
        setPageError(error?.exists
          ? `${newName} was added. This email already had a login, so it was kept: use Login on their row to check it.`
          : `${newName} was added to the team, but their login wasn’t made: ${error?.message || 'please try again'}. Use Login on their row to try again.`);
        loadAccounts();
      }
    }
    setAdding(false);
    if (saved) {
      setName('');
      setRole('');
      setEmail('');
      setMeetingGroup(DEFAULT_MEETING_GROUP);
    }
  };

  // Someone removed earlier whose email is typed again is brought back rather than added a second time.
  const bringBack = (member: any) => {
    saveData({
      ...data,
      team: data.team.map((t) => t.id === member.id ? { ...t, deleted: false } : t)
    }, 'TEAM_RESTORE', `Brought ${member.name} back to the team`);
    setName('');
    setRole('');
    setEmail('');
  };

  // Removing someone: a window shows the work they're responsible for and asks who takes it over.
  const NOBODY = '__nobody__';
  const [removing, setRemoving] = useState<any | null>(null);
  const [successorId, setSuccessorId] = useState('');
  const handleDelete = (member: any) => {
    setRemoving(member);
    setSuccessorId('');
  };
  const workOf = (id: string) => ({
    clients: (data.clients || []).filter((c) => (c.team || []).includes(id) || c.assignedTo === id),
    leads: (data.leads || []).filter((l) => l.assignedTo === id),
    issues: (data.issues || []).filter((i) => i.assigneeId === id && !isClosedIssueStatus(i.status, data.settings)),
  });
  const describeWork = (work: ReturnType<typeof workOf>) => {
    const parts = [
      work.clients.length ? `${work.clients.length} ${work.clients.length === 1 ? 'client' : 'clients'}` : '',
      work.leads.length ? `${work.leads.length} ${work.leads.length === 1 ? 'lead' : 'leads'}` : '',
      work.issues.length ? `${work.issues.length} open ${work.issues.length === 1 ? 'task' : 'tasks'}` : '',
    ].filter(Boolean);
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
  };
  const confirmRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!removing) return;
    const member = removing;
    const id = member.id;
    const work = workOf(id);
    const workCount = work.clients.length + work.leads.length + work.issues.length;
    const hasWork = workCount > 0;
    if (hasWork && !successorId) return; // the window asks for a choice
    const to: string | null = successorId && successorId !== NOBODY ? successorId : null;
    const handOver = (list: string[]) => Array.from(new Set(list.map(x => (x === id ? to : x)).filter(Boolean))) as string[];
    const clients = (data.clients || []).map((c) => ((c.team || []).includes(id) || c.assignedTo === id)
      ? { ...c, team: handOver(c.team || []), assignedTo: c.assignedTo === id ? to : c.assignedTo }
      : c);
    const leads = (data.leads || []).map((l) => l.assignedTo === id ? { ...l, assignedTo: to } : l);
    const openIssueIds = new Set(work.issues.map((i) => i.id));
    const issues = (data.issues || []).map((i) => openIssueIds.has(i.id) ? { ...i, assigneeId: to } : i);
    const team = data.team.map((t) => t.id === id ? { ...t, deleted: true } : t);
    const successor = to ? (data.team || []).find((t) => t.id === to)?.name : null;
    const details = hasWork
      ? `Removed ${member.name} from the team. Their ${describeWork(work)} ${successor ? `went to ${successor}` : `${workCount === 1 ? 'was' : 'were'} left unassigned`}.`
      : `Removed ${member.name} from the team.`;
    setRemoving(null);
    const saved = await saveData({ ...data, team, clients, leads, issues }, 'TEAM_REMOVE', details);
    // Someone who leaves the team can't sign in any more.
    const account = accountFor(member.email);
    if (saved && account && !account.disabled) {
      try {
        keepAccount(await callAccounts(getToken, 'PATCH', { email: account.email, disabled: true }));
      } catch (error: any) {
        setPageError(`${member.name} was removed from the team, but their login is still on: ${error?.message || 'please try again'}. Bring them back to the list to remove it, or tell the app’s owner.`);
      }
    }
  };

  const activeTeam = (data.team || []).filter((t) => !t.deleted);

  const filteredTeam = activeTeam.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (t.name || '').toLowerCase().includes(q) ||
           (t.email || '').toLowerCase().includes(q) ||
           (t.role || '').toLowerCase().includes(q);
  });

  const totalMembersCount = activeTeam.length;
  const activeClientsStaffedCount = useMemo(() => {
    return activeTeam.filter((m) =>
      (data.clients || []).some((c: any) =>
        !c.archived &&
        isActiveClientStatus(c.status, data.settings) &&
        ((c.team || []).includes(m.id) || c.assignedTo === m.id || (c.team || []).includes(m.name) || c.assignedTo === m.name)
      )
    ).length;
  }, [activeTeam, data.clients, data.settings]);
  const totalOpenTasksAssigned = useMemo(() => {
    const memberIds = new Set(activeTeam.map((m) => m.id));
    const memberNames = new Set(activeTeam.map((m) => m.name));
    return (data.issues || []).filter((i: any) =>
      !isClosedIssueStatus(i.status, data.settings) &&
      (memberIds.has(i.assigneeId) || memberNames.has(i.assigneeId))
    ).length;
  }, [activeTeam, data.issues, data.settings]);
  const meetingMembersCount = useMemo(() => {
    return activeTeam.filter((m) => memberGroup(m) !== NOT_IN_MEETING).length;
  }, [activeTeam]);

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-8">
      <PageHeader
        title="Team Directory"
        subtitle={isAdmin
          ? 'Add people, give them a login, and see their active work.'
          : 'See who is on the team. Only admins can add or remove team members.'}
      />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          title="Show all active team members"
          className="bg-white border border-slate-200 rounded-lg p-4 text-left transition-all hover:border-slate-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 cursor-pointer"
        >
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Team Members</span>
          <span className="block text-2xl font-extrabold text-slate-800 mt-2">{totalMembersCount}</span>
          <span className="block text-[11px] text-slate-400 mt-1">Active staff members</span>
        </button>

        <div className="bg-white border border-slate-200 rounded-lg p-4 text-left">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active On Clients</span>
          <span className="block text-2xl font-extrabold text-emerald-600 mt-2">{activeClientsStaffedCount}</span>
          <span className="block text-[11px] text-slate-400 mt-1">Staffing active accounts</span>
        </div>

        <button
          type="button"
          onClick={() => navigateTo && navigateTo('issues')}
          title="View open tasks"
          className="bg-white border border-slate-200 rounded-lg p-4 text-left transition-all hover:border-slate-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 cursor-pointer"
        >
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assigned Tasks</span>
          <span className={`block text-2xl font-extrabold mt-2 ${totalOpenTasksAssigned > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
            {totalOpenTasksAssigned}
          </span>
          <span className="block text-[11px] text-slate-400 mt-1">Open tasks across team</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo && navigateTo('meeting')}
          title="View daily meeting roster"
          className="bg-white border border-slate-200 rounded-lg p-4 text-left transition-all hover:border-slate-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 cursor-pointer"
        >
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Meeting Roster</span>
          <span className="block text-2xl font-extrabold text-sky-600 mt-2">{meetingMembersCount}</span>
          <span className="block text-[11px] text-slate-400 mt-1">In daily meeting</span>
        </button>
      </div>

      {/* Add Member Form */}
      {isAdmin && (
      <div className={CARD}>
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className={SECTION_TITLE}>Add Team Member</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <input aria-label="New member's name"
              type="text"
              placeholder="Full Name"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 transition-all bg-slate-50 font-medium text-slate-700"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <input aria-label="New member's job role"
              type="text"
              placeholder="Job Role / Title (Optional)"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 transition-all bg-slate-50 font-medium text-slate-700"
              value={role}
              onChange={e => setRole(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <input aria-label="New member's email"
              type="email"
              placeholder={access === NO_LOGIN ? 'Email Address (Optional)' : 'Email Address (for their login)'}
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 transition-all bg-slate-50 font-medium text-slate-700"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="min-w-[160px]">
            <select aria-label="New member's meeting group" title="Their group on the daily meeting list"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 transition-all bg-slate-50 font-medium text-slate-700"
              value={meetingGroup}
              onChange={e => setMeetingGroup(e.target.value)}
            >
              {MEETING_GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value === NOT_IN_MEETING ? o.label : `Meeting: ${o.label}`}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <select aria-label="New member's login" title="Whether they can sign in, and as what"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 transition-all bg-slate-50 font-medium text-slate-700"
              value={access}
              onChange={e => setAccess(e.target.value)}
            >
              <option value="user">Login: User</option>
              <option value="admin">Login: Admin</option>
              <option value={NO_LOGIN}>No login</option>
            </select>
          </div>
          <div>
            <button type="submit" disabled={!!addEmailOwner || !!addEmailProblem || addNeedsEmail || adding} className={`${PRIMARY_BUTTON} px-8 h-[42px] text-[13px]`}>
              {adding ? 'Adding…' : 'Add Member'}
            </button>
          </div>
          {addEmailOwner ? (
            <p role="alert" className="basis-full text-[12px] text-red-600">
              {addEmailOwner.deleted ? (
                <>
                  {addEmailOwner.name}, who was removed from the team, has this email.{' '}
                  <button type="button" onClick={() => bringBack(addEmailOwner)} className="font-semibold underline hover:text-red-800">Bring them back</button>
                </>
              ) : `${addEmailOwner.name} already has this email.`}
            </p>
          ) : addEmailProblem ? (
            <p role="alert" className="basis-full text-[12px] text-red-600">{addEmailProblem}</p>
          ) : addNameTwin ? (
            <p role="alert" className="basis-full text-[12px] text-amber-700">
              Someone called “{addNameTwin.name}” is already on the team. Add them anyway only if this is a different person.
            </p>
          ) : (
            <p className="basis-full text-[12px] text-slate-500">
              {access === NO_LOGIN
                ? 'They are on the team (work can be given to them) but can’t sign in. You can give them a login later.'
                : 'Add their email, and they get a login with a starting password to send them. They choose their own password when they first sign in.'}
            </p>
          )}
        </form>
      </div>
      )}

      {isAdmin && (pageError || accountsError) && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start justify-between gap-3">
          <span>{pageError || accountsError}</span>
          {pageError && <button onClick={() => setPageError(null)} aria-label="Close message" className="text-red-400 hover:text-red-700 text-lg leading-none">×</button>}
        </div>
      )}

      {/* Search Bar */}
      <div className={`${CARD} px-4 py-3 flex flex-wrap gap-4 items-center justify-between`}>
        <div className="flex items-center gap-2 flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input aria-label="Search team members"
            type="text"
            placeholder="Search team members by name, role, or email..."
            className="w-full bg-transparent border-none text-[13px] outline-none text-slate-800 placeholder:text-slate-400 font-medium"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Team Table (the edit row's boxes belong to this form) */}
      <form id="team-edit" onSubmit={saveEdit} className="hidden" />
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[880px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]">Team Member</th>
              <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]">Contact Email</th>
              <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]" title="Their group on the daily meeting list">Daily Meeting</th>
              {isAdmin && <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px]" title="Whether they can sign in, and as what (Admin or User)">Access</th>}
              {/* Work counts only for admins: a user sees only their own work, so their counts would be partial. */}
              {isAdmin && <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px] text-center" title="Clients with a status ticked Active in Customize that this person works on">Active Clients</th>}
              {isAdmin && <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px] text-center">Open Tasks</th>}
              {isAdmin && <th className="px-4 py-3 font-bold uppercase tracking-widest text-slate-500 text-[10px] text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTeam.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 3} className="p-8 text-center text-slate-400 text-[13px] font-medium italic">No team members found.</td></tr>
            ) : (
              filteredTeam.map((member) => {
                // Active clients (a status ticked Active in Customize, not archived) they're on the team of, or assigned to.
                const assignedClients = data.clients?.filter((c) =>
                  !c.archived && isActiveClientStatus(c.status, data.settings) && ((c.team || []).includes(member.id) || c.assignedTo === member.id)
                ).length || 0;
                const openIssues = data.issues?.filter((i) => i.assigneeId === member.id && !isClosedIssueStatus(i.status, data.settings)).length || 0;

                if (editingId === member.id) {
                  return (
                    <tr key={member.id} className="bg-sky-50/40">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <input form="team-edit" aria-label="Name" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={cancelOnEscape} required autoFocus className="w-full border border-slate-200 rounded-lg p-2 text-[13px] focus:outline-none focus:border-sky-500 bg-white font-bold text-slate-800" />
                          {editNameTwin && <p role="alert" className="text-[11px] text-amber-700">Someone else is called “{editNameTwin.name}”.</p>}
                          <input form="team-edit" aria-label="Job role" value={editRole} onChange={e => setEditRole(e.target.value)} onKeyDown={cancelOnEscape} placeholder="Job Role / Title (Optional)" className="w-full border border-slate-200 rounded-lg p-2 text-[12px] focus:outline-none focus:border-sky-500 bg-white font-medium text-slate-600" />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <input form="team-edit" type="email" aria-label="Email" value={editEmail} onChange={e => { setEditEmail(e.target.value); setEditError(null); }} onKeyDown={cancelOnEscape} placeholder="Email Address (Optional)" className="w-full border border-slate-200 rounded-lg p-2 text-[13px] focus:outline-none focus:border-sky-500 bg-white font-medium text-slate-600" />
                        {editEmailOwner && <p role="alert" className="mt-1 text-[11px] text-red-600">{editEmailOwner.name}{editEmailOwner.deleted ? ' (removed from the team)' : ''} already has this email.</p>}
                        {editError && <p role="alert" className="mt-1 text-[11px] text-red-600">{editError}</p>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <select form="team-edit" aria-label="Meeting group" value={editGroup} onChange={e => setEditGroup(e.target.value)} onKeyDown={cancelOnEscape} className="w-full border border-slate-200 rounded-lg p-2 text-[13px] focus:outline-none focus:border-sky-500 bg-white font-medium text-slate-600">
                          {MEETING_GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          {!MEETING_GROUP_OPTIONS.some((o) => o.value === editGroup) && <option value={editGroup}>{editGroup}</option>}
                        </select>
                      </td>
                      <td className="px-4 py-3 align-top pt-5 text-[12px]">{accessCell(member)}</td>
                      <td className="px-4 py-3 text-center font-mono text-[12px] font-bold text-slate-700 align-top pt-5">{assignedClients}</td>
                      <td className="px-4 py-3 text-center font-mono text-[12px] font-bold text-slate-700 align-top pt-5">{openIssues}</td>
                      <td className="px-4 py-3 text-right align-top whitespace-nowrap">
                        <button type="submit" form="team-edit" disabled={!editName.trim() || !!editEmailOwner} className={`${PRIMARY_BUTTON} ${SMALL_BUTTON}`}>Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className={`ml-2 ${SECONDARY_BUTTON} ${SMALL_BUTTON}`}>Cancel</button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-[13px]">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-[13px] text-slate-800">{member.name}</div>
                          <div className="text-[11px] font-medium text-slate-500 mt-0.5">{member.role || 'Team Member'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-slate-600">
                      {member.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {memberGroup(member) === NOT_IN_MEETING
                        ? <span className="text-slate-400">Not in the meeting</span>
                        : <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-semibold ${MEETING_GROUP_TAG[memberGroup(member)] || MEETING_GROUP_TAG.Team}`}>{memberGroup(member)}</span>}
                    </td>
                    {isAdmin && <td className="px-4 py-3 text-[12px]">{accessCell(member)}</td>}
                    {isAdmin && (
                      <td className="px-4 py-3 text-center font-mono text-[12px] font-bold text-slate-700">
                        {assignedClients}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-center font-mono text-[12px] font-bold text-slate-700">
                        {openIssues > 0 ? <span className="text-red-500">{openIssues}</span> : '0'}
                      </td>
                    )}
                    {isAdmin && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {navigateTo && (
                        <button
                          onClick={() => navigateTo('work', { selectedMemberId: member.id })}
                          aria-label={`Work of ${member.name}`}
                          className="mr-4 text-[11px] font-bold text-sky-600 hover:text-sky-800 hover:underline transition-colors uppercase tracking-wider"
                        >
                          Work
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(member)}
                        className="mr-4 text-[11px] font-bold text-sky-600 hover:text-sky-800 hover:underline transition-colors uppercase tracking-wider"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setLoginFor(member)}
                        disabled={!emailKey(member.email) || accounts === null}
                        title={emailKey(member.email) ? `Login for ${member.name}` : 'Add their email (Edit) to give them a login.'}
                        aria-label={`Login for ${member.name}`}
                        className="mr-4 text-[11px] font-bold text-sky-600 hover:text-sky-800 hover:underline transition-colors uppercase tracking-wider disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        Login
                      </button>
                      <button
                        onClick={() => handleDelete(member)}
                        className="text-[11px] font-bold text-red-500 hover:text-red-700 hover:underline transition-colors uppercase tracking-wider"
                      >
                        Remove
                      </button>
                    </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {loginFor && (
        <LoginDialog
          member={{ name: loginFor.name, email: loginFor.email }}
          account={accountFor(loginFor.email)}
          onChanged={keepAccount}
          onClose={() => setLoginFor(null)}
        />
      )}

      {newLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="new-login-title" className={`${DIALOG} w-full max-w-md p-5`}>
            <h3 id="new-login-title" className={DIALOG_TITLE}>Login ready for {newLogin.name}</h3>
            <StartingPasswordResult name={newLogin.name} email={newLogin.email} password={newLogin.password} onDone={() => setNewLogin(null)} />
          </div>
        </div>
      )}

      {removing && (() => {
        const work = workOf(removing.id);
        const summary = describeWork(work);
        const others = activeTeam.filter((t) => t.id !== removing.id);
        const account = accountFor(removing.email);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setRemoving(null); }}
            onKeyDown={e => { if (e.key === 'Escape') setRemoving(null); }}
          >
            <div role="dialog" aria-modal="true" aria-label="Remove team member" className={`${DIALOG} w-full max-w-md overflow-hidden`}>
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
                <h3 className={DIALOG_TITLE}>Remove {removing.name}?</h3>
                <p className="text-[12px] text-slate-500 mt-1">
                  They won&apos;t appear in lists any more. Their history is kept.
                  {account && !account.disabled ? ' Their login stops working straight away.' : ''}
                </p>
              </div>
              <form onSubmit={confirmRemove} className="p-4 space-y-4">
                {summary ? (
                  <>
                    <p className="text-[13px] text-slate-700">They&apos;re responsible for {summary}.</p>
                    <label className="block">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Hand their work over to</span>
                      <select autoFocus required value={successorId} onChange={e => setSuccessorId(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium">
                        <option value="" disabled>Choose…</option>
                        {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        <option value={NOBODY}>Nobody (leave it unassigned)</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <p className="text-[13px] text-slate-700">Nothing is assigned to them.</p>
                )}
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setRemoving(null)} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
                  <button type="submit" autoFocus={!summary} disabled={!!summary && !successorId} className={`flex-1 ${DANGER_BUTTON} py-2.5 text-[13px]`}>Remove</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
