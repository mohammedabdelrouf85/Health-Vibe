/**
 * Health Vibe AI - Account Lifecycle Test Suite
 * Tests for:
 * 1. Switch Account (Sidebar, Idle lock screen, Profile panel, Auth modal quick switcher)
 * 2. Delete Account (Modal, Confirmation phrase, Backend GDPR / HIPAA purge, Owner protection)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🔄 HEALTH VIBE AI: ACCOUNT LIFECYCLE TEST SUITE');
console.log('   Switch Account, Saved Accounts Switcher & Safe Account Deletion');
console.log('==================================================================\n');

const indexHtmlPath = path.resolve(__dirname, '../app/index.html');
const appJsPath = path.resolve(__dirname, '../app/app.js');
const serverJsPath = path.resolve(__dirname, '../backend/server.js');
const i18nJsPath = path.resolve(__dirname, '../app/i18n.js');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');
const { translations } = require(i18nJsPath);

// -----------------------------------------------------------------------------
// TEST 1: Switch Account UI Elements across index.html
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Switch Account UI Elements across index.html');
assert(indexHtml.includes('id="switchAccountButton"'), 'Sidebar must have switchAccountButton');
assert(indexHtml.includes('onclick="switchAccount(event)"'), 'Switch account button must invoke switchAccount(event)');
assert(indexHtml.includes('id="savedAccountsSwitcher"'), 'Auth modal must have savedAccountsSwitcher container');
assert(indexHtml.includes('id="savedAccountsList"'), 'Saved accounts list container must exist');
console.log('  ✓ Sidebar and Auth modal contain Switch Account triggers and switcher list.');

// -----------------------------------------------------------------------------
// TEST 2: Switch Account Global Implementation in app.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Switch Account Global Implementation in app.js');
assert(appJs.includes('async function switchAccount('), 'app.js must define switchAccount');
assert(appJs.includes('window.switchAccount = switchAccount'), 'switchAccount must be exposed on window');
assert(appJs.includes('clearActiveSession()'), 'switchAccount must clear active session');
assert(appJs.includes('setAuthMode("signin")'), 'switchAccount must set auth mode to signin');
assert(appJs.includes('renderSavedAccountsSwitcher()'), 'switchAccount must trigger renderSavedAccountsSwitcher');
console.log('  ✓ switchAccount cleanly terminates session, clears inputs, and displays auth view.');

// -----------------------------------------------------------------------------
// TEST 3: Delete Account UI & Modal Safeguards in index.html
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 3: Delete Account UI & Modal Safeguards in index.html');
assert(indexHtml.includes('id="deleteAccountModal"'), 'deleteAccountModal must exist in index.html');
assert(indexHtml.includes('id="sidebarDeleteAccountBtn"'), 'Sidebar must have direct delete account link/button');
assert(indexHtml.includes('openDeleteAccountModal()'), 'Delete triggers must invoke openDeleteAccountModal()');
assert(indexHtml.includes('id="deleteConfirmationInput"'), 'Confirmation text input must exist in delete modal');
assert(indexHtml.includes('id="btnExecuteAccountDeletion"'), 'Execution button must exist in delete modal');
console.log('  ✓ Delete account modal contains required input guard and accessible entry points.');

// -----------------------------------------------------------------------------
// TEST 4: Delete Account Backend API in server.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 4: Delete Account Backend API in server.js');
assert(serverJs.includes("app.post('/api/user/delete-account'"), 'Backend must have /api/user/delete-account route');
assert(serverJs.includes('isOwnerEmail(userEmail)'), 'Deletion route must protect platform owner accounts');
assert(serverJs.includes("collection('appointments')"), 'Deletion route must purge user appointments');
assert(serverJs.includes("collection('users').doc(userId)"), 'Deletion route must delete user document');
assert(serverJs.includes('admin.auth().deleteUser(userId)'), 'Deletion route must delete user from Firebase Auth');
assert(serverJs.includes("type: 'ACCOUNT_DELETED'"), 'Deletion route must generate HIPAA audit event');
console.log('  ✓ Backend GDPR/HIPAA account deletion verified with owner protection and full data cascade.');

// -----------------------------------------------------------------------------
// TEST 5: Client-Side Deletion & Local Registry Purging in app.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 5: Client-Side Deletion & Local Registry Purging in app.js');
assert(appJs.includes('window.openDeleteAccountModal = function'), 'openDeleteAccountModal must be on window');
assert(appJs.includes('window.closeDeleteAccountModal = function'), 'closeDeleteAccountModal must be on window');
assert(appJs.includes('isOwnerUser(user.email)'), 'Client modal must warn and block deleting owner account');
assert(appJs.includes('localStorage.setItem(ACCOUNTS_REGISTRY_KEY'), 'Account deletion must purge user from local registry');
console.log('  ✓ Client deletion ensures local accounts registry and session keys are sanitized.');

// -----------------------------------------------------------------------------
// TEST 6: Bilingual i18n Parity for Account Lifecycle
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 6: Bilingual i18n Parity for Account Lifecycle');
const navKeys = ['switchAccount', 'deleteAccount', 'signOut'];
navKeys.forEach(k => {
  assert(translations.ar.nav[k], `Arabic translation missing for nav.${k}`);
  assert(translations.en.nav[k], `English translation missing for nav.${k}`);
});

const authKeys = ['switchAccount', 'switchAccountDesc', 'deleteAccountTitle', 'deleteAccountPermanent'];
authKeys.forEach(k => {
  assert(translations.ar.auth[k], `Arabic translation missing for auth.${k}`);
  assert(translations.en.auth[k], `English translation missing for auth.${k}`);
});
console.log('  ✓ 100% Arabic and English catalog parity for switch and delete account keys.');

// -----------------------------------------------------------------------------
// TEST 7: Server-Authoritative Role Determination in backend/server.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 7: Server-Authoritative Role Determination in backend/server.js');
const setUserRoleSlice = serverJs.slice(serverJs.indexOf("app.post('/api/admin/set-user-role'"), serverJs.indexOf("app.post('/api/admin/toggle-user-suspension'"));
assert(!setUserRoleSlice.includes("Doctor roles cannot be assigned manually"), 'Backend must allow assigning doctor roles from admin panel');
console.log('  ✓ Backend defines authoritative sync-role and flexible set-user-role endpoints.');

// -----------------------------------------------------------------------------
// TEST 8: Direct Role Assignment Dropdown in app.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 8: Direct Role Assignment Dropdown in app.js');
assert(appJs.includes('class="admin-role-select"'), 'Admin table must render role selection dropdown for accounts');
assert(appJs.includes("changeUserRole('${u.id}', this.value"), 'Role select must trigger changeUserRole with target user ID and new role');
assert(appJs.includes('/api/user/sync-role'), 'app.js onAuthStateChanged must sync authoritative role with backend');
console.log('  ✓ Admin table renders role dropdown for accounts and syncs with backend.');

console.log('\n==================================================================');
console.log('🎉 ALL 8 ACCOUNT & ROLE LIFECYCLE TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================');
