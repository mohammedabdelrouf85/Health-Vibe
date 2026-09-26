/**
 * Test Suite: Environment Architecture (Development, Staging, Production)
 * Validates strict configuration isolation, endpoints, emulators, and safety flags.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("================================================================================");
console.log("🌍 HEALTH VIBE AI: DUAL ENVIRONMENT ARCHITECTURE TEST SUITE");
console.log("   Development vs Production Environment Separation");
console.log("================================================================================");

const configPath = path.join(__dirname, "../app/config.js");
const configCode = fs.readFileSync(configPath, "utf-8");

let passedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// Helper to run config in simulated environment
function loadConfigWithEnv({ hostname = "localhost", search = "", storedEnv = null, emulatorPreference = null }) {
  const localStorageMock = {
    getItem: (k) => {
      if (k === "HV_ENVIRONMENT") return storedEnv;
      if (k === "HV_USE_EMULATORS") return emulatorPreference;
      return null;
    },
    setItem: () => {},
    removeItem: () => {}
  };

  const sandbox = {
    window: {
      location: {
        hostname: hostname,
        search: search,
        reload: () => {}
      },
      localStorage: localStorageMock
    },
    localStorage: localStorageMock,
    URLSearchParams: URLSearchParams,
    console: console,
    module: { exports: {} }
  };

  const script = new vm.Script(configCode);
  const context = vm.createContext(sandbox);
  script.runInContext(context);

  return sandbox.window.HEALTH_VIBE_CONFIG;
}

// -----------------------------------------------------------------------------
// Test Category 1: Environment Resolution & Auto-Detection
// -----------------------------------------------------------------------------
console.log("\n🔍 Category 1: Environment Resolution & Auto-Detection");

runTest("Resolves to 'development' on localhost/127.0.0.1", () => {
  const cfg = loadConfigWithEnv({ hostname: "localhost" });
  assert.strictEqual(cfg.environment, "development");
  assert.strictEqual(cfg.isDevelopment(), true);
  assert.strictEqual(cfg.isProduction(), false);
  assert.strictEqual(cfg.apiBaseUrl, "http://localhost:4000");
  assert.strictEqual(cfg.allowDemoSeed, true);
  assert.strictEqual(cfg.debug, true);
  assert.strictEqual(cfg.firebase.projectId, "health-vibes-dev");
  assert.strictEqual(cfg.expectedFirebaseProjectId, "health-vibes-dev");
  assert.strictEqual(cfg.emulators.enabled, true);
});

runTest("Resolves to 'production' on live domain (e.g. app.healthvibe.ai)", () => {
  const cfg = loadConfigWithEnv({ hostname: "app.healthvibe.ai" });
  assert.strictEqual(cfg.environment, "production");
  assert.strictEqual(cfg.isDevelopment(), false);
  assert.strictEqual(cfg.isProduction(), true);
  assert.strictEqual(cfg.apiBaseUrl, "");
  assert.strictEqual(cfg.allowDemoSeed, false);
  assert.strictEqual(cfg.debug, false);
  assert.strictEqual(cfg.firebase.projectId, "health-vibes-a4b3b");
  assert.strictEqual(cfg.expectedFirebaseProjectId, "health-vibes-a4b3b");
});

runTest("Resolves staging to a separate Firebase project and API", () => {
  const cfg = loadConfigWithEnv({ hostname: "staging.healthvibe.ai" });
  assert.strictEqual(cfg.environment, "staging");
  assert.strictEqual(cfg.isStaging(), true);
  assert.strictEqual(cfg.apiBaseUrl, "https://staging.healthvibe.ai");
  assert.strictEqual(cfg.allowDemoSeed, false);
  assert.strictEqual(cfg.firebase.projectId, "health-vibes-staging");
  assert.strictEqual(cfg.expectedFirebaseProjectId, "health-vibes-staging");
});

runTest("Allows explicit query override only away from production hosts", () => {
  const cfgDev = loadConfigWithEnv({ hostname: "preview.local", search: "?env=development" });
  assert.strictEqual(cfgDev.environment, "development");
  assert.strictEqual(cfgDev.isDevelopment(), true);

  const cfgProd = loadConfigWithEnv({ hostname: "localhost", search: "?env=production" });
  assert.strictEqual(cfgProd.environment, "production");
  assert.strictEqual(cfgProd.isProduction(), true);

  const cfgProtectedProd = loadConfigWithEnv({ hostname: "healthvibe.ai", search: "?env=development" });
  assert.strictEqual(cfgProtectedProd.environment, "production");
  assert.strictEqual(cfgProtectedProd.isProduction(), true);
});

runTest("Respects stored localStorage preference away from production hosts", () => {
  const cfg = loadConfigWithEnv({ hostname: "localhost", storedEnv: "production" });
  assert.strictEqual(cfg.environment, "production");
  assert.strictEqual(cfg.isProduction(), true);

  const protectedProd = loadConfigWithEnv({ hostname: "app.healthvibe.ai", storedEnv: "development" });
  assert.strictEqual(protectedProd.environment, "production");
  assert.strictEqual(protectedProd.isProduction(), true);
});

// -----------------------------------------------------------------------------
// Test Category 2: Environment Structure & Safety Guards
// -----------------------------------------------------------------------------
console.log("\n🛡️ Category 2: Environment Structure & Production Safety Guards");

runTest("Production environment strictly disallows demo seed & enables production Firebase", () => {
  const cfg = loadConfigWithEnv({ hostname: "healthvibe.ai" });
  assert.strictEqual(cfg.allowDemoSeed, false, "Production must never allow demo seeding");
  assert.strictEqual(cfg.emulators.enabled, false, "Production must never use emulators");
  assert.strictEqual(cfg.firebase.projectId, "health-vibes-a4b3b");
});

runTest("Development environment config uses emulator presets and non-production Firebase", () => {
  const cfg = loadConfigWithEnv({ hostname: "localhost" });
  assert(cfg.emulators !== undefined);
  assert.strictEqual(cfg.emulators.enabled, true);
  assert.strictEqual(cfg.emulators.firestoreHost, "localhost");
  assert.strictEqual(cfg.emulators.firestorePort, 8080);
  assert.strictEqual(cfg.emulators.storagePort, 9199);
  assert.notStrictEqual(cfg.firebase.projectId, "health-vibes-a4b3b");
});

runTest("Production refuses emulator and demo-data toggles", () => {
  const cfg = loadConfigWithEnv({ hostname: "healthvibe.ai", search: "?emulators=true&seedDemo=true" });
  assert.strictEqual(cfg.environment, "production");
  assert.strictEqual(cfg.emulators.enabled, false);
  assert.strictEqual(cfg.allowDemoSeed, false);
});

// -----------------------------------------------------------------------------
// Test Category 3: Backend Environment Configuration Files
// -----------------------------------------------------------------------------
console.log("\n⚙️ Category 3: Backend Environment Configuration Files");

runTest("backend/.env.development exists and specifies development defaults", () => {
  const devEnvPath = path.join(__dirname, "../backend/.env.development");
  assert(fs.existsSync(devEnvPath), ".env.development must exist");
  const content = fs.readFileSync(devEnvPath, "utf-8");
  assert(content.includes("NODE_ENV=development"));
  assert(content.includes("PORT=4000"));
  assert(content.includes("FIREBASE_PROJECT_ID=health-vibes-dev"));
  assert(content.includes("EXPECTED_FIREBASE_PROJECT_ID=health-vibes-dev"));
  assert(content.includes("USE_FIREBASE_EMULATOR=true"));
  assert(content.includes("FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199"));
});

runTest("backend/.env.staging exists and points at staging only", () => {
  const stagingEnvPath = path.join(__dirname, "../backend/.env.staging");
  assert(fs.existsSync(stagingEnvPath), ".env.staging must exist");
  const content = fs.readFileSync(stagingEnvPath, "utf-8");
  assert(content.includes("NODE_ENV=staging"));
  assert(content.includes("FIREBASE_PROJECT_ID=health-vibes-staging"));
  assert(content.includes("EXPECTED_FIREBASE_PROJECT_ID=health-vibes-staging"));
  assert(content.includes("USE_FIREBASE_EMULATOR=false"));
  assert(!content.includes("FIREBASE_PROJECT_ID=health-vibes-a4b3b"));
});

runTest("backend/.env.production exists and specifies strict production policy", () => {
  const prodEnvPath = path.join(__dirname, "../backend/.env.production");
  assert(fs.existsSync(prodEnvPath), ".env.production must exist");
  const content = fs.readFileSync(prodEnvPath, "utf-8");
  assert(content.includes("NODE_ENV=production"));
  assert(content.includes("PORT=8080"));
  assert(content.includes("FIREBASE_PROJECT_ID=health-vibes-a4b3b"));
  assert(content.includes("EXPECTED_FIREBASE_PROJECT_ID=health-vibes-a4b3b"));
  assert(content.includes("USE_FIREBASE_EMULATOR=false"));
  assert(content.includes("ALLOW_DEMO_DATA=false"));
  assert(content.includes("ALLOW_DEVELOPMENT_MODE=false"));
});

runTest("backend/server.js includes dual environment loader & health check route", () => {
  const serverPath = path.join(__dirname, "../backend/server.js");
  const serverCode = fs.readFileSync(serverPath, "utf-8");
  assert(serverCode.includes("NODE_ENV"), "server.js must read NODE_ENV");
  assert(serverCode.includes("candidateEnvFiles"), "server.js must support cascading env files");
  assert(serverCode.includes("validateBackendEnvironmentConfig"), "server.js must block wrong Firebase project bindings");
  assert(serverCode.includes("FIREBASE_STORAGE_EMULATOR_HOST"), "server.js must configure the Storage emulator in development");
  assert(serverCode.includes("/health"), "server.js must expose health check route");
});

runTest("app.js includes runtime guard and Storage emulator binding", () => {
  const appPath = path.join(__dirname, "../app/app.js");
  const appCode = fs.readFileSync(appPath, "utf-8");
  assert(appCode.includes("validateClientRuntimeConfig"), "app.js must validate Firebase/environment binding before initialization");
  assert(appCode.includes("storage.useEmulator"), "app.js must connect Firebase Storage to the dev emulator");
});

console.log("\n================================================================================");
console.log(`🎉 ALL ${passedCount} ENVIRONMENT ARCHITECTURE TESTS PASSED WITH 100% SUCCESS!`);
console.log("================================================================================\n");
