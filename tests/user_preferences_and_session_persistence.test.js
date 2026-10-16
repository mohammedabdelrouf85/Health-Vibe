/**
 * Health Vibe AI - User Display Preferences & Session Persistence Test Suite
 * 
 * Verifies:
 * 1. Default preferences structure and immutability (theme, language, direction, density, breakpoints)
 * 2. Backend validation and sanitization of user display settings
 * 3. Dual persistence (In-memory cache + Firestore user_display_preferences collection)
 * 4. Multi-tenant security isolation (User A cannot access or mutate User B's preferences)
 * 5. Backend REST API routes (GET /api/user/preferences, PUT /api/user/preferences, POST /api/user/session-state)
 * 6. Firestore security rules verification for /user_display_preferences/{userId}
 * 7. Client-side UserPreferencesService API and DOM synchronization
 * 8. Script inclusion in app/index.html & integration in app.js and responsive-layout.js
 */

'use strict';

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("⚙️  HEALTH VIBE AI: USER PREFERENCES & SESSION PERSISTENCE TESTS");
console.log("   Display Tokens, Breakpoints, Multi-Tenant Security & API Sync");
console.log("==================================================================\n");

const ROOT = path.resolve(__dirname, "..");

let passedTests = 0;

async function runTest(name, fn) {
  process.stdout.write(`▶ ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log("✓ PASSED");
  } catch (err) {
    console.log("✗ FAILED");
    console.error(err);
    process.exit(1);
  }
}

(async () => {
  const service = require(path.join(ROOT, "backend", "user-display-preferences-service.js"));

  // TEST 1: Default Preferences Model & Immutability
  await runTest("TEST 1: Default preferences structure and immutability", () => {
    const defaults = service.DEFAULT_USER_DISPLAY_PREFERENCES;
    assert.ok(defaults, "Defaults must exist");
    assert.strictEqual(defaults.theme, "dark");
    assert.strictEqual(defaults.language, "ar");
    assert.strictEqual(defaults.direction, "rtl");
    assert.strictEqual(defaults.preferredBreakpoint, "auto");
    assert.strictEqual(defaults.density, "comfortable");
    assert.strictEqual(defaults.sidebarCollapsed, false);
    assert.strictEqual(defaults.lastActiveScreen, "screen-patient");
    assert.strictEqual(defaults.lastActiveModule, "respiratory");
    assert.strictEqual(defaults.deviceTier, "desktop");

    // Verify Object.freeze immutability
    assert.throws(() => {
      defaults.theme = "light";
    }, /Cannot assign to read only property/);
  });

  // TEST 2: Input Validation & Rejection of Malicious/Invalid Settings
  await runTest("TEST 2: Input validation and rejection of invalid values", () => {
    // Valid inputs
    const valid = service.validateDisplayPreferences({
      theme: "light",
      language: "en",
      density: "compact",
      preferredBreakpoint: "tablet",
      sidebarCollapsed: true,
      lastActiveScreen: "screen-doctor"
    });
    assert.strictEqual(valid.theme, "light");
    assert.strictEqual(valid.language, "en");
    assert.strictEqual(valid.direction, "ltr");
    assert.strictEqual(valid.density, "compact");
    assert.strictEqual(valid.preferredBreakpoint, "tablet");
    assert.strictEqual(valid.sidebarCollapsed, true);
    assert.strictEqual(valid.lastActiveScreen, "screen-doctor");

    // Invalid theme
    assert.throws(() => {
      service.validateDisplayPreferences({ theme: "neon-pink" });
    }, err => err.code === "INVALID_THEME");

    // Invalid language
    assert.throws(() => {
      service.validateDisplayPreferences({ language: "fr" });
    }, err => err.code === "INVALID_LANGUAGE");

    // Invalid density
    assert.throws(() => {
      service.validateDisplayPreferences({ density: "super-loose" });
    }, err => err.code === "INVALID_DENSITY");

    // Invalid breakpoint
    assert.throws(() => {
      service.validateDisplayPreferences({ preferredBreakpoint: "smartwatch-999" });
    }, err => err.code === "INVALID_BREAKPOINT");
  });

  // TEST 3: Multi-Tenant Data Isolation Between Users
  await runTest("TEST 3: Multi-tenant data isolation between patient and doctor users", async () => {
    service.clearDisplayPreferencesMemory();

    const patientId = "patient_user_771";
    const doctorId = "doctor_user_992";

    // Set Patient preferences
    await service.updateUserDisplayPreferences(null, patientId, {
      theme: "light",
      language: "en",
      density: "spacious",
      lastActiveScreen: "screen-appointments"
    });

    // Set Doctor preferences
    await service.updateUserDisplayPreferences(null, doctorId, {
      theme: "dark",
      language: "ar",
      density: "compact",
      lastActiveScreen: "screen-doctor"
    });

    // Fetch both and verify zero cross-talk
    const patientPrefs = await service.getUserDisplayPreferences(null, patientId);
    const doctorPrefs = await service.getUserDisplayPreferences(null, doctorId);

    assert.strictEqual(patientPrefs.userId, patientId);
    assert.strictEqual(patientPrefs.theme, "light");
    assert.strictEqual(patientPrefs.language, "en");
    assert.strictEqual(patientPrefs.density, "spacious");
    assert.strictEqual(patientPrefs.lastActiveScreen, "screen-appointments");

    assert.strictEqual(doctorPrefs.userId, doctorId);
    assert.strictEqual(doctorPrefs.theme, "dark");
    assert.strictEqual(doctorPrefs.language, "ar");
    assert.strictEqual(doctorPrefs.density, "compact");
    assert.strictEqual(doctorPrefs.lastActiveScreen, "screen-doctor");
  });

  // TEST 4: Session Checkpointing API
  await runTest("TEST 4: Session checkpointing records active screen and device tier", async () => {
    const testUid = "checkpoint_test_user_44";
    const checkpoint = await service.recordSessionCheckpoint(null, testUid, {
      screenId: "screen-reports",
      moduleId: "diabetes",
      deviceTier: "tablet"
    });

    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.userId, testUid);
    assert.strictEqual(checkpoint.lastActiveScreen, "screen-reports");
    assert.strictEqual(checkpoint.lastActiveModule, "diabetes");
    assert.strictEqual(checkpoint.deviceTier, "tablet");
    assert.ok(checkpoint.lastSessionAt, "Checkpoint must record lastSessionAt timestamp");
  });

  // TEST 5: Backend Express Route Definitions in server.js
  await runTest("TEST 5: REST API endpoints mounted in backend/server.js", () => {
    const serverPath = path.join(ROOT, "backend", "server.js");
    const serverContent = fs.readFileSync(serverPath, "utf8");

    assert.ok(serverContent.includes("app.get('/api/user/preferences'"), "server.js must mount GET /api/user/preferences");
    assert.ok(serverContent.includes("app.put('/api/user/preferences'"), "server.js must mount PUT /api/user/preferences");
    assert.ok(serverContent.includes("app.post('/api/user/session-state'"), "server.js must mount POST /api/user/session-state");
    assert.ok(serverContent.includes("userDisplayPreferencesService"), "server.js must import userDisplayPreferencesService");
  });

  // TEST 6: Firestore Security Rules for /user_display_preferences
  await runTest("TEST 6: Firestore security rules protect /user_display_preferences collection", () => {
    const rulesPath = path.join(ROOT, "firestore.rules");
    const rulesContent = fs.readFileSync(rulesPath, "utf8");

    assert.ok(rulesContent.includes("match /user_display_preferences/{userId}"), "firestore.rules must match /user_display_preferences/{userId}");
    assert.ok(rulesContent.includes("allow read, write: if isOwner() || (isAuthenticated() && isSelf(userId));"), "Rules must enforce authenticated self-access or owner");
  });

  // TEST 7: Client-side UserPreferencesService API
  await runTest("TEST 7: Client-side user-preferences-service.js module methods and defaults", () => {
    const clientPath = path.join(ROOT, "app", "user-preferences-service.js");
    const clientService = require(clientPath);

    assert.ok(clientService, "user-preferences-service.js must be loadable in Node/browser");
    assert.ok(typeof clientService.getPreferences === "function", "getPreferences must be a function");
    assert.ok(typeof clientService.savePreferences === "function", "savePreferences must be a function");
    assert.ok(typeof clientService.applyPreferencesToDOM === "function", "applyPreferencesToDOM must be a function");
    assert.ok(typeof clientService.syncWithServer === "function", "syncWithServer must be a function");
    assert.ok(typeof clientService.checkpointSession === "function", "checkpointSession must be a function");
    assert.ok(typeof clientService.updateDeviceTier === "function", "updateDeviceTier must be a function");

    const prefs = clientService.getPreferences();
    assert.ok(prefs.theme === "dark");
    assert.ok(prefs.language === "ar");
  });

  // TEST 8: Integration in app/index.html, responsive-layout.js, and app.js
  await runTest("TEST 8: Subsystem integration across app/index.html, responsive-layout.js, and app.js", () => {
    const htmlPath = path.join(ROOT, "app", "index.html");
    const htmlContent = fs.readFileSync(htmlPath, "utf8");
    assert.ok(htmlContent.includes('<script src="./user-preferences-service.js?v=1.0"></script>'), "index.html must load user-preferences-service.js");

    const respPath = path.join(ROOT, "app", "responsive-layout.js");
    const respContent = fs.readFileSync(respPath, "utf8");
    assert.ok(respContent.includes("HVUserPreferences.updateDeviceTier(newTier)"), "responsive-layout.js must update device tier on breakpoint change");

    const appPath = path.join(ROOT, "app", "app.js");
    const appContent = fs.readFileSync(appPath, "utf8");
    assert.ok(appContent.includes("HVUserPreferences.checkpointSession"), "app.js showScreen must checkpoint session");
    assert.ok(appContent.includes("HVUserPreferences.syncWithServer"), "app.js onAuthStateChanged must sync preferences with server");

    const stylesPath = path.join(ROOT, "app", "styles.css");
    const stylesContent = fs.readFileSync(stylesPath, "utf8");
    assert.ok(stylesContent.includes('[data-density="compact"]'), "styles.css must style [data-density='compact']");
    assert.ok(stylesContent.includes('[data-density="spacious"]'), "styles.css must style [data-density='spacious']");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests} USER PREFERENCES & SESSION TESTS PASSED!`);
  console.log("==================================================================");
})();
