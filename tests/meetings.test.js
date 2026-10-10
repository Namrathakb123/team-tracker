// Tests for the meetings on the Meetings page (src/app/api/meetings), against Firebase's emulators:
// only admins add, change or remove meetings, and everyone else only gets the meetings they are in.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, sampleData } = require('./harness');

const ADMIN = 'boss@velvo.in'; // an admin, not on the team
const ASHA = 'mgr@velvo.in'; // on the team as Asha (Team), with a User login
const IVY = 'ivy@velvo.in'; // on the team as an intern, with a User login
const IRA = 'ira@velvo.in'; // another intern, with a User login
const OUTSIDER = 'helper@velvo.in'; // a User login, not on the team
let h;

const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400000));
const TOMORROW = indiaDay(1);

async function seed() {
  const s = sampleData();
  s.team.push(
    { id: 'i1', name: 'Ivy', role: 'Video intern', email: IVY, meetingGroup: 'Intern' },
    { id: 'i2', name: 'Ira', role: 'Design intern', email: IRA, meetingGroup: 'Intern' },
  );
  await h.db.collection('appData').deleteMany({});
  await h.db.collection('appData').insertOne({ _id: 'velvo-ops-data', value: JSON.stringify(s), rev: 1 });
  await h.db.collection('meetings').deleteMany({});
}
const add = (email, meeting) => h.call('meetings', 'POST', email, meeting);
const list = async (email) => (await h.call('meetings', 'GET', email)).json.meetings.map((m) => m.title).sort();
const oneOnOne = { title: '1:1 with Ivy', type: 'One-on-one', repeat: 'weekly', date: TOMORROW, days: ['Mon'], start: '18:00', end: '18:30', people: ['i1'] };
const interns = { title: "Interns' daily update", type: 'Interns', repeat: 'weekdays', date: TOMORROW, start: '19:00', end: '19:30', groups: ['Intern'] };
const client = { title: 'Review with Alpha Foods', type: 'Client', repeat: 'none', date: TOMORROW, start: '11:00', end: '11:45', clientId: 'c1', contactName: 'Ramesh', contactPhone: '+91 98765 43210', people: ['t1'] };

test.before(async () => {
  h = await createHarness();
  h.setAccount(ADMIN, 'admin');
  h.setAccount(ASHA, 'user');
  h.setAccount(OUTSIDER, 'user');
  h.setAccount(IVY, 'user');
  h.setAccount(IRA, 'user');
});
test.after(async () => { await h.stop(); });

test('without signing in, or without access, nothing can be read or added', async () => {
  await seed();
  assert.equal((await h.call('meetings', 'GET', null)).status, 401);
  assert.equal((await add(null, oneOnOne)).status, 401);
  for (const email of ['waiting@gmail.com', 'stranger@gmail.com']) {
    assert.equal((await h.call('meetings', 'GET', email)).status, 403, email);
    assert.equal((await add(email, oneOnOne)).status, 403, email);
  }
});

test('an admin adds a meeting; it is saved tidied, with who added it, and logged', async () => {
  await seed();
  const res = await add(ADMIN, { ...client, title: '  Review with Alpha Foods ', contactName: ' Ramesh ' });
  assert.equal(res.status, 200);
  const m = res.json.meeting;
  assert.ok(m.id && m.id !== 'daily');
  assert.equal(m.title, 'Review with Alpha Foods');
  assert.equal(m.contactName, 'Ramesh');
  assert.equal(m.host, ADMIN);
  const stored = await h.db.collection('meetings').findOne({ _id: m.id });
  assert.equal(stored.createdBy, ADMIN);
  assert.ok(stored.createdAt instanceof Date);
  const log = await h.db.collection('logs').find({ action: 'MEETING_CREATE' }).sort({ timestamp: -1 }).limit(1).next();
  assert.match(log.details, /^Added the meeting “Review with Alpha Foods” \(.+, 11:00–11:45 am\)$/);
});

test('only admins add, change or remove meetings', async () => {
  await seed();
  for (const email of [ASHA, IVY, OUTSIDER]) assert.equal((await add(email, oneOnOne)).status, 403, email);
  const id = (await add(ADMIN, oneOnOne)).json.meeting.id;
  assert.equal((await h.call(`meetings?id=${id}`, 'PUT', ASHA, { ...oneOnOne, title: 'Hacked' })).status, 403);
  assert.equal((await h.call(`meetings?id=${id}`, 'DELETE', IVY)).status, 403);
  assert.equal((await h.db.collection('meetings').findOne({ _id: id })).title, '1:1 with Ivy');
});

