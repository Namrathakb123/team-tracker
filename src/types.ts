// The shapes of the records the app stores (all in one appData document; see README "How it works").
// Records written by older versions of the app can lack newer fields or still have older ones; those are marked
// optional and described, and the load-time tidy-ups (normalizeClients, normalizeIssues, normalizeLeads) fill them in.

/** Someone on the team (Team page). */
export interface TeamMember {
  id: string;
  name: string;
  /** Job title, for example "Designer". */
  role?: string;
  email?: string;
  phone?: string;
  location?: string;
  branch?: string;
  /** Their group on the daily meeting list: "Admin", "Team" or "Intern"; "None" if they don't take part. Not set
   *  means "Team" (see utils/absences.ts). */
  meetingGroup?: string;
  /** Removed from the team; kept so old records can still show the name. */
  deleted?: boolean;
}

/** A client (Clients page). */
export interface Client {
  id: string;
  name: string;
  category?: string;
  status?: string;
  deliveryStatus?: string;
  dealValue?: number | string;
  services?: string[];
  /** Team members working on the client, by id (older records used names). */
  team?: string[];
  /** The main person responsible, by id (older records used a name). */
  assignedTo?: string | null;
  /** When the client was added (ISO date and time). */
  createdAt?: string;
  archived?: boolean;
  archivedAt?: string;
  archivedBy?: string | null;
  /** The lead this client was converted from, as it was at that moment. */
  fromLead?: Lead;
}

/** A note added to an issue. */
export interface IssueNote {
  id: string;
  text: string;
  author?: string;
  /** When it was added (ISO date and time). */
  createdAt?: string;
}

/** A task: work given to someone, about a client or internal (Tasks page; stored as "issues"). */
export interface Issue {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  clientId?: string | null;
  /** The team member it is assigned to, by id. */
  assigneeId?: string | null;
  /** When it was logged (ISO date and time). */
  createdAt?: string;
  /** Who raised it (their login's email). Older issues don't have it. */
  createdBy?: string;
  /** The day it should be done by (YYYY-MM-DD), if any. */
  dueDate?: string;
  /** The day it was closed (YYYY-MM-DD), while its status is a closed one. */
  resolvedDate?: string;
  notesHistory?: IssueNote[];
  /** Older issues: the assignee's name, kept when it matches no team member. */
  assignee?: string;
  /** Older issues: the day they were logged, before createdAt existed. */
  created?: string;
}

/** A daily update about a client (Dashboard, client pages). */
export interface DailyUpdate {
  id: string;
  clientId?: string | null;
  text: string;
  /** The day it is for (YYYY-MM-DD). */
  date?: string;
  /** When it was posted (milliseconds). */
  timestamp?: number;
  /** Who wrote it. Older updates have only `author` (an email or a typed name). */
  authorEmail?: string | null;
  author?: string;
  editedAt?: string;
  /** Deleted updates are kept so they can be restored. */
  deletedAt?: string;
  deletedBy?: string;
}

/** One entry in a lead's history (newest first). */
export interface LeadHistoryEntry {
  id: string;
  /** When it happened (ISO date and time). */
  date: string;
  actionBy?: string;
  notes?: string;
  status?: string;
  /** The next follow-up day (YYYY-MM-DD); empty when the lead is closed. */
  nextActionDate?: string;
}

/** A possible client (Lead Followups page). */
export interface Lead {
  id: string;
  name: string;
  phone?: string;
  businessName?: string;
  source?: string;
  status?: string;
  priority?: string;
  /** The team member following it up, by id (older leads used a name). */
  assignedTo?: string | null;
  /** When the lead was added (ISO date and time). */
  createdAt?: string;
  /** Who added it (their login's email). Older leads don't have it. */
  createdBy?: string;
  history?: LeadHistoryEntry[];
  /** Older leads: the day they were added, before createdAt existed. */
  date?: string;
}

/** The Customize lists and choices. Every setting is a list of text (the server refuses anything else). */
export type Settings = Record<string, string[]>;

/** A meeting on the Meetings page: one time or repeating. The daily team meeting is shown as one too (its details
 *  are settings; see utils/meetings.ts). Meetings are kept apart from the shared data, and each person is only sent
 *  the meetings they are in (admins get all); see api/meetings. */
export interface Meeting {
  id: string;
  title: string;
  /** "Team", "Interns", "Client", "One-on-one" or "Other". */
  type: string;
  /** "none" (one time), "weekdays" (Monday to Friday) or "weekly" (on `days`). */
  repeat: 'none' | 'weekdays' | 'weekly';
  /** The day of a one-time meeting, or the first day of a repeating one ("YYYY-MM-DD"; empty: no first day). */
  date: string;
  /** The last day of a repeating meeting, if it ends. */
  until?: string;
  /** For "weekly": the weekdays it is on ('Mon' … 'Sun'). */
  days?: string[];
  /** Start and end, "HH:MM" (24-hour, India time). */
  start: string;
  end: string;
  link?: string;
  place?: string;
  camera?: 'Optional' | 'On';
  /** Whole groups in the meeting ('Admin', 'Team', 'Intern'): everyone on the meeting list in that group. */
  groups?: string[];
  /** Particular team members, by id. */
  people?: string[];
  /** For a client meeting: the client (by id) and the person there. Clients don't sign in. */
  clientId?: string | null;
  contactName?: string;
  contactPhone?: string;
  agenda?: string;
  /** Days of a repeating meeting with no meeting (YYYY-MM-DD and a reason). */
  skip?: { date: string; note: string }[];
  /** The admin who added it (an email); they see it and get its reminders even when not on the team. */
  host?: string;
  /** The daily team meeting (its details are changed on its own page). */
  builtIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Everything the app shares between people. */
export interface AppData {
  clients: Client[];
  issues: Issue[];
  updates: DailyUpdate[];
  team: TeamMember[];
  leads: Lead[];
  settings: Settings;
}

/** What someone may do: admins everything, managers the day-to-day work, pending accounts nothing yet. */
export type Role = 'admin' | 'manager' | 'pending';
