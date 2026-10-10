// "npm run dev:local": runs the app on this computer with a private test copy of the data, so you can try anything
// without changing the real data or the website.
// - The copy lives in Firebase's emulators on this computer (the database and the logins) and is saved in the
//   .local-firebase folder (ignored by git) every two minutes and when you stop with Ctrl+C. It runs only while this
//   command runs. Logins made on the test copy exist only there.
// - A test admin login is made the first time (TEST_ADMIN below); sign in with it, then give others logins on the
//   Team page to try the app as them.
// - The first time, the copy is filled from the earlier test copy (the .local-db folder) if there is one, otherwise
//   from the real data (read only: nothing is ever written to the real database).
// - "npm run dev:local -- --fresh" throws the test copy away and takes a new copy of the real data.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { copyMongoToFirestore } = require('./copy-data');
const { stopFirestoreEmulator, waitForFirestore, waitForEmulator } = require('./emulators');

const ROOT = path.join(__dirname, '..');
const DATA_FOLDER = path.join(ROOT, '.local-firebase');
const OLD_DB_FOLDER = path.join(ROOT, '.local-db');
const PORT = '3000';
const PROJECT_ID = 'demo-team-tracker'; // "demo-" projects exist only in the emulator
const FIRESTORE_PORT = 8080; // as in firebase.json
const AUTH_HOST = '127.0.0.1:9099'; // as in firebase.json
const HUB = 'http://127.0.0.1:4400';
// The test copy's own admin login (it exists only in the emulator, so it is fine to show it here).
const TEST_ADMIN = { email: 'admin@test.copy', password: 'TestCopy-Admin-1', name: 'Test admin' };
const SAVE_EVERY_MS = 2 * 60 * 1000;
const fresh = process.argv.includes('--fresh');

// The real database's address, read from .env.local only for a copy of the real data (nothing else is taken from there).
function realDatabaseAddress() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^\s*MONGODB_URI\s*=/.test(l));
  if (!line) return null;
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  return value || null;
}

