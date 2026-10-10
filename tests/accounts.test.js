// Tests for logins (src/app/api/accounts, src/app/api/account): admins create them with a starting password, people
// choose their own, and admins can change access, give a new starting password, or remove access.
// These sign in for real against Firebase's login emulator, with real passwords and real sign-in tokens.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, sampleData, DEFAULT_PROJECT } = require('./harness');

// The admin who calls the routes (access given directly, see harness.js).
const BOSS = 'boss@velvo.in';
const STARTING = 'Mango-River-Kite-4821';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let h;

test.before(async () => {
  h = await createHarness({ projectId: DEFAULT_PROJECT });
  h.setAccount(BOSS, 'admin');
  await h.db.collection('appData').insertOne({ _id: 'velvo-ops-data', value: JSON.stringify(sampleData()), rev: 1 });
});
test.after(async () => { await h.stop(); });

const create = (email, role = 'user', password = STARTING, name = 'Riya Test') => h.call('accounts', 'POST', BOSS, { email, name, role, password });
const patch = (body, as = BOSS) => h.call('accounts', 'PATCH', as, body);
const latestLog = (action) => h.db.collection('logs').findOne({ action }, { sort: { timestamp: -1 } });

// Calls a route with a real sign-in token (the app's own token check, as on the live site).
async function withToken(token, route, method = 'GET', body) {
  h.useRealSignIn(true);
  try {
    return await h.call(route, method, null, body, { authorization: `Bearer ${token}` });
  } finally {
    h.useRealSignIn(false);
  }
}
const signInFails = async (email, password) => {
  try { await h.signInWithPassword(email, password); return null; } catch (e) { return e.message; }
};

test('an admin gives someone a login with a starting password', async () => {
  const res = await create('riya@velvo.in');
  assert.equal(res.status, 200);
  assert.deepEqual(
    [res.json.account.email, res.json.account.role, res.json.account.mustChangePassword, res.json.account.disabled],
    ['riya@velvo.in', 'user', true, false],
  );
  const login = await h.auth.getUserByEmail('riya@velvo.in');
  assert.equal(login.emailVerified, true, 'only admins make logins, so the email counts as confirmed');
  assert.equal(login.displayName, 'Riya Test');
  const listed = (await h.call('accounts', 'GET', BOSS)).json.accounts.map((a) => a.email);
  assert.ok(listed.includes('riya@velvo.in'));
  const log = await latestLog('ACCOUNT_CREATE');
  assert.equal(log.details, 'Gave Riya Test (riya@velvo.in) a login as User');
  assert.ok(!JSON.stringify(log).includes(STARTING), 'the password is never written to the Audit Log');
});

test('the starting password only lets them choose their own; then they can use the app', async () => {
  await create('first@velvo.in');
  const startToken = await h.signInWithPassword('first@velvo.in', STARTING);
  const blocked = await withToken(startToken, 'data');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.passwordChange, true);
  assert.equal((await withToken(startToken, 'account', 'POST', { password: 'short' })).status, 400, 'too short');
  assert.equal((await withToken(startToken, 'account', 'POST', { password: 'My own secret phrase' })).status, 200);
  assert.match(await signInFails('first@velvo.in', STARTING), /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/);
  const ownToken = await h.signInWithPassword('first@velvo.in', 'My own secret phrase');
  assert.equal((await withToken(ownToken, 'data')).status, 200);
  assert.equal((await h.auth.getUserByEmail('first@velvo.in')).customClaims.mustChangePassword, undefined);
  assert.equal((await latestLog('PASSWORD_CHANGED')).details, 'Riya Test chose their own password');
  // Once done, that route can't be used again (later changes need the current password, in the browser).
  assert.equal((await withToken(ownToken, 'account', 'POST', { password: 'Another new phrase' })).status, 400);
});

test('wrong details are refused, and an email can only have one login', async () => {
  assert.equal((await create('not-an-email')).status, 400);
  assert.equal((await create('ok@velvo.in', 'user', 'short')).status, 400);
  assert.equal((await create('ok@velvo.in', 'boss')).status, 400);
  assert.equal((await h.call('accounts', 'POST', BOSS, { email: 'ok@velvo.in', name: ' ', role: 'user', password: STARTING })).status, 400);
  assert.equal(await h.auth.getUserByEmail('ok@velvo.in').catch(() => null), null);
  await create('twice@velvo.in');
  const again = await create(' Twice@Velvo.in ');
  assert.equal(again.status, 409);
  assert.equal(again.json.exists, true);
});

