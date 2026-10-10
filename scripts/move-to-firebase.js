// "npm run move-to-firebase": moves the app's real data from the old MongoDB database into the real Firebase project,
// once, on launch day. Both are named in .env.local (MONGODB_URI, and the FIREBASE_* keys).
// - It only READS from MongoDB; nothing there is changed or deleted.
// - Without --go it only looks: it shows how many records would be copied and changes nothing.
// - With --go it copies, then reads everything back from Firebase and checks it matches.
// - It refuses to copy into a Firebase project that already has the app's data (so it can't overwrite newer work).
const path = require('path');
const ROOT = path.join(__dirname, '..');
const projectRequire = require('module').createRequire(path.join(ROOT, 'package.json'));
const { copyMongoToFirestore, COLLECTIONS } = require('./copy-data');

async function main() {
  const go = process.argv.includes('--go');
  projectRequire('@next/env').loadEnvConfig(ROOT, false);
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('This is for the real Firebase project; the test copy fills itself ("npm run dev:local").');
  }
  for (const name of ['MONGODB_URI', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    if (!process.env[name]) throw new Error(`${name} is missing from .env.local.`);
  }

  const { MongoClient } = projectRequire('mongodb');
  const { initializeApp, cert } = projectRequire('firebase-admin/app');
  const { getFirestore } = projectRequire('firebase-admin/firestore');
  const privateKey = process.env.FIREBASE_PRIVATE_KEY.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\n/g, '\n');
  const firestore = getFirestore(initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) }));

  const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await mongo.connect();
  try {
    const source = mongo.db();
    console.log(`From MongoDB (read only) to the Firebase project "${process.env.FIREBASE_PROJECT_ID}":`);
    for (const name of Object.keys(COLLECTIONS)) console.log(`  ${name}: ${await source.collection(name).countDocuments()} records`);

    if ((await firestore.collection('appData').limit(1).get()).size) {
      throw new Error('The Firebase project already has the app\'s data, so nothing was copied (it could overwrite newer work).');
    }
    if (!go) {
      console.log('\nNothing was copied. Run again with --go to copy:  npm run move-to-firebase -- --go');
      return;
    }

    console.log('\nCopying...');
    await copyMongoToFirestore(source, firestore, (line) => console.log(line));

    // Check: the shared data is exactly the same, and every collection has the same number of records.
    const original = await source.collection('appData').findOne({ _id: 'velvo-ops-data' });
    const copied = (await firestore.collection('appData').doc('velvo-ops-data').get()).data();
    const sameData = !!original && !!copied && original.value === copied.value && (original.rev ?? 0) === (copied.rev ?? 0);
    let sameCounts = true;
    for (const name of Object.keys(COLLECTIONS)) {
      const a = await source.collection(name).countDocuments();
      const b = (await firestore.collection(name).count().get()).data().count;
      if (a !== b) sameCounts = false;
    }
    console.log(sameData && sameCounts
      ? '\nDone: everything was copied and checked. The app can now run on Firebase.'
      : '\nCopied, but the check found differences. Don\'t switch the website over yet; ask for help.');
    if (!(sameData && sameCounts)) process.exitCode = 1;
  } finally {
    await mongo.close();
    await firestore.terminate();
  }
}

main().catch((e) => {
  console.error('Not done:', e?.message || e);
  process.exit(1);
});
