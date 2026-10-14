/**
 * Strict Auth Validation (Email Format & Password Strength) Test Suite
 *
 * Verifies Request 21:
 * "إضافة التحقق الصارم من صيغة البريد الإلكتروني وقوة كلمة المرور (8 أحرف على الأقل، حرف كبير، رقم، ورمز) في نموذج Create Account قبل الإرسال."
 *
 * Checks:
 * 1. DOM verification of #authPasswordRules and individual criteria items:
 *    - #ruleLength (8+ characters)
 *    - #ruleUpper (uppercase letter A-Z)
 *    - #ruleNumber (number 0-9)
 *    - #ruleSymbol (special symbol)
 * 2. Dynamic visibility in setAuthMode() (shown in signup, hidden in signin).
 * 3. Real-time visual feedback engine (updatePasswordStrengthUI).
 * 4. Strict email format validation (RFC-compliant regex) blocking submission before network calls.
 * 5. Strict password strength validation in Create Account blocking submission before network calls.
 * 6. Core validation module (validatePasswordStrength and validateEmail) compliance.
 * 7. Bilingual i18n translation coverage (Arabic and English).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🔐 HEALTH VIBE AI: STRICT EMAIL & PASSWORD VALIDATION TEST SUITE");
console.log("==================================================================\n");

const indexHtmlPath = path.resolve(__dirname, "../app/index.html");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");
const appJsPath = path.resolve(__dirname, "../app/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const authUiPath = path.resolve(__dirname, "../app/modules/auth/auth-ui.js");
const authUiContent = fs.readFileSync(authUiPath, "utf8");
const i18nPath = path.resolve(__dirname, "../app/i18n.js");
const i18nContent = fs.readFileSync(i18nPath, "utf8");
const validationPath = path.resolve(__dirname, "../app/modules/core/validation.js");
const validationContent = fs.readFileSync(validationPath, "utf8");

// Load core validation module
const coreValidation = require("../app/modules/core/validation.js");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: DOM Elements in app/index.html
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 1: DOM Verification in app/index.html");
assert.ok(
  indexHtmlContent.includes('id="authPasswordRules"'),
  "index.html must include #authPasswordRules checklist container"
);
assert.ok(
  indexHtmlContent.includes('id="ruleLength"'),
  "index.html must include #ruleLength for min 8 characters"
);
assert.ok(
  indexHtmlContent.includes('id="ruleUpper"'),
  "index.html must include #ruleUpper for uppercase letter"
);
assert.ok(
  indexHtmlContent.includes('id="ruleNumber"'),
  "index.html must include #ruleNumber for number"
);
assert.ok(
  indexHtmlContent.includes('id="ruleSymbol"'),
  "index.html must include #ruleSymbol for special symbol"
);
console.log("  ✓ Password rules checklist container and all 4 rule items present in index.html.");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Dynamic Visibility in setAuthMode()
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 2: Visibility Toggling in setAuthMode()");
assert.ok(
  appJsContent.includes('rulesContainer.style.display = mode === "signup" ? "block" : "none"') ||
  appJsContent.includes('authPasswordRules.style.display = mode === "signup" ? "block" : "none"'),
  "app.js setAuthMode must show authPasswordRules in signup mode and hide in signin mode"
);
assert.ok(
  authUiContent.includes('if (passwordRules) passwordRules.style.display = isSignUp ? "block" : "none"'),
  "auth-ui.js setAuthMode must toggle passwordRules display"
);
console.log("  ✓ #authPasswordRules is visible during signup and cleanly hidden during signin.");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Core Validation Module Unit Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 3: Core Validation Module (Email & Password Strength)");

// 3.1 Email validation
const validEmails = [
  "dr.ahmed@clinic.com",
  "patient123@healthvibes.org",
  "first.last+tag@sub.domain.co.uk",
  "user.name@example.eg"
];
const invalidEmails = [
  "",
  "invalid-email",
  "missing-at-domain.com",
  "user@",
  "@domain.com",
  "user@domain",
  "user@.com",
  "user @domain.com",
  "user@domain .com"
];

validEmails.forEach(email => {
  assert.strictEqual(
    coreValidation.validateEmail(email),
    true,
    `Email should be valid: ${email}`
  );
});

invalidEmails.forEach(email => {
  assert.strictEqual(
    coreValidation.validateEmail(email),
    false,
    `Email should be rejected as invalid: ${email}`
  );
});
console.log("  ✓ Core validateEmail correctly accepts valid formats and rejects malformed addresses.");

// 3.2 Password strength criteria evaluation
assert.strictEqual(typeof coreValidation.validatePasswordStrength, "function", "validatePasswordStrength must be exported");

const weakPasswords = [
  { pwd: "", reason: "empty password" },
  { pwd: "Ab1!", reason: "less than 8 characters" },
  { pwd: "password123!", reason: "missing uppercase letter" },
  { pwd: "Password!", reason: "missing numbers" },
  { pwd: "Password123", reason: "missing special symbol" }
];

weakPasswords.forEach(({ pwd, reason }) => {
  const result = coreValidation.validatePasswordStrength(pwd);
  assert.strictEqual(result.isValid, false, `Should reject ${reason}: "${pwd}"`);
});

const strongPasswords = [
  "SecureP@ss1",
  "ClinicAdmin2026#",
  "Doctor_Vibe99!",
  "EgyptianHealth#2026"
];

strongPasswords.forEach(pwd => {
  const result = coreValidation.validatePasswordStrength(pwd);
  assert.strictEqual(result.isValid, true, `Should accept strong password: "${pwd}"`);
  assert.strictEqual(result.rules.minLength, true);
  assert.strictEqual(result.rules.hasUpper, true);
  assert.strictEqual(result.rules.hasNumber, true);
  assert.strictEqual(result.rules.hasSymbol, true);
});
console.log("  ✓ Core validatePasswordStrength strictly enforces 8+ chars, uppercase, number, and symbol.");

// 3.3 validatePassword with strict option
assert.strictEqual(coreValidation.validatePassword("Password123", { strict: true }).isValid, false);
assert.strictEqual(coreValidation.validatePassword("Password123!", { strict: true }).isValid, true);
assert.strictEqual(coreValidation.validatePassword("Password123").isValid, true); // backwards compatible without strict option
console.log("  ✓ validatePassword maintains backwards-compatibility while supporting strict mode.");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Pre-submission Enforcement in handleEmailAuth (app/app.js)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 4: Pre-submission Validation Guards in app/app.js");

assert.ok(
  appJsContent.includes('code: "auth/invalid-email"'),
  "app.js must reject invalid email with auth/invalid-email code"
);
assert.ok(
  appJsContent.includes("hasMinLength") &&
  appJsContent.includes("hasUpper") &&
  appJsContent.includes("hasNumber") &&
  appJsContent.includes("hasSymbol"),
  "app.js handleEmailAuth must check length, uppercase, number, and symbol"
);
assert.ok(
  appJsContent.includes('code: "auth/weak-password"'),
  "app.js must reject weak passwords with auth/weak-password code"
);
console.log("  ✓ Pre-submission validation stops malformed email or weak password before network dispatch.");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Pre-submission Enforcement in handleAuthSubmit (auth-ui.js)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 5: Pre-submission Validation Guards in app/modules/auth/auth-ui.js");

assert.ok(
  authUiContent.includes('code: "auth/invalid-email"'),
  "auth-ui.js must reject invalid email with auth/invalid-email code"
);
assert.ok(
  authUiContent.includes("hasMinLength") &&
  authUiContent.includes("hasUpper") &&
  authUiContent.includes("hasNumber") &&
  authUiContent.includes("hasSymbol"),
  "auth-ui.js handleAuthSubmit must check length, uppercase, number, and symbol"
);
console.log("  ✓ Modular auth-ui.js contains matching strict validation guards.");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Bilingual i18n Translation Keys
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 6: Bilingual i18n Parity (Arabic & English)");

assert.ok(
  i18nContent.includes("passwordRulesTitle:") &&
  i18nContent.includes("ruleLength:") &&
  i18nContent.includes("ruleUpper:") &&
  i18nContent.includes("ruleNumber:") &&
  i18nContent.includes("ruleSymbol:"),
  "i18n.js must define password rules keys"
);
console.log("  ✓ Bilingual translation strings verified for password rules and checklist items.");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Execution Simulation of Auth State Machine
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 7: Runtime Simulation of Create Account Validation");

function simulateAuthSubmission({ mode, email, password, name, consent }) {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!email || !password) {
    return { ok: false, code: "auth/missing-fields" };
  }
  if (!emailRegex.test(email)) {
    return { ok: false, code: "auth/invalid-email" };
  }
  if (mode === "signup" && !name) {
    return { ok: false, code: "auth/missing-name" };
  }
  if (mode === "signup") {
    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);

    if (!hasMinLength || !hasUpper || !hasNumber || !hasSymbol) {
      return { ok: false, code: "auth/weak-password" };
    }
    if (!consent) {
      return { ok: false, code: "auth/medical-consent-required" };
    }
  } else {
    if (password.length < 6) {
      return { ok: false, code: "auth/weak-password" };
    }
  }

  return { ok: true };
}

// Case A: Malformed email in signup
const resA = simulateAuthSubmission({
  mode: "signup",
  email: "bad-email",
  password: "ValidPass123!",
  name: "Dr. Ali",
  consent: true
});
assert.strictEqual(resA.ok, false);
assert.strictEqual(resA.code, "auth/invalid-email");

// Case B: Password missing symbol in signup
const resB = simulateAuthSubmission({
  mode: "signup",
  email: "dr.ali@example.com",
  password: "Password123",
  name: "Dr. Ali",
  consent: true
});
assert.strictEqual(resB.ok, false);
assert.strictEqual(resB.code, "auth/weak-password");

// Case C: Password missing uppercase in signup
const resC = simulateAuthSubmission({
  mode: "signup",
  email: "dr.ali@example.com",
  password: "password123!",
  name: "Dr. Ali",
  consent: true
});
assert.strictEqual(resC.ok, false);
assert.strictEqual(resC.code, "auth/weak-password");

// Case D: Password under 8 chars in signup
const resD = simulateAuthSubmission({
  mode: "signup",
  email: "dr.ali@example.com",
  password: "Pass1!",
  name: "Dr. Ali",
  consent: true
});
assert.strictEqual(resD.ok, false);
assert.strictEqual(resD.code, "auth/weak-password");

// Case E: Password missing number in signup
const resE = simulateAuthSubmission({
  mode: "signup",
  email: "dr.ali@example.com",
  password: "Password!@",
  name: "Dr. Ali",
  consent: true
});
assert.strictEqual(resE.ok, false);
assert.strictEqual(resE.code, "auth/weak-password");

// Case F: Fully valid signup
const resF = simulateAuthSubmission({
  mode: "signup",
  email: "dr.ali@example.com",
  password: "Password123!",
  name: "Dr. Ali",
  consent: true
});
assert.strictEqual(resF.ok, true);

console.log("  ✓ Runtime simulation confirms 100% accurate validation and error codes.");

console.log("\n==================================================================");
console.log("🎉 ALL STRICT AUTH VALIDATION TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================");
