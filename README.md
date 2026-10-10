# Team Tracker

Velvo Media's internal tracker for daily updates, issues, clients and leads, with a read-out for the daily stand-up meeting.

People sign in with their Google account. Everyone on the Team page with their Google email can get in.

## Pages

| Page | What it's for | Who can use it |
|---|---|---|
| Dashboard | Today's counters, logging a daily update, the feed of recent updates, and the client delivery report (preview and Excel download) | Admins and managers |
| Meetings | Every meeting: the daily team meeting and the ones admins add (one time or repeating; team, interns, client, one-on-one). Today's meetings, the next 6 days, and a page for each meeting; a reminder at the top of every page before your meetings. Anyone in a meeting can say "I can't attend" with a reason; admins can skip one date of a repeating meeting. Your notes for every meeting, and for admins a monthly list of who couldn't attend. The daily meeting's page has its time, link and days off, "I can't attend" notes with a reason, today's list (Admin / Team / Intern), and for admins a monthly list of who couldn't attend. Everyone sees only the meetings they are in; admins see all of them and add, change or remove them | Admins and managers |
| Issues | Blockers and action items: assign, prioritise, resolve | Admins and managers |
| Clients | Everything logged against a client: status, deal value, services, updates and issues | Admins and managers |
| Lead Followups | Leads, their follow-up dates and history, and turning a lead into a client | Admins and managers |
| Team | The team directory and each person's workload | Everyone can view; admins edit |
| Customize | The dropdown lists (statuses, priorities, lead sources), their colours and defaults | Admins |
| Audit Logs | A record of every change: who made it, when, and what changed | Admins |
| User Panel | Who can sign in, and with which role | Admins |

## How it works

- **Built with** Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS 4.
- **Sign-in** uses Firebase Authentication with Google. The server checks each request's Firebase token with `firebase-admin`.
- **Who can get in:** anyone on the Team page with their Google email can sign in straight away and works as a `manager`. Admins (set in the User Panel, or listed in `OWNER_EMAILS`) can also change the Team and Customize pages and see the Audit Logs and User Panel. The User Panel can also give access to someone who isn't on the team. Anyone else who signs in sees "You don't have access yet" and no data. Only emails Google has confirmed count.
- **Data** lives in MongoDB (Atlas). The database is the one named in `MONGODB_URI`.
  - `appData`: all shared records (clients, issues, leads, team, updates, settings) in one document with the id `velvo-ops-data` and a version number.
  - `users`: sign-in accounts and their roles.
  - `logs`: the audit log, one entry per change.
  - `meetings`: the meetings added on the Meetings page, one record each. The server only sends each person the meetings they are in (admins get all), so a one-on-one stays private.
  - `meetingAbsences`: "I can't attend" notes, one per person per meeting per day (notes for the daily meeting have no `meetingId`) (kept apart from `appData`, so several people can write one at the same moment). The meeting's own details (time, days, link, camera, notes, days off) are settings in `appData`.
- **Saving:** each save sends the whole data set with the version it started from. If someone else saved first, the server refuses the save and the app loads the latest data and asks you to make your change again. The server also refuses saves that are malformed, too large (over 5 MB), or that leave out a whole section of the data (what a page that failed to load would send). Managers can't remove many records in one save, edit or delete other people's daily updates, or change the Team directory or Customize settings.
- **Staying up to date:** the app checks for other people's changes every 20 seconds and whenever you come back to the tab.

## Running it on your computer

