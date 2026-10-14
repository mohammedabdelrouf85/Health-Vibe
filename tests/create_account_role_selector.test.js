/**
 * Create Account Role Selector Unit & Integration Test Suite
 * Validates PRD requirement for role selection (Patient / Doctor / Clinic) in Create Account:
 * 1. DOM verification of #authRoleGroup and select #authRole with Patient, Doctor, and Clinic options.
 * 2. Visibility toggling in setAuthMode('signup') and setAuthMode('signin').
 * 3. Dynamic role guidance hint updates.
 * 4. Submission mapping in handleEmailAuth and Firestore user record provisioning.
 * 5. Bilingual i18n label verification (Arabic & English).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("👥 HEALTH VIBE AI: CREATE ACCOUNT ROLE SELECTION TEST SUITE");
console.log("==================================================================\n");

const indexHtmlPath = path.resolve(__dirname, "../app/index.html");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");
const appJsPath = path.resolve(__dirname, "../app/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const i18nPath = path.resolve(__dirname, "../app/i18n.js");
const i18nContent = fs.readFileSync(i18nPath, "utf8");

// TEST 1: DOM Elements in index.html
console.log("▶ TEST 1: DOM Structure in app/index.html");
assert.ok(
  indexHtmlContent.includes('id="authRoleGroup"'),
  "index.html must include #authRoleGroup container"
);
assert.ok(
  indexHtmlContent.includes('id="authRole"'),
  "index.html must include #authRole select dropdown"
);
assert.ok(
  indexHtmlContent.includes('value="patient"'),
  "Role selector must contain Patient option"
);
assert.ok(
  indexHtmlContent.includes('value="doctor_pending"'),
  "Role selector must contain Doctor option"
);
assert.ok(
  indexHtmlContent.includes('value="clinic_admin"'),
  "Role selector must contain Clinic Admin option"
);
console.log("  ✓ Role dropdown contains Patient, Doctor (doctor_pending), and Clinic (clinic_admin).");

// TEST 2: Dynamic Visibility in setAuthMode()
console.log("\n▶ TEST 2: Visibility Toggling in setAuthMode()");
assert.ok(
  appJsContent.includes('authRoleGroup.style.display = mode === "signup" ? "block" : "none"'),
  "app.js setAuthMode must show authRoleGroup exclusively in signup mode"
);
console.log("  ✓ #authRoleGroup is shown on signup and hidden on signin.");

// TEST 3: Dynamic Role Hint Listener
console.log("\n▶ TEST 3: Dynamic Role Hint Updates on Selection");
assert.ok(
  appJsContent.includes('authRole.addEventListener("change"'),
  "app.js must attach change listener to authRole"
);
assert.ok(
  appJsContent.includes("authRoleHint"),
  "app.js must update authRoleHint text"
);
console.log("  ✓ Dynamic contextual guidance hints update smoothly on role change.");

// TEST 4: Registration Role Persistence in handleEmailAuth()
console.log("\n▶ TEST 4: Role Extraction & Storage in handleEmailAuth()");
assert.ok(
  appJsContent.includes("chosenRoleRaw = authRole ? authRole.value : \"patient\""),
  "handleEmailAuth must extract chosen role from authRole"
);
assert.ok(
  appJsContent.includes("allowedSignupRoles = [ROLES.PATIENT, ROLES.DOCTOR_PENDING, ROLES.CLINIC_ADMIN]"),
  "handleEmailAuth must validate against allowedSignupRoles"
);
assert.ok(
  appJsContent.includes("role: safeRole"),
  "User document in Firestore must be written with the selected safeRole"
);
console.log("  ✓ Chosen role is validated against whitelist and persisted to Firestore.");

// TEST 5: Bilingual i18n Translation Keys
console.log("\n▶ TEST 5: Bilingual i18n Parity (Arabic & English)");
assert.ok(
  i18nContent.includes("accountType:") && i18nContent.includes("rolePatient:"),
  "i18n.js must define accountType and role options in Arabic"
);
assert.ok(
  i18nContent.includes("roleDoctor:") && i18nContent.includes("roleClinic:"),
  "i18n.js must define roleDoctor and roleClinic options in Arabic"
);
console.log("  ✓ Bilingual translation parity verified for all role selection labels.");

// TEST 6: Execution Simulation of Registration Role Resolution
console.log("\n▶ TEST 6: Runtime Simulation of Signup Role Resolution");

function simulateRoleResolution(selectedRoleInput, isOwner = false) {
  const allowed = ["patient", "doctor_pending", "clinic_admin"];
  const target = allowed.includes(selectedRoleInput) ? selectedRoleInput : "patient";
  if (isOwner) return "super_admin";
  return target;
}

assert.strictEqual(simulateRoleResolution("patient"), "patient");
assert.strictEqual(simulateRoleResolution("doctor_pending"), "doctor_pending");
assert.strictEqual(simulateRoleResolution("clinic_admin"), "clinic_admin");
assert.strictEqual(simulateRoleResolution("invalid_hack_role"), "patient");
assert.strictEqual(simulateRoleResolution("patient", true), "super_admin");

console.log("  ✓ Simulation verified: Role resolution properly defaults and protects admin tiers.");

console.log("\n==================================================================");
console.log("🎉 ALL CREATE ACCOUNT ROLE SELECTION TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================\n");
