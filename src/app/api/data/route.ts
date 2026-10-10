import { NextResponse, NextRequest } from 'next/server';
import { verifyToken, logAction, requireAppAccess, errorResponse, findDroppedSections, validateAppData, findMassRemovals, MAX_SAVE_BYTES } from '../utils';
import { readAppData, writeAppData } from '../store';
import { settingsChanged } from '../../../utils/defaults';
import { findForbiddenUpdateChanges } from '../../../utils/updates';
import { describeChanges, type Change } from '../../../utils/changes';
import { filterForViewer, mergeUserSave, viewerFor } from '../../../utils/visibility';
import { findForbiddenTaskDeletes } from '../../../utils/tasks';

// Shown when someone else saved first. The browser then reloads the latest data.
const CONFLICT_MESSAGE = 'Someone else saved a change a moment ago. The latest data is now on your screen. Please make your change again.';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    // Only logins with access (Admin or User) may read business data.
    const me = requireAppAccess(user);
    const stored = await readAppData();
    let value = stored ? stored.value : null;
    // Admins get everything; a user gets their own work (see utils/visibility.ts).
    if (value && !me.isAdmin) {
      const state = JSON.parse(value);
      value = JSON.stringify(filterForViewer(state, viewerFor(state.team, me.email)));
    }
    // `rev` is the version number of the saved data. Every successful save increases it by one.
    return NextResponse.json({ value, rev: stored?.rev ?? 0 });
  } catch (error) {
    return errorResponse(error, '/data GET');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyToken(req);

    // Only logins with access (Admin or User) may save. Anyone else is refused.
    const dbUser = requireAppAccess(user);

    const body = await req.json();
    const value = body?.value;
    const action = body?.action || 'UPDATE_DATA';
    const details = body?.details || 'Updated dashboard data';
    const baseRev = body?.baseRev;

    if (typeof value !== 'string') return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    if (typeof baseRev !== 'number' || !Number.isInteger(baseRev) || baseRev < 0) {
      return NextResponse.json({ error: 'Your app is out of date. Please reload the page.' }, { status: 400 });
    }
    const size = Buffer.byteLength(value, 'utf8');
    if (size > MAX_SAVE_BYTES) {
      return NextResponse.json({ error: 'This save is too large. Please contact an admin.' }, { status: 413 });
    }
    // Early warning in the server logs, long before the limit is reached (in October 2026 the data was about 25 KB).
    if (size > MAX_SAVE_BYTES * 0.4) {
      console.warn(`Stored data is getting large: ${Math.round(size / 1000)} KB of ${Math.round(MAX_SAVE_BYTES / 1000)} KB allowed.`);
    }

    let newState: any;
    try {
      newState = JSON.parse(value);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    // --- SAFETY: CHECK THE SHAPE OF EVERYTHING BEFORE STORING IT ---
    const shapeProblem = validateAppData(newState);
    if (shapeProblem) {
      console.warn(`Refused save from ${user.email}: ${shapeProblem}`);
      return NextResponse.json({ error: shapeProblem }, { status: 400 });
    }

    const oldDoc = await readAppData();
    const currentRev: number = oldDoc?.rev ?? 0;

    // --- SAFETY: DON'T OVERWRITE SOMEONE ELSE'S NEWER CHANGES ---
    // The browser says which version its change was based on. If the data has changed since, refuse.
    if (baseRev !== currentRev) {
      return NextResponse.json({ error: CONFLICT_MESSAGE, conflict: true }, { status: 409 });
    }

    let oldState: any = null;
    if (oldDoc && oldDoc.value) {
      try {
        oldState = JSON.parse(oldDoc.value);
      } catch {
        oldState = null;
      }
    }

    // --- A USER SAVES ONLY THEIR OWN WORK ---
    // They were sent only their part of the data, so their save is fitted back into the whole: everyone else's
    // records stay exactly as stored. Changing a record they can't see is refused.
    if (dbUser.role !== 'admin') {
      if (oldDoc && oldDoc.value && !oldState) {
        return NextResponse.json({ error: 'Stored data could not be read' }, { status: 400 });
      }
      const fitted = mergeUserSave(oldState, newState, viewerFor(oldState?.team, dbUser.email));
      if ('problem' in fitted) {
        console.warn(`Refused save from ${user.email}: ${fitted.problem}`);
        return NextResponse.json({ error: fitted.problem }, { status: 403 });
      }
      newState = fitted.state;
    }

    // --- SAFETY: NEVER DROP WHOLE SECTIONS ---
    // A save must still contain every section the database already has (clients, issues, and so on).
    // This blocks the case where a page that failed to load saves an almost empty copy over everything.
    const dropped = findDroppedSections(oldState, newState);
    if (dropped.length > 0) {
      console.warn(`Refused save from ${user.email}: it would remove ${dropped.join(', ')}`);
      return NextResponse.json(
        { error: `Save refused because it would delete all ${dropped.join(', ')}. Reload the page and try again.` },
        { status: 409 }
      );
    }

    // --- SAFETY: NO MASS DELETION BY NON-ADMINS ---
    // The app only ever removes one record per save, so removing many at once is refused unless you are an admin.
    if (dbUser.role !== 'admin') {
      const massRemovals = findMassRemovals(oldState, newState);
      if (massRemovals.length > 0) {
        console.warn(`Refused save from ${user.email}: mass removal of ${massRemovals.join(', ')}`);
        return NextResponse.json(
          { error: `Save refused because it would delete too many records at once (${massRemovals.join(', ')}). Only admins can do that.` },
          { status: 409 }
        );
      }
    }

    // What gets stored. For non-admins the stored settings are put back in (see below).
    let valueToStore = value;

    // --- SECURITY: STATE DIFFING ---
    // Users (not admins) cannot modify the Team or the Settings.
    if (dbUser.role !== 'admin' && oldDoc && oldDoc.value) {
      if (!oldState) {
        return NextResponse.json({ error: 'Stored data could not be read' }, { status: 400 });
      }
      // Compare stringified versions of protected paths
      if (JSON.stringify(oldState.team) !== JSON.stringify(newState.team)) {
        return NextResponse.json({ error: 'Only admins can change the Team directory.' }, { status: 403 });
      }
      // Only the person who raised a task may delete it (admins may too).
      const taskProblem = findForbiddenTaskDeletes(oldState.issues, newState.issues, user.email || '');
      if (taskProblem) {
        return NextResponse.json({ error: taskProblem }, { status: 403 });
      }
      // Only the writer of an update may edit, delete or restore it (admins may too).
      const updateProblem = findForbiddenUpdateChanges(oldState, newState, user.email);
      if (updateProblem) {
        return NextResponse.json({ error: updateProblem }, { status: 403 });
      }
      // The browser fills in missing dropdown lists before showing data, so only real changes count (see settingsChanged).
      if (settingsChanged(oldState.settings, newState.settings)) {
        return NextResponse.json({ error: 'Only admins can change Customize settings.' }, { status: 403 });
      }
      // Keep the stored settings exactly as they are, whatever the browser filled in.
      if (oldState.settings !== undefined) newState.settings = oldState.settings;
      else delete newState.settings;
      valueToStore = JSON.stringify(newState);
    } else if (dbUser.role !== 'admin') {
      valueToStore = JSON.stringify(newState);
    }
    // (A user's save grows once the rest of the data is put back in, so the size is checked again.)
    if (Buffer.byteLength(valueToStore, 'utf8') > MAX_SAVE_BYTES) {
      return NextResponse.json({ error: 'This save is too large. Please contact an admin.' }, { status: 413 });
    }

    // Write only if nobody else saved in the meantime (the version must still be the one checked above).
    const newRev = currentRev + 1;
    const written = await writeAppData(currentRev, { value: valueToStore, rev: newRev, updatedAt: new Date(), updatedBy: user.email || '' });
    if (!written) {
      return NextResponse.json({ error: CONFLICT_MESSAGE, conflict: true }, { status: 409 });
    }
    // What the save changed, with before and after values, worked out here rather than trusted from the browser.
    // If it can't be worked out, the entry is still written without it (the save itself has already succeeded).
    let changes: Change[] | undefined;
    try {
      changes = describeChanges(oldState, newState);
    } catch {
      changes = undefined;
    }
    await logAction(action, dbUser.name || user.email || 'unknown', details, changes);

    return NextResponse.json({ ok: true, rev: newRev });
  } catch (error) {
    return errorResponse(error, '/data POST');
  }
}
