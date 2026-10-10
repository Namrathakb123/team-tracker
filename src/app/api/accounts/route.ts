import { NextResponse, NextRequest } from 'next/server';
import { verifyToken, requireAdmin, errorResponse, logAction } from '../utils';
import { accountsAuth, activeAdmins, changeAccountDetails, createAccount, findAccount, listAccounts, resetPassword, setDisabled, setRole, toAccount } from '../accounts';
import { ACCESS_LABELS, cleanEmail, emailProblem, isAccessRole, passwordProblem } from '../../../utils/accounts';

// Logins, for admins (the Team page). The app sends no email: the admin passes the starting password on.
//   GET                                       every login: { accounts: [{ email, name, role, disabled, … }] }
//   POST  { email, name, role, password }     a new login with a starting password (changed at the first sign-in)
//   PATCH { email, … }                        changes one login, with any of:
//           role: 'admin' | 'user'   new access (they are signed out, and have it when they sign in again)
//           password                 a new starting password (they change it again; signed out everywhere)
//           disabled: true | false   removes access (signed out everywhere) or gives it back
//           newEmail, name           their email or name as changed on the Team page
// Nobody can take admin access away from themselves, or from the last admin who can still sign in.

function refuse(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export async function GET(req: NextRequest) {
  try {
    requireAdmin(await verifyToken(req));
    return NextResponse.json({ accounts: await listAccounts() });
  } catch (error) {
    return errorResponse(error, '/accounts', 'Only admins can see who has a login.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = requireAdmin(await verifyToken(req));
    const body = await req.json().catch(() => null);
    const email = cleanEmail(body?.email);
    const name = text(body?.name);
    const role = body?.role;
    const password = body?.password;
    const problem = emailProblem(email) || (!name ? 'Enter their name.' : null) || (!isAccessRole(role) ? 'Choose Admin or User.' : null) || passwordProblem(password);
    if (problem) return refuse(problem);
    if (await findAccount(email)) return refuse('There is already a login for this email.', 409, { exists: true });
    let created;
    try {
      created = await createAccount({ email, name, role, password });
    } catch (error: any) {
      if (error?.code === 'auth/email-already-exists') return refuse('There is already a login for this email.', 409, { exists: true });
      if (error?.code === 'auth/invalid-password') return refuse(passwordProblem('') || 'That password is not allowed.');
      throw error;
    }
    await logAction('ACCOUNT_CREATE', me.name, `Gave ${name} (${email}) a login as ${ACCESS_LABELS[role as 'admin' | 'user']}`);
    return NextResponse.json({ account: toAccount(created) });
  } catch (error) {
    return errorResponse(error, '/accounts', 'Only admins can give someone a login.');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = requireAdmin(await verifyToken(req));
    const body = await req.json().catch(() => null);
    const target = await findAccount(cleanEmail(body?.email));
    if (!target) return refuse('There is no login for this email.', 404);
    const account = toAccount(target);
    const isSelf = target.uid === me.uid;
    const who = account.name || account.email;

    const role = body?.role;
    if (role !== undefined && !isAccessRole(role)) return refuse('Choose Admin or User.');
    const disabled = typeof body?.disabled === 'boolean' ? body.disabled : undefined;
    const password = body?.password;
    if (password !== undefined) {
      if (isSelf) return refuse('Use “Change password” in the menu to change your own password.');
      const problem = passwordProblem(password);
      if (problem) return refuse(problem);
    }
    const newEmail = body?.newEmail !== undefined ? cleanEmail(body.newEmail) : undefined;
    if (newEmail !== undefined && newEmail !== account.email) {
      const problem = emailProblem(newEmail);
      if (problem) return refuse(problem);
      if (await findAccount(newEmail)) return refuse('Someone else already has a login with this email.', 409);
    }
    const name = body?.name !== undefined ? text(body.name) : undefined;

    // Admin access can't be lost by yourself, or by the last admin who can still sign in.
    const losesAdmin = account.role === 'admin' && !account.disabled && ((role !== undefined && role !== 'admin') || disabled === true);
    if (losesAdmin || (disabled === true && isSelf)) {
      if (isSelf) return refuse(disabled === true ? 'You can’t remove your own access.' : 'You can’t take away your own admin access.');
      if (activeAdmins(await listAccounts()).length <= 1) return refuse('This is the last admin who can sign in. Make someone else an admin first.');
    }

    const done: string[] = [];
    if ((newEmail !== undefined && newEmail !== account.email) || (name && name !== account.name)) {
      await changeAccountDetails(target, { ...(newEmail && newEmail !== account.email ? { email: newEmail } : {}), ...(name && name !== account.name ? { name } : {}) });
      if (newEmail && newEmail !== account.email) done.push(`email ${account.email} → ${newEmail}`);
      if (name && name !== account.name) done.push(`name ${account.name || '—'} → ${name}`);
    }
    if (role !== undefined && role !== account.role) {
      await setRole(target, role);
      // Signed out, so the new access applies from their next sign-in.
      await accountsAuth().revokeRefreshTokens(target.uid);
      done.push(`access ${account.role ? ACCESS_LABELS[account.role] : 'none'} → ${ACCESS_LABELS[role as 'admin' | 'user']}`);
    }
    if (password !== undefined) {
      await resetPassword(await accountsAuth().getUser(target.uid), password);
      done.push('new starting password');
    }
    if (disabled !== undefined && disabled !== account.disabled) {
      await setDisabled(target, disabled);
      done.push(disabled ? 'access removed' : 'access given back');
    }
    if (done.length) await logAction('ACCOUNT_EDIT', me.name, `Login of ${who}: ${done.join('; ')}`);
    return NextResponse.json({ account: toAccount(await accountsAuth().getUser(target.uid)) });
  } catch (error) {
    return errorResponse(error, '/accounts', 'Only admins can change logins.');
  }
}
