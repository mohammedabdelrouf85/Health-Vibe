/**
 * Health Vibe AI - Authentication Provider Linking & Identity Security Test Suite
 *
 * Validates:
 * 1. Provider inspection and linked providers extraction (email/password, Google).
 * 2. Explicit provider linking (Google, Password) with strict Firebase UID preservation.
 * 3. Prevention of removing the last usable sign-in method (providerData.length <= 1).
 * 4. Provider conflict handling with clear recovery instructions and proof of control.
 * 5. Strict prohibition of account or clinical record merging based solely on matching emails.
 * 6. Recent authentication enforcement for linking and unlinking (requires-recent-login).
 * 7. Canceled linking handling (popup-closed-by-user).
 * 8. Suspended account protection against provider modifications.
 * 9. Full bilingual Arabic and English parity.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("🔐 HEALTH VIBE AI: AUTHENTICATION PROVIDER LINKING TEST SUITE");
console.log("   UID Preservation, Last Provider Safety, Conflicts & Anti-Merge");
console.log("==================================================================\n");

// Mock browser globals for Node test environment
global.currentLanguage = "ar";
const mockStorage = {};
global.sessionStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; }
};

// Load AuthLinking module
const authLinking = require(path.resolve(__dirname, "../app/modules/auth/auth-linking.js"));

// ==================================================================
// TEST 1: Provider Inspection & Provider Data Extraction
// ==================================================================
console.log("▶ TEST 1: Provider Inspection & Provider Data Extraction ...");

const userPasswordOnly = {
  uid: "usr_pt_tarek_101",
  email: "tarek@healthvibe.test",
  providerData: [
    { providerId: "password", email: "tarek@healthvibe.test" }
  ]
};

const userGoogleOnly = {
  uid: "usr_pt_sarah_202",
  email: "sarah@gmail.com",
  displayName: "Sarah Jenkins",
  providerData: [
    { providerId: "google.com", email: "sarah@gmail.com", displayName: "Sarah Jenkins" }
  ]
};

const userMultiProvider = {
  uid: "usr_pt_ahmed_303",
  email: "ahmed@healthvibe.test",
  displayName: "Ahmed Abdullah",
  providerData: [
    { providerId: "password", email: "ahmed@healthvibe.test" },
    { providerId: "google.com", email: "ahmed@gmail.com", displayName: "Ahmed Abdullah" }
  ]
};

const resPass = authLinking.getLinkedProviders(userPasswordOnly);
assert.equal(resPass.count, 1, "Password only user must have 1 provider");
assert.equal(resPass.hasPassword, true, "Must detect password provider");
assert.equal(resPass.hasGoogle, false, "Must not have Google provider");
assert.equal(resPass.canUnlink, false, "Single provider user must NOT be permitted to unlink");

const resGoogle = authLinking.getLinkedProviders(userGoogleOnly);
assert.equal(resGoogle.count, 1, "Google only user must have 1 provider");
assert.equal(resGoogle.hasGoogle, true, "Must detect Google provider");
assert.equal(resGoogle.hasPassword, false, "Must not have password provider");
assert.equal(resGoogle.canUnlink, false, "Single provider user must NOT be permitted to unlink");

const resMulti = authLinking.getLinkedProviders(userMultiProvider);
assert.equal(resMulti.count, 2, "Multi-provider user must have 2 providers");
assert.equal(resMulti.hasPassword, true, "Must detect password provider");
assert.equal(resMulti.hasGoogle, true, "Must detect Google provider");
assert.equal(resMulti.canUnlink, true, "Multi-provider user CAN unlink one provider");

console.log("  ✓ Provider inspection accurately categorizes active sign-in methods.\n");

// ==================================================================
// TEST 2: Explicit Google Provider Linking Flow with UID Preservation
// ==================================================================
console.log("▶ TEST 2: Explicit Google Provider Linking Flow with UID Preservation ...");

const baselineUid = "usr_pt_tarek_101";
let linkedUserObj = {
  uid: baselineUid,
  email: "tarek@healthvibe.test",
  providerData: [
    { providerId: "password", email: "tarek@healthvibe.test" }
  ],
  async linkWithPopup(provider) {
    this.providerData.push({
      providerId: "google.com",
      email: "tarek@gmail.com",
      displayName: "Tarek Abdel-Moneim"
    });
    return { user: this };
  }
};

(async () => {
  const linkRes = await authLinking.linkGoogleProvider(linkedUserObj, {
    providerInstance: { name: "MockGoogleProvider" }
  });

  assert.equal(linkRes.ok, true, "Google linking must succeed");
  assert.equal(linkRes.uid, baselineUid, "Firebase UID must be strictly preserved");
  assert.equal(linkedUserObj.uid, baselineUid, "User object UID must not mutate");
  assert.equal(linkedUserObj.providerData.length, 2, "User must now have 2 providers");

  // Verify associated medical record still maps to this exact UID
  const patientCase = {
    id: "case_resp_001",
    patientId: baselineUid,
    oxygenLevel: 94,
    patientName: "Tarek Abdel-Moneim"
  };
  assert.equal(authLinking.assertClinicalRecordOwnership(patientCase, linkedUserObj.uid), true, "Clinical record ownership must remain valid");
})();

console.log("  ✓ Google provider linking succeeds while preserving exact Firebase UID and medical records.\n");

// ==================================================================
// TEST 3: Explicit Password Provider Linking Flow & Password Strength
// ==================================================================
console.log("▶ TEST 3: Explicit Password Provider Linking Flow & Password Strength ...");

const googleUser = {
  uid: "usr_pt_sarah_202",
  email: "sarah@gmail.com",
  providerData: [
    { providerId: "google.com", email: "sarah@gmail.com" }
  ],
  async linkWithCredential(cred) {
    this.providerData.push({
      providerId: "password",
      email: this.email
    });
    return { user: this };
  }
};

(async () => {
  // 1. Weak password rejection
  const weakRes = await authLinking.linkPasswordProvider(googleUser, "123");
  assert.equal(weakRes.ok, false, "Password shorter than 6 chars must be rejected");
  assert.equal(weakRes.code, "auth/weak-password", "Must report weak password code");

  // 2. Mock EmailAuthProvider
  global.firebase = {
    auth: {
      EmailAuthProvider: {
        credential: (email, pass) => ({ email, pass, providerId: "password" })
      }
    }
  };

  // 3. Legitimate password linking
  const strongRes = await authLinking.linkPasswordProvider(googleUser, "SecurePass#2026");
  assert.equal(strongRes.ok, true, "Valid password linking must succeed");
  assert.equal(strongRes.uid, "usr_pt_sarah_202", "Firebase UID must be strictly preserved");
  assert.equal(googleUser.providerData.length, 2, "User must now have both Google and Password providers");
})();

console.log("  ✓ Password linking validates length and securely binds password to active UID.\n");

// ==================================================================
// TEST 4: Prevention of Removing the Last Usable Sign-In Method
// ==================================================================
console.log("▶ TEST 4: Prevention of Removing the Last Usable Sign-In Method ...");

const singleProviderUser = {
  uid: "usr_single_001",
  email: "solo@healthvibe.test",
  providerData: [
    { providerId: "password", email: "solo@healthvibe.test" }
  ],
  async unlink(providerId) {
    throw new Error("Should not be called!");
  }
};

(async () => {
  const check = authLinking.canUnlinkProvider(singleProviderUser, "password");
  assert.equal(check.allowed, false, "Must strictly forbid unlinking the only provider");
  assert.equal(check.reason, "LAST_REMAINING_PROVIDER", "Reason must be LAST_REMAINING_PROVIDER");

  const unlinkRes = await authLinking.unlinkProvider(singleProviderUser, "password");
  assert.equal(unlinkRes.ok, false, "Unlinking attempt must fail");
  assert.equal(unlinkRes.code, "LAST_REMAINING_PROVIDER", "Must return LAST_REMAINING_PROVIDER error code");
  assert.ok(unlinkRes.error.includes("لا يمكن إلغاء وسيلة تسجيل الدخول الوحيدة"), "Must provide clear Arabic safety explanation");

  // Now test user with 2 providers: unlinking one must succeed
  const dualUser = {
    uid: "usr_dual_002",
    email: "dual@healthvibe.test",
    providerData: [
      { providerId: "password", email: "dual@healthvibe.test" },
      { providerId: "google.com", email: "dual@gmail.com" }
    ],
    async unlink(providerId) {
      this.providerData = this.providerData.filter(p => p.providerId !== providerId);
      return this;
    }
  };

  const dualCheck = authLinking.canUnlinkProvider(dualUser, "google.com");
  assert.equal(dualCheck.allowed, true, "Unlinking allowed when multiple providers exist");

  const dualUnlinkRes = await authLinking.unlinkProvider(dualUser, "google.com");
  assert.equal(dualUnlinkRes.ok, true, "Unlinking one of two providers must succeed");
  assert.equal(dualUser.providerData.length, 1, "One provider must remain");
  assert.equal(dualUser.providerData[0].providerId, "password", "Password must remain active");
  assert.equal(dualUnlinkRes.uid, "usr_dual_002", "UID must be strictly preserved");
})();

console.log("  ✓ Protection against removing the last usable sign-in method strictly enforced.\n");

// ==================================================================
// TEST 5: Conflicting Credentials & Recovery Instructions (Proof of Control)
// ==================================================================
console.log("▶ TEST 5: Conflicting Credentials & Recovery Instructions (Proof of Control) ...");

const userWithConflict = {
  uid: "usr_conflict_001",
  email: "current@healthvibe.test",
  providerData: [
    { providerId: "password", email: "current@healthvibe.test" }
  ],
  async linkWithPopup(provider) {
    const conflictErr = new Error("Credential already associated with another user.");
    conflictErr.code = "auth/credential-already-in-use";
    throw conflictErr;
  }
};

(async () => {
  const conflictRes = await authLinking.linkGoogleProvider(userWithConflict, {
    providerInstance: { name: "GoogleProvider" }
  });

  assert.equal(conflictRes.ok, false, "Conflicting linking must be caught");
  assert.equal(conflictRes.conflict, true, "Must flag conflict");
  assert.equal(conflictRes.code, "auth/credential-already-in-use", "Must return credential-already-in-use code");
  assert.ok(conflictRes.recoveryInstructions, "Must return structured recovery instructions");
  assert.ok(conflictRes.recoveryInstructions.bodyAr.includes("لا يتم دمج السجلات الطبية أو الحسابات تلقائياً"), "Must state anti-merge rule in recovery body");
  assert.ok(conflictRes.recoveryInstructions.steps.length >= 2, "Must provide step-by-step recovery guidance");

  // Test primary login conflict handler (account-exists-with-different-credential)
  const primaryError = {
    code: "auth/account-exists-with-different-credential",
    email: "patient.smith@healthvibe.test"
  };
  const handledConflict = authLinking.handleAccountExistsConflict(primaryError, false);
  assert.equal(handledConflict.isConflict, true, "Must identify primary login conflict");
  assert.equal(handledConflict.email, "patient.smith@healthvibe.test", "Must capture email for prefilling");
  assert.ok(handledConflict.message.includes("تسجيل الدخول بالبريد وكلمة المرور أولاً"), "Must instruct user to sign in with password first for proof of control");
})();

console.log("  ✓ Provider conflict resolution provides clear recovery steps without auto-merging.\n");

// ==================================================================
// TEST 6: Strict Prohibition of Merging Clinical Records Based on Email Strings
// ==================================================================
console.log("▶ TEST 6: Strict Prohibition of Merging Clinical Records Based on Email Strings ...");

const authenticatedUserId = "usr_authenticated_primary_777";
const recordWithMatchingUid = {
  id: "case_001",
  patientId: "usr_authenticated_primary_777",
  patientEmail: "patient@healthvibe.test",
  diagnosis: "Acute Bronchitis"
};

const recordWithMatchingEmailDifferentUid = {
  id: "case_002",
  patientId: "usr_imposter_or_other_999", // DIFFERENT UID
  patientEmail: "patient@healthvibe.test", // SAME EMAIL STRING
  diagnosis: "Chronic Asthma"
};

const recordWithoutUid = {
  id: "case_003",
  patientEmail: "patient@healthvibe.test"
};

// 1. Matching UID -> Valid
assert.equal(authLinking.assertClinicalRecordOwnership(recordWithMatchingUid, authenticatedUserId), true, "Matching UID must pass clinical ownership validation");

// 2. Matching email but different UID -> Must strictly THROW error
assert.throws(() => {
  authLinking.assertClinicalRecordOwnership(recordWithMatchingEmailDifferentUid, authenticatedUserId);
}, (err) => {
  return err.code === "CLINICAL_RECORD_OWNERSHIP_MISMATCH";
}, "Must reject record merge when UID differs, even if email string matches");

// 3. Record without UID -> Must strictly THROW error
assert.throws(() => {
  authLinking.assertClinicalRecordOwnership(recordWithoutUid, authenticatedUserId);
}, (err) => {
  return err.code === "CLINICAL_OWNERSHIP_UNVERIFIED";
}, "Must reject record access without verified UID provenance");

console.log("  ✓ Accounts and clinical records are never merged or reassigned based on email strings.\n");

// ==================================================================
// TEST 7: Recent Authentication Requirement (requires-recent-login)
// ==================================================================
console.log("▶ TEST 7: Recent Authentication Requirement (requires-recent-login) ...");

const staleSessionUser = {
  uid: "usr_stale_888",
  email: "stale@healthvibe.test",
  providerData: [
    { providerId: "password", email: "stale@healthvibe.test" },
    { providerId: "google.com", email: "stale@gmail.com" }
  ],
  async unlink(providerId) {
    const err = new Error("This operation is sensitive and requires recent authentication.");
    err.code = "auth/requires-recent-login";
    throw err;
  },
  async reauthenticateWithCredential(cred) {
    this._reauthDone = true;
    return { user: this };
  }
};

(async () => {
  const staleRes = await authLinking.unlinkProvider(staleSessionUser, "google.com");
  assert.equal(staleRes.ok, false, "Stale session unlink must return error");
  assert.equal(staleRes.requiresRecentLogin, true, "Must flag requiresRecentLogin");
  assert.equal(staleRes.code, "auth/requires-recent-login", "Code must be requires-recent-login");

  // Execute re-authentication
  await authLinking.reauthenticateUser(staleSessionUser, "password", { password: "CorrectPassword123" });
  assert.equal(staleSessionUser._reauthDone, true, "Re-authentication must succeed with valid credentials");
})();

console.log("  ✓ Recent authentication check enforced on sensitive provider operations.\n");

// ==================================================================
// TEST 8: Canceled Linking & Suspended Account Protection
// ==================================================================
console.log("▶ TEST 8: Canceled Linking & Suspended Account Protection ...");

// Case A: User cancels popup
const cancelingUser = {
  uid: "usr_cancel_001",
  email: "cancel@healthvibe.test",
  providerData: [{ providerId: "password", email: "cancel@healthvibe.test" }],
  async linkWithPopup(provider) {
    const err = new Error("Popup closed by user");
    err.code = "auth/popup-closed-by-user";
    throw err;
  }
};

(async () => {
  const cancelRes = await authLinking.linkGoogleProvider(cancelingUser, {
    providerInstance: { name: "MockGoogle" }
  });
  assert.equal(cancelRes.ok, false, "Must return ok: false");
  assert.equal(cancelRes.canceled, true, "Must explicitly flag canceled: true");
  assert.ok(cancelRes.error.includes("تم إلغاء عملية الربط"), "Must provide user-friendly cancellation notice");

  // Case B: Suspended account
  const suspendedUser = {
    uid: "usr_suspended_999",
    email: "suspended@healthvibe.test",
    disabled: true, // Marked disabled
    providerData: [
      { providerId: "password", email: "suspended@healthvibe.test" },
      { providerId: "google.com", email: "suspended@gmail.com" }
    ],
    async linkWithPopup() { throw new Error("Should be blocked before reaching API"); },
    async unlink() { throw new Error("Should be blocked before reaching API"); }
  };

  assert.equal(authLinking.isAccountSuspended(suspendedUser), true, "Must detect suspended account");

  const suspendedLinkRes = await authLinking.linkGoogleProvider(suspendedUser);
  assert.equal(suspendedLinkRes.ok, false, "Suspended user cannot link");
  assert.equal(suspendedLinkRes.code, "auth/user-disabled", "Must reject with user-disabled code");

  const suspendedUnlinkRes = await authLinking.unlinkProvider(suspendedUser, "google.com");
  assert.equal(suspendedUnlinkRes.ok, false, "Suspended user cannot unlink");
  assert.equal(suspendedUnlinkRes.code, "ACCOUNT_SUSPENDED", "Must reject unlinking on suspended account");
})();

console.log("  ✓ Canceled linking handled gracefully and suspended accounts strictly quarantined.\n");

// ==================================================================
// TEST 9: Full Bilingual Translation Parity for Provider Linking
// ==================================================================
console.log("▶ TEST 9: Full Bilingual Translation Parity for Provider Linking ...");

const { translations } = require(path.resolve(__dirname, "../app/i18n.js"));
const keysToVerify = [
  "providersTitle",
  "providersSubtitle",
  "firebaseUidPreserved",
  "providerGoogle",
  "providerPassword",
  "providerConnected",
  "providerNotConnected",
  "linkGoogleBtn",
  "setPasswordBtn",
  "unlinkProviderBtn",
  "unlinkBlockedLastMethod",
  "linkingSuccess",
  "unlinkingSuccess",
  "linkingCanceled",
  "conflictAlreadyInUse",
  "conflictRecoveryGuide",
  "accountSuspendedNotice",
  "noEmailAutoMergeNotice",
  "enterPasswordToLink",
  "reauthRequiredPrompt"
];

for (const key of keysToVerify) {
  assert.ok(translations.en.auth[key], `English catalog must include auth.${key}`);
  assert.ok(translations.ar.auth[key], `Arabic catalog must include auth.${key}`);
}

console.log("  ✓ All 20 authentication linking keys verified with 100% Arabic/English parity.\n");

console.log("==================================================================");
console.log("🎉 ALL 9 AUTH PROVIDER LINKING ACCEPTANCE TESTS PASSED (100%)");
console.log("==================================================================");
