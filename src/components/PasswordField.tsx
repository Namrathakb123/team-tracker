'use client'

import { useId, useState } from 'react';

// A password box with a Show/Hide button and a warning while Caps Lock is on.
// `autoComplete` tells password managers what it is: "current-password" to sign in, "new-password" for a new one.
export function PasswordField({
  label, value, onChange, autoComplete, autoFocus = false, hint, invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
  hint?: string;
  invalid?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-semibold text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`w-full border rounded-lg p-2.5 pr-16 text-[14px] bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 ${invalid ? 'border-red-300' : 'border-slate-300'}`}
        />
        <button
          type="button"
          onClick={() => setShown(s => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[12px] font-semibold text-sky-700 hover:bg-sky-50"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {capsLock && <p className="mt-1 text-[12px] font-medium text-amber-700">Caps Lock is on.</p>}
      {hint && <p id={`${id}-hint`} className="mt-1 text-[12px] text-slate-500">{hint}</p>}
    </div>
  );
}
