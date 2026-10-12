import { getAuth } from 'firebase-admin/auth';
import { NextRequest, NextResponse } from 'next/server';
import type { Change } from '../../utils/changes';
import { isAccessRole, type AccessRole } from '../../utils/accounts';
import { firebaseApp } from './firebase';
import { addLog } from './store';

// Who is signed in, as Firebase's sign-in token says. `role` and `mustChangePassword` are the login's custom
// claims (see accounts.ts); `email_verified` is true for every login an admin created.
export interface TokenUser {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  role?: unknown;
  mustChangePassword?: unknown;
}

// Checks the sign-in token the browser sends. Throws 'Unauthorized' when there is none or it isn't valid.
export async function verifyToken(req: NextRequest): Promise<TokenUser> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('Unauthorized');
  }
  // Only tokens that Firebase can verify (signed by Google, not expired, issued for this project) are accepted.
  // `true` also refuses tokens of a login whose access was removed, or that an admin signed out.
  // There is deliberately no fallback: an unverified token must never be trusted.
  try {
    return (await getAuth(firebaseApp()).verifyIdToken(token, true)) as TokenUser;
  } catch (error: any) {
    console.warn('Rejected login token:', error?.code, error?.message || error);
    throw new Error('Unauthorized');
  }
}

// The signed-in person, as the routes work with them.
export interface SignedIn {
  uid: string;
  email: string;
  name: string;
  role: AccessRole;
  isAdmin: boolean;
  // Whether Firebase confirmed the email (always true for logins an admin created).
  emailVerified: boolean;
}

// Returns the signed-in person if their login gives them access to the app. Throws 'Forbidden' when it doesn't,
// and 'PasswordChange' while they still have to replace their starting password (only /api/account allows that).
export function requireAppAccess(user: TokenUser, { allowPasswordChange = false } = {}): SignedIn {
  if (!isAccessRole(user.role) || !user.email) throw new Error('Forbidden');
  if (user.mustChangePassword === true && !allowPasswordChange) throw new Error('PasswordChange');
  const email = user.email.trim().toLowerCase();
  return { uid: user.uid, email, name: user.name || email.split('@')[0], role: user.role, isAdmin: user.role === 'admin', emailVerified: user.email_verified === true };
}

// Like requireAppAccess, for pages only admins may use (the Audit Log, managing logins).
export function requireAdmin(user: TokenUser): SignedIn {
  const me = requireAppAccess(user);
  if (!me.isAdmin) throw new Error('Forbidden');
  return me;
}

export const FORBIDDEN_MESSAGE = "Your login doesn't give you access to this. Ask an admin if you think it should.";
export const PASSWORD_CHANGE_MESSAGE = 'Choose your own password first.';

// The answer for the errors above (and anything unexpected, which is logged for the server's owner).
export function errorResponse(error: unknown, where: string, forbiddenMessage = FORBIDDEN_MESSAGE) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (message === 'Forbidden') return NextResponse.json({ error: forbiddenMessage }, { status: 403 });
  if (message === 'PasswordChange') return NextResponse.json({ error: PASSWORD_CHANGE_MESSAGE, passwordChange: true }, { status: 403 });
  console.error(`API ${where} error:`, message);
  return NextResponse.json({ error: 'Database error' }, { status: 500 });
}

// The sections of the saved data. Lists are arrays; settings is an object.
export const DATA_SECTIONS = ['clients', 'issues', 'updates', 'team', 'leads', 'settings'];

// Lists the sections that exist in the stored data but are missing (or the wrong kind) in a new save.
// Emptying a list is allowed (for example deleting the last client); leaving the section out entirely is not.
export function findDroppedSections(oldState: any, newState: any): string[] {
  if (!oldState || typeof oldState !== 'object') return [];
  return DATA_SECTIONS.filter(key => {
    const before = oldState[key];
    if (before === undefined || before === null) return false;
    const after = newState ? newState[key] : undefined;
    if (Array.isArray(before)) return !Array.isArray(after);
    if (typeof before === 'object') return !after || typeof after !== 'object' || Array.isArray(after);
    return false;
  });
}

// The list sections (everything except settings).
export const LIST_SECTIONS = ['clients', 'issues', 'updates', 'team', 'leads'];

// Largest save accepted, in bytes of text. Firestore keeps at most 1 MiB (1,048,576 bytes) in one record, and the
// shared data is one record, so this leaves room for the version number and dates stored with it.
export const MAX_SAVE_BYTES = 1_000_000;

// Checks that a save has the expected shape. Returns a message describing the first problem, or null when it is fine.
export function validateAppData(state: any): string | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'Invalid data: expected an object.';
  for (const key of Object.keys(state)) {
    if (!DATA_SECTIONS.includes(key)) return `Invalid data: unknown section "${key}".`;
  }
  for (const key of LIST_SECTIONS) {
    const list = state[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return `Invalid data: "${key}" must be a list.`;
    const seen = new Set<string>();
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return `Invalid data: every entry in "${key}" must be a record.`;
      if (typeof item.id !== 'string' || !item.id) return `Invalid data: an entry in "${key}" has no id.`;
      if (seen.has(item.id)) return `Invalid data: "${key}" contains the same id twice.`;
      seen.add(item.id);
    }
  }
  if (state.settings !== undefined) {
    const settings = state.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'Invalid data: "settings" must be an object.';
    for (const [name, list] of Object.entries(settings)) {
      if (!Array.isArray(list) || list.some(entry => typeof entry !== 'string')) {
        return `Invalid data: the "${name}" setting must be a list of text values.`;
      }
    }
  }
  return null;
}

// Most records a non-admin may remove from one list in a single save. The app itself only ever removes one at a time.
export const MAX_REMOVALS_PER_SAVE = 3;

// Lists the sections where a save removes more records than allowed, for example ["clients (12)"].
export function findMassRemovals(oldState: any, newState: any, limit = MAX_REMOVALS_PER_SAVE): string[] {
  if (!oldState || typeof oldState !== 'object') return [];
  const result: string[] = [];
  for (const key of LIST_SECTIONS) {
    const before = Array.isArray(oldState[key]) ? oldState[key] : [];
    const after = Array.isArray(newState?.[key]) ? newState[key] : [];
    const remaining = new Set(after.map((item) => item && item.id));
    const removed = before.filter((item) => item && !remaining.has(item.id)).length;
    if (removed > limit) result.push(`${key} (${removed})`);
  }
  return result;
}

// `changes` (optional) lists what a save changed, with before and after values (see utils/changes.ts).
export async function logAction(action: string, userName: string, details: string, changes?: Change[]) {
  try {
    await addLog({ action, userName, details, timestamp: new Date(), ...(changes && changes.length ? { changes } : {}) });
  } catch (error: any) {
    // The save itself already succeeded, so it isn't undone; but a missing audit entry should be noticed.
    console.warn('Could not write audit log entry:', action, error?.message || error);
  }
}
