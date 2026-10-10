// Tests for the daily meeting's "I can't attend" notes (src/app/api/meeting), against Firebase's emulators.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, sampleData } = require('./harness');

const ADMIN = 'boss@velvo.in';
const ASHA = 'mgr@velvo.in'; // on the team as Asha, with a User login
const RAVI = 'ravi@velvo.in'; // on the team, with a User login
const NEEL = 'neel@velvo.in'; // on the team but not in the daily meeting
const OUTSIDER = 'helper@velvo.in'; // a User login, not on the team
let h;

// Days in India time (the meeting's time zone), counted from today.
const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400000));
const indiaMinutes = () => { const [hh, mm] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return hh * 60 + mm; };
const weekday = (day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day + 'T00:00:00Z').getUTCDay()];
const TODAY = indiaDay(0);
const TOMORROW = indiaDay(1);
// A Friday at least a week ahead.
const FRIDAY = (() => { for (let i = 7; ; i++) if (weekday(indiaDay(i)) === 'Fri') return indiaDay(i); })();
const dayAfter = (day, n) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n)).toISOString().slice(0, 10);

const EVERY_DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function state({ days = EVERY_DAY, time = ['08:30', '09:30'], daysOff = [] } = {}) {
  const s = sampleData();
  s.team.push(
    { id: 't2', name: 'Ravi', role: 'Editor', email: RAVI },
    { id: 't3', name: 'Ivy', role: 'Intern', email: 'ivy@velvo.in', meetingGroup: 'Intern' },
    { id: 't4', name: 'Neel', role: 'Accounts', email: NEEL, meetingGroup: 'None' },
  );
  s.settings.meetingDays = days;
  s.settings.meetingTime = time;
  s.settings.meetingDaysOff = daysOff;
  return s;
}
async function seed(options) {
  await h.db.collection('appData').deleteMany({});
  await h.db.collection('appData').insertOne({ _id: 'velvo-ops-data', value: JSON.stringify(state(options)), rev: 1 });
  await h.db.collection('meetingAbsences').deleteMany({});
}
const inform = (email, body, headers) => h.call('meeting', 'POST', email, body, headers);
const notes = async () => (await h.db.collection('meetingAbsences').find({}).sort({ date: 1, memberId: 1 }).toArray());

test.before(async () => {
  h = await createHarness();
  h.setAccount(ADMIN, 'admin');
  h.setAccount(ASHA, 'user');
  h.setAccount(OUTSIDER, 'user');
  for (const email of [RAVI, NEEL, 'ivy@velvo.in']) h.setAccount(email, 'user');
});
test.after(async () => { await h.stop(); });

test('without signing in, or without access, nothing can be read or written', async () => {
  await seed();
  assert.equal((await h.call(`meeting?date=${TODAY}`, 'GET', null)).status, 401);
  assert.equal((await inform(null, { from: TOMORROW, reason: 'Sick' })).status, 401);
  for (const email of ['waiting@gmail.com', 'stranger@gmail.com']) {
    assert.equal((await h.call(`meeting?date=${TODAY}`, 'GET', email)).status, 403, email);
    assert.equal((await inform(email, { from: TOMORROW, reason: 'Sick' })).status, 403, email);
  }
  assert.equal((await notes()).length, 0);
});

