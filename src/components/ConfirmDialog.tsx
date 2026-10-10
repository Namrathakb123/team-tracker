'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON, DIALOG, DIALOG_TITLE } from '../utils/styles';

// In-app confirmation dialogs, instead of the browser's own confirm box. `useConfirm()` gives a function that shows
// the dialog and resolves to true when the person confirms (false for Cancel, Escape or a click outside).
export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    setRequest({ ...options, resolve });
  }), []);

  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  // The confirm button is ready to press (Enter), and Escape cancels.
  useEffect(() => {
    if (request) confirmButton.current?.focus();
  }, [request]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) close(false); }}
          onKeyDown={e => { if (e.key === 'Escape') close(false); }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={request.message ? 'confirm-message' : undefined}
            className={`${DIALOG} w-full max-w-sm overflow-hidden`}
          >
            <div className="px-5 pt-5 pb-4">
              <h3 id="confirm-title" className={DIALOG_TITLE}>{request.title}</h3>
              {request.message && <p id="confirm-message" className="text-[13px] text-slate-600 mt-2">{request.message}</p>}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => close(false)}
                className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}
              >
                {request.cancelLabel || 'Cancel'}
              </button>
              <button
                ref={confirmButton}
                type="button"
                data-confirm
                onClick={() => close(true)}
                className={`flex-1 ${request.danger ? DANGER_BUTTON : PRIMARY_BUTTON} py-2.5 text-[13px]`}
              >
                {request.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
