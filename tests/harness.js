// Test helper: loads the app's real API routes (TypeScript) into Node, backed by Firebase's emulators on this
// computer ("npm test" starts them: the database and the logins). It never reads .env.local and never connects to a
// real project. Each test file gets its own empty emulator project.
// Signing in: a request says who is signed in with an "x-test-email" header. Their access comes from
// setAccount(email, role) or, if they have one, from their real login in the emulator (as made by /api/accounts).
// useRealSignIn(true) switches to the app's real token check, for tests that sign in with a real emulator token.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const vm = require('vm');
const ts = require('typescript');
const { createTestDb, clearEmulatorProject } = require('./firestore-db');

const ROOT = path.join(__dirname, '..');
const projectRequire = Module.createRequire(path.join(ROOT, 'package.json'));

// Settings the server reads. Real values are never used in tests.
const SETTINGS = ['MONGODB_URI', 'OWNER_EMAILS', 'REQUIRE_APPROVAL', 'SKIP_SIGN_IN', 'LOCAL_TEST_DATA', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_API_KEY'];

// One emulator project per test file ("demo-" projects exist only in the emulators). Signing in with a password
// always goes to the emulators' own project (DEFAULT_PROJECT, see scripts/test.js), so a test file that does that
// uses it instead: createHarness({ projectId: DEFAULT_PROJECT }).
const DEFAULT_PROJECT = 'demo-tests';

async function createHarness({ projectId } = {}) {
  const PROJECT_ID = projectId || `demo-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!firestoreHost || !authHost) throw new Error('Run the tests with "npm test": it starts the Firebase emulators they use.');
  for (const name of SETTINGS) delete process.env[name];
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  await clearEmulatorProject(firestoreHost, PROJECT_ID);
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });

  // Loads a TypeScript file from src (and the files it imports) as plain Node code.
  const cache = new Map();
  function loadTs(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
    }).outputText;
    const m = new Module(file);
    m.filename = file;
    m.paths = Module._nodeModulePaths(path.dirname(file));
    cache.set(file, m);
    const localRequire = (request) => {
      if (request.startsWith('.')) {
        const base = path.resolve(path.dirname(file), request);
        for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
          if (fs.existsSync(candidate)) return loadTs(candidate);
        }
      }
      return projectRequire(request);
    };
    vm.runInThisContext(Module.wrap(js), { filename: file })
      .call(m.exports, m.exports, localRequire, m, file, path.dirname(file));
    return m.exports;
  }

  const firebase = loadTs(path.join(ROOT, 'src/app/api/firebase.ts'));
  const utils = loadTs(path.join(ROOT, 'src/app/api/utils.ts'));
  const { getAuth } = projectRequire('firebase-admin/auth');
  const auth = getAuth(firebase.firebaseApp());

  // Who may do what, for test sign-ins: email -> { role, mustChangePassword }.
  const accounts = new Map();
  const setAccount = (email, role, extra = {}) => {
    const key = email.trim().toLowerCase();
    if (!role) accounts.delete(key);
    else accounts.set(key, { role, ...extra });
  };
  const testSignIn = async (req) => {
    const email = (req.headers.get('x-test-email') || '').trim().toLowerCase();
    if (!email) throw new Error('Unauthorized');
    const given = accounts.get(email);
    // "x-test-unverified: true" = an email Firebase has not confirmed (never so for logins an admin made).
    const verified = req.headers.get('x-test-unverified') !== 'true';
    if (given) return { uid: 'test-' + email, email, email_verified: verified, name: email.split('@')[0], ...given };
    // Someone with a real login in the emulator signs in as that login (with its access, if any).
    const real = await auth.getUserByEmail(email).catch(() => null);
    if (real) {
      if (real.disabled) throw new Error('Unauthorized');
      return { uid: real.uid, email, email_verified: real.emailVerified, name: real.displayName || email.split('@')[0], ...(real.customClaims || {}) };
    }
    return { uid: 'test-' + email, email, email_verified: true, name: email.split('@')[0] };
  };
  const realSignIn = utils.verifyToken;
  utils.verifyToken = testSignIn;
  const useRealSignIn = (on) => { utils.verifyToken = on ? realSignIn : testSignIn; };
  const routes = {
    data: loadTs(path.join(ROOT, 'src/app/api/data/route.ts')),
    accounts: loadTs(path.join(ROOT, 'src/app/api/accounts/route.ts')),
    account: loadTs(path.join(ROOT, 'src/app/api/account/route.ts')),
    logs: loadTs(path.join(ROOT, 'src/app/api/logs/route.ts')),
    config: loadTs(path.join(ROOT, 'src/app/api/config/route.ts')),
    meeting: loadTs(path.join(ROOT, 'src/app/api/meeting/route.ts')),
    meetings: loadTs(path.join(ROOT, 'src/app/api/meetings/route.ts')),
  };

  const { NextRequest } = projectRequire('next/server');
  const { Timestamp } = projectRequire('firebase-admin/firestore');
  const db = createTestDb(firebase.firestore(), Timestamp);

  // Calls a route the way the browser does, e.g. call('data', 'POST', 'boss@velvo.in', { value, baseRev }).
  async function call(route, method, email, body, extraHeaders = {}) {
    const headers = { 'content-type': 'application/json', ...extraHeaders };
    if (email) headers['x-test-email'] = email;
    const [name, query] = route.split('?');
    const req = new NextRequest('http://localhost/api/' + name + (query ? '?' + query : ''), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The routes log refused saves on purpose; keep the test output readable.
    const warn = console.warn;
    console.warn = () => {};
    try {
      const res = await routes[name][method](req);
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json };
    } finally {
      console.warn = warn;
    }
  }

  // Signs in to the login emulator with an email and password, the way the browser does. Returns the sign-in
  // token, or throws with Firebase's error code (for example INVALID_LOGIN_CREDENTIALS or USER_DISABLED).
  async function signInWithPassword(email, password) {
    const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true, tenantId: undefined }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `sign-in failed (${res.status})`);
    return json.idToken;
  }

  // The shared data as it is stored, and its version.
  async function stored() {
    const doc = await db.collection('appData').findOne({ _id: 'velvo-ops-data' });
    return doc ? { rev: doc.rev, state: JSON.parse(doc.value) } : null;
  }

  // Closes the connection to the emulator, so the test process can end.
  async function stop() {
    await firebase.firestore().terminate().catch(() => {});
    delete global._firestore;
    const { getApps, deleteApp } = projectRequire('firebase-admin/app');
    await Promise.all(getApps().map((app) => deleteApp(app).catch(() => {})));
  }

  return { call, db, auth, stored, stop, setAccount, useRealSignIn, signInWithPassword, projectId: PROJECT_ID };
}

// A small but complete data set, like the one the app saves.
function sampleData() {
  return {
    clients: [
      { id: 'c1', name: 'Alpha Foods', status: 'Active', team: ['t1'], services: [] },
      { id: 'c2', name: 'Bravo Media', status: 'Active', team: [], services: [] },
      { id: 'c3', name: 'Charlie Cafe', status: 'Paused', team: [], services: [] },
      { id: 'c4', name: 'Delta Travels', status: 'Active', team: [], services: [] },
      { id: 'c5', name: 'Echo Salon', status: 'Active', team: [], services: [] },
    ],
    issues: [],
    updates: [{ id: 'u1', clientId: 'c1', text: 'Kick-off call', authorEmail: 'mgr@velvo.in', date: '2026-09-01', timestamp: 1788220800000 }],
    team: [{ id: 't1', name: 'Asha', role: 'Designer', email: 'mgr@velvo.in' }],
    leads: [],
    settings: { clientStatuses: ['Active', 'Paused'], priorities: ['Critical', 'High', 'Medium', 'Low'] },
  };
}

module.exports = { createHarness, sampleData, DEFAULT_PROJECT };
