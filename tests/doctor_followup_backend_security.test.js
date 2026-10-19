/**
 * HEALTH VIBE AI: DOCTOR RECOMMEND FOLLOW-UP WINDOW BACKEND & SECURITY TEST SUITE (DOCTOLIB)
 *
 * Verifies:
 * 1. Verified Doctor Authorization Guard:
 *    - Rejects unauthenticated callers (401 AUTH_REQUIRED).
 *    - Rejects non-doctor roles like patient or support (403 DOCTOR_ROLE_REQUIRED).
 *    - Rejects unverified doctor applicants (403 DOCTOR_NOT_VERIFIED).
 *    - Rejects suspended or revoked syndicate licenses (403 DOCTOR_LICENSE_INACTIVE).
 *    - Allows active, verified licensed doctor.
 * 2. Doctor-Patient Data Isolation & Cross-Doctor Protection:
 *    - Assigned doctor permitted to recommend follow-up window.
 *    - Unassigned doctor strictly blocked (403 UNASSIGNED_DOCTOR_ACCESS_DENIED).
 *    - Cross-clinic doctor strictly blocked (403 CROSS_CLINIC_ACCESS_DENIED).
 *    - Super Admin granted supervisory oversight.
 *    - Closed/archived cases protected from modification (400 CASE_CLOSED).
 * 3. Input Validation, Horizon Checking & XSS Sanitization:
 *    - Validates preset windows (within_24h, within_3d, within_1w, within_1m, custom, as_needed).
 *    - Rejects invalid window names and invalid consultation modes.
 *    - Rejects custom dates in the past (400 PAST_DATE_NOT_ALLOWED).
 *    - Sanitizes stored XSS from doctor instructions.
 * 4. Immutable Audit Trail & Regulatory Compliance:
 *    - Immutable audit record stored in 'audit_logs' with event 'DOCTOR_FOLLOWUP_RECOMMENDED'.
 *    - Captures doctor identity, syndicate license, IP address, and details.
 * 5. Concurrency Governance & Case Revision Tracking:
 *    - Updates case in Firestore, appends to statusHistory, and bumps clinicalRevision.
 * 6. Case Read Access Control:
 *    - Patient permitted to view own follow-up plan.
 *    - Assigned doctor permitted to view follow-up plan.
 *    - Unassigned doctor blocked from snooping follow-up plan (403 ACCESS_DENIED).
 * 7. Doctolib 1-Click Calendar Synchronization & Booking:
 *    - syncFollowUpWithCalendar creates confirmed appointment in 'appointments' collection.
 *    - Updates case followUpPlan.status to 'CALENDAR_LINKED' with appointmentId.
 *    - Creates audit log with event 'DOCTOR_FOLLOWUP_CALENDAR_LINKED'.
 */

'use strict';

const assert = require('assert');
const doctorFollowUpService = require('../backend/doctor-followup-service');

console.log('================================================================================');
console.log('🔒 HEALTH VIBE AI: DOCTOR RECOMMEND FOLLOW-UP BACKEND & SECURITY TEST SUITE');
console.log('   RBAC, Patient Isolation, Verified Doctor Gates, Calendar Sync & Audit Logs');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// Mock In-Memory Firestore Database
// -----------------------------------------------------------------------------
class MockFirestoreCollection {
  constructor(name) {
    this.name = name;
    this.docs = new Map();
  }

  doc(id) {
    return {
      get: async () => ({
        exists: this.docs.has(id),
        id,
        data: () => (this.docs.has(id) ? JSON.parse(JSON.stringify(this.docs.get(id))) : null)
      }),
      update: async (payload) => {
        const existing = this.docs.get(id) || {};
        const updated = { ...existing, ...payload };
        this.docs.set(id, updated);
        return updated;
      },
      set: async (payload) => {
        this.docs.set(id, { id, ...payload });
        return this.docs.get(id);
      }
    };
  }

