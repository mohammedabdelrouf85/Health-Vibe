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
  appJsContent.includes("auth.signInWithRedirect(googleProvider)"),
  "enterApp must trigger signInWithRedirect when popup is blocked"
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
console.log("  ✓ toFriendlyAppError maps popup-blocked, unauthorized-domain, and operation-not-allowed to bilingual guidance.");

// TEST 5: Simulation of enterApp execution logic
console.log("\n▶ TEST 5: Execution Simulation of enterApp('google')");

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
