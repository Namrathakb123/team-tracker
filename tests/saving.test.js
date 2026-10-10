// Tests for loading and saving the shared data (src/app/api/data/route.ts), against a throwaway database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, sampleData } = require('./harness');

const ADMIN = 'boss@velvo.in';
const MANAGER = 'mgr@velvo.in';
let h;

test.before(async () => {
  h = await createHarness();
  h.setAccount(ADMIN, 'admin', { name: 'Boss' });
  h.setAccount(MANAGER, 'user', { name: 'Manager' });
});
test.after(async () => { await h.stop(); });

// Starts a test from known data at a known version.
async function seed(state = sampleData(), rev = 1) {
  await h.db.collection('appData').deleteMany({});
  await h.db.collection('logs').deleteMany({});
  await h.db.collection('appData').insertOne({ _id: 'velvo-ops-data', value: JSON.stringify(state), rev });
}
const save = (email, state, baseRev, extra = {}) => h.call('data', 'POST', email, { value: typeof state === 'string' ? state : JSON.stringify(state), baseRev, ...extra });
const renamed = (name) => { const s = sampleData(); s.clients[0].name = name; return s; };

test('the first save creates the data, and loading returns it with its version', async () => {
  await h.db.collection('appData').deleteMany({});
  const first = await save(ADMIN, sampleData(), 0);
  assert.equal(first.status, 200);
  assert.equal(first.json.rev, 1);
  const loaded = await h.call('data', 'GET', ADMIN);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.json.rev, 1);
  assert.deepEqual(JSON.parse(loaded.json.value), sampleData());
  // A user gets the same version, with their own part of the work (Asha works on the first client).
  const theirs = await h.call('data', 'GET', MANAGER);
  assert.equal(theirs.json.rev, 1);
  assert.deepEqual(JSON.parse(theirs.json.value).clients.map((c) => c.id), ['c1']);
});

test('each save moves the version on by one', async () => {
  await seed(sampleData(), 4);
  const res = await save(ADMIN, renamed('Alpha Foods Ltd'), 4);
  assert.equal(res.status, 200);
  assert.equal(res.json.rev, 5);
  assert.equal((await h.stored()).state.clients[0].name, 'Alpha Foods Ltd');
});

test('a save based on an older version is refused, and nothing changes', async () => {
  await seed(sampleData(), 3);
  const res = await save(ADMIN, renamed('Changed'), 2);
  assert.equal(res.status, 409);
  assert.equal(res.json.conflict, true);
  const now = await h.stored();
  assert.equal(now.rev, 3);
  assert.equal(now.state.clients[0].name, 'Alpha Foods');
});

test('two people saving from the same version: the first wins, the second is refused', async () => {
  await seed(sampleData(), 1);
  const first = await save(ADMIN, renamed('First change'), 1);
  const second = await save(MANAGER, renamed('Second change'), 1);
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.equal((await h.stored()).state.clients[0].name, 'First change');
});

test('a save that leaves out a whole section is refused, even from an admin', async () => {
  await seed();
  const state = sampleData();
  delete state.clients; // what a page that failed to load would send
  const res = await save(ADMIN, state, 1);
  assert.equal(res.status, 409);
  assert.equal((await h.stored()).state.clients.length, 5);
});

test('malformed saves are refused', async () => {
  await seed();
  const cases = [
    ['not JSON', '{"clients": ['],
    ['an unknown section', { ...sampleData(), extra: [] }],
    ['a list that is not a list', { ...sampleData(), clients: {} }],
    ['a record without an id', { ...sampleData(), clients: [{ name: 'No id' }] }],
    ['the same id twice', { ...sampleData(), clients: [{ id: 'x' }, { id: 'x' }] }],
    ['a setting that is not a list of text', { ...sampleData(), settings: { priorities: 'High' } }],
  ];
  for (const [label, state] of cases) {
    const res = await save(ADMIN, state, 1);
    assert.equal(res.status, 400, label);
  }
  const noVersion = await h.call('data', 'POST', ADMIN, { value: JSON.stringify(sampleData()) });
  assert.equal(noVersion.status, 400, 'a save without a version');
  assert.equal((await h.stored()).rev, 1);
});

test('a save over 1 MB is refused, one just under it is stored', async () => {
  await seed();
  // Firestore keeps at most 1 MiB in one record, so bigger saves are refused with a clear message.
  const big = sampleData();
  big.clients[0].notes = 'x'.repeat(1_000_001);
  assert.equal((await save(ADMIN, big, 1)).status, 413);
  // Sizes count bytes, not letters: "₹" takes 3 bytes, so 340,000 of them are over the limit too.
  const rupees = sampleData();
  rupees.clients[0].notes = '₹'.repeat(340_000);
  assert.equal((await save(ADMIN, rupees, 1)).status, 413);
  assert.equal((await h.stored()).rev, 1);
  // Just under the limit is fine, and is really stored.
  const nearly = sampleData();
  nearly.clients[0].notes = 'x'.repeat(950_000);
  assert.equal((await save(ADMIN, nearly, 1)).status, 200);
  const stored = await h.stored();
  assert.equal(stored.rev, 2);
  assert.equal(stored.state.clients[0].notes.length, 950_000);
});

test('every save is written to the audit log, with what changed', async () => {
  await seed();
  const res = await save(ADMIN, renamed('Alpha Foods Ltd'), 1, { action: 'CLIENT_UPDATE', details: 'Renamed a client' });
  assert.equal(res.status, 200);
  const logs = await h.db.collection('logs').find({}).toArray();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'CLIENT_UPDATE');
  assert.equal(logs[0].userName, 'Boss');
  assert.ok(logs[0].changes.some((c) => c.before === 'Alpha Foods' && c.after === 'Alpha Foods Ltd'), JSON.stringify(logs[0].changes));
});
