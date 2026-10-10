'use client'

import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { PasswordField } from './PasswordField';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DIALOG, DIALOG_TITLE } from '../utils/styles';

// What the team uses the app for, shown beside the sign-in form.
const FEATURES = [
  { title: 'Daily updates', text: 'What happened today, for every client.', icon: <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></> },
  { title: 'Tasks', text: 'Work given out, followed up and finished.', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
  { title: 'Clients and leads', text: 'Deals, follow-ups and the full history.', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> },
  { title: 'Meetings', text: 'Every meeting, its link, and who can’t make it.', icon: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
];

// "Forgot password?": only an admin can set a new starting password (the app sends no emails).
function ForgotPasswordDialog({ onClose }: { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeButton.current?.focus(); }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="forgot-title" className={`${DIALOG} w-full max-w-sm p-5`}>
        <h3 id="forgot-title" className={DIALOG_TITLE}>Forgot your password?</h3>
        <p className="mt-2 text-[13px] text-slate-600">
          Contact your admin. They can give you a new starting password from the Team page in a minute.
        </p>
        <p className="mt-2 text-[13px] text-slate-600">
          Sign in with it, and you&apos;ll be asked to choose your own password again.
        </p>
        <button ref={closeButton} type="button" onClick={onClose} className={`mt-5 w-full ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>
          OK
        </button>
      </div>
    </div>
  );
}

// The first screen people see: what the app is for, and the sign-in form. On phones the description is shortened
// so the form stays on the first screen. `preview` shows it on this computer without signing out.
export function SignInScreen({ onSignIn, error, preview = false }: {
  onSignIn: (email: string, password: string) => Promise<boolean> | void;
  error: string | null;
  preview?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || preview) return;
    setBusy(true);
    try {
      await onSignIn(email, password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f8fafc]">
      {preview && (
        <div role="status" className="fixed top-0 inset-x-0 z-50 bg-amber-100 text-amber-900 text-[12px] font-semibold text-center py-1.5">
          Preview of the sign-in page (only on this computer). Signing in does nothing here.
        </div>
      )}
      <section className="bg-[#1e293b] text-slate-300 px-6 py-8 md:w-1/2 md:px-14 md:py-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h1 className="text-white text-xl font-bold tracking-tight">Team Tracker</h1>
              <p className="text-[13px] text-slate-400">by Velvo Media</p>
            </div>
          </div>
          <p className="mt-8 md:mt-16 text-2xl md:text-4xl font-extrabold text-white leading-tight max-w-md">
            Everything the team is working on, in one place.
          </p>
          <ul className="hidden md:block mt-10 space-y-6 max-w-md">
            {FEATURES.map(f => (
              <li key={f.title} className="flex gap-4">
                <span className="shrink-0 w-10 h-10 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.icon}</svg>
                </span>
                <span>
                  <span className="block text-white font-semibold">{f.title}</span>
                  <span className="block text-[14px] text-slate-400">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="hidden md:block mt-12 text-[12px] text-slate-500">An internal tool for the Velvo Media team.</p>
      </section>

      <section className="flex-1 flex items-center justify-center px-6 py-10 md:p-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Sign in</h2>
          <p className="mt-1 text-[14px] text-slate-500">Use the email and password your admin gave you.</p>
          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="sign-in-email" className="block text-[12px] font-semibold text-slate-700 mb-1">Email</label>
              <input
                id="sign-in-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@velvo.in"
                className="w-full border border-slate-300 rounded-lg p-2.5 text-[14px] bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>
            <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className={`w-full ${PRIMARY_BUTTON} py-3 text-[15px] shadow-sm`}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <button type="button" onClick={() => setForgotOpen(true)} className="mt-3 text-[13px] font-semibold text-sky-700 hover:underline">
            Forgot password?
          </button>
          <div className="mt-6 rounded-lg bg-white border border-slate-200 p-4 text-[13px] text-slate-600">
            <p className="font-semibold text-slate-700">First time here?</p>
            <p className="mt-1">Ask an admin to give you a login on the Team page. You&apos;ll get a starting password, and choose your own when you first sign in.</p>
          </div>
        </div>
      </section>
      {forgotOpen && <ForgotPasswordDialog onClose={() => setForgotOpen(false)} />}
    </div>
  );
}
