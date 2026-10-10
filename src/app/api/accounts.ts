import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { firebaseApp } from './firebase';
import { cleanEmail, isAccessRole, type AccessRole } from '../../utils/accounts';

// The logins themselves, kept by Firebase Authentication (email and password). What a login may do is stored on it
// as "custom claims", which Firebase puts inside every sign-in token, so checking access needs no database read:
//   role                 'admin' or 'user'; a login without one has no access
//   mustChangePassword   true until the person replaces their starting password

export interface AccountClaims {
  role?: AccessRole;
  mustChangePassword?: boolean;
}

// A login as the Team page shows it.
export interface Account {
  uid: string;
  email: string;
  name: string;
  role: AccessRole | null;
  // Access removed (they can't sign in).
  disabled: boolean;
  mustChangePassword: boolean;
  // ISO times, or null if never.
  lastSignIn: string | null;
  createdAt: string | null;
}

export const accountsAuth = () => getAuth(firebaseApp());

function claimsOf(user: UserRecord): AccountClaims {
  const claims = user.customClaims || {};
  return { ...(isAccessRole(claims.role) ? { role: claims.role } : {}), ...(claims.mustChangePassword === true ? { mustChangePassword: true } : {}) };
}

const isoTime = (value: string | undefined | null) => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
};

export function toAccount(user: UserRecord): Account {
  const claims = claimsOf(user);
  return {
    uid: user.uid,
    email: cleanEmail(user.email),
    name: user.displayName || '',
    role: claims.role ?? null,
    disabled: !!user.disabled,
    mustChangePassword: !!claims.mustChangePassword,
    lastSignIn: isoTime(user.metadata?.lastSignInTime),
    createdAt: isoTime(user.metadata?.creationTime),
  };
}

// Every login, by email.
export async function listAccounts(): Promise<Account[]> {
  const accounts: Account[] = [];
  let pageToken: string | undefined;
  do {
    const page = await accountsAuth().listUsers(1000, pageToken);
    accounts.push(...page.users.map(toAccount));
    pageToken = page.pageToken;
  } while (pageToken);
  return accounts.sort((a, b) => a.email.localeCompare(b.email));
}

// The login with this email, or null if there is none.
export async function findAccount(email: string): Promise<UserRecord | null> {
  try {
    return await accountsAuth().getUserByEmail(cleanEmail(email));
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

// Admins who can still sign in.
export const activeAdmins = (accounts: Account[]) => accounts.filter((a) => a.role === 'admin' && !a.disabled);

// A new login with a starting password, to be changed at the first sign-in. The email counts as confirmed, because
// only an admin can create a login.
export async function createAccount(details: { email: string; name: string; role: AccessRole; password: string }): Promise<UserRecord> {
  const user = await accountsAuth().createUser({
    email: cleanEmail(details.email),
    emailVerified: true,
    password: details.password,
    displayName: details.name,
    disabled: false,
  });
  await accountsAuth().setCustomUserClaims(user.uid, { role: details.role, mustChangePassword: true });
  return accountsAuth().getUser(user.uid);
}

async function setClaims(user: UserRecord, changes: AccountClaims) {
  const next = { ...claimsOf(user), ...changes };
  if (!next.mustChangePassword) delete next.mustChangePassword;
  await accountsAuth().setCustomUserClaims(user.uid, next);
}

export async function setRole(user: UserRecord, role: AccessRole) {
  await setClaims(user, { role });
}

// A new starting password from an admin: the person must change it again, and is signed out everywhere.
export async function resetPassword(user: UserRecord, password: string) {
  await accountsAuth().updateUser(user.uid, { password });
  await setClaims(user, { mustChangePassword: true });
  await accountsAuth().revokeRefreshTokens(user.uid);
}

// Removing access signs them out everywhere straight away; giving it back lets them sign in again.
export async function setDisabled(user: UserRecord, disabled: boolean) {
  await accountsAuth().updateUser(user.uid, { disabled });
  if (disabled) await accountsAuth().revokeRefreshTokens(user.uid);
}

export async function changeAccountDetails(user: UserRecord, details: { email?: string; name?: string }) {
  await accountsAuth().updateUser(user.uid, {
    ...(details.email ? { email: cleanEmail(details.email), emailVerified: true } : {}),
    ...(details.name ? { displayName: details.name } : {}),
  });
}

// The person replaces their starting password with their own.
export async function finishPasswordChange(uid: string, password: string) {
  const user = await accountsAuth().getUser(uid);
  await accountsAuth().updateUser(uid, { password });
  await setClaims(user, { mustChangePassword: false });
}
