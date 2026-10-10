import { NextResponse, NextRequest } from 'next/server';
import { verifyToken, requireAppAccess, errorResponse, logAction } from '../utils';
import { finishPasswordChange } from '../accounts';
import { passwordProblem } from '../../../utils/accounts';

// The signed-in person's own login.
//   POST { password }   replaces their starting password with one they chose (only while they still have to;
//                       later changes go through Firebase directly and need their current password).

export async function POST(req: NextRequest) {
  try {
    const user = await verifyToken(req);
    const me = requireAppAccess(user, { allowPasswordChange: true });
    if (user.mustChangePassword !== true) {
      return NextResponse.json({ error: 'Use “Change password” in the menu to change your password.' }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const problem = passwordProblem(body?.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    await finishPasswordChange(me.uid, body.password);
    await logAction('PASSWORD_CHANGED', me.name, `${me.name} chose their own password`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, '/account');
  }
}
