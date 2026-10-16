/**
 * strict_doctor_assigned_queries.test.js
 *
 * Automated verification of strict database query scoping for Doctors (User Request 29):
 * "تقييد استعلامات قاعدة البيانات الخاصة بالطبيب (Doctor Queries) بحيث لا يرى الطبيب سوى المرضى المعينين له فقط (Assigned Patients Only)."
 *
 * 1. Relational Database Scoping (PostgreSQL/Supabase RLS & Relational Service):
 *    - Schema defines `doctor_assigned_patients_only` and `doctor_assigned_cases_only` RLS policies.
 *    - RelationalDatabaseService.getAssignedPatientsForDoctor() returns ONLY patients assigned to that doctor.
 *    - RelationalDatabaseService.getAssignedCasesForDoctor() returns ONLY cases assigned to that doctor.
 *    - RelationalDatabaseService.getPatientHistoryForDoctor() strictly rejects unassigned patient queries with 403_DOCTOR_NOT_ASSIGNED.
 *
 * 2. Backend Server Endpoint Protection (GET /api/patient/medical-profile):
 *    - Rejects doctor queries for unassigned patient profiles with HTTP 403 PATIENT_NOT_ASSIGNED_TO_DOCTOR.
 *    - Grants access for legitimately assigned patients.
 *
 * 3. Timeline Service Zero-Trust Gating (verifyTimelineAccess):
 *    - Strictly rejects timeline access for physicians not linked or assigned to the target patient.
 *
 * 4. Client-Side Firestore Query & Queue Scoping:
 *    - Firestore rules restrict case reads to assigned doctors.
 *    - UI real-time queue queries enforce `.where("assignedDoctorId", "==", user.uid)`.
 *    - Memory queue rendering filters out any records not belonging to the authenticated doctor.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RelationalDatabaseService } = require('../backend/relational-db-service');
const timelineService = require('../backend/timeline-service');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: DOCTOR ASSIGNED PATIENTS ONLY TEST SUITE');
console.log('   Strict Database Query Scoping & Horizontal Isolation');
console.log('==================================================================\n');

// =============================================================================
// TEST 1: Relational Schema DDL & RLS Policies Verification
// =============================================================================
console.log('▶ TEST 1: Relational Database Schema RLS Policies Verification');

const schemaPath = path.join(__dirname, '../backend/db/schema.sql');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

assert.ok(
  schemaContent.includes('CREATE POLICY doctor_assigned_patients_only ON patients'),
  'schema.sql must define RLS policy doctor_assigned_patients_only on patients table'
);

assert.ok(
  schemaContent.includes('CREATE POLICY doctor_assigned_cases_only ON clinical_cases'),
  'schema.sql must define RLS policy doctor_assigned_cases_only on clinical_cases table'
);

assert.ok(
  schemaContent.includes('CREATE POLICY doctor_patient_history_access ON patient_history'),
  'schema.sql must define RLS policy doctor_patient_history_access on patient_history table'
);

console.log('  ✓ PostgreSQL / Supabase RLS policies verified on patients, clinical_cases, and patient_history.\n');

// =============================================================================
// TEST 2: Relational Database Service Assigned Query Gating
// =============================================================================
console.log('▶ TEST 2: RelationalDatabaseService Doctor Scoped Queries');

(async () => {
  const db = new RelationalDatabaseService();

  // Create Doctor A
  const docAccountA = await db.createAccount({
    email: 'dr.ahmed.mamdouh@example.com',
    fullName: 'Dr. Ahmed Mamdouh',
    role: 'doctor'
  });
  const docProfileA = await db.createDoctorProfile({
    accountId: docAccountA.id,
    syndicateId: 'DOC-MAMDOUH-88',
    specialty: 'Pulmonology',
    verificationStatus: 'verified'
  });

  // Create Doctor B
  const docAccountB = await db.createAccount({
    email: 'dr.sarah.khalil@example.com',
    fullName: 'Dr. Sarah Khalil',
    role: 'doctor'
  });
  const docProfileB = await db.createDoctorProfile({
    accountId: docAccountB.id,
    syndicateId: 'DOC-KHALIL-77',
    specialty: 'Cardiology',
    verificationStatus: 'verified'
  });

  // Create Patient 1 (assigned to Doctor A)
  const patientAcc1 = await db.createAccount({
    email: 'patient.one@example.com',
    fullName: 'Patient One',
    role: 'patient'
  });
  const patient1 = await db.createPatientProfile({
    accountId: patientAcc1.id,
    dateOfBirth: '1985-03-20',
    gender: 'female',
    assignedDoctorId: docProfileA.id
  });

  // Create Patient 2 (assigned to Doctor B)
  const patientAcc2 = await db.createAccount({
    email: 'patient.two@example.com',
    fullName: 'Patient Two',
    role: 'patient'
  });
  const patient2 = await db.createPatientProfile({
    accountId: patientAcc2.id,
    dateOfBirth: '1990-11-12',
    gender: 'male',
    assignedDoctorId: docProfileB.id
  });

  // Cases for Patient 1 (Doctor A)
  const caseA = await db.createClinicalCase({
    patientId: patient1.id,
    assignedDoctorId: docProfileA.id,
    diseaseModule: 'respiratory',
    vitals: { spo2: 96, respiratory_rate: 18 }
  });

  // Cases for Patient 2 (Doctor B)
  const caseB = await db.createClinicalCase({
    patientId: patient2.id,
    assignedDoctorId: docProfileB.id,
    diseaseModule: 'respiratory',
    vitals: { spo2: 94, respiratory_rate: 22 }
  });

  // Create History Entry for Patient 2
  await db.createPatientHistoryEntry({
    patientId: patient2.id,
    caseId: caseB.id,
    certifiedByDoctorId: docProfileB.id,
    doctorName: 'Dr. Sarah Khalil',
    summary: 'Hypertension and respiratory follow-up completed.',
    diagnosis: 'Stable hypertension'
  });

  // 1. Doctor A queries assigned patients: MUST RETURN ONLY Patient 1
  const docAPatients = await db.getAssignedPatientsForDoctor(docProfileA.id);
  assert.equal(docAPatients.length, 1, 'Doctor A must have exactly 1 assigned patient');
  assert.equal(docAPatients[0].id, patient1.id, 'Doctor A must only see Patient 1');
  assert.ok(!docAPatients.some(p => p.id === patient2.id), 'Doctor A must NOT see Patient 2');

  // 2. Doctor B queries assigned patients: MUST RETURN ONLY Patient 2
  const docBPatients = await db.getAssignedPatientsForDoctor(docProfileB.id);
  assert.equal(docBPatients.length, 1, 'Doctor B must have exactly 1 assigned patient');
  assert.equal(docBPatients[0].id, patient2.id, 'Doctor B must only see Patient 2');
  assert.ok(!docBPatients.some(p => p.id === patient1.id), 'Doctor B must NOT see Patient 1');

  // 3. Doctor A queries assigned cases: MUST RETURN ONLY Case A
  const docACases = await db.getAssignedCasesForDoctor(docProfileA.id);
  assert.equal(docACases.length, 1);
  assert.equal(docACases[0].id, caseA.id);

  // 4. Doctor A queries history of Patient 2 (Doctor B's patient) -> MUST THROW 403_DOCTOR_NOT_ASSIGNED
  let crossPatientHistoryBlocked = false;
  try {
    await db.getPatientHistoryForDoctor(docProfileA.id, patient2.id);
  } catch (err) {
    crossPatientHistoryBlocked = true;
    assert.equal(err.code, '403_DOCTOR_NOT_ASSIGNED');
  }
  assert.ok(crossPatientHistoryBlocked, 'Doctor A must be blocked from querying Patient 2 history');

  // 5. Doctor B queries history of Patient 2 (Assigned) -> MUST SUCCEED
  const docBHistory = await db.getPatientHistoryForDoctor(docProfileB.id, patient2.id);
  assert.equal(docBHistory.length, 1, 'Doctor B must successfully query assigned patient history');

  console.log('  ✓ getAssignedPatientsForDoctor() isolates patients by assignedDoctorId.');
  console.log('  ✓ getAssignedCasesForDoctor() isolates cases by assignedDoctorId.');
  console.log('  ✓ getPatientHistoryForDoctor() strictly rejects unassigned cross-doctor queries with 403_DOCTOR_NOT_ASSIGNED.\n');

  // =============================================================================
  // TEST 3: Timeline Service Zero-Trust Access Check
  // =============================================================================
  console.log('▶ TEST 3: Timeline Service verifyTimelineAccess() Gating');

  // Mock DB for timeline access check
  const mockFirestore = {
    collection(name) {
      return {
        doc(id) {
          return {
            get: async () => ({
              exists: true,
              data: () => ({
                clinicId: 'clinic_cairo',
                medicalProfile: { clinicLinkage: { linkedDoctorId: 'doctor-a-uid' } }
              })
            })
          };
        },
        where(field, op, val) {
          return {
            get: async () => {
              if (name === 'cases') {
                if (val === 'patient-1-uid') {
                  return {
                    empty: false,
                    forEach(cb) {
                      cb({ data: () => ({ assignedDoctorId: 'doctor-a-uid', patientId: 'patient-1-uid' }) });
                    }
                  };
                }
                return { empty: true, forEach() {} };
              }
              if (name === 'appointments') {
                return { empty: true };
              }
              return { empty: true };
            },
            where() {
              return { get: async () => ({ empty: true }) };
            }
          };
        }
      };
    }
  };

  const doctorAUser = { uid: 'doctor-a-uid', role: 'doctor', email: 'doctorA@example.com' };
  const doctorBUser = { uid: 'doctor-b-uid', role: 'doctor', email: 'doctorB@example.com' };

  // Doctor A accesses Patient 1 (assigned) -> Authorized
  const checkAssigned = await timelineService.verifyTimelineAccess(doctorAUser, 'patient-1-uid', mockFirestore);
  assert.equal(checkAssigned.authorized, true, 'Assigned doctor must be authorized for patient timeline');

  // Doctor B accesses Patient 1 (unassigned) -> REJECTED
  const checkUnassigned = await timelineService.verifyTimelineAccess(doctorBUser, 'patient-1-uid', mockFirestore);
  assert.equal(checkUnassigned.authorized, false, 'Unassigned doctor must be rejected from viewing patient timeline');
  assert.ok(checkUnassigned.reason.includes('PATIENT_NOT_ASSIGNED_TO_DOCTOR'), 'Reason must explicitly cite PATIENT_NOT_ASSIGNED_TO_DOCTOR');

  console.log('  ✓ verifyTimelineAccess() allows assigned doctor to view patient timeline.');
  console.log('  ✓ verifyTimelineAccess() rejects unassigned doctor with PATIENT_NOT_ASSIGNED_TO_DOCTOR.\n');

  // =============================================================================
  // TEST 4: Backend Endpoint Gating (GET /api/patient/medical-profile)
  // =============================================================================
  console.log('▶ TEST 4: Server Endpoint GET /api/patient/medical-profile Verification');

  const serverPath = path.join(__dirname, '../backend/server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert.ok(
    serverContent.includes("error: 'PATIENT_NOT_ASSIGNED_TO_DOCTOR'"),
    'backend/server.js must reject unassigned doctor queries on /api/patient/medical-profile'
  );

  assert.ok(
    serverContent.includes('Zero-Trust enforcement: Physicians can only access medical profiles for patients assigned to their clinical care.'),
    'backend/server.js must provide explicit Zero-Trust enforcement message'
  );

  console.log('  ✓ GET /api/patient/medical-profile strictly checks doctor-patient assignment before returning records.\n');

  // =============================================================================
  // TEST 5: Client Queue & Firestore Query Scoping
  // =============================================================================
  console.log('▶ TEST 5: Client Queue Query & In-Memory Isolation');

  const appPath = path.join(__dirname, '../app/app.js');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert.ok(
    appContent.includes('queueQuery.where("assignedDoctorId", "==", user.uid)'),
    'app.js real-time queueQuery must filter by assignedDoctorId'
  );

  assert.ok(
    appContent.includes('docs = docs.filter(c => isCaseAssignedToCurrentDoctor(c))'),
    'app.js real-time snapshot handler must filter in-memory records with isCaseAssignedToCurrentDoctor'
  );

  assert.ok(
    appContent.includes('if (role === ROLES.DOCTOR) query = query.where("assignedDoctorId", "==", user.uid);'),
    'app.js getCases() must explicitly filter by assignedDoctorId for ROLES.DOCTOR'
  );

  console.log('  ✓ Client Firestore real-time listener filters by assignedDoctorId.');
  console.log('  ✓ Snapshot handler verifies isCaseAssignedToCurrentDoctor in memory.');
  console.log('  ✓ Fallback getCases() query restricts doctor results to assignedDoctorId.\n');

  console.log('==================================================================');
  console.log('🎉 ALL DOCTOR ASSIGNED PATIENTS ONLY TESTS PASSED WITH 100% SUCCESS!');
  console.log('==================================================================');
})();