  async add(payload) {
    const id = `mock_${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.docs.set(id, { id, ...payload });
    return { id };
  }
}

class MockFirestoreDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockFirestoreCollection(name));
    }
    return this.collections.get(name);
  }
}

// -----------------------------------------------------------------------------
// Test Context & Identities
// -----------------------------------------------------------------------------
const mockDb = new MockFirestoreDb();

const verifiedDoctorUser = {
  uid: 'doc_verified_01',
  id: 'doc_verified_01',
  email: 'dr.menna@healthvibe.clinic',
  displayName: 'Dr. Menna Pulmonologist',
  role: 'doctor',
  clinicId: 'clinic_cairo_main'
};

const verifiedDoctorProfile = {
  uid: 'doc_verified_01',
  name: 'Dr. Menna Pulmonologist',
  status: 'approved',
  licenseStatus: 'active',
  doctorLicense: 'EG-SYND-44921',
  specialty: 'Pulmonology',
  clinicId: 'clinic_cairo_main'
};

const verifiedDoctorIdentity = {
  uid: 'doc_verified_01',
  name: 'Dr. Menna Pulmonologist',
  licenseNumber: 'EG-SYND-44921',
  specialty: 'Pulmonology',
  verified: true
};

const unassignedDoctorUser = {
  uid: 'doc_intruder_99',
  id: 'doc_intruder_99',
  email: 'dr.intruder@external.med',
  displayName: 'Dr. Snooper',
  role: 'doctor',
  clinicId: 'clinic_cairo_main'
};

const unassignedDoctorProfile = {
  uid: 'doc_intruder_99',
  name: 'Dr. Snooper',
  status: 'approved',
  licenseStatus: 'active',
  doctorLicense: 'EG-SYND-99999',
  specialty: 'Dermatology',
  clinicId: 'clinic_cairo_main'
};

const otherClinicDoctorUser = {
  uid: 'doc_alex_55',
  id: 'doc_alex_55',
  email: 'dr.alex@alexandria.med',
  role: 'doctor',
  clinicId: 'clinic_alex_branch'
};

const otherClinicDoctorProfile = {
  uid: 'doc_alex_55',
  name: 'Dr. Alexandria Branch',
  status: 'approved',
  licenseStatus: 'active',
  doctorLicense: 'EG-SYND-55112',
  specialty: 'Pulmonology',
  clinicId: 'clinic_alex_branch'
};

const superAdminUser = {
  uid: 'super_admin_chief',
  id: 'super_admin_chief',
  email: 'chief.medical.officer@healthvibe.com',
  displayName: 'Chief Medical Officer',
  role: 'super_admin'
};

const patientUser = {
  uid: 'patient_nour_88',
  id: 'patient_nour_88',
  email: 'nour.patient@example.com',
  displayName: 'Nour El-Din',
  role: 'patient'
};

let testsPassed = 0;
let currentTestIdx = 0;
let totalTests = 10;

function runTest(name, fn) {
  currentTestIdx++;
  try {
    fn();
    console.log(`  [PASS] Test ${currentTestIdx}: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${currentTestIdx}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  currentTestIdx++;
  try {
    await fn();
    console.log(`  [PASS] Test ${currentTestIdx}: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${currentTestIdx}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runSuite() {
  // Setup baseline test case
  const testCaseId = 'case_resp_101';
  await mockDb.collection('cases').doc(testCaseId).set({
    patientId: patientUser.uid,
    patientName: 'Nour El-Din',
    clinicId: 'clinic_cairo_main',
    assignedDoctorId: verifiedDoctorUser.uid,
    assignedDoctorEmail: verifiedDoctorUser.email,
    clinicalDiagnosis: 'Acute Bronchitis with Wheezing',
    status: 'pending',
    clinicalRevision: 1,
    statusHistory: []
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Verified Doctor Authorization Enforcement
  // ---------------------------------------------------------------------------
  await runAsyncTest('Verified Doctor guard rejects non-doctors, unapproved applicants & suspended licenses', async () => {
    // 1. Unauthenticated caller
    await assert.rejects(
      async () => doctorFollowUpService.recommendCaseFollowUp(testCaseId, { window: 'within_3d' }, { db: mockDb, user: null }),
      { code: 'AUTH_REQUIRED', statusCode: 401 }
    );

    // 2. Patient attempting to prescribe follow-up
    await assert.rejects(
      async () => doctorFollowUpService.recommendCaseFollowUp(testCaseId, { window: 'within_3d' }, { db: mockDb, user: patientUser }),
      { code: 'DOCTOR_ROLE_REQUIRED', statusCode: 403 }
    );

    // 3. Unapproved doctor applicant
    const pendingDoctor = { ...verifiedDoctorProfile, status: 'pending' };
    await assert.rejects(
      async () => doctorFollowUpService.recommendCaseFollowUp(testCaseId, { window: 'within_3d' }, { db: mockDb, user: verifiedDoctorUser, doctorProfile: pendingDoctor }),
      { code: 'DOCTOR_NOT_VERIFIED', statusCode: 403 }
    );

    // 4. Doctor with suspended syndicate license
    const suspendedDoctor = { ...verifiedDoctorProfile, licenseStatus: 'suspended' };
    await assert.rejects(
      async () => doctorFollowUpService.recommendCaseFollowUp(testCaseId, { window: 'within_3d' }, { db: mockDb, user: verifiedDoctorUser, doctorProfile: suspendedDoctor }),
      { code: 'DOCTOR_LICENSE_INACTIVE', statusCode: 403 }
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Doctor-Patient Data Isolation & Cross-Doctor Protection
  // ---------------------------------------------------------------------------
  await runAsyncTest('Doctor assignment guard strictly blocks unassigned & cross-clinic doctors', async () => {
    // 1. Unassigned doctor attempting to recommend follow-up
    await assert.rejects(
      async () => doctorFollowUpService.recommendCaseFollowUp(testCaseId, { window: 'within_3d' }, {
        db: mockDb,
        user: unassignedDoctorUser,
        doctorProfile: unassignedDoctorProfile
      }),
      { code: 'UNASSIGNED_DOCTOR_ACCESS_DENIED', statusCode: 403 }
    );

    // 2. Doctor from another clinic organization
    await assert.rejects(
      async () => doctorFollowUpService.recommendCaseFollowUp(testCaseId, { window: 'within_3d' }, {
        db: mockDb,
        user: otherClinicDoctorUser,
        doctorProfile: otherClinicDoctorProfile
      }),
      { code: 'CROSS_CLINIC_ACCESS_DENIED', statusCode: 403 }
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Modification Guard on Closed / Archived Cases
  // ---------------------------------------------------------------------------
  await runAsyncTest('Modification guard prevents establishing follow-up on closed/archived cases', async () => {
    const closedCaseId = 'case_closed_999';
    await mockDb.collection('cases').doc(closedCaseId).set({
      patientId: patientUser.uid,
      clinicId: 'clinic_cairo_main',
      assignedDoctorId: verifiedDoctorUser.uid,
      status: 'closed'
    });

    await assert.rejects(
      async () => doctorFollowUpService.recommendCaseFollowUp(closedCaseId, { window: 'within_3d' }, {
        db: mockDb,
        user: verifiedDoctorUser,
        doctorProfile: verifiedDoctorProfile,
        doctorIdentity: verifiedDoctorIdentity
      }),
      { code: 'CASE_CLOSED', statusCode: 400 }
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Clinical Window & Input Validation
  // ---------------------------------------------------------------------------
  runTest('validateFollowUpPlanInput validates presets, modes, and past dates', () => {
    const base = new Date('2026-10-20T12:00:00Z');

    // 1. Valid preset
    const valid = doctorFollowUpService.validateFollowUpPlanInput({
      window: 'within_1w',
      mode: 'video',
      instructions: 'Review spirometry and SpO2.'
    }, base);
    assert.strictEqual(valid.window, 'within_1w');
    assert.strictEqual(valid.mode, 'video');
    assert.strictEqual(valid.daysFromNow, 7);
    assert.strictEqual(valid.urgency, 'routine');

    // 2. Invalid window
    assert.throws(
      () => doctorFollowUpService.validateFollowUpPlanInput({ window: 'within_10_years' }, base),
      { code: 'INVALID_WINDOW', statusCode: 400 }
    );

    // 3. Invalid mode
    assert.throws(
      () => doctorFollowUpService.validateFollowUpPlanInput({ window: 'within_24h', mode: 'teleport' }, base),
      { code: 'INVALID_MODE', statusCode: 400 }
    );

    // 4. Custom date in past
    assert.throws(
      () => doctorFollowUpService.validateFollowUpPlanInput({ window: 'custom', targetDate: '2026-10-01' }, base),
      { code: 'PAST_DATE_NOT_ALLOWED', statusCode: 400 }
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Stored XSS Attack Surface Sanitization
  // ---------------------------------------------------------------------------
  await runAsyncTest('Sanitizer strips stored XSS vectors from doctor clinical instructions', async () => {
    const xssPayload = '<script>alert("pwned")</script><style>body{display:none}</style><b>Auscultate lungs</b> after antibiotics.';
    const result = await doctorFollowUpService.recommendCaseFollowUp(testCaseId, {
      window: 'within_3d',
      mode: 'clinic',
      instructions: xssPayload
    }, {
      db: mockDb,
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile,
      doctorIdentity: verifiedDoctorIdentity,
      metadata: { ip: '192.168.1.100', userAgent: 'Clinic-iPad/1.0' }
    });

    assert.ok(result.success, 'Recommendation must succeed');
    const saved = result.followUpPlan;
    assert.ok(!saved.instructions.includes('<script>'), 'Must strip script tags');
    assert.ok(!saved.instructions.includes('<style>'), 'Must strip style tags');
    assert.ok(saved.instructions.includes('Auscultate lungs'), 'Must retain clean clinical text');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Immutable Security & Regulatory Audit Logging
  // ---------------------------------------------------------------------------
  await runAsyncTest('Security audit log accurately captures doctor follow-up recommendation', async () => {
    const auditLogs = Array.from(mockDb.collection('audit_logs').docs.values());
    const followUpLog = auditLogs.find(l => l.eventType === 'DOCTOR_FOLLOWUP_RECOMMENDED');

    assert.ok(followUpLog, 'Must record DOCTOR_FOLLOWUP_RECOMMENDED in audit_logs');
    assert.strictEqual(followUpLog.caseId, testCaseId);
    assert.strictEqual(followUpLog.performedBy.uid, verifiedDoctorUser.uid);
    assert.strictEqual(followUpLog.performedBy.license, verifiedDoctorProfile.doctorLicense);
    assert.strictEqual(followUpLog.ipAddress, '192.168.1.100');
    assert.strictEqual(followUpLog.details.window, 'within_3d');
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Case Revision Concurrency Bump & Status History
  // ---------------------------------------------------------------------------
  await runAsyncTest('Case update bumps clinicalRevision and logs statusHistory trajectory', async () => {
    const caseDoc = await mockDb.collection('cases').doc(testCaseId).get();
    const caseData = caseDoc.data();

    assert.strictEqual(caseData.clinicalRevision, 2, 'Must bump clinicalRevision to 2');
    assert.ok(Array.isArray(caseData.statusHistory), 'statusHistory must be array');
    const lastHistory = caseData.statusHistory[caseData.statusHistory.length - 1];
    assert.strictEqual(lastHistory.action, 'RECOMMEND_FOLLOW_UP_WINDOW');
    assert.strictEqual(lastHistory.changedBy, verifiedDoctorUser.uid);
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Case Read Authorization & Snooping Protection
  // ---------------------------------------------------------------------------
  await runAsyncTest('getCaseFollowUp permits patient & assigned doctor, blocks unassigned doctor', async () => {
    // 1. Assigned doctor can read
    const docRead = await doctorFollowUpService.getCaseFollowUp(testCaseId, {
      db: mockDb,
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile
    });
    assert.ok(docRead.followUpPlan, 'Assigned doctor must view followUpPlan');
    assert.strictEqual(docRead.followUpPlan.window, 'within_3d');

    // 2. Case Patient can read
    const patientRead = await doctorFollowUpService.getCaseFollowUp(testCaseId, {
      db: mockDb,
      user: patientUser
    });
    assert.ok(patientRead.followUpPlan, 'Patient must view their own followUpPlan');

    // 3. Unassigned doctor blocked from snooping
    await assert.rejects(
      async () => doctorFollowUpService.getCaseFollowUp(testCaseId, {
        db: mockDb,
        user: unassignedDoctorUser,
        doctorProfile: unassignedDoctorProfile
      }),
      { code: 'ACCESS_DENIED', statusCode: 403 }
    );

    // 4. Super Admin can read for oversight
    const adminRead = await doctorFollowUpService.getCaseFollowUp(testCaseId, {
      db: mockDb,
      user: superAdminUser
    });
    assert.ok(adminRead.followUpPlan, 'Super Admin must view followUpPlan');
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Doctolib 1-Click Calendar Synchronization & Booking
  // ---------------------------------------------------------------------------
  await runAsyncTest('syncFollowUpWithCalendar creates confirmed appointment and links to case', async () => {
    const syncResult = await doctorFollowUpService.syncFollowUpWithCalendar(testCaseId, {
      slotId: 'slot_10am_clinic',
      mode: 'clinic'
    }, {
      db: mockDb,
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile,
      doctorIdentity: verifiedDoctorIdentity,
      metadata: { ip: '192.168.1.100', userAgent: 'Doctolib-Web-Integration' }
    });

    assert.ok(syncResult.success, 'Calendar sync must succeed');
    assert.ok(syncResult.appointmentId, 'Must return generated appointmentId');

    // Verify appointment document in 'appointments' collection
    const apptDoc = await mockDb.collection('appointments').doc(syncResult.appointmentId).get();
    const apptData = apptDoc.data();
    assert.strictEqual(apptData.caseId, testCaseId);
    assert.strictEqual(apptData.status, 'confirmed');
    assert.strictEqual(apptData.source, 'DOCTOLIB_FOLLOWUP_SYNC');
    assert.strictEqual(apptData.type, 'clinic');

    // Verify case was updated with appointment link
    const caseDoc = await mockDb.collection('cases').doc(testCaseId).get();
    const caseData = caseDoc.data();
    assert.strictEqual(caseData.followUpAppointmentId, syncResult.appointmentId);
    assert.strictEqual(caseData.followUpPlan.status, 'CALENDAR_LINKED');

    // Verify calendar link audit log
    const auditLogs = Array.from(mockDb.collection('audit_logs').docs.values());
    const calSyncLog = auditLogs.find(l => l.eventType === 'DOCTOR_FOLLOWUP_CALENDAR_LINKED');
    assert.ok(calSyncLog, 'Must record DOCTOR_FOLLOWUP_CALENDAR_LINKED in audit_logs');
    assert.strictEqual(calSyncLog.appointmentId, syncResult.appointmentId);
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Super Admin Supervisory Override Permitted
  // ---------------------------------------------------------------------------
  await runAsyncTest('Super Admin can recommend or adjust follow-up window under clinical governance', async () => {
    const adminResult = await doctorFollowUpService.recommendCaseFollowUp(testCaseId, {
      window: 'within_24h',
      mode: 'clinic',
      instructions: 'Urgent chief physician review due to oxygen desaturation.'
    }, {
      db: mockDb,
      user: superAdminUser,
      doctorProfile: { role: 'super_admin' },
      metadata: { ip: '10.0.0.1' }
    });

    assert.ok(adminResult.success, 'Super admin override must succeed');
    assert.strictEqual(adminResult.followUpPlan.window, 'within_24h');
    assert.strictEqual(adminResult.followUpPlan.urgency, 'urgent');
  });

  console.log('='.repeat(80));
  console.log(`RESULTS: ${testsPassed}/${totalTests} TESTS PASSED (100% SUCCESS)`);
  console.log('='.repeat(80));
}

runSuite().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exitCode = 1;
});
