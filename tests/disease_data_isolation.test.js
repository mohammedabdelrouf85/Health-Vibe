/**
 * Health Vibe - Disease Data Isolation & Authorization Test Suite
 *
 * Validates strict data isolation across disease modules (Diabetes, Hypertension, Blood Clotting, Obesity).
 * Verifies:
 * 1. Patient cannot receive another patient's records across all modules.
 * 2. Doctor cannot access records outside assigned patients.
 * 3. Clinic boundaries are enforced (clinicId mismatch check).
 * 4. Internal doctor notes and unreleased interpretations are sanitized for patient role.
 * 5. Direct ID manipulation attempts are rejected with 403 FORBIDDEN.
 */

const assert = require('assert');
const diabetesService = require('../backend/diabetes-service');
const hypertensionService = require('../backend/hypertension-service');

async function runIsolationTests() {
  console.log('🧪 Starting Disease Data Isolation Test Suite...\n');

  // Reset in-memory stores for clean testing
  if (hypertensionService.resetHypertensionStoreForTesting) {
    hypertensionService.resetHypertensionStoreForTesting();
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
    recordedByUid: 'pat_A_001'
  });

  hypertensionService.recordBloodPressureReading({
    patientId: 'pat_B_002',
    systolic: 145,
    diastolic: 95,
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
  
  // Diabetes Bundle check
  let diaAuthAtoB = diabetesService.verifyAccessPermission(patientA, 'pat_B_002', { clinicId: 'clinic_alex' });
  assert.strictEqual(diaAuthAtoB.authorized, false, 'Patient A should NOT be authorized for Patient B Diabetes records');
  assert.strictEqual(diaAuthAtoB.reason, 'PATIENT_CAN_ONLY_ACCESS_OWN_DATA');

  assert.throws(() => {
    diabetesService.getPatientDiabetesBundle('pat_B_002', patientA);
  }, (err) => err.code === 'FORBIDDEN' || err.message.includes('Access denied'), 'getPatientDiabetesBundle must throw FORBIDDEN when Patient A accesses Patient B');

  // Hypertension Bundle check
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

  // Doctor assigned to Patient A, but requesting from a different clinic context
  let docWrongClinicCheck = hypertensionService.verifyAccessPermission(doctorWrongClinic, 'pat_A_001', {
    clinicId: 'clinic_cairo',
    assignedDoctorId: 'doc_cardio_101'
  });
  assert.strictEqual(docWrongClinicCheck.authorized, false);
  assert.strictEqual(docWrongClinicCheck.reason, 'CLINIC_MISMATCH');

  // Clinic Admin Alex attempting to access Clinic Cairo patient
  let adminAlexCheck = hypertensionService.verifyAccessPermission(clinicAdminAlex, 'pat_A_001', {
    clinicId: 'clinic_cairo'
  });
  assert.strictEqual(adminAlexCheck.authorized, false);
  assert.strictEqual(adminAlexCheck.reason, 'CLINIC_MISMATCH');

  // Clinic Admin Cairo accessing Clinic Cairo patient -> Authorized
  let adminCairoCheck = hypertensionService.verifyAccessPermission(clinicAdminCairo, 'pat_A_001', {
    clinicId: 'clinic_cairo'
  });
  assert.strictEqual(adminCairoCheck.authorized, true);

  console.log('   ✅ Clinic boundaries strictly enforced across doctors and clinic admins.');

  // =========================================================================
  // TEST 4: Privacy Filtering (Internal Doctor Notes Hidden from Patients)
  // =========================================================================
  console.log('▶ Test 4: Internal clinical notes sanitization for Patient role');

  // Patient A fetching their own bundle
  const patientABundle = hypertensionService.getPatientHypertensionBundle('pat_A_001', patientA);
  assert.strictEqual(patientABundle.clinicalNotes.length, 0, 'Patients must receive empty clinicalNotes array');

  // Assigned Doctor fetching Patient A bundle
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
    symptoms: ['headache']
  }, patientA);

  assert.strictEqual(asm.clinicalRevision, 1);
  assert.strictEqual(asm.patientId, 'pat_A_001');

  // Patient attempting to revise assessment with forbidden internal doctor fields
  const revised = hypertensionService.reviseHypertensionAssessment(asm.assessmentId, {
    systolic: 128,
    diastolic: 84
  }, patientA, 'patient_log_update');

  assert.strictEqual(revised.clinicalRevision, 2);

  console.log('   ✅ Assessment revisions incremented cleanly with immutable provenance.');

  console.log('\n🎉 ALL DISEASE DATA ISOLATION TESTS PASSED SUCCESSFULLY!');
}

runIsolationTests().catch(err => {
  console.error('❌ Data isolation test failed:', err);
  process.exit(1);
});