test('each person only gets the meetings they are in; admins get all', async () => {
  await seed();
  for (const m of [oneOnOne, interns, client]) assert.equal((await add(ADMIN, m)).status, 200, m.title);
  assert.deepEqual(await list(ADMIN), ["1:1 with Ivy", "Interns' daily update", 'Review with Alpha Foods']);
  assert.deepEqual(await list(IVY), ["1:1 with Ivy", "Interns' daily update"]);
  assert.deepEqual(await list(IRA), ["Interns' daily update"]); // not Ivy's one-on-one
  assert.deepEqual(await list(ASHA), ['Review with Alpha Foods']);
  assert.deepEqual(await list(OUTSIDER), []);
  // An email Firebase hasn't confirmed doesn't count as that team member.
  assert.deepEqual((await h.call('meetings', 'GET', ASHA, undefined, { 'x-test-unverified': 'true' })).json.meetings, []);
});

test('what an admin types is checked on the server too', async () => {
  await seed();
  const bad = [
    { ...oneOnOne, title: '' },
    { ...oneOnOne, type: 'Party' },
    { ...oneOnOne, repeat: 'monthly' },
    { ...oneOnOne, days: [] },
    { ...oneOnOne, start: '18:30', end: '18:00' },
    { ...oneOnOne, link: 'javascript:alert(1)' },
    { ...oneOnOne, people: ['nobody'] },
    { ...client, clientId: '' },
    { ...client, clientId: 'nope' },
    { ...client, contactPhone: 'call me' },
    { ...oneOnOne, people: [], groups: [] },
    { ...oneOnOne, repeat: 'none', date: indiaDay(-1) },
    { ...oneOnOne, agenda: 'x'.repeat(2001) },
    null,
  ];
  for (const m of bad) assert.equal((await add(ADMIN, m)).status, 400, JSON.stringify(m)?.slice(0, 80));
  assert.equal(await h.db.collection('meetings').countDocuments(), 0);
});

test('changing a meeting replaces it, keeping who added it; removing it takes it away', async () => {
  await seed();
  const created = (await add(ADMIN, { ...oneOnOne, agenda: 'Goals', link: 'https://meet.google.com/abc-defg-hij' })).json.meeting;
  const changed = await h.call(`meetings?id=${created.id}`, 'PUT', ADMIN, { ...oneOnOne, title: '1:1 with Ivy (weekly)', start: '18:15', end: '18:45' });
  assert.equal(changed.status, 200);
  const stored = await h.db.collection('meetings').findOne({ _id: created.id });
  assert.equal(stored.title, '1:1 with Ivy (weekly)');
  assert.equal(stored.start, '18:15');
  assert.equal(stored.agenda, undefined); // left empty this time, so removed
  assert.equal(stored.link, undefined);
  assert.equal(stored.host, ADMIN);
  assert.ok(stored.updatedAt instanceof Date);
  assert.equal((await h.call('meetings?id=nope', 'PUT', ADMIN, oneOnOne)).status, 404);
  assert.equal((await h.call(`meetings?id=${created.id}`, 'PUT', ADMIN, { ...oneOnOne, title: '' })).status, 400);
  assert.equal((await h.call(`meetings?id=${created.id}`, 'DELETE', ADMIN)).status, 200);
  assert.equal((await h.call(`meetings?id=${created.id}`, 'DELETE', ADMIN)).status, 404);
  assert.equal(await h.db.collection('meetings').countDocuments(), 0);
  const actions = (await h.db.collection('logs').find({ action: /^MEETING_(EDIT|DELETE)$/ }).toArray()).map((l) => l.action);
  assert.ok(actions.includes('MEETING_EDIT') && actions.includes('MEETING_DELETE'));
});

test('a one-time meeting already on a past day can still be changed', async () => {
  await seed();
  const created = (await add(ADMIN, { ...client })).json.meeting;
  const yesterday = indiaDay(-1);
  await h.db.collection('meetings').updateOne({ _id: created.id }, { $set: { date: yesterday } });
  const res = await h.call(`meetings?id=${created.id}`, 'PUT', ADMIN, { ...client, date: yesterday, agenda: 'What we agreed' });
  assert.equal(res.status, 200);
  assert.equal((await h.db.collection('meetings').findOne({ _id: created.id })).agenda, 'What we agreed');
});

