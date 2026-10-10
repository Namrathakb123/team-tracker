# Handover: where the Team Tracker stands (11 Oct 2026)

Read this first if you are continuing the work (a person or an AI agent).
Never paste the contents of `.env.local` or the Firebase key file (`*-firebase-adminsdk-*.json`) into a chat.

## What changed in this round (all built on the private test copy; nothing is deployed yet)

1. **Data moved from MongoDB to Firebase (Firestore).** Server code: `src/app/api/firebase.ts` (connection) and
   `src/app/api/store.ts` (every read and write). The shared data is still one record (`appData/velvo-ops-data`, with
   a version number `rev`); also `logs`, `meetings`, `meetingAbsences`. Limit: 1 MB per save (`MAX_SAVE_BYTES`).
2. **Email + password login** (Firebase Authentication) instead of Google sign-in.
   - Only admins create logins, on the **Team page** (the old User Panel is gone): Access = Admin or User, with a
     random starting password to send the person. They must choose their own password at the first sign-in.
   - Access is stored on the login as Firebase "custom claims" (`role`, `mustChangePassword`), checked on every request
     (`verifyIdToken(token, true)`, so removed access stops at once). Code: `src/app/api/accounts.ts`,
     `src/app/api/accounts/route.ts` (admins), `src/app/api/account/route.ts` (first password),
     `src/context/AuthContext.tsx`, `src/components/SignInScreen.tsx`, `PasswordForms.tsx`, `LoginDialog.tsx`.
   - "Forgot password?" shows a pop-up: contact your admin (they give a new starting password on the Team page).
3. **Admins see everything; users see only their own work** (`src/utils/visibility.ts`, used by
   `src/app/api/data/route.ts`): their clients, tasks given to/raised by them (and those clients), leads given to/added
   by them, and updates on those. A user's save is fitted back into the whole data; others' records stay untouched.
4. **Issues became Tasks** (`src/components/TasksView.tsx`, rules in `src/utils/tasks.ts`): My tasks / Raised by me /
   All, a "New task" window, due dates (overdue shown on the Dashboard), a board view by status, and users can delete
   only tasks they raised. The data keeps its old names (`issues`, `issueStatuses`), so old records still work.
5. **"My work" page** (`src/components/MemberWorkView.tsx`, `?page=work`): a person's tasks, follow-ups, clients,
   meetings and recent updates. Admins open anyone's from the Team page ("Work").
6. All money is shown in Indian rupees with Indian grouping (₹5,00,000), in the app and the Excel downloads.

## Running it on this computer

- `npm run dev:local`: the private test copy (Firebase emulators on this computer, saved in `.local-firebase`).
  Sign in with the test admin **admin@test.copy / TestCopy-Admin-1** (exists only in the emulator). Needs Java.
- `npm test`: the project's tests (52), against the emulators. All pass.
- `npm run lint`, `npx tsc --noEmit`: both clean (lint has warnings only).
- Extra unit and browser tests are kept outside the project in `../dev-tools/extra-tests/` (they were written in a
  temporary folder; the paths at the top of `run-all.sh`, `run-ui.sh` and `ui-common.js` must be pointed at their new
  place before running them). Unit tests (`run-all.sh`): all pass.

## Left to do (in this order)

1. **Browser tests still using the old wording.** About 25 of the extra browser tests look for "Issues", "All issues",
   "Issue Statuses", "Raise an issue", "FLAG AS ISSUE" (now "Tasks", "Task Statuses", "Add a task", "MAKE A TASK") or
   fill in the old inline issue form (now: click "+ New task", fill the window, "Create task"). Some open a lead or task
   as the test User, which must now be given to that User (`assignedTo: "mgr-member"`). Update the tests; the app
   itself is fine.
2. **Grid layout on the other pages** (Clients, Leads, Meetings, Team, Customize) to match the Dashboard. Cosmetic.
3. **Landing page:** the sign-in page is the landing page; ask the owner what else they want on it.

## Going live (with the owner)

1. Firebase console, project `team-tracker-velvo-ce4e2`:
   - Build > Firestore Database > Create database (Standard edition, location **asia-south1 (Mumbai)**, production
     mode). Rules: copy `firestore.rules` (everything closed to browsers; only the server reads and writes).
   - Build > Authentication > Sign-in method: turn **Email/Password** on; turn **Google** off.
   - Authentication > Settings > User actions: turn off **Enable create (sign-up)**, so only admins can make logins.
   - Authentication > Users > Add user: the owner's own email with a password only they know.
   - Billing (recommended): the Blaze plan with a budget alert (for example ₹500/month); normal use stays free.
2. On this computer: `npm run move-to-firebase` (shows counts only), then `npm run move-to-firebase -- --go` (copies
   the real data from the old MongoDB, read only, and checks it). Then `npm run make-admin -- owner@email`.
3. GitHub: a **private** repository; push this folder (`.env.local`, `.local-*` and keys are ignored by git).
4. Vercel: import the GitHub repository; Functions region **bom1 (Mumbai)**; Environment variables: everything in
   `.env.example` except MONGODB_URI (values from `.env.local`). Deploy. Note: Vercel's free plan is for personal,
   non-commercial use; a company tool may need the Pro plan.
5. Firebase > Authentication > Settings > Authorized domains: add the Vercel address (and the custom domain if any).
6. Sign in, give everyone a login on the Team page, send them their starting passwords, add the real meeting link.
7. Afterwards: switch the old site off, and delete the old MongoDB user and the old Firebase key.
