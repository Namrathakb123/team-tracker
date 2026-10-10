'use client'

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import { ACCESS_HELP, ACCESS_LABELS, ACCESS_ROLES, loginMessage, makeStartingPassword, passwordProblem, type AccessRole } from '../utils/accounts';
import { formatDateTime } from '../utils/dates';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_OUTLINE_BUTTON, SMALL_BUTTON, DIALOG, DIALOG_TITLE } from '../utils/styles';

// A login as the server lists it (see src/app/api/accounts.ts).
export interface AccountInfo {
  email: string;
  name: string;
  role: AccessRole | null;
  disabled: boolean;
  mustChangePassword: boolean;
  lastSignIn: string | null;
  createdAt: string | null;
}

// Calls /api/accounts. Resolves to the changed login, or throws an Error with the server's message.
export async function callAccounts(getToken: () => Promise<string | null>, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<AccountInfo> {
  const res = await fetch('/api/accounts', {
    method,
    headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `The login could not be saved (error ${res.status}).`), { exists: !!json.exists });
  return json.account;
}

// The starting password, shown once with a message to send (the app sends no email itself).
export function StartingPasswordResult({ name, email, password, onDone }: { name: string; email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState<'message' | 'password' | 'failed' | null>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { doneButton.current?.focus(); }, []);
  const copy = async (what: 'message' | 'password') => {
    try {
      await navigator.clipboard.writeText(what === 'message' ? loginMessage({ name, email, password }, window.location.origin) : password);
      setCopied(what);
    } catch {
      setCopied('failed');
    }
  };
  return (
    <div className="mt-3 space-y-3">
      <p role="status" className="text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        {name} can now sign in. Send them their email and this starting password privately (for example on WhatsApp).
        They&apos;ll choose their own password the first time they sign in.
      </p>
      <dl className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] space-y-1">
        <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">Email</dt><dd className="font-medium text-slate-800 break-all">{email}</dd></div>
        <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">Starting password</dt><dd className="font-mono font-semibold text-slate-800 break-all" aria-label="Starting password">{password}</dd></div>
      </dl>
      <p className="text-[12px] text-slate-500">This password isn&apos;t shown again. If it gets lost, give them a new one.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => copy('message')} className={`${PRIMARY_BUTTON} ${SMALL_BUTTON}`}>
          {copied === 'message' ? 'Message copied' : 'Copy a message to send them'}
        </button>
        <button type="button" onClick={() => copy('password')} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON}`}>
          {copied === 'password' ? 'Password copied' : 'Copy the password'}
        </button>
      </div>
      {copied === 'failed' && <p role="alert" className="text-[12px] text-red-600">Couldn&apos;t copy. Select the password above and copy it by hand.</p>}
      <button ref={doneButton} type="button" onClick={onDone} className={`w-full ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Done</button>
    </div>
  );
}