You need [Node.js](https://nodejs.org) 20.9 or newer.

1. Install the packages:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in the real values (see [Settings](#settings) below). `.env.local` is private: never commit or share it.
3. Start the app:
   ```bash
   npm run dev
   ```
   Then open http://localhost:3000.

> **Careful:** the local app uses whatever database `.env.local` points to. If that is the live database, anything you add, edit or delete locally changes the real data. To try things out safely, use `npm run dev:local` (below).

### Trying things out without touching the real data

```bash
npm run dev:local
```

This runs the app on http://localhost:3000 with a private test copy of the data, kept in the `.local-db` folder on your computer. The first time, it copies the real data once (read only). After that, everything you add, edit or delete stays in the copy: the real database and the website are never changed. A green "Test copy" bar at the top of the app shows you are on the copy. Stop it with Ctrl+C.

To start again from a fresh copy of the real data: `npm run dev:local -- --fresh`.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev:local` | Runs the app on a private test copy of the data (see above) |
| `npm run build` | Builds the app for production (also checks the TypeScript types) |
| `npm start` | Runs the production build |
| `npm run lint` | Checks the code with ESLint |
| `npm test` | Runs the tests for saving and permissions (see below) |

## Tests

`npm test` checks the rules that protect the data: that saves based on an old version are refused, that malformed or oversized saves are refused, that every save is written to the audit log, and who may do what (signed out, waiting for approval, manager, admin). The tests are in `tests/`.

They run the real server code against a throwaway database that exists only while the tests run. They never read `.env.local` and never connect to the real database. The first run downloads a MongoDB program (about 100 MB), so it needs an internet connection once.

## Settings

All settings are environment variables. Put them in `.env.local` on your computer and in the Vercel project settings for the live site. `.env.example` lists them with placeholders.

| Name | Needed | What it is |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string, including the database user, password and database name |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project id |
| `FIREBASE_CLIENT_EMAIL` | Yes | The Firebase service account's email (Firebase console → Project settings → Service accounts) |
| `FIREBASE_PRIVATE_KEY` | Yes | The service account's private key, in quotes, with the `\n` markers kept as they are in the downloaded key file |
| `OWNER_EMAILS` | Yes | Full email addresses that are always admins, separated by commas |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` | No | The Firebase web app settings used by the sign-in page. The app has built-in values for the current Firebase project; set these only if you move to another project |
| `SKIP_SIGN_IN` | No | Local testing only: `true` opens the app with `npm run dev` without Google sign-in, as an admin called "Local admin". Production builds ignore it |
| `REQUIRE_APPROVAL` | No | Local testing only: `false` lets pending accounts use the app with `npm run dev`. Production builds ignore it |

## Deploying to Vercel

1. Import the project into Vercel. No `vercel.json` is needed: Vercel detects Next.js by itself.
2. In the Vercel project settings, add every required setting from the table above.
3. In the Firebase console (Authentication → Settings → Authorized domains), add the site's domain, or Google sign-in will be refused.
4. In MongoDB Atlas (Network Access), allow connections from Vercel.
5. Deploy. Anyone listed in `OWNER_EMAILS` becomes an admin when they sign in, and can then add the team's Google emails on the Team page.

Turn on backups in MongoDB Atlas: the shared records are one document, so a bad save or a mistaken delete can only be undone from a backup or by hand from the Audit Logs.

## Where the code is

```
src/app/page.tsx      the app shell: sign-in screens, the sidebar, and which page is shown
                      (pages have their own addresses, for example /?page=clients&id=…)
src/app/api/          server routes: data (load and save), users (sign-in and roles),
                      logs (the audit log), config (Firebase web settings),
                      meetings (the Meetings page's meetings), meeting ("I can't attend"
                      notes for the daily meeting)
src/components/       one file per page (DashboardView, ClientsView, …), one client's and one
                      lead's page (ClientDetail, LeadDetail), and shared parts (PageHeader,
                      Pagination, ConfirmDialog, Sidebar)
src/context/          AuthContext (who is signed in, their role) and DataContext
                      (loading, saving and refreshing the shared data)
src/utils/            shared logic: dates, money, phone numbers, colours and styles,
                      the report, the Excel file, the audit log's change lists, …
src/types.ts          the shape of every record the app stores
tests/                the tests for saving and permissions (npm test)
```
