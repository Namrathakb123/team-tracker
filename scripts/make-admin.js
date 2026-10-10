// "npm run make-admin -- you@example.com": makes an existing login an admin on the REAL Firebase project named in
// .env.local. Needed once, on launch day: create your own login in the Firebase console (Authentication > Users >
// Add user, with a password only you know), run this, then sign in to the app and give everyone else a login on
// the Team page. It changes nothing else, and never asks for or shows a password.
const path = require('path');
const ROOT = path.join(__dirname, '..');
const projectRequire = require('module').createRequire(path.join(ROOT, 'package.json'));

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Give the email of the login, for example: npm run make-admin -- you@example.com');
    process.exit(1);
  }
  projectRequire('@next/env').loadEnvConfig(ROOT, false);
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error('This is for the real Firebase project. The test copy makes its own admin login.');
    process.exit(1);
  }
  const { initializeApp, cert } = projectRequire('firebase-admin/app');
  const { getAuth } = projectRequire('firebase-admin/auth');
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\n/g, '\n');
  const app = initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
  privateKey = '';
  const auth = getAuth(app);

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (e) {
    if (e?.code === 'auth/user-not-found') {
      console.error(`There is no login for ${email} in the Firebase project "${process.env.FIREBASE_PROJECT_ID}".`);
      console.error('Create it first: Firebase console > Authentication > Users > Add user.');
      process.exit(1);
    }
    throw e;
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role: 'admin' });
  if (!user.emailVerified) await auth.updateUser(user.uid, { emailVerified: true });
  console.log(`Done: ${email} is now an admin of the Team Tracker. Sign in to the app with it.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Could not make the login an admin:', e?.message || e);
  process.exit(1);
});
