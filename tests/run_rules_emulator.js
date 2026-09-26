const { spawn } = require("child_process");
const path = require("path");

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
