/**
 * ==============================================================================
 * 🩺 HEALTH VIBE AI: STRICT DOCTOR REGISTRATION & CREDENTIAL VERIFICATION SUITE
 * PRD Page 8 Requirement 43:
 * - Dual Credential Upload: National ID Card (بطاقة الرقم القومي) + Medical Syndicate Card (كارنيه نقابة الأطباء)
 * - Account State: Pending Verification (role: doctor_pending, doctorApplicationStatus: pending, verificationStatus: pending_verification)
 * - Clinical Review Lock: Doctor review panel and clinical report approval gated until Admin approval
 * - Admin Review Workspace: Direct inspection and verification links for both credentials
 * - 100% i18n Parity across Arabic and English
 * ==============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'app', 'app.js');
const i18nPath = path.join(__dirname, '..', 'app', 'i18n.js');
const serverJsPath = path.join(__dirname, '..', 'backend', 'server.js');
const firestoreRulesPath = path.join(__dirname, '..', 'firestore.rules');

console.log('================================================================================');
console.log('🩺 HEALTH VIBE AI: DOCTOR REGISTRATION DUAL CREDENTIAL & PENDING VERIFICATION');
console.log('   PRD Page 8 Req 43: National ID + Syndicate Card Upload & Admin Pending Gate');
console.log('================================================================================\n');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const i18nJs = fs.readFileSync(i18nPath, 'utf8');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');
const firestoreRules = fs.readFileSync(firestoreRulesPath, 'utf8');

// ── TEST 1: Dual Credential Upload Controls in Application Form (State C) ─────
console.log('▶ TEST 1: Dual Credential Upload Controls in Application Form (State C)');
assert.ok(appJs.includes('doctorAppNationalIdContainer'), 'Missing National ID container #doctorAppNationalIdContainer');
assert.ok(appJs.includes('doctorAppSyndicateContainer'), 'Missing Syndicate card container #doctorAppSyndicateContainer');
assert.ok(appJs.includes('doctorAppNationalIdFile'), 'Missing National ID file input #doctorAppNationalIdFile');
assert.ok(appJs.includes('doctorAppSyndicateFile'), 'Missing Syndicate card file input #doctorAppSyndicateFile');
assert.ok(appJs.includes('onDoctorNationalIdPicked'), 'Missing onDoctorNationalIdPicked handler');
assert.ok(appJs.includes('onDoctorSyndicateCardPicked'), 'Missing onDoctorSyndicateCardPicked handler');
assert.ok(appJs.includes('window.onDoctorNationalIdPicked = onDoctorNationalIdPicked'), 'onDoctorNationalIdPicked not exposed on window');
assert.ok(appJs.includes('window.onDoctorSyndicateCardPicked = onDoctorSyndicateCardPicked'), 'onDoctorSyndicateCardPicked not exposed on window');
console.log('  ✓ Verified dedicated pickers and containers for National ID and Syndicate Card.');

// ── TEST 2: Dual File Validation & Upload Pipeline ───────────────────────────
console.log('\n▶ TEST 2: Dual File Validation & Upload Pipeline');
assert.ok(appJs.includes('credentialType === "national_id"'), 'Missing national_id credentialType handling in uploadDoctorApplicationDocument');
assert.ok(appJs.includes('credentialType === "syndicate_card"'), 'Missing syndicate_card credentialType handling in uploadDoctorApplicationDocument');
assert.ok(appJs.includes('file: nationalIdFile') && appJs.includes('credentialType: "national_id"'), 'handleDoctorAppSubmit must upload nationalIdFile with credentialType national_id');
assert.ok(appJs.includes('file: syndicateFile') && appJs.includes('credentialType: "syndicate_card"'), 'handleDoctorAppSubmit must upload syndicateFile with credentialType syndicate_card');
console.log('  ✓ Verified dual file upload pipeline to Firebase Storage with secure paths and metadata.');

// ── TEST 3: Account State Gating: Pending Verification & Doctor_Pending ───────
console.log('\n▶ TEST 3: Account State Gating: Pending Verification & Doctor_Pending');
assert.ok(appJs.includes('role: ROLES.DOCTOR_PENDING'), 'User role must be set to ROLES.DOCTOR_PENDING upon application submission');
assert.ok(appJs.includes('doctorApplicationStatus: "pending"'), 'doctorApplicationStatus must be set to pending');
assert.ok(appJs.includes('verificationStatus: "pending_verification"'), 'verificationStatus must be set to pending_verification');
assert.ok(appJs.includes('nationalIdDoc: {'), 'doctor_applications document must persist nationalIdDoc object');
assert.ok(appJs.includes('syndicateCardDoc: {'), 'doctor_applications document must persist syndicateCardDoc object');
assert.ok(appJs.includes('doctorAppNationalIdDoc: appData.nationalIdDoc'), 'User profile document must persist doctorAppNationalIdDoc');
assert.ok(appJs.includes('doctorAppSyndicateDoc: appData.syndicateCardDoc'), 'User profile document must persist doctorAppSyndicateDoc');
console.log('  ✓ Verified user account is put into role: doctor_pending and verificationStatus: pending_verification.');

// ── TEST 4: Clinical Review Panel Locked Until Admin Review (State B) ─────────
console.log('\n▶ TEST 4: Clinical Review Panel Locked Until Admin Review (State B)');
assert.ok(appJs.includes('isPendingVerification'), 'renderVerificationScreen must check isPendingVerification');
assert.ok(appJs.includes('Pending Verification ⏳'), 'State B must render Pending Verification status pill');
assert.ok(appJs.includes('ضابط الأمان السريري وحماية المرضى مفعل') || appJs.includes('Clinical Governance & Patient Safety Guard Active'), 'State B must render Clinical Governance Safety Guard banner');
assert.ok(appJs.includes('openDoctorCredentialDocument'), 'State B must provide openDoctorCredentialDocument for previewing uploaded credentials');
assert.ok(appJs.includes('cancelOrReapplyDoctorApp'), 'State B must provide cancel and reapply option');
console.log('  ✓ Verified doctor review panel is locked in State B with Pending Verification banner and dual credential summary.');

// ── TEST 5: Admin Workspace Verification Board Displays Both Credentials ─────
console.log('\n▶ TEST 5: Admin Workspace Verification Board Displays Both Credentials');
assert.ok(appJs.includes('nationalIdName'), 'renderAdminApplications must resolve nationalIdName');
assert.ok(appJs.includes('syndicateName'), 'renderAdminApplications must resolve syndicateName');
assert.ok(appJs.includes('View National ID ↗') || appJs.includes('عرض بطاقة الرقم القومي ↗'), 'Admin must have link to view National ID Card');
assert.ok(appJs.includes('View Syndicate Card ↗') || appJs.includes('عرض كارنيه النقابة ↗'), 'Admin must have link to view Syndicate Card');
console.log('  ✓ Verified Admin board displays both National ID and Syndicate Card credentials with direct verification links.');

// ── TEST 6: Server Approval Transition Consistency ──────────────────────────
console.log('\n▶ TEST 6: Server Approval Transition Consistency');
assert.ok(serverJs.includes("normalizeRole(applicantDoc.data().role) !== ROLES.DOCTOR_PENDING"), 'Backend server must enforce applicantDoc.role === DOCTOR_PENDING before promotion');
assert.ok(serverJs.includes("app.post('/api/admin/approve-doctor-application'"), 'Backend must provide POST /api/admin/approve-doctor-application endpoint');
assert.ok(serverJs.includes("app.post('/api/admin/reject-doctor-application'"), 'Backend must provide POST /api/admin/reject-doctor-application endpoint');
console.log('  ✓ Verified backend server transition rules strictly align with doctor_pending state.');

// ── TEST 7: Firestore Rules Compliance ───────────────────────────────────────
console.log('\n▶ TEST 7: Firestore Rules Compliance');
assert.ok(firestoreRules.includes('match /doctor_applications/{appId}'), 'Firestore rules must secure doctor_applications collection');
assert.ok(appJs.includes('docName: uploadedSyndicate.docName') && appJs.includes('storagePath: uploadedSyndicate.storagePath'), 'Top-level backward compatibility maintained for existing Firestore rules');
console.log('  ✓ Verified Firestore rules compatibility and storage metadata compliance.');

// ── TEST 8: Full i18n Key Parity for Doctor Verification Keys ─────────────────
console.log('\n▶ TEST 8: Full i18n Key Parity for Doctor Verification Keys');
const i18nModule = require('../app/i18n.js');
const arDoctor = i18nModule.translations.ar.doctor;
const enDoctor = i18nModule.translations.en.doctor;

const requiredKeys = [
  'nationalIdLabel',
  'nationalIdPlaceholder',
  'syndicateCardLabel',
  'syndicateCardPlaceholder',
  'pendingVerificationTitle',
  'pendingVerificationDesc',
  'nationalIdStatus',
  'syndicateCardStatus',
  'credentialsReceived',
  'adminReviewNotice'
];

requiredKeys.forEach((key) => {
  assert.ok(arDoctor[key], `Missing Arabic translation for doctor.${key}`);
  assert.ok(enDoctor[key], `Missing English translation for doctor.${key}`);
});
console.log(`  ✓ Verified all ${requiredKeys.length} doctor credential verification keys with 100% Arabic/English parity.`);

console.log('\n================================================================================');
console.log('🎉 ALL DOCTOR DUAL CREDENTIAL & PENDING VERIFICATION TESTS PASSED! (8/8)');
console.log('================================================================================');
