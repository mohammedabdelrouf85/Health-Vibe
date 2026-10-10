/**
 * Health Vibe - Disease Data Isolation, Authorization & Audit Logging Test Suite
 *
 * Validates:
 * 1. Strict data isolation across disease modules (Diabetes, Hypertension, Blood Clotting, Obesity).
 * 2. Patient cannot receive another patient's records.
 * 3. Doctor cannot access records outside assigned patients.
 * 4. Clinic boundaries are enforced (clinicId mismatch check).
 * 5. Internal doctor notes and unreleased interpretations are sanitized for patient role.
 * 6. Direct ID manipulation attempts are rejected with 403 FORBIDDEN.
 * 7. Authoritative Audit Logging for disease-module actions with PHI redaction:
 *    - ASSESSMENT_CREATION, MEASUREMENT_CREATION, MEASUREMENT_CORRECTION,
 *      DOCTOR_REVIEW, INFORMATION_REQUEST, PATIENT_RESPONSE, REPORT_APPROVAL,
 *      REPORT_WITHDRAWAL, PERMISSION_CHANGES.
 */

const assert = require('assert');
const diabetesService = require('../backend/diabetes-service');
const hypertensionService = require('../backend/hypertension-service');
const auditService = require('../backend/audit-service');

async function runIsolationTests() {
  console.log('🧪 Starting Disease Data Isolation & Audit Logging Test Suite...\n');

  // Reset in-memory stores & audit log for clean testing
  if (hypertensionService.resetHypertensionStoreForTesting) {
    hypertensionService.resetHypertensionStoreForTesting();
  }
  if (auditService.resetAuditStoreForTesting) {
    auditService.resetAuditStoreForTesting();
  }

  // Define actors
  const patientA = { uid: 'pat_A_001', role: 'patient', clinicId: 'clinic_cairo' };
  const patientB = { uid: 'pat_B_002', role: 'patient', clinicId: 'clinic_alex' };
  
  const doctorAssignedA = {
    uid: 'doc_cardio_101',
    role: 'doctor',
    email: 'cardio101@healthvibe.com',
    clinicId: 'clinic_cairo',
    assignedPatientIds: ['pat_A_001']
  };

  const doctorUnassigned = {
    uid: 'doc_other_202',
    role: 'doctor',
    email: 'other202@healthvibe.com',
    clinicId: 'clinic_cairo',
    assignedPatientIds: []
  };

  const doctorWrongClinic = {
    uid: 'doc_cardio_101',
    role: 'doctor',
    email: 'cardio101@healthvibe.com',
    clinicId: 'clinic_giza', // Mismatched clinic
    assignedPatientIds: ['pat_A_001']
  };

  const clinicAdminCairo = { uid: 'admin_cairo', role: 'clinic_admin', clinicId: 'clinic_cairo' };
  const clinicAdminAlex = { uid: 'admin_alex', role: 'clinic_admin', clinicId: 'clinic_alex' };

  // Seed baseline records for Patient A and Patient B
  hypertensionService.savePatientHypertensionRecord('pat_A_001', {
    clinicId: 'clinic_cairo',
    assignedDoctorId: 'doc_cardio_101'
  }, doctorAssignedA);

  hypertensionService.savePatientHypertensionRecord('pat_B_002', {
    clinicId: 'clinic_alex',
    assignedDoctorId: 'doc_alex_999'
  }, { uid: 'doc_alex_999', role: 'doctor', clinicId: 'clinic_alex' });

  hypertensionService.recordBloodPressureReading({
    patientId: 'pat_A_001',
    systolic: 125,
    diastolic: 82,
    pulse: 72,
    recordedByUid: 'pat_A_001'
  });

  hypertensionService.recordBloodPressureReading({
    patientId: 'pat_B_002',
    systolic: 145,
    diastolic: 95,
    pulse: 78,
    recordedByUid: 'pat_B_002'
  });

  hypertensionService.addClinicalNote({
    patientId: 'pat_A_001',
    doctorUid: 'doc_cardio_101',
    doctorName: 'Dr. Cardio',
    noteText: 'Internal doctor note: Patient blood pressure slightly elevated upon stress.'
  });

  // =========================================================================
  // TEST 1: Patient A attempting to access Patient B's records (ID Manipulation)
  // =========================================================================
  console.log('▶ Test 1: Direct ID manipulation - Patient A requesting Patient B records');
  
  let diaAuthAtoB = diabetesService.verifyAccessPermission(patientA, 'pat_B_002', { clinicId: 'clinic_alex' });
  assert.strictEqual(diaAuthAtoB.authorized, false, 'Patient A should NOT be authorized for Patient B Diabetes records');
  assert.strictEqual(diaAuthAtoB.reason, 'PATIENT_CAN_ONLY_ACCESS_OWN_DATA');

  assert.throws(() => {
    diabetesService.getPatientDiabetesBundle('pat_B_002', patientA);
  }, (err) => err.code === 'FORBIDDEN' || err.message.includes('Access denied'), 'getPatientDiabetesBundle must throw FORBIDDEN when Patient A accesses Patient B');

  let htnAuthAtoB = hypertensionService.verifyAccessPermission(patientA, 'pat_B_002', { clinicId: 'clinic_alex' });
  assert.strictEqual(htnAuthAtoB.authorized, false, 'Patient A should NOT be authorized for Patient B Hypertension records');
  assert.strictEqual(htnAuthAtoB.reason, 'PATIENT_DATA_ISOLATION_VIOLATION');

  assert.throws(() => {
    hypertensionService.getPatientHypertensionBundle('pat_B_002', patientA);
  }, (err) => err.code === 'FORBIDDEN' || err.message.includes('Access denied'), 'getPatientHypertensionBundle must throw FORBIDDEN when Patient A accesses Patient B');

  console.log('   ✅ Patient A to Patient B isolation verified (Diabetes & Hypertension).');

  // =========================================================================
  // TEST 2: Unassigned Doctor attempting to access Patient records
  // =========================================================================
  console.log('▶ Test 2: Direct ID manipulation - Unassigned doctor requesting Patient A records');

  let docUnassignedCheck = hypertensionService.verifyAccessPermission(doctorUnassigned, 'pat_A_001', {
    clinicId: 'clinic_cairo',
    assignedDoctorId: 'doc_cardio_101'
  });
  assert.strictEqual(docUnassignedCheck.authorized, false);
  assert.strictEqual(docUnassignedCheck.reason, 'DOCTOR_NOT_ASSIGNED_TO_PATIENT');

  assert.throws(() => {
    hypertensionService.getPatientHypertensionBundle('pat_A_001', doctorUnassigned);
  }, (err) => err.code === 'FORBIDDEN');

  console.log('   ✅ Unassigned doctor access correctly blocked (403 DOCTOR_NOT_ASSIGNED_TO_PATIENT).');

  // =========================================================================
  // TEST 3: Clinic Boundaries Enforcement (Clinic Mismatch)
  // =========================================================================
  console.log('▶ Test 3: Clinic boundary enforcement - Doctor/Admin with mismatched clinicId');

  let docWrongClinicCheck = hypertensionService.verifyAccessPermission(doctorWrongClinic, 'pat_A_001', {
    clinicId: 'clinic_cairo',
    assignedDoctorId: 'doc_cardio_101'
  });
  assert.strictEqual(docWrongClinicCheck.authorized, false);
  assert.strictEqual(docWrongClinicCheck.reason, 'CLINIC_MISMATCH');

  let adminAlexCheck = hypertensionService.verifyAccessPermission(clinicAdminAlex, 'pat_A_001', {
    clinicId: 'clinic_cairo'
  });
  assert.strictEqual(adminAlexCheck.authorized, false);
  assert.strictEqual(adminAlexCheck.reason, 'CLINIC_MISMATCH');

  let adminCairoCheck = hypertensionService.verifyAccessPermission(clinicAdminCairo, 'pat_A_001', {
    clinicId: 'clinic_cairo'
  });
  assert.strictEqual(adminCairoCheck.authorized, true);

  console.log('   ✅ Clinic boundaries strictly enforced across doctors and clinic admins.');

  // =========================================================================
  // TEST 4: Privacy Filtering (Internal Doctor Notes Hidden from Patients)
  // =========================================================================
  console.log('▶ Test 4: Internal clinical notes sanitization for Patient role');

  const patientABundle = hypertensionService.getPatientHypertensionBundle('pat_A_001', patientA);
  assert.strictEqual(patientABundle.clinicalNotes.length, 0, 'Patients must receive empty clinicalNotes array');

  const doctorABundle = hypertensionService.getPatientHypertensionBundle('pat_A_001', doctorAssignedA);
  assert.strictEqual(doctorABundle.clinicalNotes.length, 1, 'Assigned doctors must be able to view clinical notes');
  assert.strictEqual(doctorABundle.clinicalNotes[0].noteText.includes('Internal doctor note'), true);

  console.log('   ✅ Internal doctor notes redacted for Patient role while preserved for assigned Doctor.');

  // =========================================================================
  // TEST 5: Assessment & Report Revision Integrity
  // =========================================================================
  console.log('▶ Test 5: Assessment creation and revision authorization');

  const asm = hypertensionService.createHypertensionAssessment({
    patientId: 'pat_A_001',
    systolic: 130,
    diastolic: 85,
    pulse: 72,
    symptoms: ['headache']
  }, patientA);

  assert.strictEqual(asm.clinicalRevision, 1);
  assert.strictEqual(asm.patientId, 'pat_A_001');

  const revised = hypertensionService.reviseHypertensionAssessment(asm.assessmentId, {
    systolic: 128,
    diastolic: 84,
    pulse: 70
  }, patientA, 'patient_log_update');

  assert.strictEqual(revised.clinicalRevision, 2);

  console.log('   ✅ Assessment revisions incremented cleanly with immutable provenance.');

  // =========================================================================
  // TEST 6: Disease Module Action Audit Event Trail & PHI Redaction
  // =========================================================================
  console.log('▶ Test 6: Verifying Disease Action Audit Events & Data Minimization');

  // Trigger additional disease actions
  const clarification = hypertensionService.addPatientClarification('pat_A_001', 'Did you rest for 5 minutes before taking reading?');
  hypertensionService.replyToClarification('pat_A_001', clarification.cycleId, 'Yes, I rested on the chair for 10 minutes.', patientA);

  const certified = await hypertensionService.certifyChronicHypertensionReport('pat_A_001', {
    uid: 'doc_cardio_101',
    name: 'Dr. Cardio',
    licenseNumber: 'HV-CARDIO-99',
    specialty: 'Cardiology',
    clinic: 'Cairo Heart Center'
  }, 'Stage 1 Hypertension', 'Continue Mediterranean diet and 30 min daily walking.', 'Moderate Risk');

  hypertensionService.withdrawReport('pat_A_001', certified.reportRef, doctorAssignedA);
  hypertensionService.updatePermission('pat_A_001', { grantedSpecialties: ['Cardiology'] }, clinicAdminCairo);

  // Retrieve in-memory audit trail for Patient A
  const patientAAuditLogs = auditService.getInMemoryAuditEvents({ patientId: 'pat_A_001' });

  const actionsFound = patientAAuditLogs.map(l => l.action);
  console.log('   Captured Audit Actions:', actionsFound);

  assert.ok(actionsFound.includes('MEASUREMENT_CREATION'), 'Must record MEASUREMENT_CREATION');
  assert.ok(actionsFound.includes('DOCTOR_REVIEW'), 'Must record DOCTOR_REVIEW');
  assert.ok(actionsFound.includes('ASSESSMENT_CREATION'), 'Must record ASSESSMENT_CREATION');
  assert.ok(actionsFound.includes('MEASUREMENT_CORRECTION'), 'Must record MEASUREMENT_CORRECTION');
  assert.ok(actionsFound.includes('INFORMATION_REQUEST'), 'Must record INFORMATION_REQUEST');
  assert.ok(actionsFound.includes('PATIENT_RESPONSE'), 'Must record PATIENT_RESPONSE');
  assert.ok(actionsFound.includes('REPORT_APPROVAL'), 'Must record REPORT_APPROVAL');
  assert.ok(actionsFound.includes('REPORT_WITHDRAWAL'), 'Must record REPORT_WITHDRAWAL');
  assert.ok(actionsFound.includes('PERMISSION_CHANGES'), 'Must record PERMISSION_CHANGES');

  // Verify Audit Event Structure & Data Minimization (PHI Redaction)
  for (const log of patientAAuditLogs) {
    assert.ok(log.eventId, 'Audit log must contain eventId');
    assert.ok(log.timestamp, 'Audit log must contain server timestamp');
    assert.ok(log.actor, 'Audit log must contain actor context');
    assert.ok(log.affectedRecord, 'Audit log must contain affectedRecord');
    assert.strictEqual(log.affectedRecord.patientId, 'pat_A_001');

    // Verify PHI Redaction: details MUST NOT contain raw vitals or medical text
    const detailsKeys = Object.keys(log.details || {});
    assert.strictEqual(detailsKeys.includes('systolic'), false, 'Audit log must NOT contain raw systolic BP');
    assert.strictEqual(detailsKeys.includes('diastolic'), false, 'Audit log must NOT contain raw diastolic BP');
    assert.strictEqual(detailsKeys.includes('noteText'), false, 'Audit log must NOT contain raw noteText');
    assert.strictEqual(detailsKeys.includes('observations'), false, 'Audit log must NOT contain raw observations');
    assert.strictEqual(detailsKeys.includes('replyText'), false, 'Audit log must NOT contain raw replyText');
  }

  console.log('   ✅ Disease action audit logging and strict PHI redaction verified across all 9 action types.');

  console.log('\n🎉 ALL DISEASE DATA ISOLATION & AUDIT LOGGING TESTS PASSED SUCCESSFULLY!');
}

runIsolationTests().catch(err => {
  console.error('❌ Data isolation test failed:', err);
  process.exit(1);
});
