// Team members and their login accounts.

import type { TeamMember } from '../types';

// An email as compared: no spaces at the ends, ignoring capitals. A missing email is empty.
export function emailKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

// The team member linked to a login account: the one with the same email. Someone removed from the team is
// only found when `includeRemoved` is set (and only if nobody on the team has that email). Null if none.
export function teamMemberForEmail(team: TeamMember[] | undefined, email: unknown, includeRemoved = false): TeamMember | null {
  const key = emailKey(email);
  if (!key) return null;
  const members = (Array.isArray(team) ? team : []).filter((t) => t && emailKey(t.email) === key);
  return members.find((t) => !t.deleted) || (includeRemoved ? members[0] : null) || null;
}
