// Tests for who may do what (src/app/api/*), against Firebase's emulators.
// Access comes from the login: Admin or User. Logins without access, and people still using their starting
// password, can't use the app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, sampleData } = require('./harness');

const ADMIN = 'boss@velvo.in';
const USER = 'mgr@velvo.in';
const NO_ACCESS = 'nobody@velvo.in';
const NEW_PASSWORD = 'starting@velvo.in';
let h;

test.before(async () => {
  h = await createHarness();
  h.setAccount(ADMIN, 'admin');
  h.setAccount(USER, 'user');
  h.setAccount(NEW_PASSWORD, 'user', { mustChangePassword: true });
});
test.after(async () => { await h.stop(); });

async function seed(state = sampleData()) {
  await h.db.collection('appData').deleteMany({});
  await h.db.collection('appData').insertOne({ _id: 'velvo-ops-data', value: JSON.stringify(state), rev: 1 });
}
const save = (email, state) => h.call('data', 'POST', email, { value: JSON.stringify(state), baseRev: 1 });
const changed = (change) => { const s = sampleData(); change(s); return s; };

test('without signing in, nothing can be loaded or saved', async () => {
  await seed();
  assert.equal((await h.call('data', 'GET', null)).status, 401);
  assert.equal((await save(null, sampleData())).status, 401);
  assert.equal((await h.call('logs', 'GET', null)).status, 401);
  assert.equal((await h.call('accounts', 'GET', null)).status, 401);
});

test('a login without access can neither load nor save', async () => {
  await seed();
  for (const email of [NO_ACCESS, 'stranger@gmail.com']) {
    assert.equal((await h.call('data', 'GET', email)).status, 403, email);
    assert.equal((await save(email, changed((s) => { s.clients[0].name = 'Hacked'; }))).status, 403, email);
    assert.equal((await h.call('meetings', 'GET', email)).status, 403, email);
  }
  assert.equal((await h.stored()).state.clients[0].name, 'Alpha Foods');
});

test('someone still on their starting password must choose their own first', async () => {
  await seed();
  const load = await h.call('data', 'GET', NEW_PASSWORD);
  assert.equal(load.status, 403);
  assert.equal(load.json.passwordChange, true);
  assert.equal((await save(NEW_PASSWORD, changed((s) => { s.clients[0].status = 'Paused'; }))).status, 403);
  assert.equal((await h.call('meetings', 'GET', NEW_PASSWORD)).status, 403);
  assert.equal((await h.stored()).state.clients[0].status, 'Active');
});

test('a user can make ordinary changes', async () => {
  await seed();
  const res = await save(USER, changed((s) => { s.clients[0].status = 'Paused'; }));
  assert.equal(res.status, 200);
  assert.equal((await h.stored()).state.clients[0].status, 'Paused');
});

test('a user cannot change the Team directory', async () => {
  await seed();
  const res = await save(USER, changed((s) => { s.team[0].role = 'Owner'; }));
  assert.equal(res.status, 403);
  assert.equal((await h.stored()).state.team[0].role, 'Designer');
});

test('a user cannot change the Customize settings', async () => {
  await seed();
  const res = await save(USER, changed((s) => { s.settings.clientStatuses.push('Archived'); }));
  assert.equal(res.status, 403);
  assert.deepEqual((await h.stored()).state.settings.clientStatuses, ['Active', 'Paused']);
});

test('only admins can change the daily meeting details; everyone keeps them when saving', async () => {
  await seed();
  const meeting = changed((s) => {
    s.settings.meetingLink = ['https://meet.google.com/abc-defg-hij'];
    s.settings.meetingTime = ['09:00', '10:00'];
    s.settings.meetingDaysOff = ['2026-10-20 Diwali'];
  });
  assert.equal((await save(USER, meeting)).status, 403);
  assert.equal((await h.stored()).state.settings.meetingLink, undefined);
  assert.equal((await save(ADMIN, meeting)).status, 200);
  let stored = (await h.stored()).state.settings;
  assert.deepEqual([stored.meetingLink, stored.meetingTime, stored.meetingDaysOff], [['https://meet.google.com/abc-defg-hij'], ['09:00', '10:00'], ['2026-10-20 Diwali']]);
  // A user's ordinary change afterwards leaves the meeting details as they are.
  const later = JSON.parse(JSON.stringify(meeting));
  later.clients[0].status = 'Paused';
  assert.equal((await h.call('data', 'POST', USER, { value: JSON.stringify(later), baseRev: 2 })).status, 200);
  stored = (await h.stored()).state.settings;
  assert.deepEqual([stored.meetingLink, stored.meetingTime, stored.meetingDaysOff], [['https://meet.google.com/abc-defg-hij'], ['09:00', '10:00'], ['2026-10-20 Diwali']]);
});