// A starting password box, filled in with a new random one that the admin can replace.
function StartingPasswordField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="starting-password" className="block text-[12px] font-semibold text-slate-700 mb-1">Starting password</label>
      <div className="flex gap-2">
        <input
          id="starting-password"
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 border border-slate-300 rounded-lg p-2.5 font-mono text-[13px] bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
        />
        <button type="button" onClick={() => onChange(makeStartingPassword())} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON}`}>New one</button>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">They change it the first time they sign in.</p>
    </div>
  );
}

// Everything about one team member's login, opened from their row on the Team page (admins only).
export function LoginDialog({ member, account, onChanged, onClose }: {
  member: { name: string; email: string };
  account: AccountInfo | null;
  // Called with the login after every change, so the Team page can show it.
  onChanged: (account: AccountInfo) => void;
  onClose: () => void;
}) {
  const { user, getToken } = useAuth();
  const confirm = useConfirm();
  const isSelf = !!account && account.email === (user?.email || '').trim().toLowerCase();
  const [role, setRole] = useState<AccessRole>(account?.role || 'user');
  const [password, setPassword] = useState(() => makeStartingPassword());
  // 'reset' while choosing a new starting password; the result once a starting password was set.
  const [mode, setMode] = useState<'main' | 'reset'>('main');
  const [result, setResult] = useState<{ password: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<AccountInfo>, after?: (saved: AccountInfo) => void) => {
    setBusy(true);
    setProblem(null);
    try {
      const saved = await work();
      onChanged(saved);
      after?.(saved);
    } catch (e: any) {
      setProblem(e?.message || 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const issue = passwordProblem(password);
    if (issue) { setProblem(issue); return; }
    const chosen = password;
    run(() => callAccounts(getToken, 'POST', { email: member.email, name: member.name, role, password: chosen }), () => setResult({ password: chosen }));
  };
  const setNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const issue = passwordProblem(password);
    if (issue) { setProblem(issue); return; }
    const chosen = password;
    run(() => callAccounts(getToken, 'PATCH', { email: account!.email, password: chosen }), () => setResult({ password: chosen }));
  };
  const saveRole = () => run(() => callAccounts(getToken, 'PATCH', { email: account!.email, role }));
  const removeAccess = async () => {
    const ok = await confirm({
      title: `Remove ${member.name}’s access?`,
      message: 'They are signed out straight away and can’t sign in any more. Their work and history stay in the app. You can give access back later.',
      confirmLabel: 'Remove access',
      danger: true,
    });
    if (ok) run(() => callAccounts(getToken, 'PATCH', { email: account!.email, disabled: true }));
  };
  const giveBack = () => run(() => callAccounts(getToken, 'PATCH', { email: account!.email, disabled: false }));

  const status = !account ? 'No login yet.'
    : account.disabled ? 'Access removed: they can’t sign in.'
    : account.mustChangePassword ? 'Hasn’t signed in with their starting password yet.'
    : account.lastSignIn ? `Last signed in ${formatDateTime(account.lastSignIn)}.` : 'Has never signed in.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="login-dialog-title" className={`${DIALOG} w-full max-w-md p-5 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="login-dialog-title" className={DIALOG_TITLE}>Login for {member.name}</h3>
            <p className="text-[12px] text-slate-500 break-all">{member.email}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1">×</button>
        </div>

        {result ? (
          <StartingPasswordResult name={member.name} email={member.email} password={result.password} onDone={onClose} />
        ) : !account ? (
          <form onSubmit={create} className="mt-4 space-y-4">
            <div role="radiogroup" aria-labelledby="new-login-access">
              <p id="new-login-access" className="block text-[12px] font-semibold text-slate-700 mb-1">Access</p>
              <div className="space-y-2">
                {ACCESS_ROLES.map((r) => (
                  <label key={r} className={`flex gap-2 items-start rounded-lg border p-2.5 cursor-pointer ${role === r ? 'border-sky-300 bg-sky-50' : 'border-slate-200'}`}>
                    <input type="radio" name="access" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5" />
                    <span>
                      <span className="block text-[13px] font-semibold text-slate-800">{ACCESS_LABELS[r]}</span>
                      <span className="block text-[12px] text-slate-500">{ACCESS_HELP[r]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <StartingPasswordField value={password} onChange={(v) => { setPassword(v); setProblem(null); }} />
            {problem && <p role="alert" className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{problem}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={busy} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
              <button type="submit" disabled={busy} className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>{busy ? 'Creating…' : 'Create login'}</button>
            </div>
          </form>
        ) : mode === 'reset' ? (
          <form onSubmit={setNewPassword} className="mt-4 space-y-4">
            <p className="text-[13px] text-slate-600">They&apos;ll be signed out everywhere, sign in with this new starting password, and then choose their own again.</p>
            <StartingPasswordField value={password} onChange={(v) => { setPassword(v); setProblem(null); }} />
            {problem && <p role="alert" className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{problem}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => { setMode('main'); setProblem(null); }} disabled={busy} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Back</button>
              <button type="submit" disabled={busy} className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>{busy ? 'Saving…' : 'Set this password'}</button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-[13px] text-slate-600">{status}</p>
            {account.disabled ? (
              <button type="button" onClick={giveBack} disabled={busy} className={`w-full ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>Give access back</button>
            ) : (
              <>
                <div>
                  <label htmlFor="login-role" className="block text-[12px] font-semibold text-slate-700 mb-1">Access</label>
                  <div className="flex gap-2">
                    <select
                      id="login-role"
                      value={role}
                      onChange={e => setRole(e.target.value as AccessRole)}
                      disabled={isSelf || busy}
                      className="flex-1 border border-slate-300 rounded-lg p-2.5 text-[13px] bg-white text-slate-800 focus:outline-none focus:border-sky-500"
                    >
                      {ACCESS_ROLES.map((r) => <option key={r} value={r}>{ACCESS_LABELS[r]}</option>)}
                    </select>
                    <button type="button" onClick={saveRole} disabled={isSelf || busy || role === account.role} className={`${PRIMARY_BUTTON} ${SMALL_BUTTON}`}>Save</button>
                  </div>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {isSelf ? 'This is your own login, so you can’t change its access.' : `${ACCESS_HELP[role]} A change signs them out; they have it when they sign in again.`}
                  </p>
                </div>
                {!isSelf && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => { setPassword(makeStartingPassword()); setMode('reset'); setProblem(null); }} disabled={busy} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON}`}>
                      Give a new starting password
                    </button>
                    <button type="button" onClick={removeAccess} disabled={busy} className={`${DANGER_OUTLINE_BUTTON} ${SMALL_BUTTON}`}>
                      Remove access
                    </button>
                  </div>
                )}
              </>
            )}
            {problem && <p role="alert" className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{problem}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
