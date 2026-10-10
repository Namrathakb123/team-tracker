'use client'

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { describeSaveFailure } from '../utils/saveErrors';
import { withDefaultSettings, emptyAppData } from '../utils/defaults';
import { normalizeIssues } from '../utils/issues';
import { normalizeClients } from '../utils/clients';
import { normalizeLeads } from '../utils/leads';
import type { AppData } from '../types';

export type { AppData };

export interface DataContextType {
  data: AppData;
  // True while the first load is in progress (or while retrying after a failed load).
  loading: boolean;
  // True only after data has been loaded successfully from the server. Saving is blocked until then.
  loaded: boolean;
  // Message to show when loading failed. Null when there is no problem.
  loadError: string | null;
  // Message to show when the last save failed. Null when there is no problem.
  saveError: string | null;
  clearSaveError: () => void;
  // 'saving' while changes are being saved, 'saved' for a moment after they all were, otherwise 'idle'.
  saveState: 'idle' | 'saving' | 'saved';
  // Resolves to true when the server confirmed the save, false when it failed (the screen is then put back).
  saveData: (newData: AppData, action?: string, details?: string) => Promise<boolean>;
  // Reloads data in the background, keeping what is on screen if the reload fails.
  forceRefresh: () => Promise<void>;
  // Tries the first load again after it failed, showing the loading screen meanwhile.
  retryLoad: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({
  data: emptyAppData(),
  loading: true,
  loaded: false,
  loadError: null,
  saveError: null,
  clearSaveError: () => {},
  saveState: 'idle',
  saveData: async () => false,
  forceRefresh: async () => {},
  retryLoad: async () => {}
});

// Turns the server's answer ({ value, rev }) into the data shown on screen, filling in any missing dropdown lists.
// Throws if the stored data is not in the expected format.
function prepareData(json: any): { data: any; rev: number } {
  const rev = typeof json?.rev === 'number' ? json.rev : 0;
  if (json?.value) {
    const parsed = JSON.parse(json.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('The saved data is in an unexpected format.');
    }
    // Fill in only lists that are missing or empty. Saved lists are always kept exactly as the admin set them.
    parsed.settings = withDefaultSettings(parsed.settings);
    // Older issues are converted to the one format used everywhere; the next save stores them that way.
    parsed.issues = normalizeIssues(parsed.issues, parsed.team);
    // Clients' team members are stored by id (older records used names).
    parsed.clients = normalizeClients(parsed.clients, parsed.team);
    // Leads get the date they were added, and the assigned person by id (older leads had neither).
    parsed.leads = normalizeLeads(parsed.leads, parsed.team);
    return { data: parsed, rev };
  }
  // Complete fresh start with defaults (the server confirmed there is no saved data yet)
  return { rev, data: emptyAppData() };
}

// How often to check the server for changes made by other people, in milliseconds.
const REFRESH_EVERY_MS = 20000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { authToken, getToken, isApproved, recheckSignIn } = useAuth();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  // "Saved" shows for two seconds.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = setTimeout(() => setSaveState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [saveState]);
  // Refs so that save and refresh always see the latest values, not the ones from an older render.
  const loadedRef = useRef(false);
  const dataRef = useRef<any>({});
  useEffect(() => { dataRef.current = data; }, [data]);
  // Version number of the data on screen, as the server numbered it. Sent with every save.
  const revRef = useRef(0);
  // Saves are sent one after another, never at the same time, so each one uses the latest version number.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Goes up by one whenever a save fails. Saves queued before that were built on top of the failed change and are dropped.
  const saveEpochRef = useRef(0);
  // How many saves are waiting or in progress.
  const pendingSavesRef = useRef(0);

  const markLoaded = (value: boolean) => {
    loadedRef.current = value;
    setLoaded(value);
  };

