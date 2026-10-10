'use client'

// The meetings the signed-in person may see (admins: all of them), loaded once for the whole app: the Meetings page,
// the meeting reminder at the top of every page and the Dashboard's "My day" all use this list. It is loaded again
// every two minutes, when you come back to the tab, and after you add, change or remove a meeting. The daily team
// meeting isn't in it: its details are settings (see utils/meetings.ts, dailyMeeting).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import type { Meeting } from '../types';
import type { MeetingDraft } from '../utils/meetings';

interface MeetingsContextType {
  /** null until they have loaded. */
  meetings: Meeting[] | null;
  error: string | null;
  reload: () => void;
  /** Adds a meeting (no id) or changes one. Resolves to the saved meeting, or the reason it wasn't saved. */
  saveMeeting: (draft: MeetingDraft, id?: string) => Promise<{ meeting?: Meeting; problem?: string }>;
  /** Removes a meeting. Resolves to null when it worked, or the reason it didn't. */
  removeMeeting: (id: string) => Promise<string | null>;
  /** One date of a repeating meeting with no meeting (and why), or back on. Resolve to null, or the reason it failed. */
  skipDate: (id: string, date: string, note: string) => Promise<string | null>;
  unskipDate: (id: string, date: string) => Promise<string | null>;
}

const MeetingsContext = createContext<MeetingsContextType>({
  meetings: null, error: null, reload: () => {}, saveMeeting: async () => ({ problem: 'Not ready yet.' }), removeMeeting: async () => 'Not ready yet.',
  skipDate: async () => 'Not ready yet.', unskipDate: async () => 'Not ready yet.',
});

const LOAD_FAILED = "Couldn't load the meetings. Check your internet connection; the list tries again by itself.";
const NO_SERVER = "Couldn't reach the server. Check your internet connection and try again.";

export function MeetingsProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/meetings', { headers: { Authorization: `Bearer ${await getToken()}` } });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) { setError(json?.error || LOAD_FAILED); return; }
        setMeetings(Array.isArray(json?.meetings) ? json.meetings : []);
        setError(null);
      } catch {
        if (!cancelled) setError(LOAD_FAILED);
      }
    };
    load();
    const timer = setInterval(load, 120000);
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onFocus); };
  }, [getToken, version]);

  const saveMeeting = async (draft: MeetingDraft, id?: string) => {
    try {
      const res = await fetch(id ? `/api/meetings?id=${encodeURIComponent(id)}` : '/api/meetings', {
        method: id ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return { problem: json?.error || 'The meeting was not saved. Please try again.' };
      reload();
      return { meeting: json?.meeting as Meeting };
    } catch {
      return { problem: NO_SERVER };
    }
  };

  const removeMeeting = async (id: string) => {
    try {
      const res = await fetch(`/api/meetings?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await getToken()}` } });
      if (res.ok) { reload(); return null; }
      const json = await res.json().catch(() => null);
      return json?.error || 'The meeting was not removed. Please try again.';
    } catch {
      return NO_SERVER;
    }
  };

  const patch = async (id: string, body: unknown) => {
    try {
      const res = await fetch(`/api/meetings?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { reload(); return null; }
      const json = await res.json().catch(() => null);
      return json?.error || 'That was not saved. Please try again.';
    } catch {
      return NO_SERVER;
    }
  };
  const skipDate = (id: string, date: string, note: string) => patch(id, { skip: { date, note } });
  const unskipDate = (id: string, date: string) => patch(id, { unskip: date });

  return (
    <MeetingsContext.Provider value={{ meetings, error, reload, saveMeeting, removeMeeting, skipDate, unskipDate }}>
      {children}
    </MeetingsContext.Provider>
  );
}

export const useMeetings = () => useContext(MeetingsContext);