// ---- "I can't attend" for any meeting, and skipping a date (Meetings step 2) ----
const indiaMinutes = () => { const [hh, mm] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return hh * 60 + mm; };
const weekdayOf = (day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day + 'T00:00:00Z').getUTCDay()];
const EVERY_DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TODAY = indiaDay(0);
// A one-on-one with Ivy and an interns' meeting, both every day late in the evening, so any day works.
const ivy11 = { ...oneOnOne, date: TODAY, days: EVERY_DAY, start: '23:58', end: '23:59' };
const internsDaily = { ...interns, repeat: 'weekly', days: EVERY_DAY, date: TODAY, start: '23:58', end: '23:59' };
const note = (email, body) => h.call('meeting', 'POST', email, body);
const notesFor = async (email, date, meetingId) => {
  const res = await h.call(`meeting?date=${date}${meetingId ? `&meetingId=${meetingId}` : ''}`, 'GET', email);
  return res.status === 200 ? res.json.absences.map((a) => `${a.memberId}:${a.reason}`).sort() : res.status;
};
async function seedMeetings() {
  await seed();
  await h.db.collection('meetingAbsences').deleteMany({});
  const one = (await add(ADMIN, ivy11)).json.meeting;
  const group = (await add(ADMIN, internsDaily)).json.meeting;
  return { one, group };
}

