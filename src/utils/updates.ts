// Rules for daily updates: who wrote one, who may change it, and which ones are shown.
// Used by both the pages and the server, so they always agree.

import type { DailyUpdate } from '../types';

// The email of the person who wrote an update, or null when it isn't known.
// New updates store it in `authorEmail`. Older Dashboard updates stored the email as `author`;
// older client-page updates only have a typed name, so their writer isn't known.
export function updateOwner(update: Partial<DailyUpdate> | null | undefined): string | null {
  const email = update?.authorEmail || (typeof update?.author === 'string' && update.author.includes('@') ? update.author : null);
  return email ? String(email).trim().toLowerCase() : null;
}

function isOwner(update: Partial<DailyUpdate> | null | undefined, email: string | null | undefined): boolean {
  const owner = updateOwner(update);
  return !!owner && !!email && owner === email.trim().toLowerCase();
}

// Only the writer may edit the text of an update.
export function canEditUpdate(update: DailyUpdate, email: string | null | undefined): boolean {
  return isOwner(update, email);
}

// The writer or an admin may delete an update, and restore it afterwards.
export function canDeleteUpdate(update: DailyUpdate, email: string | null | undefined, isAdmin: boolean): boolean {
  return isAdmin || isOwner(update, email);
}

// Updates that haven't been deleted. Deleted ones are kept (with `deletedAt`) so they can be restored.
export function visibleUpdates(updates: DailyUpdate[] | undefined): DailyUpdate[] {
  return (Array.isArray(updates) ? updates : []).filter((u) => u && !u.deletedAt);
}

// Server check for a non-admin's save: they may only change, delete or restore their own updates,
// and new updates must be in their own name. Returns the reason when something isn't allowed.
export function findForbiddenUpdateChanges(oldState: any, newState: any, email: string | null | undefined): string | null {
  const before: any[] = Array.isArray(oldState?.updates) ? oldState.updates : [];
  const after: any[] = Array.isArray(newState?.updates) ? newState.updates : [];
  const afterById = new Map(after.map((u) => [u?.id, u]));
  const beforeIds = new Set(before.map((u) => u?.id));
  for (const old of before) {
    const now = afterById.get(old?.id);
    if (now && JSON.stringify(old) === JSON.stringify(now)) continue;
    if (!isOwner(old, email) || (now && !isOwner(now, email))) {
      return 'You can only edit or delete your own updates.';
    }
  }
  for (const now of after) {
    if (beforeIds.has(now?.id)) continue;
    // A new update's writer, when it can be told, must be the person saving it.
    if (updateOwner(now) !== null && !isOwner(now, email)) return 'New updates must be saved under your own name.';
  }
  return null;
}

// The name to show for who wrote an update: the part of an email before the @, or the name that was typed.
export function authorLabel(update: { author?: string | null }): string {
  const author = typeof update?.author === 'string' ? update.author.trim() : '';
  if (!author) return 'Unknown';
  return author.includes('@') ? author.split('@')[0] : author;
}