test('a user cannot remove many of their own records in one save, nor anyone else\'s at all; an admin can', async () => {
  // Here the user (Asha, t1) works on all five clients.
  const theirs = changed((s) => { s.clients.forEach((c) => { c.team = ['t1']; }); });
  await seed(theirs);
  const fewer = JSON.parse(JSON.stringify(theirs)); fewer.clients = fewer.clients.slice(0, 1);
  assert.equal((await save(USER, fewer)).status, 409);
  assert.equal((await h.stored()).state.clients.length, 5);
  // Clients that aren't theirs stay, whatever a save leaves out.
  await seed();
  assert.equal((await save(USER, changed((s) => { s.clients = s.clients.slice(0, 1); }))).status, 200);
  assert.equal((await h.stored()).state.clients.length, 5);
  await seed(theirs);
  assert.equal((await save(ADMIN, fewer)).status, 200);
  assert.equal((await h.stored()).state.clients.length, 1);
});

test('a user gets only their own work; an admin gets everything', async () => {
  const state = sampleData();
  state.team.push({ id: 't2', name: 'Ravi', email: 'ravi@velvo.in' });
  state.issues.push({ id: 'i1', title: 'Theirs', clientId: 'c2', assigneeId: 't1', status: 'Open' }, { id: 'i2', title: 'Ravi’s', clientId: 'c3', assigneeId: 't2', status: 'Open' });
  state.leads.push({ id: 'l1', name: 'Theirs', assignedTo: 't1' }, { id: 'l2', name: 'Ravi’s', assignedTo: 't2' });
  state.updates.push({ id: 'u2', clientId: 'c4', authorEmail: 'ravi@velvo.in', text: 'Ravi’s update', date: '2026-09-02', timestamp: 1788307200000 });
  await seed(state);
  const mine = JSON.parse((await h.call('data', 'GET', USER)).json.value);
  assert.deepEqual(mine.clients.map((c) => c.id), ['c1', 'c2'], 'their client, and the client of their issue');
  assert.deepEqual(mine.issues.map((i) => i.id), ['i1']);
  assert.deepEqual(mine.leads.map((l) => l.id), ['l1']);
  assert.deepEqual(mine.updates.map((u) => u.id), ['u1']);
  assert.equal(mine.team.length, 2, 'everyone sees the team list');
  const all = JSON.parse((await h.call('data', 'GET', ADMIN)).json.value);
  assert.deepEqual([all.clients.length, all.issues.length, all.leads.length, all.updates.length], [5, 2, 2, 2]);
});

test('a user\'s save changes only their own work; someone else\'s can\'t be changed', async () => {
  await seed();
  const mine = JSON.parse((await h.call('data', 'GET', USER)).json.value);
  mine.clients[0].status = 'Paused';
  mine.leads.push({ id: 'l-new', name: 'New lead', assignedTo: null });
  assert.equal((await save(USER, mine)).status, 200);
  const stored = (await h.stored()).state;
  assert.equal(stored.clients.length, 5, 'nobody else’s clients went missing');
  assert.deepEqual(stored.clients.map((c) => c.status), ['Paused', 'Active', 'Paused', 'Active', 'Active']);
  const lead = stored.leads.find((l) => l.id === 'l-new');
  assert.deepEqual([lead.assignedTo, lead.createdBy], ['t1', USER], 'a new lead without anyone is theirs');
  const sneaky = JSON.parse((await h.call('data', 'GET', USER)).json.value);
  sneaky.clients.push({ ...sampleData().clients[1], name: 'Hacked' });
  const refused = await h.call('data', 'POST', USER, { value: JSON.stringify(sneaky), baseRev: 2 });
  assert.equal(refused.status, 403);
  assert.equal((await h.stored()).state.clients[1].name, 'Bravo Media');
});

test('a user can edit their own daily update, but not someone else\'s', async () => {
  const state = sampleData();
  state.updates.push({ id: 'u2', clientId: 'c2', text: 'Shoot planned', authorEmail: 'other@velvo.in', date: '2026-09-02', timestamp: 1788307200000 });
  await seed(state);
  const own = JSON.parse(JSON.stringify(state)); own.updates[0].text = 'Kick-off call (moved)';
  assert.equal((await save(USER, own)).status, 200);
  await seed(state);
  const other = JSON.parse(JSON.stringify(state)); other.updates[1].text = 'Changed by someone else';
  assert.equal((await save(USER, other)).status, 403);
  assert.equal((await h.stored()).state.updates[1].text, 'Shoot planned');
});

test('only admins can read the audit log', async () => {
  assert.equal((await h.call('logs', 'GET', USER)).status, 403);
  assert.equal((await h.call('logs', 'GET', ADMIN)).status, 200);
});

test('only admins can see or manage logins', async () => {
  assert.equal((await h.call('accounts', 'GET', USER)).status, 403);
  const byUser = await h.call('accounts', 'POST', USER, { email: 'new.person@velvo.in', name: 'New Person', role: 'user', password: 'Mango-River-Kite-4821' });
  assert.equal(byUser.status, 403);
  assert.equal(await h.auth.getUserByEmail('new.person@velvo.in').catch(() => null), null, 'no login was made');
  assert.equal((await h.call('accounts', 'PATCH', USER, { email: ADMIN, role: 'user' })).status, 403);
  assert.equal((await h.call('accounts', 'GET', ADMIN)).status, 200);
});

test('the sign-in page is never told to use a login emulator on the live site', async () => {
  const before = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';
    const config = (await h.call('config', 'GET', null)).json;
    assert.equal(config.authEmulatorHost, undefined);
    assert.equal(config.testData, undefined);
  } finally {
    if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before;
  }
});
