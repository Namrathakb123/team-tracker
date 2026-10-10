'use client'

import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { PasswordField } from './PasswordField';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../utils/accounts';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DIALOG, DIALOG_TITLE } from '../utils/styles';

const RULE = `At least ${MIN_PASSWORD_LENGTH} characters. A short sentence is easy to remember and hard to guess.`;

// The checks both forms make before asking the server.
function newPasswordProblem(password: string, again: string): string | null {
  return passwordProblem(password) || (password !== again ? 'The two passwords are not the same.' : null);
}

// After signing in with a starting password from an admin: the person chooses their own before using the app.
export function ChoosePasswordScreen({ email, onSave, onSignOut }: {
  email: string;
  onSave: (password: string) => Promise<string | null>;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const local = newPasswordProblem(password, again);
    if (local) {
      setProblem(local);
      return;
    }
    setBusy(true);
    const result = await onSave(password);
    setBusy(false);
    setProblem(result);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <div className="flex items-center gap-2 text-slate-800">
          <Logo size={28} />
          <span className="font-bold tracking-tight">Team Tracker</span>
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-slate-800 tracking-tight">Choose your own password</h1>
        <p className="mt-2 text-[14px] text-slate-600">
          You signed in as <span className="font-semibold text-slate-800 break-all">{email}</span> with a starting password from your admin.
          Choose a password only you know.
        </p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <PasswordField label="New password" value={password} onChange={v => { setPassword(v); setProblem(null); }} autoComplete="new-password" autoFocus hint={RULE} invalid={!!problem} />
          <PasswordField label="New password again" value={again} onChange={v => { setAgain(v); setProblem(null); }} autoComplete="new-password" invalid={!!problem} />
          {problem && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{problem}</p>}
          <button type="submit" disabled={busy} className={`w-full ${PRIMARY_BUTTON} py-3 text-[15px] shadow-sm`}>
            {busy ? 'Saving…' : 'Save my password'}
          </button>
        </form>
        <button type="button" onClick={onSignOut} className={`mt-3 w-full ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// "Change password" from the menu: asks for the current password, then the new one twice.
export function ChangePasswordDialog({ onSave, onClose }: {
  onSave: (current: string, next: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const doneButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (done) doneButton.current?.focus(); }, [done]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const local = (current ? null : 'Enter your current password.') || newPasswordProblem(password, again);
    if (local) {
      setProblem(local);
      return;
    }
    setBusy(true);
    const result = await onSave(current, password);
    setBusy(false);
    if (result) setProblem(result);
    else setDone(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="change-password-title" className={`${DIALOG} w-full max-w-sm p-5`}>
        <h3 id="change-password-title" className={DIALOG_TITLE}>Change password</h3>
        {done ? (
          <>
            <p role="status" className="mt-3 text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              Your password is changed. Use the new one next time you sign in.
            </p>
            <button ref={doneButton} type="button" onClick={onClose} className={`mt-4 w-full ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>Done</button>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="mt-4 space-y-4">
            <PasswordField label="Current password" value={current} onChange={v => { setCurrent(v); setProblem(null); }} autoComplete="current-password" autoFocus />
            <PasswordField label="New password" value={password} onChange={v => { setPassword(v); setProblem(null); }} autoComplete="new-password" hint={RULE} />
            <PasswordField label="New password again" value={again} onChange={v => { setAgain(v); setProblem(null); }} autoComplete="new-password" />
            {problem && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{problem}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} disabled={busy} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
              <button type="submit" disabled={busy} className={`flex-1 ${PRIMARY_BUTTON} py-2.5 text-[13px]`}>{busy ? 'Saving…' : 'Change password'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