test("someone in a meeting can say they can't attend it; people not in it can't", async () => {
  const { one } = await seedMeetings();
  const res = await note(IVY, { meetingId: one.id, from: TOMORROW, reason: 'Exam' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.absences.map((a) => [a.meetingId, a.memberId, a.date]), [[one.id, 'i1', TOMORROW]]);
  const stored = await h.db.collection('meetingAbsences').findOne({ _id: `${one.id}|i1|${TOMORROW}` });
  assert.equal(stored.meetingId, one.id);
  // Ira and Asha aren't in Ivy's one-on-one: for them it doesn't exist.
  assert.equal((await note(IRA, { meetingId: one.id, from: TOMORROW, reason: 'Exam' })).status, 404);
  assert.equal((await note(ASHA, { meetingId: one.id, from: TOMORROW, reason: 'Busy' })).status, 404);
  // An admin can write a note for someone in it, but not for someone who isn't.
  assert.equal((await note(ADMIN, { meetingId: one.id, from: indiaDay(2), reason: 'Called in sick', memberId: 'i1' })).status, 200);
  const notIn = await note(ADMIN, { meetingId: one.id, from: TOMORROW, reason: 'Busy', memberId: 'i2' });
  assert.equal(notIn.status, 400);
  assert.match(notIn.json.error, /isn't in this meeting/);
  assert.equal((await note(ADMIN, { meetingId: 'nope', from: TOMORROW, reason: 'Busy', memberId: 'i1' })).status, 404);
  const log = await h.db.collection('logs').find({ action: 'MEETING_ABSENCE' }).sort({ timestamp: -1 }).limit(1).next();
  assert.match(log.details, /^Ivy can't attend “1:1 with Ivy” on .+: Called in sick$/);
});

test('a note is only for days the meeting is on, and only until it ends that day', async () => {
  await seed();
  await h.db.collection('meetingAbsences').deleteMany({});
  // On Mondays only: the Tuesday after has no meeting.
  const monday = (() => { for (let i = 1; ; i++) if (weekdayOf(indiaDay(i)) === 'Mon') return indiaDay(i); })();
  const tuesday = new Date(Date.parse(monday + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const weekly = (await add(ADMIN, { ...oneOnOne, date: TODAY, days: ['Mon'] })).json.meeting;
  const wrongDay = await note(IVY, { meetingId: weekly.id, from: tuesday, reason: 'Exam' });
  assert.equal(wrongDay.status, 400);
  assert.match(wrongDay.json.error, /no meeting/);
  assert.equal((await note(IVY, { meetingId: weekly.id, from: monday, reason: 'Exam' })).status, 200);
  // A meeting that has already ended today: closed for Ivy, still open to an admin.
  if (indiaMinutes() >= 2) {
    const ended = (await add(ADMIN, { ...ivy11, start: '00:00', end: '00:01' })).json.meeting;
    const late = await note(IVY, { meetingId: ended.id, from: TODAY, reason: 'Sick' });
    assert.equal(late.status, 400);
    assert.match(late.json.error, /has ended/);
    assert.equal((await note(ADMIN, { meetingId: ended.id, from: TODAY, reason: 'Was sick', memberId: 'i1' })).status, 200);
    assert.equal((await h.call(`meeting?date=${TODAY}&meetingId=${ended.id}`, 'DELETE', IVY)).status, 400);
  }
});

test("everyone in a meeting sees today's notes for it; other days only their own; the daily meeting's notes stay apart", async () => {
  const { one, group } = await seedMeetings();
  if (indiaMinutes() < 23 * 60 + 57) {
    assert.equal((await note(IVY, { meetingId: group.id, from: TODAY, reason: 'Doctor' })).status, 200);
    assert.deepEqual(await notesFor(IRA, TODAY, group.id), ['i1:Doctor']);
    assert.deepEqual(await notesFor(IRA, TODAY), []); // not a note for the daily meeting
  }
  assert.equal((await note(IVY, { meetingId: group.id, from: TOMORROW, reason: 'Travel' })).status, 200);
  assert.deepEqual(await notesFor(IRA, TOMORROW, group.id), []); // another day: only her own
  assert.deepEqual(await notesFor(IVY, TOMORROW, group.id), ['i1:Travel']);
  assert.deepEqual(await notesFor(ADMIN, TOMORROW, group.id), ['i1:Travel']);
  assert.equal(await notesFor(IRA, TOMORROW, one.id), 404); // Ivy's one-on-one: not hers to see
  // Ivy's own notes, for every meeting, say which meeting each is for.
  const mine = (await h.call('meeting?mine=1', 'GET', IVY)).json.absences;
  assert.ok(mine.length > 0 && mine.every((a) => a.meetingId === group.id));
  const monthly = (await h.call(`meeting?month=${TOMORROW.slice(0, 7)}`, 'GET', ADMIN)).json.absences;
  assert.ok(monthly.some((a) => a.meetingId === group.id && a.reason === 'Travel'));
  // Taking a note back: only her own.
  assert.equal((await h.call(`meeting?date=${TOMORROW}&meetingId=${group.id}&memberId=i1`, 'DELETE', IRA)).status, 403);
  assert.equal((await h.call(`meeting?date=${TOMORROW}&meetingId=${group.id}`, 'DELETE', IVY)).status, 200);
  assert.deepEqual(await notesFor(IVY, TOMORROW, group.id), []);
});

test('an admin can skip one date of a repeating meeting, and put it back', async () => {
  const { one } = await seedMeetings();
  const skip = (email, body) => h.call(`meetings?id=${one.id}`, 'PATCH', email, body);
  assert.equal((await skip(IVY, { skip: { date: TOMORROW, note: 'Holiday' } })).status, 403);
  assert.equal((await skip(ADMIN, { skip: { date: TOMORROW, note: '' } })).status, 400); // a reason is needed
  assert.equal((await skip(ADMIN, { skip: { date: indiaDay(-1), note: 'Holiday' } })).status, 400); // passed
  const res = await skip(ADMIN, { skip: { date: TOMORROW, note: 'Holiday' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.meeting.skip, [{ date: TOMORROW, note: 'Holiday' }]);
  assert.equal((await skip(ADMIN, { skip: { date: TOMORROW, note: 'Again' } })).status, 400); // already skipped
  // That day has no meeting now, so no note can be written for it.
  assert.equal((await note(IVY, { meetingId: one.id, from: TOMORROW, reason: 'Exam' })).status, 400);
  // Changing the meeting keeps its skipped dates.
  assert.equal((await h.call(`meetings?id=${one.id}`, 'PUT', ADMIN, { ...ivy11, title: '1:1 with Ivy (daily)' })).status, 200);
  assert.deepEqual((await h.db.collection('meetings').findOne({ _id: one.id })).skip, [{ date: TOMORROW, note: 'Holiday' }]);
  const back = await skip(ADMIN, { unskip: TOMORROW });
  assert.equal(back.status, 200);
  assert.deepEqual(back.json.meeting.skip, []);
  assert.equal((await skip(ADMIN, { unskip: TOMORROW })).status, 404);
  assert.equal((await note(IVY, { meetingId: one.id, from: TOMORROW, reason: 'Exam' })).status, 200);
  const details = (await h.db.collection('logs').find({ action: /^MEETING_(UN)?SKIP$/ }).toArray()).map((l) => l.details);
  assert.ok(details.some((d) => /^No “1:1 with Ivy” on .+ \(Holiday\)$/.test(d)) && details.some((d) => /is on again on/.test(d)), details.join(' | '));
  // A one-time meeting can't skip a date (it can be removed instead).
  const once = (await add(ADMIN, client)).json.meeting;
  assert.equal((await h.call(`meetings?id=${once.id}`, 'PATCH', ADMIN, { skip: { date: TOMORROW, note: 'Holiday' } })).status, 400);
});
