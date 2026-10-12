import { NextResponse } from 'next/server';

// The Firebase web settings the sign-in page needs. They aren't secret: they name the Firebase project, they don't
// unlock anything (every request to the app's server still needs a valid sign-in token).
export async function GET() {
  const development = process.env.NODE_ENV === 'development';
  // On the test copy ("npm run dev:local") logins live in Firebase's emulator on this computer. Never on the live site.
  const authEmulatorHost = development ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined;

  const config: Record<string, string | undefined> = {
    apiKey: (process.env.FIREBASE_API_KEY || (authEmulatorHost ? 'demo-key' : undefined))?.trim(),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: process.env.FIREBASE_APP_ID?.trim()
  };

  // Remove empty strings so Firebase doesn't crash during initialization
  Object.keys(config).forEach(key => {
    if (!config[key]) delete config[key];
  });

  // Local testing only: whether this is "npm run dev:local" (a private test copy of the data and logins).
  const testData = development && process.env.LOCAL_TEST_DATA === 'true';

  return NextResponse.json({ ...config, ...(testData ? { testData: true } : {}), ...(authEmulatorHost ? { authEmulatorHost } : {}) });
}
