const { spawn, execSync } = require("child_process");
const path = require("path");

// Check Java version required by firebase-tools emulators (Java 21+)
let javaMajor = 0;
try {
  const versionOutput = execSync('java -version 2>&1', { encoding: 'utf8' });
  const match = versionOutput.match(/(?:version\s+"(\d+)|build\s+(\d+))/i);
  if (match) {
    javaMajor = parseInt(match[1] || match[2], 10);
  }
} catch (_) {}

if (javaMajor > 0 && javaMajor < 21 && !process.env.CI) {
  console.warn(`[RULES EMULATOR] Java version ${javaMajor} detected. firebase-tools requires Java 21+ for Firestore/Auth emulators. Skipping local rules emulator execution (runs in CI with Java 21).`);
  process.exit(0);
}

const projectId = "health-vibes-rules-test";
const firebaseBin = path.join(__dirname, "..", "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const {
  FIRESTORE_EMULATOR_HOST,
  FIREBASE_AUTH_EMULATOR_HOST,
  FIREBASE_STORAGE_EMULATOR_HOST,
  FIREBASE_DATABASE_EMULATOR_HOST,
  FIREBASE_CONFIG,
  GCLOUD_PROJECT,
  FIREBASE_PROJECT_ID,
  GOOGLE_APPLICATION_CREDENTIALS,
  ...cleanEnv
} = process.env;

const child = spawn(process.execPath, [
  firebaseBin,
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  "auth,firestore,storage",
  "node tests/firestore_rules_emulator.test.js"
], {
  cwd: path.join(__dirname, ".."),
  env: {
    ...cleanEnv,
    GCLOUD_PROJECT: projectId,
    FIREBASE_PROJECT_ID: projectId
  },
  shell: false,
  stdio: "inherit"
});

child.on("error", (err) => {
  console.error(`Failed to start Firebase emulators: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Firebase emulators stopped by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code || 0);
});
