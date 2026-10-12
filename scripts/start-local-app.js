process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_PROJECT_ID = 'demo-team-tracker';
process.env.LOCAL_TEST_DATA = 'true';
delete process.env.MONGODB_URI;

const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const nextBin = require.resolve('next/dist/bin/next', { paths: [ROOT] });
const child = spawn(process.execPath, [nextBin, 'dev', '-p', '3000'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code || 0));
