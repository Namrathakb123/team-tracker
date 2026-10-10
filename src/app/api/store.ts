import { Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { firestore } from './firebase';
import type { Change } from '../../utils/changes';

// Everything the server keeps in Firebase's database (Firestore), and the only place that reads or writes it:
//   appData/velvo-ops-data   all shared app data (clients, issues, updates, team, leads, settings) as one record,
//                            with a version number `rev` that goes up by one with every save
//   logs/{automatic id}      the Audit Log
//   meetings/{id}            the meetings on the Meetings page
//   meetingAbsences/{id}     "I can't attend" notes, one per person per meeting per day

const APP_DATA_ID = 'velvo-ops-data';

// Firestore gives times back as its own Timestamp type; the rest of the app works with Date.
function withDates<T>(data: DocumentData | undefined): T {
  const out: DocumentData = {};
  for (const [key, value] of Object.entries(data || {})) out[key] = value instanceof Timestamp ? value.toDate() : value;
  return out as T;
}

// ---------------------------------------------------------------- shared app data

export interface StoredAppData {
  value: string;
  rev: number;
  updatedAt?: Date;
  updatedBy?: string;
}

const appDataRef = () => firestore().collection('appData').doc(APP_DATA_ID);

// The saved app data as stored (null when nothing has been saved yet). Data saved before versions existed counts as version 0.
export async function readAppData(): Promise<StoredAppData | null> {
  const snap = await appDataRef().get();
  if (!snap.exists) return null;
  const data = withDates<StoredAppData>(snap.data());
  return { ...data, rev: typeof data.rev === 'number' ? data.rev : 0 };
}

// The saved app data as an object; empty when there is none or it can't be read.
export async function readAppState(): Promise<Record<string, any>> {
  const stored = await readAppData();
  if (!stored || typeof stored.value !== 'string') return {};
  try {
    const state = JSON.parse(stored.value);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch {
    return {};
  }
}

// Stores new app data, but only if the stored version is still `expectedRev` (checked and written in one step, so
// two saves can never both succeed on top of the same version). Returns false when someone else saved first.
export async function writeAppData(expectedRev: number, data: StoredAppData): Promise<boolean> {
  const ref = appDataRef();
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data()?.rev : 0;
    const currentRev = typeof stored === 'number' ? stored : 0;
    if (currentRev !== expectedRev) return false;
    tx.set(ref, data);
    return true;
  });
}

// ---------------------------------------------------------------- Audit Log

export interface LogEntry {
  action: string;
  userName: string;
  details: string;
  timestamp: Date;
  changes?: Change[];
  userEmail?: string;
}

export async function addLog(entry: LogEntry): Promise<void> {
  await firestore().collection('logs').add(entry);
}

// A search reads the entries one by one, so it looks through at most this many (the newest in the chosen dates).
export const MAX_SEARCHED_LOGS = 5000;

export interface LogSearch {
  q?: string;
  from?: Date | null;
  to?: Date | null;
  page: number;
  pageSize: number;
}

function logMatches(entry: LogEntry, q: string): boolean {
  const wanted = q.toLowerCase();
  const has = (value: unknown) => typeof value === 'string' && value.toLowerCase().includes(wanted);
  if ([entry.userName, entry.userEmail, entry.action, entry.details].some(has)) return true;
  return Array.isArray(entry.changes) && entry.changes.some((c) => c && [c.record, c.before, c.after].some(has));
}

// Entries newest first, one page at a time. `limited` is true when a search stopped after MAX_SEARCHED_LOGS entries.
export async function findLogs(search: LogSearch): Promise<{ logs: (LogEntry & { _id: string })[]; total: number; limited: boolean }> {
  let query: Query = firestore().collection('logs').orderBy('timestamp', 'desc');
  if (search.from) query = query.where('timestamp', '>=', search.from);
  if (search.to) query = query.where('timestamp', '<=', search.to);
  const skip = (search.page - 1) * search.pageSize;
  const toEntry = (d: QueryDocumentSnapshot) => ({ ...withDates<LogEntry>(d.data()), _id: d.id });

  if (search.q) {
    const snap = await query.limit(MAX_SEARCHED_LOGS).get();
    const matches = snap.docs.map(toEntry).filter((entry) => logMatches(entry, search.q as string));
    return { logs: matches.slice(skip, skip + search.pageSize), total: matches.length, limited: snap.size >= MAX_SEARCHED_LOGS };
  }
  const [count, page] = await Promise.all([query.count().get(), query.offset(skip).limit(search.pageSize).get()]);
  return { logs: page.docs.map(toEntry), total: count.data().count, limited: false };
}

// ---------------------------------------------------------------- meetings

// A meeting as stored: its id is `_id`, and it remembers who added and last changed it.
export interface StoredMeetingRecord {
  _id: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  [field: string]: unknown;
}