// Saves the emulator's data in the .local-firebase folder.
async function saveCopy() {
  const res = await fetch(`${HUB}/_admin/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: DATA_FOLDER, initiatedBy: 'dev-local' }),
  });
  if (!res.ok) throw new Error(`saving the test copy failed (${res.status})`);
}

// Fills the empty emulator: from the earlier test copy (.local-db) unless --fresh, otherwise from the real data.
async function fillCopy(firestore) {
  const { MongoClient } = require('mongodb');
  const useOldCopy = !fresh && fs.existsSync(OLD_DB_FOLDER);
  let source = null;
  let address;
  if (useOldCopy) {
    const { MongoMemoryServer } = require('mongodb-memory-server-core');
    source = await MongoMemoryServer.create({ instance: { dbPath: OLD_DB_FOLDER, storageEngine: 'wiredTiger', launchTimeout: 60000 } });
    address = source.getUri() + 'velvo';
    console.log('Filling the test copy from the earlier test copy (.local-db)...');
  } else {
    address = realDatabaseAddress();
    if (!address) throw new Error('No MONGODB_URI in .env.local, so there is no real data to copy.');
    console.log('Taking a copy of the real data (read only)...');
  }
  const client = new MongoClient(address);
  try {
    await client.connect();
    await copyMongoToFirestore(client.db(), firestore, (line) => console.log(line));
  } finally {
    await client.close().catch(() => {});
    if (source) await source.stop({ doCleanup: false }).catch(() => {});
  }
}

async function main() {
  if (fresh && fs.existsSync(DATA_FOLDER)) {
    fs.rmSync(DATA_FOLDER, { recursive: true, force: true });
    console.log('Test copy removed; a new copy of the real data will be taken.');
  }
  // An emulator left over from an earlier run that didn't stop properly would block the port.
  stopFirestoreEmulator(FIRESTORE_PORT);

  console.log("Starting Firebase's database emulator...");
  const firebaseBin = require.resolve('firebase-tools/lib/bin/firebase.js', { paths: [ROOT] });
  const emulatorArgs = [firebaseBin, 'emulators:start', '--only', 'firestore,auth', '--project', PROJECT_ID, '--log-verbosity', 'QUIET'];
  if (fs.existsSync(path.join(DATA_FOLDER, 'firebase-export-metadata.json'))) emulatorArgs.push('--import', DATA_FOLDER);
  const emulator = spawn(process.execPath, emulatorArgs, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const stopEmulator = () => {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(emulator.pid), '/T', '/F'], { stdio: 'ignore' });
      else emulator.kill('SIGKILL');
    } catch {}
    stopFirestoreEmulator(FIRESTORE_PORT);
  };

  const emulatorHost = `127.0.0.1:${FIRESTORE_PORT}`;
  try {
    await waitForFirestore(FIRESTORE_PORT);
    await waitForEmulator(Number(AUTH_HOST.split(':')[1]), "Firebase's login emulator");
    process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
    const { initializeApp } = require(require.resolve('firebase-admin/app', { paths: [ROOT] }));
    const { getFirestore } = require(require.resolve('firebase-admin/firestore', { paths: [ROOT] }));
    const { getAuth } = require(require.resolve('firebase-admin/auth', { paths: [ROOT] }));
    const admin = initializeApp({ projectId: PROJECT_ID }, 'dev-local');
    const firestore = getFirestore(admin);
    let changed = false;
    if (!(await firestore.collection('appData').limit(1).get()).size) {
      await fillCopy(firestore);
      changed = true;
    }
    // The test admin login, made once.
    const auth = getAuth(admin);
    const existing = await auth.getUserByEmail(TEST_ADMIN.email).catch(() => null);
    if (!existing) {
      const created = await auth.createUser({ email: TEST_ADMIN.email, password: TEST_ADMIN.password, displayName: TEST_ADMIN.name, emailVerified: true });
      await auth.setCustomUserClaims(created.uid, { role: 'admin' });
      changed = true;
    }
    if (changed) await saveCopy();
    await firestore.terminate();
  } catch (e) {
    stopEmulator();
    throw e;
  }

  console.log('');
  console.log('============================================================');
  console.log(' TEST COPY: the app on http://localhost:' + PORT + ' uses a private copy');
  console.log(' of the data. Changes stay on this computer and never reach the');
  console.log(' real database or the website. Press Ctrl+C to stop.');
  console.log('');
  console.log(' Sign in as the test admin:');
  console.log('   email     ' + TEST_ADMIN.email);
  console.log('   password  ' + TEST_ADMIN.password);
  console.log('============================================================');
  console.log('');

  // The app itself, pointed at the emulators (settings given here win over the ones in .env.local).
  const nextBin = require.resolve('next/dist/bin/next', { paths: [ROOT] });
  const env = { ...process.env, FIRESTORE_EMULATOR_HOST: emulatorHost, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, FIREBASE_PROJECT_ID: PROJECT_ID, LOCAL_TEST_DATA: 'true' };
  delete env.MONGODB_URI;
  const app = spawn(process.execPath, [nextBin, 'dev', '-p', PORT], { cwd: ROOT, stdio: 'inherit', env });

  const saver = setInterval(() => { saveCopy().catch((e) => console.warn('Test copy:', e.message)); }, SAVE_EVERY_MS);
  let finishing = false;
  const finish = async (code) => {
    if (finishing) return;
    finishing = true;
    clearInterval(saver);
    await saveCopy().then(() => console.log('Test copy saved.'), (e) => console.warn('Test copy:', e.message));
    try { app.kill(); } catch {}
    stopEmulator();
    process.exit(code ?? 0);
  };
  app.on('exit', (code) => { finish(code); });
  process.on('SIGINT', () => { finish(0); });
  process.on('SIGTERM', () => { finish(0); });
}

main().catch((e) => {
  console.error('Could not start the test copy:', e.message);
  process.exit(1);
});
