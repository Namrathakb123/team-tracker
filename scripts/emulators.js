// Helpers for Firebase's emulators on this computer (used by "npm test" and "npm run dev:local").
const { execFileSync } = require('child_process');

// Stops a Firestore emulator left running on `port` (on Windows the emulator, a Java program, doesn't always stop
// together with the command that started it). Only the emulator on that port is touched.
function stopFirestoreEmulator(port) {
  try {
    if (process.platform === 'win32') {
      const script = `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -like '*cloud-firestore-emulator*' -and $_.CommandLine -like '*--port ${port} *' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    } else {
      execFileSync('pkill', ['-f', `cloud-firestore-emulator.*--port ${port} `], { stdio: 'ignore' });
    }
  } catch {
    // Nothing was running.
  }
}

// Whether something answers on this port of this computer.
async function isListening(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

// Waits until an emulator answers on `port` (`name` is for the message). Throws after `timeoutMs`.
async function waitForEmulator(port, name = "Firebase's database emulator", timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isListening(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} did not start on port ${port}.`);
}

const waitForFirestore = (port, timeoutMs) => waitForEmulator(port, "Firebase's database emulator", timeoutMs);

module.exports = { stopFirestoreEmulator, isListening, waitForEmulator, waitForFirestore };
