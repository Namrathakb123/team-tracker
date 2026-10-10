'use client'

// "I can't attend" notes for the daily meeting. They are not part of the shared app data: the page loads and sends
// them through /api/meeting (see that route for who may see and write what).
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { toAbsence, type Absence } from '../utils/absences';

const LOAD_FAILED = "Couldn't load who can't attend. Check your internet connection; the list tries again by itself.";

function readAbsences(json: unknown): Absence[] {
  const list = json && typeof json === 'object' ? (json as { absences?: unknown }).absences : null;
  return (Array.isArray(list) ? list : []).map(toAbsence).filter((a): a is Absence => !!a);
}

// The notes for `query` ("date=YYYY-MM-DD", "mine=1" or "month=YYYY-MM"), loaded again every minute while the page
// is open (others may write notes too) and whenever `refreshKey` changes. `absences` is null until they arrive.
export function useAbsences(query: string | null, refreshKey = 0): { absences: Absence[] | null; error: string | null } {
  const { getToken } = useAuth();
  const [result, setResult] = useState<{ query: string; absences: Absence[] | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/meeting?${query}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setResult({ query, absences: null, error: json?.error || LOAD_FAILED });
          return;
        }
        setResult({ query, absences: readAbsences(json), error: null });
      } catch {
        // Keep showing what was loaded before, with a note.
        if (!cancelled) setResult((prev) => ({ query, absences: prev?.query === query ? prev.absences : null, error: LOAD_FAILED }));
      }
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [query, refreshKey, getToken]);
  if (!query || !result || result.query !== query) return { absences: null, error: null };
  return { absences: result.absences, error: result.error };
}

// Sends a note ("I can't attend") or takes one back, for the daily meeting or (with `meetingId`) another meeting.
// Each resolves to null when it worked, or the reason it didn't.
export function useAbsenceActions() {
  const { getToken } = useAuth();
  const send = async (method: 'POST' | 'DELETE', query: string, body?: unknown): Promise<string | null> => {
    try {
      const res = await fetch(`/api/meeting${query}`, {
        method,
        headers: { Authorization: `Bearer ${await getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return null;
      const json = await res.json().catch(() => null);
      return json?.error || 'That didn\'t work. Please try again.';
    } catch {
      return "Couldn't reach the server. Check your internet connection and try again.";
    }
  };
  return {
    inform: (note: { from: string; to?: string; reason: string; memberId?: string; meetingId?: string }) => send('POST', '', note),
    withdraw: (date: string, memberId?: string, meetingId?: string) =>
      send('DELETE', `?date=${encodeURIComponent(date)}${memberId ? `&memberId=${encodeURIComponent(memberId)}` : ''}${meetingId ? `&meetingId=${encodeURIComponent(meetingId)}` : ''}`),
  };
}