  const fetchData = async () => {
    // Pending users are not allowed to read data, so don't ask the server for it.
    if (!authToken || !isApproved) return;
    try {
      const res = await fetch('/api/data', {
        headers: { 'Authorization': `Bearer ${await getToken()}` }
      });
      if (!res.ok) {
        // Signed out by the server (for example access removed or changed): check the login again.
        if (res.status === 401) recheckSignIn();
        let serverMessage = '';
        try { serverMessage = (await res.json())?.error || ''; } catch {}
        throw new Error(
          res.status === 401 ? 'Your login has expired. Please sign out and sign in again.' :
          res.status === 403 ? (serverMessage || 'You do not have access to this data.') :
          `The server could not load the data (error ${res.status}${serverMessage ? `: ${serverMessage}` : ''}).`
        );
      }
      const prepared = prepareData(await res.json());
      setData(prepared.data);
      dataRef.current = prepared.data;
      revRef.current = prepared.rev;
      markLoaded(true);
      setLoadError(null);
    } catch (e: any) {
      console.warn('Failed to load data', e);
      // If good data is already on screen, keep it and keep working. Only block the app when nothing was ever loaded.
      if (!loadedRef.current) {
        setLoadError(
          e instanceof TypeError
            ? 'Could not reach the server. Check your internet connection and try again.'
            : (e?.message || 'Could not load the data.')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Checks quietly for changes other people saved, and shows them. Never interrupts the user:
  // it skips while one of their own saves is in progress, and ignores errors (it simply tries again later).
  const quietRefresh = async () => {
    if (!loadedRef.current || pendingSavesRef.current > 0 || !authToken || !isApproved) return;
    try {
      const res = await fetch('/api/data', {
        headers: { 'Authorization': `Bearer ${await getToken()}` }
      });
      if (!res.ok) {
        if (res.status === 401) recheckSignIn();
        return;
      }
      const json = await res.json();
      const rev = typeof json.rev === 'number' ? json.rev : 0;
      // Only newer versions matter. Also skip if the user started saving while we were asking.
      if (rev <= revRef.current || pendingSavesRef.current > 0) return;
      const prepared = prepareData(json);
      setData(prepared.data);
      dataRef.current = prepared.data;
      revRef.current = prepared.rev;
    } catch {
      // Network hiccup or similar: keep what is on screen and try again next time.
    }
  };

  useEffect(() => {
    if (!loaded) return;
    const check = () => { if (document.visibilityState === 'visible') quietRefresh(); };
    const timer = window.setInterval(check, REFRESH_EVERY_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [loaded, authToken, isApproved]);

  const retryLoad = async () => {
    setLoadError(null);
    setLoading(true);
    await fetchData();
  };

  useEffect(() => {
    if (!authToken || !isApproved) {
      // Signed out or not approved: forget any previous data so it can never be saved over someone else's.
      markLoaded(false);
      revRef.current = 0;
      setData({});
      setLoadError(null);
      setSaveError(null);
      setLoading(true);
      return;
    }
    fetchData();
  }, [authToken, isApproved]);

  // Returns true when the server confirmed the save. On failure the screen goes back to how it was,
  // the reason is shown to the user, and the data is re-synced with what the server really has.
  const saveData = (newData: any, action = 'UPDATE_DATA', details = 'Updated dashboard data'): Promise<boolean> => {
    // Never save unless real data was loaded first. Saving on top of an empty screen would wipe the database.
    if (!loadedRef.current) {
      console.warn('Save blocked: data has not been loaded yet.');
      setSaveError('Your change was not saved because your data has not finished loading. Reload the page and try again.');
      return Promise.resolve(false);
    }
    const previous = dataRef.current;
    const epoch = saveEpochRef.current;
    // Optimistic update: show the change straight away while the server saves it.
    setData(newData);
    dataRef.current = newData;
    pendingSavesRef.current++;
    setSaveState('saving');

    const run = saveQueueRef.current.then(async () => {
      try {
        // An earlier change failed and this one was made on top of it, so it can't be saved as it is.
        if (epoch !== saveEpochRef.current) return false;

        let failure: string | null = null;
        try {
          const res = await fetch('/api/data', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${await getToken()}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: JSON.stringify(newData), action, details, baseRev: revRef.current })
          });
          if (res.ok) {
            const json = await res.json().catch(() => ({}));
            if (typeof json.rev === 'number') revRef.current = json.rev;
          } else {
            let serverMessage = '';
            try { serverMessage = (await res.json())?.error || ''; } catch {}
            failure = describeSaveFailure(res.status, serverMessage);
            if (res.status === 401) recheckSignIn();
          }
        } catch (e) {
          console.warn('Failed to save', e);
          failure = describeSaveFailure(null);
        }

        if (failure) {
          console.warn('Save failed:', failure);
          saveEpochRef.current++;
          setData(previous);
          dataRef.current = previous;
          setSaveError(failure);
          fetchData();
          return false;
        }
        // A successful save makes any older error message out of date.
        setSaveError(null);
        return true;
      } finally {
        pendingSavesRef.current--;
      }
    });
    saveQueueRef.current = run.catch(() => {});
    // Once nothing else is waiting: "Saved" if this last save worked (a failure shows its own message).
    run.then(ok => {
      if (pendingSavesRef.current === 0) setSaveState(ok ? 'saved' : 'idle');
    }, () => {
      if (pendingSavesRef.current === 0) setSaveState('idle');
    });
    return run;
  };

  return (
    <DataContext.Provider value={{ data, loading, loaded, loadError, saveError, clearSaveError: () => setSaveError(null), saveState, saveData, forceRefresh: fetchData, retryLoad }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
