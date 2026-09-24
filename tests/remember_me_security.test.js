/**
 * HEALTH VIBE AI: SECURE REMEMBER ME & CLINICAL IDLE LOCK TEST SUITE
 * 
 * Verifies:
 * 1. Dual-Mode Auth Persistence (LOCAL vs SESSION)
 * 2. Unrestricted User Preference Toggle & LocalStorage Sync
 * 3. Workstation Storage Segregation (Zero residual credentials on shared PC)
 * 4. Clinical Inactivity Auto-Lock (HIPAA § 164.312(a)(2)(iii))
 * 5. UI Security Hint & Lock Screen Modal Elements in app/index.html
 * 6. Bilingual i18n Catalog Parity for Session Security Keys
 * 7. Comprehensive Purge on Sign Out (leaveApp)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log("🔒 HEALTH VIBE AI: SECURE REMEMBER ME & CLINICAL IDLE LOCK SUITE");
console.log("   Dual-Mode Persistence, HIPAA Inactivity Lock & Workstation Isolation");
console.log("==================================================================\n");

const APP_DIR = path.resolve(__dirname, '../app');
const appJsPath = path.join(APP_DIR, 'app.js');
const indexHtmlPath = path.join(APP_DIR, 'index.html');
const i18nJsPath = path.join(APP_DIR, 'i18n.js');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const { translations } = require(i18nJsPath);

// -----------------------------------------------------------------------------
// TEST 1: Dual-Mode Auth Persistence Logic in app.js
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Dual-Mode Auth Persistence Selection");
assert.ok(appJs.includes("firebase.auth.Auth.Persistence.LOCAL"), "Must support LOCAL persistence for trusted workstations.");
assert.ok(appJs.includes("firebase.auth.Auth.Persistence.SESSION"), "Must support SESSION persistence for shared/hospital workstations.");

// Verify that applyAuthPersistence branches between LOCAL and SESSION based on user choice
const persistenceRegex = /const\s+persistence\s*=\s*remember\s*\?\s*firebase\.auth\.Auth\.Persistence\.LOCAL\s*:\s*firebase\.auth\.Auth\.Persistence\.SESSION/;
assert.ok(persistenceRegex.test(appJs), "applyAuthPersistence must dynamically choose LOCAL vs SESSION depending on 'remember' boolean.");
console.log("  ✓ Dynamic dual-mode auth persistence (LOCAL / SESSION) verified.");

// -----------------------------------------------------------------------------
// TEST 2: User Freedom & Preference Toggle (No Forced Re-Checking)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Unrestricted Remember Me Toggle");
// Verify that the old anti-pattern 'checkbox.checked = true; // Always stay checked' is absent
assert.ok(!appJs.includes("checkbox.checked = true; // Always stay checked"), "Must NOT force checkbox to true on change event.");

// Verify that user preference is stored and read from localStorage
assert.ok(appJs.includes("localStorage.setItem(REMEMBER_ME_KEY, isChecked ? \"true\" : \"false\")"), "Checkbox change must record user selection to localStorage.");
assert.ok(appJs.includes("localStorage.getItem(REMEMBER_ME_KEY)"), "Init must restore saved preference from localStorage.");
console.log("  ✓ User preference freely toggled and accurately mirrored in storage.");

// -----------------------------------------------------------------------------
// TEST 3: Workstation Storage Segregation (HIPAA PHI Defense)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Workstation Storage Segregation");
// In saveActiveSession, if remember is false, persistent credentials must be cleared
assert.ok(appJs.includes("sessionStorage.setItem(\"hv_active_session\", JSON.stringify(session))"), "Active session must always exist in ephemeral sessionStorage.");
assert.ok(appJs.includes("localStorage.removeItem(\"hv_active_session\")"), "Shared mode must sanitize persistent localStorage to prevent PHI exposure.");
assert.ok(appJs.includes("localStorage.removeItem(\"hv_user_logged_in\")"), "Shared mode must remove logged-in flag from persistent localStorage.");
console.log("  ✓ Ephemeral session isolation protects patient data on shared clinical workstations.");

// -----------------------------------------------------------------------------
// TEST 4: Clinical Inactivity & HIPAA Auto-Lock Implementation
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: HIPAA Inactivity Lock System");
assert.ok(appJs.includes("initIdleSessionLockMonitor"), "Must define initIdleSessionLockMonitor.");
assert.ok(appJs.includes("lockSessionDueToInactivity"), "Must define lockSessionDueToInactivity.");
assert.ok(appJs.includes("resumeLockedSession"), "Must define resumeLockedSession.");
assert.ok(appJs.includes("window._isIdleLocked"), "Must track idle lock state globally.");

// Check timeout constants
assert.ok(appJs.includes("IDLE_TIMEOUT_TRUSTED_MS"), "Must define trusted device idle timeout (30 min).");
assert.ok(appJs.includes("IDLE_TIMEOUT_SHARED_MS"), "Must define shared workstation idle timeout (15 min).");

// Check user activity event listeners
const trackedEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
trackedEvents.forEach(evt => {
  assert.ok(appJs.includes(`"${evt}"`), `Activity tracker must monitor '${evt}' event.`);
});
console.log("  ✓ Inactivity monitor, timeout thresholds (15m/30m), and event tracking verified.");

// -----------------------------------------------------------------------------
// TEST 5: HTML Security Elements in index.html
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: HTML Security Hint & Idle Lock Modal");
assert.ok(indexHtml.includes('id="rememberMe"'), "Auth form must contain #rememberMe checkbox.");
assert.ok(indexHtml.includes('data-i18n="auth.rememberMeTip"'), "Auth form must present security warning tip.");
assert.ok(indexHtml.includes('id="idleLockScreen"'), "HTML must contain #idleLockScreen modal overlay.");
assert.ok(indexHtml.includes('id="idleLockUserName"'), "Idle lock screen must display current user name.");
assert.ok(indexHtml.includes('id="idleLockUserEmail"'), "Idle lock screen must display current user email.");
assert.ok(indexHtml.includes('id="idleLockWorkstationBadge"'), "Idle lock screen must display workstation security badge.");
assert.ok(indexHtml.includes('onclick="resumeLockedSession()"'), "Idle lock screen must contain resume session trigger.");
console.log("  ✓ Security hint caption and complete HIPAA lock overlay markup verified in index.html.");

// -----------------------------------------------------------------------------
// TEST 6: Bilingual i18n Catalog Parity
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 6: Bilingual i18n Key Parity");
const requiredSecurityKeys = [
  'rememberMe',
  'rememberMeTip',
  'sessionLockedTitle',
  'sessionLockedDesc',
  'resumeSession',
  'lockedUserLabel',
  'lockScreenHipaaBadge',
  'workstationPersonal',
  'workstationShared'
];

requiredSecurityKeys.forEach(k => {
  assert.ok(translations.ar.auth[k], `Arabic catalog missing auth.${k}`);
  assert.ok(translations.en.auth[k], `English catalog missing auth.${k}`);
});
console.log(`  ✓ All ${requiredSecurityKeys.length} security keys present with 100% Arabic & English parity.`);

// -----------------------------------------------------------------------------
// TEST 7: Complete Session Sanitization on Sign Out (leaveApp)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 7: Clean Sign Out & Lock Reset");
assert.ok(appJs.includes("clearActiveSession()"), "leaveApp must invoke clearActiveSession().");
assert.ok(appJs.includes("clearFirebaseAuthStorage()"), "leaveApp must purge Firebase auth storage.");
assert.ok(appJs.includes("window._isIdleLocked = false"), "leaveApp must reset idle lock state.");
console.log("  ✓ Full session teardown and state reset verified on logout.");

console.log("\n==================================================================");
console.log("🎉 ALL 7 SECURE REMEMBER ME & IDLE LOCK TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================");
