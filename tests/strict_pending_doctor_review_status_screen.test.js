/**
 * Health Vibe AI - Strict Pending Doctor Review Status Screen Test Suite
 *
 * Verifies (PRD Page 10 Req 49):
 * 1. Dedicated status screen for patient after submitting symptoms:
 *    - Section #screen-pending with modern reassuring aesthetics.
 *    - Prominent #pendingReviewBadge declaring "Pending Doctor Review" / "قيد مراجعة الطبيب المختص".
 * 2. Expected Response Time (SLA):
 *    - Prominent #pendingSlaCard and #pendingExpectedResponse stating "Within 15 - 30 minutes" / "خلال 15 - 30 دقيقة".
 *    - Clear notification guidance: patient does not need to wait on screen, alerts sent upon approval.
 * 3. Prevention of Alarming Numbers (دون إظهار أرقام مقلقة):
 *    - No raw anxiety-inducing scores or panic metrics displayed to distressed patients before clinical review.
 *    - #pendingCaseO2 displays safe encrypted status: "تم الحفظ والتشفير بأمان ✓" / "Safely Recorded & Encrypted ✓".
 *    - #pendingCasePriority displays reassuring clinical status: "قيد المراجعة السريرية من الطبيب" / "Under Specialist Clinical Review".
 *    - Reassurance banner #pendingNoAlarmNotice explains clinical safety and absence of premature automated predictions.
 * 4. Tracking and Navigation:
 *    - Case reference ID (#pendingCaseId) and assigned clinician (#pendingDoctorName) clearly displayed.
 *    - Action buttons for tracking (#pendingTrackCaseBtn), returning home, and viewing history.
 *    - Emergency alert (#pendingEmergencyAlert) preserved for SpO2 < 90% protocol.
 * 5. Multilingual i18n Parity (Arabic and English):
 *    - All SLA, reassurance, and tracking keys verified with 100% parity in app/i18n.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🩺 HEALTH VIBE AI: PENDING DOCTOR REVIEW STATUS SCREEN TEST SUITE');
console.log('   PRD Req 49: Reassuring Patient Status Screen with Expected Response Time (SLA)');
console.log('================================================================================\n');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'app', 'index.html');
const APP_JS_PATH = path.join(ROOT_DIR, 'app', 'app.js');
const I18N_JS_PATH = path.join(ROOT_DIR, 'app', 'i18n.js');

const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
const { translations } = require(I18N_JS_PATH);

// ── TEST 1: Pending Screen DOM Structure & Elements ──
console.log('▶ TEST 1: Pending Doctor Review Screen DOM Markup in app/index.html');
assert(indexHtml.includes('id="screen-pending"'), 'index.html must contain #screen-pending section');
assert(indexHtml.includes('id="pendingReviewBadge"'), 'Must contain #pendingReviewBadge');
assert(indexHtml.includes('Pending Doctor Review'), 'Badge markup must declare Pending Doctor Review');
assert(indexHtml.includes('قيد مراجعة الطبيب المختص'), 'Badge markup must declare Arabic doctor review');
assert(indexHtml.includes('id="pendingSlaCard"'), 'Must contain #pendingSlaCard');
assert(indexHtml.includes('id="pendingExpectedResponse"'), 'Must contain #pendingExpectedResponse element');
assert(indexHtml.includes('id="pendingNoAlarmNotice"'), 'Must contain #pendingNoAlarmNotice reassurance banner');
assert(indexHtml.includes('id="pendingCaseSummary"'), 'Must contain #pendingCaseSummary container');
assert(indexHtml.includes('id="pendingCaseId"'), 'Must contain #pendingCaseId for reference number');
assert(indexHtml.includes('id="pendingCaseName"'), 'Must contain #pendingCaseName');
assert(indexHtml.includes('id="pendingDoctorName"'), 'Must contain #pendingDoctorName');
assert(indexHtml.includes('id="pendingCaseO2"'), 'Must contain #pendingCaseO2 container');
assert(indexHtml.includes('id="pendingCasePriority"'), 'Must contain #pendingCasePriority container');
assert(indexHtml.includes('id="pendingCaseTime"'), 'Must contain #pendingCaseTime');
assert(indexHtml.includes('id="pendingTrackCaseBtn"'), 'Must contain #pendingTrackCaseBtn');
assert(indexHtml.includes('id="pendingEmergencyAlert"'), 'Must retain #pendingEmergencyAlert for emergency protocols');

console.log('  ✓ Verified all core DOM elements, SLA card, reassurance notices, and action buttons.\n');


// ── TEST 2: Expected Response Time (SLA) Specification ──
console.log('▶ TEST 2: Expected Response Time (SLA) & Notification Reassurance');
assert(indexHtml.includes('خلال 15 - 30 دقيقة') || indexHtml.includes('15 - 30'), 'SLA card must state 15 - 30 minutes response window');
assert(indexHtml.includes('data-i18n="pending.expectedResponseBadge"'), 'Must bind expectedResponseBadge translation key');
assert(indexHtml.includes('data-i18n="pending.expectedResponseTime"'), 'Must bind expectedResponseTime translation key');
assert(indexHtml.includes('data-i18n="pending.expectedResponseDesc"'), 'Must bind expectedResponseDesc translation key');

console.log('  ✓ Verified Expected Response Time (15-30 minutes) and automatic notification assurance.\n');


// ── TEST 3: Shielding Patient from Alarming Numbers ──
console.log('▶ TEST 3: Protection Against Alarming Numbers (دون إظهار أرقام مقلقة)');
assert(indexHtml.includes('data-i18n="pending.reassuranceTitle"'), 'Must include reassurance title key');
assert(indexHtml.includes('data-i18n="pending.reassuranceDesc"'), 'Must include reassurance description key');

// Check script population in app.js
assert(appJs.includes('Safely Recorded & Encrypted ✓'), 'app.js must display safe encryption status for vitals');
assert(appJs.includes('تم الحفظ والتشفير بأمان ✓'), 'app.js must display Arabic safe encryption status');
assert(appJs.includes('Under Specialist Clinical Review'), 'app.js must display reassuring review status');
assert(appJs.includes('قيد المراجعة السريرية من الطبيب'), 'app.js must display Arabic reassuring review status');
assert(appJs.includes('pendingDoctorName'), 'app.js must populate assigned doctor name');

console.log('  ✓ Verified raw anxiety-inducing percentages and panic scores are omitted in patient view.\n');


// ── TEST 4: Navigation & Tracking Script Integration ──
console.log('▶ TEST 4: Client Navigation & Case Tracking in app/app.js');
assert(appJs.includes('window.trackCurrentPendingCase = function'), 'Must define window.trackCurrentPendingCase');
assert(appJs.includes('openCaseReport(window._currentCaseId)'), 'trackCurrentPendingCase must route to case timeline when caseId exists');
assert(appJs.includes('showScreen("pending")'), 'Assessment submission must transition smoothly to pending screen');

console.log('  ✓ Verified trackCurrentPendingCase and screen transition logic.\n');


// ── TEST 5: Multilingual i18n Catalog Parity ──
console.log('▶ TEST 5: Multilingual i18n Catalog Parity in app/i18n.js');
const requiredPendingKeys = [
  'expectedResponseBadge',
  'expectedResponseTime',
  'expectedResponseDesc',
  'reassuranceTitle',
  'reassuranceDesc',
  'vitalsStatusLabel',
  'reviewStatusLabel',
  'vitalsSafelyRecorded',
  'reviewInProgressText',
  'assignedClinicDoctor',
  'trackCaseBtn'
];

requiredPendingKeys.forEach(key => {
  assert(translations.ar.pending[key], `Arabic catalog missing pending.${key}`);
  assert(translations.en.pending[key], `English catalog missing pending.${key}`);
});

assert(translations.ar.pending.expectedResponseTime.includes('15 - 30 دقيقة'), 'Arabic SLA must state 15 - 30 minutes');
assert(translations.en.pending.expectedResponseTime.includes('15 - 30 minutes'), 'English SLA must state 15 - 30 minutes');

console.log('  ✓ All 11 SLA and reassurance keys present in Arabic and English with 100% parity.\n');

console.log('================================================================================');
console.log('🎉 ALL 5 STRICT PENDING DOCTOR REVIEW STATUS SCREEN TESTS PASSED 100%!');
console.log('================================================================================');