const meetingsCol = () => firestore().collection('meetings');
const toStoredMeeting = <T extends StoredMeetingRecord>(id: string, data: DocumentData | undefined) => ({ ...withDates<Omit<T, '_id'>>(data), _id: id } as T);

// Every meeting, by date and then start time.
export async function listMeetings<T extends StoredMeetingRecord>(): Promise<T[]> {
  const snap = await meetingsCol().limit(2000).get();
  return snap.docs
    .map((d) => toStoredMeeting<T>(d.id, d.data()))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)));
}

export async function getMeeting<T extends StoredMeetingRecord>(id: string): Promise<T | null> {
  if (!id) return null;
  const snap = await meetingsCol().doc(id).get();
  return snap.exists ? toStoredMeeting<T>(snap.id, snap.data()) : null;
}

// Adds the meeting, or replaces it as a whole when it already exists.
export async function putMeeting(meeting: StoredMeetingRecord): Promise<void> {
  const { _id, ...rest } = meeting;
  await meetingsCol().doc(_id).set(rest);
}

export async function updateMeeting(id: string, fields: Record<string, unknown>): Promise<void> {
  await meetingsCol().doc(id).update(fields);
}

export async function deleteMeeting(id: string): Promise<void> {
  await meetingsCol().doc(id).delete();
}

// ---------------------------------------------------------------- "I can't attend" notes

export interface StoredNote {
  _id: string;
  meetingId?: string;
  memberId: string;
  date: string;
  reason: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
}

export interface NoteFilter {
  memberId?: string;
  date?: string;
  // First and last day (YYYY-MM-DD), both included.
  from?: string;
  to?: string;
  // A meeting's id, or null for the daily meeting (whose notes have no meeting id).
  meetingId?: string | null;
}

const notesCol = () => firestore().collection('meetingAbsences');
const toNote = (id: string, data: DocumentData | undefined) => ({ ...withDates<Omit<StoredNote, '_id'>>(data), _id: id } as StoredNote);
const byDateNewestFirst = (a: StoredNote, b: StoredNote) =>
  b.date.localeCompare(a.date) || (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0);

// Notes matching every part of the filter, newest day first (and, within a day, in the order they were written).
// The database is asked for one part only; the rest is checked here, which needs no extra database indexes.
export async function findNotes(filter: NoteFilter): Promise<StoredNote[]> {
  let query: Query = notesCol();
  if (filter.date) query = query.where('date', '==', filter.date);
  else if (filter.memberId) query = query.where('memberId', '==', filter.memberId);
  else {
    if (filter.from) query = query.where('date', '>=', filter.from);
    if (filter.to) query = query.where('date', '<=', filter.to);
  }
  const snap = await query.limit(2000).get();
  return snap.docs
    .map((d) => toNote(d.id, d.data()))
    .filter((n) =>
      (filter.memberId === undefined || n.memberId === filter.memberId) &&
      (filter.date === undefined || n.date === filter.date) &&
      (filter.from === undefined || n.date >= filter.from) &&
      (filter.to === undefined || n.date <= filter.to) &&
      (filter.meetingId === undefined || (n.meetingId || null) === filter.meetingId))
    .sort(byDateNewestFirst);
}

// Writes one note per day (ids[i] for days[i]). A note that already exists for that day gets the new reason, keeps
// when and by whom it was first written, and records who changed it. Returns the notes as stored, earliest day first.
export async function saveNotes(
  ids: string[],
  days: string[],
  note: { memberId: string; reason: string; meetingId: string | null },
  writer: string,
  now: Date,
): Promise<StoredNote[]> {
  const refs = ids.map((id) => notesCol().doc(id));
  await firestore().runTransaction(async (tx) => {
    const snaps = refs.length ? await tx.getAll(...refs) : [];
    snaps.forEach((snap, i) => {
      const fields = { memberId: note.memberId, date: days[i], reason: note.reason, ...(note.meetingId ? { meetingId: note.meetingId } : {}) };
      if (!snap.exists) {
        tx.set(refs[i], { ...fields, createdAt: now, createdBy: writer });
        return;
      }
      const old = snap.data() || {};
      const changed = old.reason !== fields.reason || old.memberId !== fields.memberId || old.date !== fields.date || (old.meetingId || null) !== note.meetingId;
      tx.set(refs[i], { ...fields, ...(changed ? { updatedAt: now, updatedBy: writer } : {}) }, { merge: true });
    });
  });
  const saved = refs.length ? await firestore().getAll(...refs) : [];
  return saved.filter((s) => s.exists).map((s) => toNote(s.id, s.data())).sort((a, b) => a.date.localeCompare(b.date));
}

// Returns false when there was no such note.
export async function deleteNote(id: string): Promise<boolean> {
  const ref = notesCol().doc(id);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.delete(ref);
    return true;
  });
}