test('an admin can change someone\'s access; they are signed out and get it at their next sign-in', async () => {
  await create('promo@velvo.in');
  await withToken(await h.signInWithPassword('promo@velvo.in', STARTING), 'data'); // (signed in once)
  await h.call('account', 'POST', 'promo@velvo.in', { password: 'Promo own password' });
  const before = await h.signInWithPassword('promo@velvo.in', 'Promo own password');
  assert.equal((await withToken(before, 'logs')).status, 403, 'a user can’t read the Audit Log');
  await sleep(1100); // (sign-in times are kept in whole seconds)
  assert.equal((await patch({ email: 'promo@velvo.in', role: 'admin' })).status, 200);
  assert.equal((await withToken(before, 'data')).status, 401, 'signed out by the change');
  const after = await h.signInWithPassword('promo@velvo.in', 'Promo own password');
  assert.equal((await withToken(after, 'logs')).status, 200, 'now an admin');
  assert.equal((await latestLog('ACCOUNT_EDIT')).details, 'Login of Riya Test: access User → Admin');
});

test('a new starting password from an admin: the old one stops working and they choose again', async () => {
  await create('forgot@velvo.in');
  await h.call('account', 'POST', 'forgot@velvo.in', { password: 'Forgotten phrase 1' });
  const old = await h.signInWithPassword('forgot@velvo.in', 'Forgotten phrase 1');
  await sleep(1100);
  assert.equal((await patch({ email: 'forgot@velvo.in', password: 'Tulip-Ocean-Fern-0042' })).status, 200);
  assert.equal((await withToken(old, 'data')).status, 401, 'signed out everywhere');
  assert.ok(await signInFails('forgot@velvo.in', 'Forgotten phrase 1'));
  const fresh = await h.signInWithPassword('forgot@velvo.in', 'Tulip-Ocean-Fern-0042');
  assert.equal((await withToken(fresh, 'data')).json.passwordChange, true, 'must choose their own again');
  assert.equal((await patch({ email: 'forgot@velvo.in', password: 'tiny' })).status, 400);
});

test('removing access stops them at once; giving it back lets them in again', async () => {
  await create('leaver@velvo.in');
  await h.call('account', 'POST', 'leaver@velvo.in', { password: 'Leaver own phrase' });
  const token = await h.signInWithPassword('leaver@velvo.in', 'Leaver own phrase');
  assert.equal((await withToken(token, 'data')).status, 200);
  assert.equal((await patch({ email: 'leaver@velvo.in', disabled: true })).status, 200);
  assert.equal((await withToken(token, 'data')).status, 401, 'their open session stops working');
  assert.match(await signInFails('leaver@velvo.in', 'Leaver own phrase'), /USER_DISABLED/);
  assert.equal((await patch({ email: 'leaver@velvo.in', disabled: false })).status, 200);
  assert.equal((await withToken(await h.signInWithPassword('leaver@velvo.in', 'Leaver own phrase'), 'data')).status, 200);
});

test('nobody can take away their own admin access, or that of the last admin who can sign in', async () => {
  await create('owner@velvo.in', 'admin', STARTING, 'Owner');
  // (A new login can do nothing else until it has its own password.)
  assert.equal((await patch({ email: 'promo@velvo.in', role: 'user' }, 'owner@velvo.in')).json.passwordChange, true);
  await h.call('account', 'POST', 'owner@velvo.in', { password: 'Owner own phrase' });
  // (Every other login in this file is a user or was made one again below.)
  await patch({ email: 'promo@velvo.in', role: 'user' });
  assert.equal((await patch({ email: 'owner@velvo.in', role: 'user' }, 'owner@velvo.in')).status, 400, 'not your own');
  assert.equal((await patch({ email: 'owner@velvo.in', disabled: true }, 'owner@velvo.in')).status, 400, 'not your own');
  const last = await patch({ email: 'owner@velvo.in', role: 'user' });
  assert.equal(last.status, 400);
  assert.match(last.json.error, /last admin/);
  assert.equal((await patch({ email: 'owner@velvo.in', disabled: true })).status, 400);
  await create('second.admin@velvo.in', 'admin', STARTING, 'Second');
  assert.equal((await patch({ email: 'owner@velvo.in', role: 'user' })).status, 200, 'fine once there is another admin');
  assert.equal((await h.auth.getUserByEmail('owner@velvo.in')).customClaims.role, 'user');
});

test('changing someone\'s email or name on the Team page changes their login', async () => {
  await create('old.address@velvo.in');
  const res = await patch({ email: 'old.address@velvo.in', newEmail: 'New.Address@Velvo.in', name: 'Riya Sharma' });
  assert.equal(res.status, 200);
  assert.equal(res.json.account.email, 'new.address@velvo.in');
  assert.equal(res.json.account.name, 'Riya Sharma');
  assert.ok(await h.signInWithPassword('new.address@velvo.in', STARTING));
  assert.equal((await patch({ email: 'new.address@velvo.in', newEmail: 'riya@velvo.in' })).status, 409, 'that email has a login already');
  assert.equal((await patch({ email: 'new.address@velvo.in', newEmail: 'not an email' })).status, 400);
  assert.equal((await patch({ email: 'nobody.here@velvo.in', role: 'admin' })).status, 404);
});
