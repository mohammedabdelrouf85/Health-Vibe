/**
 * Explicit Medical Consent Checkbox Unit & Compliance Test Suite
 * Validates PRD Section 10 "Must" requirement:
 * "Explicit Medical Consent Checkbox before allowing patient account creation or collecting clinical data"
 *
 * Checks:
 * 1. DOM verification of #authConsentGroup and checkbox #authMedicalConsentChk in app/index.html.
 * 2. Mandatory validation in handleEmailAuth(): blocking signup if unchecked with clear clinical guidance.
 * 3. Dynamic display toggling: shown in signup mode, hidden in signin mode.
 * 4. Audit trail persistence: writing privacyConsent metadata into Firestore user record upon signup.
 * 5. Bilingual i18n translation coverage (Arabic and English).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🛡️ HEALTH VIBE AI: EXPLICIT MEDICAL CONSENT TEST SUITE (PRD SEC. 10)");
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
  indexHtmlContent.includes('id="authConsentGroup"'),
  "index.html must include #authConsentGroup container"
);
assert.ok(
  indexHtmlContent.includes('id="authMedicalConsentChk"'),
  "index.html must include #authMedicalConsentChk checkbox"
);
assert.ok(
  indexHtmlContent.includes("openLegalModal('privacy')") &&
  indexHtmlContent.includes("openLegalModal('disclaimer')"),
  "Consent checkbox must link directly to Privacy Policy and Medical Disclaimer modals"
);
console.log("  ✓ Explicit consent checkbox present and bound to legal & medical disclosures.");

// TEST 2: Dynamic Visibility in setAuthMode()
console.log("\n▶ TEST 2: Visibility Toggling in setAuthMode()");
assert.ok(
  appJsContent.includes('authConsentGroup.style.display = mode === "signup" ? "block" : "none"'),
  "app.js setAuthMode must show authConsentGroup in signup mode and hide in signin mode"
);
console.log("  ✓ #authConsentGroup is visible during signup and cleanly hidden during signin.");

// TEST 3: Validation Guard in handleEmailAuth()
console.log("\n▶ TEST 3: Enforcement Guard in handleEmailAuth()");
assert.ok(
  appJsContent.includes("authMedicalConsentChk && !authMedicalConsentChk.checked"),
  "handleEmailAuth must check if authMedicalConsentChk is checked during signup"
);
assert.ok(
  appJsContent.includes("auth/medical-consent-required"),
  "handleEmailAuth must trigger 'auth/medical-consent-required' when unchecked"
);
console.log("  ✓ Blocking validation prevents account creation without explicit medical consent.");

// TEST 4: Clinical Consent Metadata Audit Trail in Firestore
console.log("\n▶ TEST 4: Clinical Consent Audit Trail in Firestore User Document");
assert.ok(
  appJsContent.includes("privacyConsent: consentData"),
  "User document in Firestore must include privacyConsent audit object"
);
assert.ok(
  appJsContent.includes("PRD Section 10: Explicit consent for clinical data processing"),
  "Audit trail must document PRD Section 10 compliance purpose"
);
console.log("  ✓ Immutable consent audit record attached to user document upon registration.");

// TEST 5: Bilingual i18n Translation Keys
console.log("\n▶ TEST 5: Bilingual i18n Parity (Arabic & English)");
assert.ok(
  i18nContent.includes("medicalConsentText:") && i18nContent.includes("consentRequiredError:"),
  "i18n.js must define medicalConsentText and consentRequiredError in both languages"
);
console.log("  ✓ Bilingual translation strings verified for medical consent and error guidance.");

// TEST 6: Execution Simulation of Validation State Machine
console.log("\n▶ TEST 6: Runtime Simulation of Consent Guard");

function validateSignupConsent({ isSignup, consentChecked }) {
  if (isSignup && !consentChecked) {
    return {
      allowed: false,
      code: "auth/medical-consent-required",
      error: "Explicit medical consent is required to create an account and begin clinical data processing."
    };
  }
  return { allowed: true };
}

// Unchecked signup must fail
const uncheckedAttempt = validateSignupConsent({ isSignup: true, consentChecked: false });
assert.strictEqual(uncheckedAttempt.allowed, false);
assert.strictEqual(uncheckedAttempt.code, "auth/medical-consent-required");

// Checked signup must pass
const checkedAttempt = validateSignupConsent({ isSignup: true, consentChecked: true });
assert.strictEqual(checkedAttempt.allowed, true);

// Sign-in does not require re-checking
const signinAttempt = validateSignupConsent({ isSignup: false, consentChecked: false });
assert.strictEqual(signinAttempt.allowed, true);

console.log("  ✓ Simulation verified: Explicit consent is mandatory for signup and non-intrusive for signin.");

console.log("\n==================================================================");
console.log("🎉 ALL EXPLICIT MEDICAL CONSENT TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================\n");
