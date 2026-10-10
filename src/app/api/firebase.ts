import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// The connection to Firebase: sign-in checks and the database (Firestore).
// Keys come only from environment variables (.env.local locally, project settings on Vercel); see .env.example.
// On the private test copy ("npm run dev:local") and in tests, everything goes to Firebase's emulators on this
// computer instead (FIRESTORE_EMULATOR_HOST is set), and no keys are needed.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing environment variable ${name}. Add it to .env.local (see .env.example).`);
  }
  return value;
}

// Whether this server talks to Firebase's emulators on this computer rather than the real project.
export function usingEmulators(): boolean {
  return !!process.env.FIRESTORE_EMULATOR_HOST;
}

export function firebaseApp(): App {
  if (getApps().length) return getApp();
  if (usingEmulators()) {
    // "demo-" project names only ever exist in the emulators, so nothing can reach a real project by mistake.
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-team-tracker' });
  }
  // The test copy must never fall back to the real database.
  if (process.env.LOCAL_TEST_DATA === 'true') {
    throw new Error('The test copy is not connected to the Firebase emulators, so it stopped before reaching real data.');
  }
  let privateKey = requireEnv('FIREBASE_PRIVATE_KEY').trim();
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  return initializeApp({
    credential: cert({
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey,
    }),
  });
}

// Kept on `global` so that reloading the code while developing doesn't set the database up twice (Firestore allows
// its settings to be given only once).
const globalWithFirestore = global as typeof globalThis & { _firestore?: Firestore };

export function firestore(): Firestore {
  if (!globalWithFirestore._firestore) {
    const db = getFirestore(firebaseApp());
    // Fields left undefined are simply not stored (Firestore would refuse the whole record otherwise).
    db.settings({ ignoreUndefinedProperties: true });
    globalWithFirestore._firestore = db;
  }
  return globalWithFirestore._firestore;
}
