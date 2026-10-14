/**
 * Health Vibe AI - Auth Loading & Submission Integrity Test Suite
 *
 * Verifies:
 * 1. Infinite loading prevention on Sign In and Create Account forms.
 * 2. Robust try/catch/finally wrapping around all network/auth operations.
 * 3. Finally block resets submit button from "Please wait..." back to idle.
 * 4. Finally block re-enables all disabled form inputs and action controls.
 * 5. Failure displays localized error banners with category, icon, title, message, and action.
 * 6. Success redirects user and transitions to app without leaving hanging loaders.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🔐 HEALTH VIBE AI: AUTH FORM & INFINITE LOADING TEST SUITE");
console.log("==================================================================\n");

// 1. Verify app/modules/auth/auth-ui.js
console.log("▶ TEST 1: Inspecting app/modules/auth/auth-ui.js");
const authUiPath = path.resolve(__dirname, "../app/modules/auth/auth-ui.js");
const authUiContent = fs.readFileSync(authUiPath, "utf8");

assert(authUiContent.includes("function setAuthLoading(loading)"), "auth-ui.js must define setAuthLoading");
assert(authUiContent.includes("aria-busy"), "auth-ui.js must toggle aria-busy attribute");
assert(authUiContent.includes("Please wait..."), "auth-ui.js must support English Please wait... text");
assert(authUiContent.includes("يرجى الانتظار..."), "auth-ui.js must support Arabic Please wait text");
assert(authUiContent.includes("submitBtn.disabled = isLoading"), "auth-ui.js must set submitBtn.disabled");
assert(authUiContent.includes("authEmail"), "auth-ui.js must toggle input disabled states");
assert(authUiContent.includes("handleAuthSubmit"), "auth-ui.js must implement handleAuthSubmit");
assert(authUiContent.includes("try {"), "handleAuthSubmit must have try block");
assert(authUiContent.includes("} catch ("), "handleAuthSubmit must have catch block");
assert(authUiContent.includes("} finally {"), "handleAuthSubmit must have finally block");
assert(authUiContent.includes("setAuthLoading(false)"), "finally block must reset loading state via setAuthLoading(false)");
console.log("  ✓ auth-ui.js implements complete try/catch/finally, input toggle, and idle reset.");

// 2. Verify app/app.js
console.log("\n▶ TEST 2: Inspecting app/app.js");
const appJsPath = path.resolve(__dirname, "../app/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");

assert(appJsContent.includes("function setAuthLoading(loading)"), "app.js must define setAuthLoading");
assert(appJsContent.includes("authSubmitBtn.disabled = isLoading"), "app.js must toggle authSubmitBtn.disabled");
assert(appJsContent.includes("authSubmitText.textContent = isEn ? \"Please wait...\" : \"يرجى الانتظار...\""), "app.js must set loading text");
assert(appJsContent.includes("authSubmitText.textContent = isSignUp"), "app.js must restore idle text");
assert(appJsContent.includes("async function handleEmailAuth(e)"), "app.js must define handleEmailAuth");

// Check try/catch/finally in handleEmailAuth
const handleEmailAuthStart = appJsContent.indexOf("async function handleEmailAuth(e)");
assert(handleEmailAuthStart !== -1, "handleEmailAuth must exist");
const handleEmailAuthBlock = appJsContent.slice(handleEmailAuthStart, handleEmailAuthStart + 12000);

assert(handleEmailAuthBlock.includes("setAuthLoading(true);"), "handleEmailAuth must start with setAuthLoading(true)");
assert(handleEmailAuthBlock.includes("try {"), "handleEmailAuth must have try block");
assert(handleEmailAuthBlock.includes("} catch (error) {"), "handleEmailAuth must have catch block");
assert(handleEmailAuthBlock.includes("showAuthError(error);"), "handleEmailAuth must pass error to showAuthError");
assert(handleEmailAuthBlock.includes("} finally {"), "handleEmailAuth must have finally block");
assert(handleEmailAuthBlock.includes("setAuthLoading(false);"), "handleEmailAuth finally block must call setAuthLoading(false)");
assert(handleEmailAuthBlock.includes("transitionToApp(user);"), "handleEmailAuth must properly transition/redirect user");
console.log("  ✓ app.js wraps handleEmailAuth in robust try/catch/finally with localized error banner and redirect.");

// 3. Functional Simulation in a DOM-like environment
console.log("\n▶ TEST 3: Simulating DOM State Transitions & Error Recovery");

function createMockDom() {
  const elements = {};
  function makeEl(id, tagName = "div") {
    elements[id] = {
      id,
      tagName,
      value: "",
      textContent: "",
      disabled: false,
      style: { display: "none" },
      innerHTML: "",
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      querySelectorAll() { return []; },
      scrollIntoView() {}
    };
    return elements[id];
  }

  [
    "authSubmitBtn",
    "authSubmitText",
    "authEmail",
    "authPassword",
    "authName",
    "rememberMe",
    "googleLogin",
    "authTabSignIn",
    "authTabSignUp",
    "forgotPasswordBtn",
    "authErrorBanner",
    "authEmailForm"
  ].forEach(id => makeEl(id));

  return {
    elements,
    getElementById: (id) => elements[id] || null
  };
}

const mockDom = createMockDom();
global.document = mockDom;
global.currentLanguage = "en";

// Test loading simulation on AuthUI
const authUiModule = require("../app/modules/auth/auth-ui.js");

// Set to Sign In mode
authUiModule.setAuthMode("signin");
assert.equal(authUiModule.getMode(), "signin");

// Simulate loading start
authUiModule.setAuthLoading(true);
assert.equal(mockDom.elements.authSubmitBtn.disabled, true, "Submit button must be disabled when loading");
assert.equal(mockDom.elements.authSubmitBtn.getAttribute("aria-busy"), "true", "Submit button must have aria-busy=true");
assert.equal(mockDom.elements.authSubmitText.textContent, "Please wait...", "Submit text must be 'Please wait...'");
assert.equal(mockDom.elements.authEmail.disabled, true, "Email input must be disabled during load");
assert.equal(mockDom.elements.authPassword.disabled, true, "Password input must be disabled during load");
assert.equal(mockDom.elements.googleLogin.disabled, true, "Google login must be disabled during load");

// Simulate finally block reset
authUiModule.setAuthLoading(false);
assert.equal(mockDom.elements.authSubmitBtn.disabled, false, "Submit button must be enabled after reset");
assert.equal(mockDom.elements.authSubmitBtn.getAttribute("aria-busy"), undefined, "Submit button must remove aria-busy");
assert.equal(mockDom.elements.authSubmitText.textContent, "Sign In", "Submit text must reset to 'Sign In' idle state");
assert.equal(mockDom.elements.authEmail.disabled, false, "Email input must be re-enabled after reset");
assert.equal(mockDom.elements.authPassword.disabled, false, "Password input must be re-enabled after reset");
assert.equal(mockDom.elements.googleLogin.disabled, false, "Google login must be re-enabled after reset");

console.log("  ✓ Sign In idle state reset and re-enabling inputs verified.");

// Test in Create Account mode
authUiModule.setAuthMode("signup");
assert.equal(authUiModule.getMode(), "signup");

authUiModule.setAuthLoading(true);
assert.equal(mockDom.elements.authSubmitBtn.disabled, true);
assert.equal(mockDom.elements.authSubmitText.textContent, "Please wait...");

authUiModule.setAuthLoading(false);
assert.equal(mockDom.elements.authSubmitBtn.disabled, false);
assert.equal(mockDom.elements.authSubmitText.textContent, "Create Account", "Submit text must reset to 'Create Account' in signup mode");

console.log("  ✓ Create Account idle state reset and re-enabling inputs verified.");

// Test Arabic Localization
global.currentLanguage = "ar";
authUiModule.setAuthLoading(true);
assert.equal(mockDom.elements.authSubmitText.textContent, "يرجى الانتظار...", "Arabic submit text must be 'يرجى الانتظار...'");

authUiModule.setAuthLoading(false);
assert.equal(mockDom.elements.authSubmitText.textContent, "إنشاء حساب", "Arabic submit text must reset to 'إنشاء حساب'");

// Error banner verification
const friendlyErr = authUiModule.showAuthError({
  code: "auth/invalid-credential",
  message: "Invalid login credentials"
});
assert(mockDom.elements.authErrorBanner.style.display !== "none", "Error banner must be visible on failure");
assert(mockDom.elements.authErrorBanner.innerHTML.includes("بيانات تسجيل الدخول غير صحيحة") || mockDom.elements.authErrorBanner.innerHTML.includes("المصادقة"), "Error banner must render localized error");

authUiModule.clearAuthError();
assert.equal(mockDom.elements.authErrorBanner.style.display, "none", "clearAuthError must hide error banner");

console.log("  ✓ Localized error banner display and clearing verified.");

console.log("\n==================================================================");
console.log("🎉 ALL AUTH LOADING & INTEGRITY TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================");
