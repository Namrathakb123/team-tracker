// Logins: who can sign in, as what, and the rules for emails and passwords. Shared by the server and the pages.
// Everyone signs in with their email and a password. Only admins create logins (on the Team page), each with a
// starting password that the person changes the first time they sign in.

export type AccessRole = 'admin' | 'user';
export const ACCESS_ROLES: AccessRole[] = ['admin', 'user'];
export const ACCESS_LABELS: Record<AccessRole, string> = { admin: 'Admin', user: 'User' };
// What each kind of login may do, in a few words (shown on the Team page).
export const ACCESS_HELP: Record<AccessRole, string> = {
  admin: 'Sees and manages everything, including the team, settings and the Audit Log.',
  user: 'Sees and works on their own clients, leads, tasks and meetings.',
};
export const isAccessRole = (value: unknown): value is AccessRole => value === 'admin' || value === 'user';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// The email in the one form used everywhere (no spaces, small letters).
export const cleanEmail = (email: unknown): string => (typeof email === 'string' ? email.trim().toLowerCase() : '');

// What is wrong with an email address, or null when it looks right.
export function emailProblem(email: unknown): string | null {
  const value = cleanEmail(email);
  if (!value) return 'Enter an email address.';
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(value) || value.includes('..')) {
    return 'That doesn’t look like an email address (for example name@velvo.in).';
  }
  return null;
}

// What is wrong with a new password, or null when it is fine.
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || !password) return 'Enter a password.';
  if (password.trim().length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

// Short, easy words for starting passwords (easy to read out or type from a message).
const WORDS = [
  'Apple', 'Bamboo', 'Banyan', 'Basil', 'Cedar', 'Cherry', 'Cobalt', 'Coral', 'Cotton', 'Delta', 'Ember', 'Falcon',
  'Fern', 'Garnet', 'Ginger', 'Harbor', 'Hazel', 'Indigo', 'Ivory', 'Jasmine', 'Juniper', 'Kite', 'Lagoon', 'Lemon',
  'Lotus', 'Mango', 'Maple', 'Meadow', 'Mint', 'Monsoon', 'Nectar', 'Nutmeg', 'Ocean', 'Olive', 'Orchid', 'Otter',
  'Papaya', 'Pebble', 'Pepper', 'Pine', 'Planet', 'Quartz', 'Raven', 'River', 'Saffron', 'Sage', 'Silver', 'Sparrow',
  'Spice', 'Summit', 'Tamarind', 'Teak', 'Thunder', 'Tiger', 'Topaz', 'Tulip', 'Valley', 'Velvet', 'Walnut', 'Willow',
  'Winter', 'Yarrow', 'Zephyr', 'Zinnia',
];

function randomIndex(size: number): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] % size;
}

// A new starting password, for example "Mango-River-Kite-4821": three words and four digits, chosen at random.
export function makeStartingPassword(): string {
  const words = [0, 1, 2].map(() => WORDS[randomIndex(WORDS.length)]);
  const digits = String(randomIndex(10000)).padStart(4, '0');
  return `${words.join('-')}-${digits}`;
}

// The message an admin can send someone with their login (the app sends no email itself).
export function loginMessage(person: { name: string; email: string; password: string }, appAddress: string): string {
  return [
    `Hi ${person.name}, here is your Team Tracker login.`,
    `Open: ${appAddress}`,
    `Email: ${person.email}`,
    `Starting password: ${person.password}`,
    'You will be asked to choose your own password the first time you sign in.',
  ].join('\n');
}
