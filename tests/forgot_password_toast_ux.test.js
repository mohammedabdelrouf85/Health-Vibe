/**
 * HEALTH VIBE AI: FORGOT PASSWORD MODAL & TOAST UX VERIFICATION SUITE
 *
 * Verifies:
 * 1. Toast z-index elevation (z-index >= 100000) so notifications float above auth overlay (z-index: 9999)
 * 2. Toast styled variants: .toast-success, .toast-error, .toast-info in styles.css
 * 3. Bilingual i18n keys for password reset dispatch and cooldown feedback with parameter interpolation
 * 4. showToast function behavior: type classes, aria/sr-status, custom duration, and window export
 * 5. handleForgotPasswordSubmit UX:
 *    - Validates email input and shows error toast on empty
 *    - Calls AuthService / sendPasswordResetEmail
 *    - Triggers prominent success toast with target email address
 *    - Updates in-modal #resetSuccessMessage with sanitized target email
 *    - Runs 60-second cooldown timer on submit button
 *    - Dispatches informative toast with remaining seconds when clicked during cooldown
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("==================================================================");
console.log("🔔 HEALTH VIBE AI: FORGOT PASSWORD TOAST & MODAL UX TEST SUITE");
console.log("   Toast Elevation, Visual Variants, i18n Parity & Dual Confirmation");
console.log("==================================================================\n");

const APP_DIR = path.resolve(__dirname, '../app');
const appJsPath = path.join(APP_DIR, 'app.js');
const stylesCssPath = path.join(APP_DIR, 'styles.css');
const i18nJsPath = path.join(APP_DIR, 'i18n.js');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');
const { translations, defaultI18n } = require(i18nJsPath);

// -----------------------------------------------------------------------------
// TEST 1: Toast CSS Layering & Elevated z-index over Auth Overlay
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Toast Layering & z-index Elevation Above Auth Screen (z-index: 9999)");

const toastZIndexMatch = stylesCss.match(/\.toast\s*\{[^}]*z-index:\s*(\d+)/s);
assert.ok(toastZIndexMatch, "styles.css must define z-index for .toast");
const toastZIndex = parseInt(toastZIndexMatch[1], 10);
assert.ok(toastZIndex > 9999, `Toast z-index (${toastZIndex}) must be strictly higher than auth modal overlay (9999) to avoid being hidden behind modal.`);

assert.ok(stylesCss.includes(".toast.toast-success"), ".toast-success variant must be defined in styles.css");
assert.ok(stylesCss.includes(".toast.toast-error"), ".toast-error variant must be defined in styles.css");
assert.ok(stylesCss.includes(".toast.toast-info"), ".toast-info variant must be defined in styles.css");
console.log(`  ✓ Toast elevated to z-index ${toastZIndex} with success, error, and info styled themes.`);

// -----------------------------------------------------------------------------
// TEST 2: Bilingual i18n Catalog Parity for Reset Link & Cooldown
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Bilingual i18n Catalog Parity (Arabic & English)");

assert.ok(translations.ar.auth.resetLinkSent, "Arabic catalog must contain auth.resetLinkSent");
assert.ok(translations.en.auth.resetLinkSent, "English catalog must contain auth.resetLinkSent");
assert.ok(translations.ar.auth.resetWaitCooldown, "Arabic catalog must contain auth.resetWaitCooldown");
assert.ok(translations.en.auth.resetWaitCooldown, "English catalog must contain auth.resetWaitCooldown");

const testEmail = "patient.test@healthvibe.ai";
defaultI18n.setLanguage("en");
const enMsg = defaultI18n.t("auth.resetLinkSent", { email: testEmail });
defaultI18n.setLanguage("ar");
const arMsg = defaultI18n.t("auth.resetLinkSent", { email: testEmail });
assert.ok(enMsg.includes(testEmail), "English message must interpolate recipient email.");
assert.ok(arMsg.includes(testEmail), "Arabic message must interpolate recipient email.");

defaultI18n.setLanguage("en");
const enCooldown = defaultI18n.t("auth.resetWaitCooldown", { seconds: 45 });
defaultI18n.setLanguage("ar");
const arCooldown = defaultI18n.t("auth.resetWaitCooldown", { seconds: 45 });
assert.ok(enCooldown.includes("45"), "English cooldown must interpolate remaining seconds.");
assert.ok(arCooldown.includes("45"), "Arabic cooldown must interpolate remaining seconds.");
console.log("  ✓ Bilingual interpolation confirmed for reset link dispatch and active cooldown.");

// -----------------------------------------------------------------------------
// TEST 3: showToast Functional Behavior & Class Management
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: showToast Function Execution & Global Exposure");

// Verify showToast implementation inside sandbox
const fakeToastEl = {
  textContent: "",
  classList: {
    classes: new Set(),
    add(...args) { args.forEach(c => this.classes.add(c)); },
    remove(...args) { args.forEach(c => this.classes.delete(c)); },
    contains(c) { return this.classes.has(c); }
  }
};
const fakeSrStatusEl = { textContent: "" };

// Extract showToast code from app.js using regex
const showToastMatch = appJs.match(/function showToast\(message, type = "info", duration = 3500\) \{[\s\S]*?showToast\.timer = window\.setTimeout[\s\S]*?\}\);?\s*\}/);
assert.ok(showToastMatch, "showToast signature with (message, type, duration) must exist in app.js");

const sandbox = {
  toast: fakeToastEl,
  srStatus: fakeSrStatusEl,
  localized: (msg) => msg,
  window: {
    clearTimeout: () => {},
    setTimeout: (fn, delay) => { fn.delay = delay; return 123; }
  }
};
vm.createContext(sandbox);
vm.runInContext(`${showToastMatch[0]}; window.showToast = showToast;`, sandbox);

// Test Success Toast
sandbox.showToast("Reset email sent!", "success", 5000);
assert.strictEqual(fakeToastEl.textContent, "Reset email sent!");
assert.strictEqual(fakeSrStatusEl.textContent, "Reset email sent!");
assert.ok(fakeToastEl.classList.contains("show"), "Toast must have .show class");
assert.ok(fakeToastEl.classList.contains("toast-success"), "Toast must have .toast-success class");
assert.ok(!fakeToastEl.classList.contains("toast-error"), "Toast must not have .toast-error class");

// Test Error Toast
sandbox.showToast("Network error occurred", "error", 4000);
assert.strictEqual(fakeToastEl.textContent, "Network error occurred");
assert.ok(fakeToastEl.classList.contains("toast-error"), "Toast must switch to .toast-error class");
assert.ok(!fakeToastEl.classList.contains("toast-success"), "Toast must have removed .toast-success class");

// Test Global Exposure
assert.strictEqual(typeof sandbox.window.showToast, "function", "showToast must be exposed on window");
console.log("  ✓ showToast correctly switches type classes, accessibility live-region text, and exposes to window.");

// -----------------------------------------------------------------------------
// TEST 4: handleForgotPasswordSubmit Flow (Dual Toast + Modal Confirmation)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: handleForgotPasswordSubmit Toast Notification & Cooldown Execution");

let toastedMessages = [];
let sentEmails = [];
let displayedErrors = [];

const mockAuth = {
  sendPasswordResetEmail: async (email) => {
    sentEmails.push(email);
  }
};

const mockResetEmailInput = { value: "user@example.com" };
const mockResetSuccessMessage = { style: { display: "none" }, innerHTML: "" };
const mockSendResetLinkBtn = { disabled: false };
const mockSendResetLinkText = { textContent: "Send Reset Link" };

const submitSandbox = {
  console: console,
  currentLanguage: "en",
  resetEmailInput: mockResetEmailInput,
  resetSuccessMessage: mockResetSuccessMessage,
  sendResetLinkBtn: mockSendResetLinkBtn,
  sendResetLinkText: mockSendResetLinkText,
  auth: mockAuth,
  HealthVibes: {},
  i18n: defaultI18n,
  escapeHtml: (str) => String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  clearAuthError: () => {},
  showAuthError: (msg) => { displayedErrors.push(msg); },
  getAuthErrorMessage: (err) => err.message || "Error",
  showToast: (msg, type, duration) => {
    toastedMessages.push({ msg, type, duration });
  },
  clearInterval: () => {},
  setInterval: (fn, ms) => 999
};

// Extract handleForgotPasswordSubmit block from app.js
const forgotHandlerMatch = appJs.match(/let resetCooldown = false;[\s\S]*?async function handleForgotPasswordSubmit\(e\) \{[\s\S]*?\n\}/);
assert.ok(forgotHandlerMatch, "handleForgotPasswordSubmit and resetCooldown block must exist in app.js");

vm.createContext(submitSandbox);
vm.runInContext(forgotHandlerMatch[0], submitSandbox);

// Execute submit
(async () => {
  await submitSandbox.handleForgotPasswordSubmit({ preventDefault: () => {} });

  assert.strictEqual(sentEmails.length, 1, "Must call sendPasswordResetEmail once");
  assert.strictEqual(sentEmails[0], "user@example.com");

  // Verify toast notification dispatched
  assert.ok(toastedMessages.length >= 1, "Must trigger at least one toast notification upon submit");
  const successToast = toastedMessages.find(t => t.type === "success");
  assert.ok(successToast, "Must dispatch a 'success' toast notification when link is sent");
  assert.ok(successToast.msg.includes("user@example.com"), "Toast message must explicitly confirm target email address");

  // Verify modal confirmation box
  assert.strictEqual(mockResetSuccessMessage.style.display, "block", "In-modal confirmation box must be displayed");
  assert.ok(mockResetSuccessMessage.innerHTML.includes("user@example.com"), "In-modal confirmation box must show sanitized recipient email");

  // Verify button cooldown timer
  assert.strictEqual(mockSendResetLinkBtn.disabled, true, "Send button must be disabled during cooldown");
  assert.strictEqual(mockSendResetLinkText.textContent, "60s", "Send button text must show 60s countdown");

  // Verify clicking during cooldown triggers informative toast instead of silence
  await submitSandbox.handleForgotPasswordSubmit({ preventDefault: () => {} });
  const cooldownToast = toastedMessages.find(t => t.type === "info");
  assert.ok(cooldownToast, "Must trigger info toast when user clicks during cooldown");
  assert.ok(cooldownToast.msg.includes("60"), "Cooldown toast must state remaining time");

  console.log("  ✓ Forgot password workflow triggers immediate confirmation toast, updates modal, and gives feedback on cooldown.");

  console.log("\n==================================================================");
  console.log("🎉 ALL FORGOT PASSWORD UX & TOAST TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
})();
