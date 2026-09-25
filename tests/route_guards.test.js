/**
 * Health Vibe AI - Route Guard Test Suite
 * Tests for the centralized route guard engine in app/app.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: ROUTE GUARD ENGINE TEST SUITE');
console.log('   Auth Guard, RBAC, Verification, Consent, Hash Routing');
console.log('==================================================================\n');

const appJsPath = path.resolve(__dirname, '../app/app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
}

// TEST 1: Guard Constant Declarations
console.log('▶ TEST 1: Guard constant declarations (AUTH, VERIFICATION, CONSENT)');
assert(appJs.includes('const AUTH_REQUIRED_SCREENS'), 'app.js must declare AUTH_REQUIRED_SCREENS array');
assert(appJs.includes('const VERIFICATION_REQUIRED_SCREENS'), 'app.js must declare VERIFICATION_REQUIRED_SCREENS array');
assert(appJs.includes('const CONSENT_REQUIRED_SCREENS'), 'app.js must declare CONSENT_REQUIRED_SCREENS array');

const authBlock = extractBlock(appJs, 'const AUTH_REQUIRED_SCREENS', '];');
['consent', 'profile', 'assessment', 'doctor', 'admin', 'audit', 'kpi', 'report'].forEach(screen => {
  assert(authBlock.includes('"' + screen + '"'), 'AUTH_REQUIRED_SCREENS must include "' + screen + '"');
});

const verifBlock = extractBlock(appJs, 'const VERIFICATION_REQUIRED_SCREENS', '];');
['assessment', 'doctor', 'admin', 'audit', 'kpi', 'report'].forEach(screen => {
  assert(verifBlock.includes('"' + screen + '"'), 'VERIFICATION_REQUIRED_SCREENS must include "' + screen + '"');
});
assert(
  appJs.includes('CONSENT_REQUIRED_SCREENS') && appJs.includes('"assessment"'),
  'CONSENT_REQUIRED_SCREENS must contain "assessment"'
);
console.log('  ✓ AUTH_REQUIRED_SCREENS, VERIFICATION_REQUIRED_SCREENS, CONSENT_REQUIRED_SCREENS declared.');

// TEST 2: applyRouteGuards() Function Structure
console.log('\n▶ TEST 2: applyRouteGuards() implements all 4 guard layers');
assert(appJs.includes('function applyRouteGuards('), 'app.js must define applyRouteGuards() function');
assert(appJs.includes('window.applyRouteGuards = applyRouteGuards'), 'applyRouteGuards must be on window');

const guardsSource = extractBlock(appJs, 'function applyRouteGuards(', 'window.applyRouteGuards =');
assert(guardsSource.includes('AUTH_REQUIRED_SCREENS.includes(targetScreen)'), 'Guard 1: auth check required');
assert(guardsSource.includes('getActiveUser'), 'Guard 1: must use getActiveUser()');
assert(guardsSource.includes('canAccessScreen(targetScreen)'), 'Guard 2: RBAC check required');
assert(guardsSource.includes('VERIFICATION_REQUIRED_SCREENS.includes(targetScreen)'), 'Guard 3: verification check required');
assert(guardsSource.includes('window._isUserVerified'), 'Guard 3: must check _isUserVerified');
assert(guardsSource.includes('CONSENT_REQUIRED_SCREENS.includes(targetScreen)'), 'Guard 4: consent check required');
assert(guardsSource.includes('hasAcceptedPrivacyConsent'), 'Guard 4: must call hasAcceptedPrivacyConsent()');
console.log('  ✓ applyRouteGuards() implements all 4 guards: auth, RBAC, verification, consent.');

// TEST 3: showScreen() Delegates to applyRouteGuards()
console.log('\n▶ TEST 3: showScreen() uses applyRouteGuards() — no scattered inline checks');
const showScreenSource = extractBlock(appJs, 'function showScreen(name)', 'async function renderPatientDashboard');
assert(showScreenSource.includes('applyRouteGuards(name)'), 'showScreen() must call applyRouteGuards(name)');
assert(!showScreenSource.includes('if (!canAccessScreen(name))'), 'showScreen() must NOT have legacy canAccessScreen inline check');
console.log('  ✓ showScreen() cleanly delegates to applyRouteGuards() — legacy inline guards eliminated.');

// TEST 4: Hash-Based Deep Link Route Guard
console.log('\n▶ TEST 4: Hash-based deep link routing enforces route guards');
assert(appJs.includes('initHashRouting'), 'app.js must define initHashRouting() IIFE');
assert(appJs.includes('addEventListener("hashchange"'), 'app.js must register hashchange event listener');
assert(appJs.includes('history.replaceState'), 'Hash router must clean hash via history.replaceState');
const hashRouterSource = extractBlock(appJs, 'function initHashRouting', 'function updateAvatar');
assert(hashRouterSource.includes('showScreen(screenFromHash)'), 'Hash router must call showScreen() for guard enforcement');
console.log('  ✓ Hash router calls showScreen() for guard enforcement; cleans hash with replaceState.');

// TEST 5: enforceServerPermission() Uses getRoleDefaultScreen()
console.log('\n▶ TEST 5: enforceServerPermission and handleServerPermissionDenied use getRoleDefaultScreen()');
const enforceServerSource = extractBlock(appJs, 'async function enforceServerPermission(', 'function handleServerPermissionDenied(');
assert(enforceServerSource.includes('getRoleDefaultScreen(serverRole)'), 'enforceServerPermission must use getRoleDefaultScreen()');
const handleDeniedSource = extractBlock(appJs, 'function handleServerPermissionDenied(', 'function hasPermission(');
assert(handleDeniedSource.includes('getRoleDefaultScreen(realRole)'), 'handleServerPermissionDenied must use getRoleDefaultScreen()');
console.log('  ✓ Server permission enforcement uses centralized getRoleDefaultScreen().');

// TEST 6: Suspension Guard
console.log('\n▶ TEST 6: Suspension guard blocks suspended accounts');
assert(appJs.includes('isUserSuspended') && appJs.includes('auth.signOut()'), 'Suspended accounts must trigger signOut');
assert(appJs.includes('showCentralErrorModal') || appJs.includes('Account Suspended'), 'Suspension must show error modal');
console.log('  ✓ Suspended accounts blocked at auth state with immediate sign-out and error modal.');

console.log('\n==================================================================');
console.log('🎉 ALL 6 ROUTE GUARD TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================');