test('a team member says they can\'t attend, with a reason; it is saved with who wrote it and when', async () => {
  await seed();
  const before = Date.now();
  const res = await inform(RAVI, { from: TOMORROW, reason: '  Sick  ' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.absences.map((a) => [a.memberId, a.date, a.reason, a.createdBy]), [['t2', TOMORROW, 'Sick', RAVI]]);
  const [note] = await notes();
  assert.equal(note._id, `t2|${TOMORROW}`);
  assert.ok(note.createdAt instanceof Date && note.createdAt.getTime() >= before - 1000);
  assert.equal(note.updatedAt, undefined);
  const mine = await h.call('meeting?mine=1', 'GET', RAVI);
  assert.deepEqual(mine.json.absences.map((a) => a.date), [TOMORROW]);
  const log = await h.db.collection('logs').find({ action: 'MEETING_ABSENCE' }).sort({ timestamp: -1 }).limit(1).next();
  assert.match(log.details, /^Ravi can't attend the daily meeting on .+: Sick$/);
});

test('writing again for the same day changes the reason; it stays one note', async () => {
  await seed();
  await inform(RAVI, { from: TOMORROW, reason: 'Sick' });
  const first = (await notes())[0];
  assert.equal((await inform(RAVI, { from: TOMORROW, reason: 'Doctor appointment' })).status, 200);
  const all = await notes();
  assert.equal(all.length, 1);
  assert.equal(all[0].reason, 'Doctor appointment');
  assert.equal(all[0].createdAt.getTime(), first.createdAt.getTime());
  assert.ok(all[0].updatedAt instanceof Date);
});

test('a proper reason is needed', async () => {
  await seed();
  for (const reason of ['', '  ', 'ok', 'x'.repeat(201), 42]) {
    const res = await inform(RAVI, { from: TOMORROW, reason });
    assert.equal(res.status, 400, JSON.stringify(reason));
  }
  assert.equal((await notes()).length, 0);
});

test('a team member can only write their own note; an admin can write anyone\'s', async () => {
  await seed();
  const other = await inform(RAVI, { from: TOMORROW, reason: 'Covering for Asha', memberId: 't1' });
  assert.equal(other.status, 403);
  const byAdmin = await inform(ADMIN, { from: TOMORROW, reason: 'Called in sick', memberId: 't1' });
  assert.equal(byAdmin.status, 200);
  const [note] = await notes();
  assert.deepEqual([note.memberId, note.createdBy], ['t1', ADMIN]);
});

test('someone not on the meeting list, or not on the team, can\'t write a note', async () => {
  await seed();
  assert.equal((await inform(NEEL, { from: TOMORROW, reason: 'Busy' })).status, 400);
  assert.equal((await inform(ADMIN, { from: TOMORROW, reason: 'Busy', memberId: 't4' })).status, 400);
  assert.equal((await inform(ADMIN, { from: TOMORROW, reason: 'Busy', memberId: 'nobody' })).status, 400);
  const outsider = await inform(OUTSIDER, { from: TOMORROW, reason: 'Busy' });
  assert.equal(outsider.status, 403);
  assert.match(outsider.json.error, /isn't on the Team page/);
  assert.deepEqual((await h.call('meeting?mine=1', 'GET', OUTSIDER)).json.absences, []);
  // An email Firebase hasn't confirmed doesn't count as that team member.
  assert.equal((await inform(ASHA, { from: TOMORROW, reason: 'Sick' }, { 'x-test-unverified': 'true' })).status, 403);
  assert.equal((await notes()).length, 0);
});

test('only meeting days get a note: not days without a meeting, and not days off', async () => {
  const monday = dayAfter(FRIDAY, 3);
  const tuesday = dayAfter(FRIDAY, 4);
  await seed({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], daysOff: [`${monday} Holiday`] });
  assert.equal((await inform(RAVI, { from: dayAfter(FRIDAY, 1), reason: 'Away' })).status, 400); // a Saturday
  assert.equal((await inform(RAVI, { from: monday, reason: 'Away' })).status, 400); // the day off
  // Friday to Tuesday: Friday and Tuesday get a note; the weekend has no meeting and Monday is a day off.
  const res = await inform(RAVI, { from: FRIDAY, to: tuesday, reason: 'On leave' });
  assert.equal(res.status, 200);
  assert.deepEqual((await notes()).map((n) => n.date), [FRIDAY, tuesday]);
  const log = await h.db.collection('logs').find({ action: 'MEETING_ABSENCE' }).sort({ timestamp: -1 }).limit(1).next();
  assert.match(log.details, /^Ravi can't attend 2 daily meetings, .+ to .+: On leave$/);
});

test('a stretch of days must make sense: not backwards, not longer than a month', async () => {
  await seed();
  assert.equal((await inform(RAVI, { from: FRIDAY, to: dayAfter(FRIDAY, -1), reason: 'Leave' })).status, 400);
  assert.equal((await inform(RAVI, { from: FRIDAY, to: dayAfter(FRIDAY, 31), reason: 'Leave' })).status, 400);
  assert.equal((await inform(RAVI, { from: 'soon', reason: 'Leave' })).status, 400);
  assert.equal((await notes()).length, 0);
  assert.equal((await inform(RAVI, { from: FRIDAY, to: dayAfter(FRIDAY, 30), reason: 'Long leave' })).status, 200);
  assert.equal((await notes()).length, 31);
});

test('a team member can tell us until the meeting ends; after that only an admin can write a note for that day', async () => {
  const minutes = indiaMinutes();
  if (minutes >= 2) {
    await seed({ time: ['00:00', '00:01'] }); // today's meeting has ended
    const late = await inform(RAVI, { from: TODAY, reason: 'Sick' });
    assert.equal(late.status, 400);
    assert.match(late.json.error, /has ended/);
    assert.equal((await inform(ADMIN, { from: TODAY, reason: 'Told me by phone', memberId: 't2' })).status, 200);
  }
  if (minutes < 23 * 60 + 57) {
    await seed({ time: ['23:58', '23:59'] }); // today's meeting hasn't started yet
    assert.equal((await inform(RAVI, { from: TODAY, reason: 'Sick' })).status, 200);
  }
  await seed();
  const past = await inform(RAVI, { from: indiaDay(-1), reason: 'Sick' });
  assert.equal(past.status, 400);
  assert.match(past.json.error, /passed/);
  assert.equal((await inform(ADMIN, { from: indiaDay(-1), reason: 'Was sick', memberId: 't2' })).status, 200);
});

test('everyone sees today\'s notes; other days\' notes only admins (and each person their own)', async () => {
  await seed({ time: ['23:58', '23:59'] });
  const today = indiaMinutes() < 23 * 60 + 57;
  if (today) assert.equal((await inform(ASHA, { from: TODAY, reason: 'Client visit' })).status, 200);
  assert.equal((await inform(ASHA, { from: TOMORROW, reason: 'On leave' })).status, 200);
  assert.equal((await inform(RAVI, { from: TOMORROW, reason: 'Sick' })).status, 200);
  const names = (res) => res.json.absences.map((a) => a.memberId).sort().join();
  if (today) assert.equal(names(await h.call(`meeting?date=${TODAY}`, 'GET', RAVI)), 't1');
  assert.equal(names(await h.call(`meeting?date=${TOMORROW}`, 'GET', RAVI)), 't2');
  assert.equal(names(await h.call(`meeting?date=${TOMORROW}`, 'GET', OUTSIDER)), '');
  assert.equal(names(await h.call(`meeting?date=${TOMORROW}`, 'GET', ADMIN)), 't1,t2');
  // The monthly list is for admins only.
  const month = TOMORROW.slice(0, 7);
  assert.equal((await h.call(`meeting?month=${month}`, 'GET', RAVI)).status, 403);
  const monthly = await h.call(`meeting?month=${month}`, 'GET', ADMIN);
  assert.equal(monthly.status, 200);
  assert.ok(monthly.json.absences.some((a) => a.memberId === 't2' && a.date === TOMORROW && a.reason === 'Sick'));
  assert.equal((await h.call('meeting?month=October', 'GET', ADMIN)).status, 400);
  assert.equal((await h.call('meeting?date=tomorrow', 'GET', ADMIN)).status, 400);
});

test('a note can be taken back by its person (until the meeting ends) or by an admin', async () => {
  await seed();
  await inform(RAVI, { from: TOMORROW, reason: 'Sick' });
  await inform(ASHA, { from: TOMORROW, reason: 'On leave' });
  assert.equal((await h.call(`meeting?date=${TOMORROW}&memberId=t1`, 'DELETE', RAVI)).status, 403);
  assert.equal((await h.call(`meeting?date=${TOMORROW}`, 'DELETE', RAVI)).status, 200);
  assert.equal((await h.call(`meeting?date=${TOMORROW}`, 'DELETE', RAVI)).status, 404);
  assert.equal((await h.call(`meeting?date=${TOMORROW}&memberId=t1`, 'DELETE', ADMIN)).status, 200);
  assert.equal((await notes()).length, 0);
  const log = await h.db.collection('logs').find({ action: 'MEETING_ABSENCE_WITHDRAWN' }).sort({ timestamp: -1 }).limit(1).next();
  assert.match(log.details, /^Asha can attend the daily meeting on .+ after all/);
  if (indiaMinutes() >= 2) {
    await seed({ time: ['00:00', '00:01'] });
    await inform(ADMIN, { from: TODAY, reason: 'Sick', memberId: 't2' });
    const late = await h.call(`meeting?date=${TODAY}`, 'DELETE', RAVI);
    assert.equal(late.status, 400);
    assert.equal((await h.call(`meeting?date=${TODAY}&memberId=t2`, 'DELETE', ADMIN)).status, 200);
  }
});
