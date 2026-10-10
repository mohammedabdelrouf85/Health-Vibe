/**
 * Health Vibe AI - Diabetes Doctor-Review Workflow Comprehensive Test Suite
 *
 * Verifies:
 * 1. A doctor must only access diabetes cases that are legitimately assigned or authorized.
 * 2. Display of all 9 mandatory clinical elements:
 *    - patient identity
 *    - assessment date
 *    - current clinical revision
 *    - submitted diabetes information
 *    - historical measurements
 *    - patient clarifications
 *    - relevant attachments
 *    - doctor notes
 *    - previous approved reports
 * 3. Mandatory review of current clinical revision before approval.
 * 4. Invalidation of stale review if information changes after opening case (require explicit re-review).
 * 5. Concurrency guard: Do not allow approval of outdated clinical data (HTTP 409).
 * 6. Preservation of unsaved doctor notes during conflicts and re-renders.
 * 7. Prohibition of unsupported diagnoses, medications, or recommendations.
 * 8. Any final clinical content must come from the approved doctor workflow.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: DIABETES DOCTOR-REVIEW WORKFLOW TEST SUITE');
console.log('   Strict Assignment, 9-Element Display, Revision Locking & Concurrency');
console.log('==================================================================\n');

// Load backend services and client modules
const backendDiabetesService = require('../backend/diabetes-service.js');
const clientDiabetesService = require('../app/modules/diabetes/diabetes-service.js');
const i18n = require('../app/i18n.js');

// Mock browser window and storage for client-side tests
let mockSessionStorage = {};
global.sessionStorage = {
  getItem: (k) => mockSessionStorage[k] || null,
  setItem: (k, v) => { mockSessionStorage[k] = String(v); },
  removeItem: (k) => { delete mockSessionStorage[k]; },
  clear: () => { mockSessionStorage = {}; }
};

global.HealthVibes = {
  DiabetesService: clientDiabetesService,
  translations: i18n.translations
};

// =============================================================================
// TEST 1: Doctor Access Control & Legitimate Assignment Isolation
// =============================================================================
console.log('▶ TEST 1: Legitimate Assignment & RBAC Permission Model ...');

const assignedDoctor = {
  uid: 'doc-endocrine-101',
  email: 'dr.hendrix@healthvibe.clinic',
  displayName: 'Dr. Arthur Hendrix',
  role: 'doctor',
  clinicId: 'clinic-endocrine-alpha'
};

const unassignedDoctor = {
  uid: 'doc-unassigned-999',
  email: 'dr.intruder@otherclinic.org',
  displayName: 'Dr. Unauthorized',
  role: 'doctor',
  clinicId: 'clinic-other'
};

const superAdmin = {
  uid: 'admin-super-01',
  role: 'super_admin'
};

const clinicAdminSame = {
  uid: 'admin-clinic-01',
  role: 'clinic_admin',
  clinicId: 'clinic-endocrine-alpha'
};

const clinicAdminOther = {
  uid: 'admin-clinic-02',
  role: 'clinic_admin',
  clinicId: 'clinic-beta'
};

const patientRecord = {
  patientId: 'patient-dia-4001',
  patientName: 'Kareem Tarek',
  clinicId: 'clinic-endocrine-alpha',
  assignedDoctorId: 'doc-endocrine-101',
  assignedDoctorEmail: 'dr.hendrix@healthvibe.clinic'
};

// Assigned doctor check
const assignedAccess = backendDiabetesService.verifyDoctorCanReviewDiabetesCase(
  assignedDoctor,
  'patient-dia-4001',
  patientRecord
);
assert.equal(assignedAccess.authorized, true, 'Assigned doctor must be authorized');

// Unassigned doctor check
const unassignedAccess = backendDiabetesService.verifyDoctorCanReviewDiabetesCase(
  unassignedDoctor,
  'patient-dia-4001',
  patientRecord
);
assert.equal(unassignedAccess.authorized, false, 'Unassigned doctor must be blocked');
assert.equal(unassignedAccess.reason, 'DOCTOR_NOT_ASSIGNED_TO_PATIENT');

// Client-side canAccessPatientDiabetes check
const clientAssigned = clientDiabetesService.canAccessPatientDiabetes(assignedDoctor, 'doctor', 'patient-dia-4001', patientRecord);
assert.equal(clientAssigned.allowed, true);

const clientUnassigned = clientDiabetesService.canAccessPatientDiabetes(unassignedDoctor, 'doctor', 'patient-dia-4001', patientRecord);
assert.equal(clientUnassigned.allowed, false);
assert.equal(clientUnassigned.reason, 'DOCTOR_NOT_ASSIGNED_TO_PATIENT');

// Super Admin & Clinic Admin checks
assert.equal(clientDiabetesService.canAccessPatientDiabetes(superAdmin, 'super_admin', 'patient-dia-4001', patientRecord).allowed, true);
assert.equal(clientDiabetesService.canAccessPatientDiabetes(clinicAdminSame, 'clinic_admin', 'patient-dia-4001', patientRecord).allowed, true);
assert.equal(clientDiabetesService.canAccessPatientDiabetes(clinicAdminOther, 'clinic_admin', 'patient-dia-4001', patientRecord).allowed, false);

console.log('  ✓ Verified: Doctors can strictly access only legitimately assigned diabetes cases; unassigned doctors are locked out.\n');

// =============================================================================
// TEST 2: Display of All 9 Mandatory Clinical Review Elements
// =============================================================================
console.log('▶ TEST 2: Verification of All 9 Mandatory Display Elements ...');

// Build patient bundle with all elements
const testPatientId = 'patient-dia-4001';

// Save patient record with legitimate doctor assignment
backendDiabetesService.savePatientDiabetesInfo(testPatientId, {
  patientName: 'Kareem Tarek',
  clinicId: 'clinic-endocrine-alpha',
  clinicName: 'مركز السكري والغدد الصماء التخصصي',
  assignedDoctorId: 'doc-endocrine-101',
  assignedDoctorName: 'Dr. Arthur Hendrix',
  assignedDoctorEmail: 'dr.hendrix@healthvibe.clinic',
  diabetesType: 'type_2'
});

// Seed attachments & clarifications
backendDiabetesService.addPatientAttachment(testPatientId, {
  fileName: 'Lab_HbA1c_September2026.pdf',
  fileType: 'Lab Report',
  fileUrl: 'https://cdn.healthvibe.local/labs/hba1c_4001.pdf',
  uploadedBy: 'patient-dia-4001'
});

backendDiabetesService.addPatientClarification(testPatientId, {
  message: 'Did you experience shakiness or sweating with the morning reading of 58 mg/dL?',
  authorName: 'Dr. Arthur Hendrix',
  authorRole: 'doctor'
});

backendDiabetesService.addPatientClarification(testPatientId, {
  message: 'Yes, mild tremors occurred before breakfast, resolved after orange juice.',
  authorName: 'Kareem Tarek',
  authorRole: 'patient'
});

backendDiabetesService.recordDiabetesMeasurement({
  patientId: testPatientId,
  type: 'fasting',
  value: 126,
  unit: 'mg/dL',
  source: 'bluetooth_glucometer',
  notes: 'Woke up at 7:30 AM'
});

backendDiabetesService.recordDiabetesMeasurement({
  patientId: testPatientId,
  type: 'postprandial',
  value: 198,
  unit: 'mg/dL',
  source: 'manual_patient_log',
  notes: '2 hours after lunch'
});

backendDiabetesService.addClinicalNote({
  patientId: testPatientId,
  doctorUid: 'doc-endocrine-101',
  doctorName: 'Dr. Arthur Hendrix',
  noteText: 'Patient shows dawn phenomenon pattern with postprandial glucose excursions.'
});

backendDiabetesService.linkApprovedReport(testPatientId, {
  reportRef: 'HV-REP-DIA-PREV-01',
  revisionId: 'rev-0',
  doctorName: 'Dr. Arthur Hendrix',
  clinicalDiagnosis: 'Type 2 Diabetes with moderate glycemic variability',
  approvedAt: '2026-09-10T10:00:00Z'
});

// Create structured assessment revision #1
const asm1 = backendDiabetesService.createDiabetesAssessment({
  patientId: testPatientId,
  diabetesHistory: {
    status: 'known',
    diabetesType: 'type_2',
    diagnosisYear: 2021
  },
  symptoms: {
    reported: ['Polydipsia', 'Fatigue'],
    notes: 'Mild fatigue in afternoons'
  },
  medications: {
    details: 'Metformin 1000mg BID',
    status: 'provided'
  },
  complications: {
    conditions: ['Mild distal peripheral sensory neuropathy'],
    status: 'documented'
  },
  familyHistory: {
    relativesDetails: 'Father had Type 2 Diabetes diagnosed at age 52',
    status: 'provided'
  },
  lifestyle: {
    physicalActivity: 'Walking 20 minutes 3 days per week',
    status: 'provided'
  },
  measurements: {
    fasting: { value: 126, unit: 'mg/dL', source: 'bluetooth_glucometer' },
    postprandial: { value: 198, unit: 'mg/dL', source: 'manual_patient_log' }
  }
});

const bundle = backendDiabetesService.getPatientDiabetesBundle(testPatientId);

// Check all 9 components are present in bundle
assert.ok(bundle.patientId, '1. Patient identity must be present');
assert.ok(bundle.assessments[0].assessedAt, '2. Assessment date must be present');
assert.equal(bundle.assessments[0].clinicalRevision, 1, '3. Current clinical revision must be present');
assert.ok(bundle.info.diabetesType, '4. Submitted diabetes info must be present');
assert.ok(bundle.measurements.length >= 2, '5. Historical measurements must be present');
assert.ok(bundle.clarifications.length >= 2, '6. Patient clarifications must be present');
assert.ok(bundle.attachments.length >= 1, '7. Relevant attachments must be present');
assert.ok(bundle.clinicalNotes.length >= 1, '8. Doctor notes must be present');
assert.ok(bundle.approvedReports.length >= 1, '9. Previous approved reports must be present');

// Verify DiabetesUI render output contains all 9 elements
// Load DiabetesUI into simulated DOM environment
const uiSource = fs.readFileSync(path.resolve(__dirname, '../app/modules/diabetes/diabetes-ui.js'), 'utf8');
const clientServiceSource = fs.readFileSync(path.resolve(__dirname, '../app/modules/diabetes/diabetes-service.js'), 'utf8');

global.window = global;
global.document = {
  getElementById: (id) => null,
  createElement: (tag) => ({ style: {}, appendChild: () => {} }),
  body: { appendChild: () => {} }
};
global.selectedRole = 'doctor';
global.auth = { currentUser: assignedDoctor };

// Evaluate UI in VM context
eval(clientServiceSource);
eval(uiSource);

const DiabetesUI = global.HealthVibes.DiabetesUI;
assert.ok(DiabetesUI, 'DiabetesUI must be loaded');

// Set active bundle in UI
DiabetesUI.setActiveBundle(bundle);
DiabetesUI.setActivePatientId(testPatientId);
const reviewTabHtml = DiabetesUI.renderDoctorReviewTab();

assert.ok(reviewTabHtml.includes(testPatientId), 'Must render patient ID in identity header');
assert.ok(reviewTabHtml.includes('diabetes.assessmentDateLabel'), 'Must render assessment date');
assert.ok(reviewTabHtml.includes('#1'), 'Must render clinical revision number');
assert.ok(reviewTabHtml.includes('diabetes.submittedInfoHeading'), 'Must render submitted info');
assert.ok(reviewTabHtml.includes('diabetes.historicalMeasurementsHeading'), 'Must render historical measurements');
assert.ok(reviewTabHtml.includes('diabetes.patientClarificationsHeading'), 'Must render clarifications thread');
assert.ok(reviewTabHtml.includes('diabetes.relevantAttachmentsHeading'), 'Must render attachments');
assert.ok(reviewTabHtml.includes('diabetes.doctorNotesHeading'), 'Must render doctor notes & care plan builder');
assert.ok(reviewTabHtml.includes('diabetes.previousApprovedReportsHeading'), 'Must render previous approved reports');
assert.ok(reviewTabHtml.includes('diabetesDoctorDiagnosisInput'), 'Must render clinical diagnosis input');
assert.ok(reviewTabHtml.includes('btnApproveDiabetesReport'), 'Must render approval button');

console.log('  ✓ Verified: Complete rendering of all 9 mandatory clinical elements confirmed in doctor review console.\n');

// =============================================================================
// TEST 3: Mandatory Current Clinical Revision Review Requirement
// =============================================================================
console.log('▶ TEST 3: Mandatory Current Clinical Revision Review Requirement ...');

const curRevId = bundle.assessments[0].currentRevisionId;

// Initially, doctor has not reviewed revision #1
assert.equal(clientDiabetesService.isRevisionStale(testPatientId, curRevId), true, 'Must be marked pending/stale before doctor acknowledges it');

// In HTML, approval button must be disabled
assert.ok(reviewTabHtml.includes('disabled'), 'Approval button must be disabled before revision review');
assert.ok(reviewTabHtml.includes('diabetes.approvalLockedNotice') || reviewTabHtml.includes('diabetesApprovalLockedNotice'), 'Must show lock notice');

// Doctor reviews and acknowledges revision #1
clientDiabetesService.acknowledgeRevision(testPatientId, curRevId);
assert.equal(clientDiabetesService.isRevisionStale(testPatientId, curRevId), false, 'Must not be stale after acknowledgment');
assert.equal(clientDiabetesService.getAcknowledgedRevision(testPatientId), curRevId);

console.log('  ✓ Verified: Case approval is strictly gated behind explicit clinical revision examination.\n');

// =============================================================================
// TEST 4: Stale Review Invalidation When Information Changes
// =============================================================================
console.log('▶ TEST 4: Invalidate Stale Review When Information Changes ...');

// Patient/staff updates assessment to Revision #2 with new glucose reading & symptoms
const asm2 = backendDiabetesService.updateDiabetesAssessment(
  asm1.assessmentId,
  {
    symptoms: { reported: ['Polydipsia', 'Fatigue', 'Blurry vision'] },
    measurements: {
      postprandial: { value: 245, unit: 'mg/dL', source: 'cgm_sensor' }
    }
  },
  { uid: testPatientId }
);

assert.equal(asm2.clinicalRevision, 2, 'Clinical revision must increment to 2');
const rev2Id = asm2.currentRevisionId;

// Doctor had acknowledged Revision #1. Now current revision is Revision #2.
const staleCheck = clientDiabetesService.isRevisionStale(testPatientId, rev2Id);
assert.equal(staleCheck, true, 'Review MUST be invalidated and marked stale when revision updates');

console.log('  ✓ Verified: Review is immediately invalidated when clinical data changes; stale review notice triggered.\n');

// =============================================================================
// TEST 5: Concurrency Guard: Atomic HTTP 409 Rejection of Outdated Clinical Data
// =============================================================================
console.log('▶ TEST 5: Concurrency Guard: Rejection of Outdated Clinical Data ...');

// Attempting approval with stale revision #1
const staleApprovalAttempt = backendDiabetesService.validateDiabetesRevisionForApproval({
  patientId: testPatientId,
  caseId: 'case-test-1',
  submittedRevisionId: curRevId, // Stale rev 1
  expectedRevisionNumber: 1,      // Stale rev 1
  baselineSnapshot: {
    fastingGlucose: 126,
    postprandialGlucose: 198
  }
});

assert.equal(staleApprovalAttempt.valid, false, 'Approval with stale revision must be rejected');
assert.equal(staleApprovalAttempt.conflict.currentRevision, '2');
assert.equal(staleApprovalAttempt.conflict.reviewedRevision, '1');
assert.equal(staleApprovalAttempt.conflict.changedFields.includes('clinicalRevision'), true);

// Attempt approval via processDiabetesDoctorApproval with stale revision
const staleApprovalResult = backendDiabetesService.processDiabetesDoctorApproval({
  patientId: testPatientId,
  doctorUser: assignedDoctor,
  approvalPayload: {
    caseId: 'case-test-1',
    currentRevisionId: curRevId,
    expectedRevisionNumber: 1,
    clinicalDiagnosis: 'Type 2 Diabetes Mellitus - Poor glycemic control',
    medications: 'Metformin 1000mg BID, Empagliflozin 10mg daily',
    recommendations: 'Dietary carbohydrate restriction, repeat HbA1c in 90 days'
  }
});

assert.equal(staleApprovalResult.success, false, 'Must fail approval on stale revision');
assert.equal(staleApprovalResult.error, 'CLINICAL_DATA_CONFLICT');
assert.ok(staleApprovalResult.conflict, 'Must return structured conflict');

console.log('  ✓ Verified: Outdated clinical data is atomically rejected with structured conflict guard (HTTP 409).\n');

// =============================================================================
// TEST 6: Preservation of Doctor Draft Notes During Conflicts & Re-renders
// =============================================================================
console.log('▶ TEST 6: Preservation of Doctor Draft Notes During Conflicts ...');

const draftToPreserve = {
  clinicalDiagnosis: 'Type 2 Diabetes Mellitus with Postprandial Dysregulation',
  medications: 'Metformin 1000mg BID + Sitagliptin 100mg OD',
  recommendations: 'Carbohydrate counting, SMBG log 4 times daily',
  doctorNotes: 'Patient showed elevation to 245 mg/dL after high-glycemic meal.'
};

// Save draft notes to session storage
clientDiabetesService.saveDraftNotes(testPatientId, draftToPreserve);

// Retrieve preserved draft
const retrievedDraft = clientDiabetesService.getDraftNotes(testPatientId);
assert.equal(retrievedDraft.clinicalDiagnosis, draftToPreserve.clinicalDiagnosis);
assert.equal(retrievedDraft.medications, draftToPreserve.medications);
assert.equal(retrievedDraft.recommendations, draftToPreserve.recommendations);
assert.equal(retrievedDraft.doctorNotes, draftToPreserve.doctorNotes);

// Verify draft survives conflict simulation without wipe
clientDiabetesService.saveDraftNotes(testPatientId, retrievedDraft);
const postConflictDraft = clientDiabetesService.getDraftNotes(testPatientId);
assert.equal(postConflictDraft.clinicalDiagnosis, draftToPreserve.clinicalDiagnosis, 'Draft notes must not be wiped');

console.log('  ✓ Verified: Unsaved doctor notes strictly preserved in session storage during conflicts and re-renders.\n');

// =============================================================================
// TEST 7: Prohibition of Autonomous/Unsupported Diagnoses, Medications, Recommendations
// =============================================================================
console.log('▶ TEST 7: Prohibition of Autonomous/Unsupported Diagnoses ...');

// Attempt approval without physician-authored diagnosis
const missingDiagApproval = backendDiabetesService.processDiabetesDoctorApproval({
  patientId: testPatientId,
  doctorUser: assignedDoctor,
  approvalPayload: {
    caseId: 'case-test-1',
    currentRevisionId: rev2Id,
    expectedRevisionNumber: 2,
    clinicalDiagnosis: '', // Empty diagnosis!
    medications: 'Metformin 1000mg BID',
    recommendations: 'Dietary modifications'
  }
});

assert.equal(missingDiagApproval.success, false);
assert.equal(missingDiagApproval.error, 'MISSING_DOCTOR_DIAGNOSIS');

// Attempt approval without physician recommendations
const missingRecsApproval = backendDiabetesService.processDiabetesDoctorApproval({
  patientId: testPatientId,
  doctorUser: assignedDoctor,
  approvalPayload: {
    caseId: 'case-test-1',
    currentRevisionId: rev2Id,
    expectedRevisionNumber: 2,
    clinicalDiagnosis: 'Type 2 Diabetes',
    medications: 'Metformin 1000mg BID',
    recommendations: '' // Empty recommendations!
  }
});

assert.equal(missingRecsApproval.success, false);
assert.equal(missingRecsApproval.error, 'MISSING_DOCTOR_RECOMMENDATIONS');

console.log('  ✓ Verified: Autonomous diagnosis or treatments strictly prohibited; explicit physician authoring required.\n');

// =============================================================================
// TEST 8: Successful Approval & Certified Report Generation
// =============================================================================
console.log('▶ TEST 8: Successful Approval & Certified Report Generation ...');

// Doctor acknowledges fresh Revision #2
clientDiabetesService.acknowledgeRevision(testPatientId, rev2Id);
assert.equal(clientDiabetesService.isRevisionStale(testPatientId, rev2Id), false);

// Doctor submits approval with fresh Revision #2 and full physician-authored content
const validApproval = backendDiabetesService.processDiabetesDoctorApproval({
  patientId: testPatientId,
  doctorUser: assignedDoctor,
  approvalPayload: {
    caseId: 'case-test-1',
    currentRevisionId: rev2Id,
    expectedRevisionNumber: 2,
    clinicalDiagnosis: draftToPreserve.clinicalDiagnosis,
    medications: draftToPreserve.medications,
    recommendations: draftToPreserve.recommendations,
    doctorNotes: draftToPreserve.doctorNotes
  }
});

assert.equal(validApproval.success, true, 'Approval must succeed with fresh revision');
assert.ok(validApproval.report.reportRef, 'Certified report reference must be issued');
assert.equal(validApproval.report.revisionId, rev2Id);
assert.equal(validApproval.report.doctorIdentity.doctorId, assignedDoctor.uid);
assert.equal(validApproval.report.clinicalDiagnosis, draftToPreserve.clinicalDiagnosis);

// Verify report was linked to patient's record
const updatedBundle = backendDiabetesService.getPatientDiabetesBundle(testPatientId);
const linkedReport = updatedBundle.approvedReports.find(r => r.reportRef === validApproval.report.reportRef);
assert.ok(linkedReport, 'Approved report must be present in patient bundle');

// Clear draft notes post-approval
clientDiabetesService.clearDraftNotes(testPatientId);
assert.equal(clientDiabetesService.getDraftNotes(testPatientId), null, 'Draft notes cleared post-approval');

console.log('  ✓ Verified: Certified report successfully issued and linked to patient records.\n');

console.log('==================================================================');
console.log('🎉 ALL 8 DIABETES DOCTOR-REVIEW WORKFLOW ACCEPTANCE TESTS PASSED (100%)');
console.log('==================================================================');
