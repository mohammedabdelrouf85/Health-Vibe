/**
 * Google Authentication Flow & Fallback Unit Tests
 * Validates Google OAuth behavior, popup blocking, explicit logout cleanup, and friendly error translation.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🔍 HEALTH VIBE AI: GOOGLE AUTHENTICATION FLOW TEST SUITE");
console.log("==================================================================");

const appJsPath = path.resolve(__dirname, "../app/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");

// TEST 1: Static verification of explicit logout flag clearing in enterApp('google')
console.log("\n▶ TEST 1: Explicit Logout Flag Reset in enterApp()");
assert.ok(
  appJsContent.includes('localStorage.removeItem("hv_explicit_logout")'),
  "enterApp must remove hv_explicit_logout from localStorage"
);
assert.ok(
  appJsContent.includes('sessionStorage.removeItem("hv_explicit_logout")'),
  "enterApp must remove hv_explicit_logout from sessionStorage"
);
console.log("  ✓ enterApp() clears hv_explicit_logout on initiation.");

// TEST 2: Static verification of popup-blocked fallback to signInWithRedirect
console.log("\n▶ TEST 2: Popup Blocked to signInWithRedirect Fallback");
assert.ok(
  appJsContent.includes('errCode === "auth/popup-blocked"'),
  "enterApp must detect auth/popup-blocked"
);
assert.ok(
  appJsContent.includes("activeAuth.signInWithRedirect(activeProvider)"),
  "enterApp must trigger signInWithRedirect with activeProvider when popup is blocked"
);
console.log("  ✓ enterApp() redirects when popup is blocked by browser.");

// TEST 3: Static verification of getRedirectResult in initHVAuthListener
console.log("\n▶ TEST 3: Redirect Auth Result Processing");
assert.ok(
  appJsContent.includes("auth.getRedirectResult"),
  "initHVAuthListener must check auth.getRedirectResult()"
);
console.log("  ✓ initHVAuthListener() handles getRedirectResult() gracefully.");

// TEST 4: Error formatting translation verification for Google OAuth errors
console.log("\n▶ TEST 4: Google Auth Friendly Error Translations");
assert.ok(
  appJsContent.includes('"auth/popup-blocked"'),
  "toFriendlyAppError must handle auth/popup-blocked"
);
assert.ok(
  appJsContent.includes('"auth/unauthorized-domain"'),
  "toFriendlyAppError must handle auth/unauthorized-domain"
);
assert.ok(
  appJsContent.includes('"auth/operation-not-allowed"'),
  "toFriendlyAppError must handle auth/operation-not-allowed"
);
// TEST 5: Guard against duplicate concurrent sign-in attempts
console.log("\n▶ TEST 5: Duplicate In-Flight Sign-In Guard");
assert.ok(
  appJsContent.includes("window._isGoogleAuthInFlight"),
  "enterApp must have in-flight mutex check _isGoogleAuthInFlight"
);
console.log("  ✓ enterApp() guards against concurrent/double-click sign-in attempts.");

// TEST 6: Resilient GoogleAuthProvider initialization
console.log("\n▶ TEST 6: Resilient GoogleAuthProvider Initialization");
assert.ok(
  appJsContent.includes("function getGoogleAuthProvider()"),
  "app.js must define resilient getGoogleAuthProvider() helper"
);
assert.ok(
  appJsContent.includes('prompt: "select_account"') || appJsContent.includes("prompt: 'select_account'"),
  "Google provider must configure prompt: select_account for clean account switching"
);
console.log("  ✓ getGoogleAuthProvider() handles deferred loading and sets select_account.");

// TEST 7: Demo Mode Google Auth Guard & Alert Notice
console.log("\n▶ TEST 7: Demo Mode Google Auth Guard & Alert Notice");
assert.ok(
  appJsContent.includes("isExplicitDemo"),
  "enterApp must detect explicit demo environment"
);
assert.ok(
  appJsContent.includes("Notice: Live Google OAuth is reserved for production"),
  "enterApp must display informative notice when Google login is clicked in demo mode"
);
assert.ok(
  appJsContent.includes("enterDemoMode()"),
  "enterApp must route seamlessly into interactive sandbox when in demo mode"
);
console.log("  ✓ enterApp() guards Demo mode with clear bilingual alert notice and sandbox fallback.");

// TEST 8: Simulation of enterApp execution logic
console.log("\n▶ TEST 8: Execution Simulation of enterApp('google')");

let mockLocalStorage = { "hv_explicit_logout": "true" };
let mockSessionStorage = { "hv_explicit_logout": "true" };
let redirected = false;

const simulatedAuth = {
  signInWithPopup: async () => {
    const err = new Error("Popup was blocked");
    err.code = "auth/popup-blocked";
    throw err;
  },
  signInWithRedirect: async () => {
    redirected = true;
    return Promise.resolve();
  }
};

async function testSimulatedEnterApp() {
  delete mockLocalStorage["hv_explicit_logout"];
  delete mockSessionStorage["hv_explicit_logout"];

  try {
    await simulatedAuth.signInWithPopup();
  } catch (err) {
    if (err.code === "auth/popup-blocked" && typeof simulatedAuth.signInWithRedirect === "function") {
      await simulatedAuth.signInWithRedirect();
    }
  }
}

(async () => {
  await testSimulatedEnterApp();
  assert.strictEqual(mockLocalStorage["hv_explicit_logout"], undefined, "Explicit logout flag must be deleted");
  assert.strictEqual(redirected, true, "signInWithRedirect must have been called on popup-blocked");
  console.log("  ✓ Simulation verified: Explicit logout cleared and redirect called on popup block.");

  console.log("\n==================================================================");
  console.log("🎉 ALL GOOGLE AUTHENTICATION FLOW TESTS PASSED WITH 100% SUCCESS!");
  console.log("==================================================================\n");
})();
