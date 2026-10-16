/**
 * HEALTH VIBE AI: DOCTOR REJECT & REQUEST RE-ENTRY BACKEND & API TEST SUITE (K HEALTH)
 * 
 * Validates:
 * 1. Verified Doctor RBAC verification (role === 'doctor', approved status, active license).
 * 2. Role enforcement (rejection of non-doctor, pending, or suspended practitioners).
 * 3. Multi-tenant clinic isolation & patient assignment enforcement (UNASSIGNED_DOCTOR_ACCESS_DENIED).
 * 4. Structured clinical input validation (modes, categories, mandatory >= 10 chars note, requiredFields).
 * 5. Closed case protection (cannot reject or request re-entry on closed cases).
 * 6. Case state transitions (under_review -> more_info_requested vs rejected).
 * 7. Immutable security & compliance audit logging in audit_logs collection.
 * 8. Real-time patient notification dispatch in notifications collection.
 * 9. Status inspection endpoint handler & DoctorService client API integration.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const rejectReentryService = require('../backend/reject-reentry-service');
const DoctorService = require('../app/modules/doctor/doctor-service');

console.log('================================================================================');
console.log('🛡️  HEALTH VIBE AI: DOCTOR REJECT & RE-ENTRY BACKEND & API TEST SUITE (K HEALTH)');
console.log('   RBAC, Verified Doctor Gate, Audit Logging, Notifications & Multi-Tenancy');
console.log('================================================================================\n');

// Mock Firestore Database Implementation
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
        data: () => this.docs.get(id) || null
      }),
      update: async (patch) => {
        if (!this.docs.has(id)) throw new Error('Document does not exist');
        const current = this.docs.get(id);
        const updated = { ...current, ...patch };
        this.docs.set(id, updated);
        return { writeTime: new Date().toISOString() };
      },
      set: async (data) => {
        this.docs.set(id, { ...data });
        return { writeTime: new Date().toISOString() };
      }
    };
  }

  async add(data) {
    const id = `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.docs.set(id, { ...data, id });
    return { id };
  }

  where(field, op, val) {
    return {
      get: async () => {
        const matches = [];
        for (const [id, doc] of this.docs.entries()) {
          if (op === '==' && doc[field] === val) {
            matches.push({ id, data: () => doc });
          }
        }
        return { docs: matches, size: matches.length };
      }
    };
  }

  async get() {
    const list = [];
    for (const [id, doc] of this.docs.entries()) {
      list.push({ id, data: () => doc });
    }
    return { docs: list, size: list.length };
  }
}

class MockFirestoreDb {
  constructor() {
    this.collections = {
      cases: new MockFirestoreCollection('cases'),
      audit_logs: new MockFirestoreCollection('audit_logs'),
      notifications: new MockFirestoreCollection('notifications')
    };
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new MockFirestoreCollection(name);
    }
    return this.collections[name];
  }
}

// Test Runner Helper
let passedCount = 0;
let totalCount = 0;

async function runTest(testName, testFn) {
  totalCount++;
  try {
    await testFn();
    console.log(`  [PASS] Test ${totalCount}: ${testName}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalCount}: ${testName}`);
    console.error(`         Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

// Global Test Fixtures
const verifiedDoctorUser = {
  uid: 'doc_verified_101',
  email: 'dr.tarek@healthvibe.com',
  role: 'doctor'
};

const verifiedDoctorProfile = {
  uid: 'doc_verified_101',
  name: 'Dr. Tarek Mahmoud, MD',
  email: 'dr.tarek@healthvibe.com',
  role: 'doctor',
  doctorApplicationStatus: 'approved',
  verifiedDoctor: true,
  licenseStatus: 'active',
  doctorLicense: 'EG-MED-44829',
  specialty: 'Pulmonology / Critical Care',
  clinicId: 'clinic_cairo_central'
};

const superAdminUser = {
  uid: 'admin_master_1',
  email: 'admin@healthvibe.com',
  role: 'super_admin'
};

const superAdminProfile = {
  uid: 'admin_master_1',
  name: 'Health Vibe Medical Director',
  role: 'super_admin',
  licenseStatus: 'active'
};

// -----------------------------------------------------------------------------
// Test Suite Execution
// -----------------------------------------------------------------------------
(async () => {

  // 1. RBAC & Verification Gate
  await runTest('RBAC & Verification Gate: Denies non-doctors, unapproved applicants, and suspended doctors', async () => {
    // Non-doctor (patient)
    const patientProfile = { role: 'patient', verifiedDoctor: false };
    const auth1 = rejectReentryService.verifyDoctorAuthorization(patientProfile);
    assert.strictEqual(auth1.isAuthorized, false);
    assert.strictEqual(auth1.code, 'INSUFFICIENT_ROLE');

    // Unapproved applicant
    const pendingDoctor = { role: 'doctor', doctorApplicationStatus: 'pending', verifiedDoctor: false };
    const auth2 = rejectReentryService.verifyDoctorAuthorization(pendingDoctor);
    assert.strictEqual(auth2.isAuthorized, false);
    assert.strictEqual(auth2.code, 'DOCTOR_NOT_VERIFIED');

    // Suspended license
    const suspendedDoctor = { role: 'doctor', doctorApplicationStatus: 'approved', licenseStatus: 'suspended' };
    const auth3 = rejectReentryService.verifyDoctorAuthorization(suspendedDoctor);
    assert.strictEqual(auth3.isAuthorized, false);
    assert.strictEqual(auth3.code, 'DOCTOR_LICENSE_INACTIVE');

    // Approved Doctor
    const auth4 = rejectReentryService.verifyDoctorAuthorization(verifiedDoctorProfile);
    assert.strictEqual(auth4.isAuthorized, true);
    assert.strictEqual(auth4.doctorName, 'Dr. Tarek Mahmoud, MD');
    assert.strictEqual(auth4.doctorLicense, 'EG-MED-44829');

    // Super Admin
    const auth5 = rejectReentryService.verifyDoctorAuthorization(superAdminProfile);
    assert.strictEqual(auth5.isAuthorized, true);
  });

  // 2. Data Isolation & Multi-Tenancy
  await runTest('Tenant & Patient Isolation: Enforces clinic boundary and assigned clinician restrictions', async () => {
    const mockCase = {
      id: 'CASE-TENANT-001',
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_verified_101',
      assignedDoctorEmail: 'dr.tarek@healthvibe.com'
    };

    // Case assigned to doc_verified_101 -> allowed
    const accessAllowed = rejectReentryService.verifyDoctorCaseAccess(mockCase, verifiedDoctorUser, verifiedDoctorProfile);
    assert.strictEqual(accessAllowed.isAllowed, true);

    // Another doctor trying to access -> UNASSIGNED_DOCTOR_ACCESS_DENIED
    const otherDoctorUser = { uid: 'doc_other_202', email: 'other.doc@healthvibe.com', role: 'doctor' };
    const otherDoctorProfile = { ...verifiedDoctorProfile, uid: 'doc_other_202', email: 'other.doc@healthvibe.com' };
    const accessDenied = rejectReentryService.verifyDoctorCaseAccess(mockCase, otherDoctorUser, otherDoctorProfile);
    assert.strictEqual(accessDenied.isAllowed, false);
    assert.strictEqual(accessDenied.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
    assert.strictEqual(accessDenied.statusCode, 403);

    // Cross-Clinic Access Denied
    const diffClinicDoctorProfile = { ...verifiedDoctorProfile, clinicId: 'clinic_alex_sea' };
    const crossClinicDenied = rejectReentryService.verifyDoctorCaseAccess(mockCase, verifiedDoctorUser, diffClinicDoctorProfile);
    assert.strictEqual(crossClinicDenied.isAllowed, false);
    assert.strictEqual(crossClinicDenied.code, 'CROSS_CLINIC_ACCESS_DENIED');
    assert.strictEqual(crossClinicDenied.statusCode, 403);

    // Super admin override passes all isolation checks
    const adminAccess = rejectReentryService.verifyDoctorCaseAccess(mockCase, superAdminUser, superAdminProfile);
    assert.strictEqual(adminAccess.isAllowed, true);
  });

  // 3. Structured Clinical Input Validation
  await runTest('Structured Input Validation: Validates modes, categories, notes >= 10 chars, and requiredFields', async () => {
    const db = new MockFirestoreDb();

    // Missing caseId
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: '',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Valid note for clinical testing',
          user: verifiedDoctorUser,
          doctorProfile: verifiedDoctorProfile,
          db
        });
      },
      { code: 'CASE_ID_REQUIRED', statusCode: 400 }
    );

    // Invalid mode
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'CASE-01',
          mode: 'invalid_mode',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Valid note for clinical testing',
          user: verifiedDoctorUser,
          doctorProfile: verifiedDoctorProfile,
          db
        });
      },
      { code: 'INVALID_MODE', statusCode: 400 }
    );

    // Invalid reason category
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'CASE-01',
          mode: 'reentry',
          reasonCategory: 'NON_EXISTENT_CATEGORY',
          requiredFields: ['spo2'],
          doctorNote: 'Valid note for clinical testing',
          user: verifiedDoctorUser,
          doctorProfile: verifiedDoctorProfile,
          db
        });
      },
      { code: 'INVALID_REENTRY_CATEGORY', statusCode: 400 }
    );

    // Doctor note too short (< 10 chars)
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'CASE-01',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Too short',
          user: verifiedDoctorUser,
          doctorProfile: verifiedDoctorProfile,
          db
        });
      },
      { code: 'MANDATORY_NOTE_REQUIRED', statusCode: 400 }
    );

    // Re-entry without requiredFields
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'CASE-01',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: [],
          doctorNote: 'Valid physician instructions for intake re-entry',
          user: verifiedDoctorUser,
          doctorProfile: verifiedDoctorProfile,
          db
        });
      },
      { code: 'REQUIRED_FIELDS_EMPTY', statusCode: 400 }
    );
  });

  // 4. Closed Case Protection
  await runTest('Closed Case Protection: Blocks rejection or re-entry requests on already closed cases', async () => {
    const db = new MockFirestoreDb();
    const caseId = 'CASE-CLOSED-99';
    await db.collection('cases').doc(caseId).set({
      id: caseId,
      status: 'closed',
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_verified_101'
    });

    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId,
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Attempting to request re-entry on closed case',
          user: verifiedDoctorUser,
          doctorProfile: verifiedDoctorProfile,
          db
        });
      },
      { code: 'CASE_CLOSED', statusCode: 400 }
    );
  });

  // 5. Successful Re-entry Request Processing (mode === 'reentry')
  await runTest('Re-entry Processing: Transitions status to more_info_requested with structured payload', async () => {
    const db = new MockFirestoreDb();
    const caseId = 'CASE-REENTRY-VALID';
    await db.collection('cases').doc(caseId).set({
      id: caseId,
      status: 'under_review',
      patientId: 'patient_ahmed_123',
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_verified_101',
      statusHistory: [
        { status: 'submitted', changedAt: '2026-10-16T10:00:00.000Z' }
      ]
    });

    const result = await rejectReentryService.processRejectReentry({
      caseId,
      mode: 'reentry',
      reasonCategory: 'CONTRADICTORY_VITALS',
      requiredFields: ['spo2', 'blood_pressure'],
      doctorNote: 'Pulse oximeter reading of 72% contradicts active speech and normal heart rate. Please rest and re-measure.',
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile,
      db,
      metadata: { ip: '197.35.12.8', userAgent: 'HealthVibeClinicApp/2.4', lang: 'ar' }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, 'reentry');
    assert.strictEqual(result.targetStatus, 'more_info_requested');
    assert.strictEqual(result.previousStatus, 'under_review');
    assert.ok(result.message.includes('spo2'));

    // Verify Firestore updates
    const updatedCaseDoc = await db.collection('cases').doc(caseId).get();
    const updatedCase = updatedCaseDoc.data();
    assert.strictEqual(updatedCase.status, 'more_info_requested');
    assert.strictEqual(updatedCase.isReentryRequest, true);
    assert.strictEqual(updatedCase.reentryMode, 'reentry');
    assert.deepStrictEqual(updatedCase.requiredFields, ['spo2', 'blood_pressure']);
    assert.strictEqual(updatedCase.rejectionCategory, 'CONTRADICTORY_VITALS');
    assert.strictEqual(updatedCase.doctorApproved, false);
    assert.ok(updatedCase.moreInfoRequestedAt);
    assert.strictEqual(updatedCase.statusHistory.length, 2);
    assert.strictEqual(updatedCase.statusHistory[1].status, 'more_info_requested');
    assert.strictEqual(updatedCase.statusHistory[1].changedByLicense, 'EG-MED-44829');
  });

  // 6. Successful Definitive Rejection Processing (mode === 'definitive_reject')
  await runTest('Definitive Rejection: Transitions status to rejected with timestamp and flag', async () => {
    const db = new MockFirestoreDb();
    const caseId = 'CASE-DEFINITIVE-REJECT';
    await db.collection('cases').doc(caseId).set({
      id: caseId,
      status: 'under_review',
      patientId: 'patient_mona_456',
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_verified_101'
    });

    const result = await rejectReentryService.processRejectReentry({
      caseId,
      mode: 'definitive_reject',
      reasonCategory: 'CLINICAL_INCONSISTENCY',
      doctorNote: 'Intake answers and clinical history indicate non-respiratory cosmetic consultation outside telemedicine scope.',
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile,
      db,
      metadata: { ip: '197.35.12.8', userAgent: 'HealthVibeClinicApp/2.4' }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, 'definitive_reject');
    assert.strictEqual(result.targetStatus, 'rejected');

    const updatedCaseDoc = await db.collection('cases').doc(caseId).get();
    const updatedCase = updatedCaseDoc.data();
    assert.strictEqual(updatedCase.status, 'rejected');
    assert.strictEqual(updatedCase.isReentryRequest, false);
    assert.strictEqual(updatedCase.reentryMode, 'definitive_reject');
    assert.strictEqual(updatedCase.doctorApproved, false);
    assert.ok(updatedCase.rejectedAt);
  });

  // 7. Compliance & Security Audit Logging
  await runTest('Audit Log: Records immutable CASE_REJECTED_REENTRY_REQUESTED audit log in audit_logs', async () => {
    const db = new MockFirestoreDb();
    const caseId = 'CASE-AUDIT-VERIFY';
    await db.collection('cases').doc(caseId).set({
      id: caseId,
      status: 'under_review',
      patientId: 'patient_hassan_789',
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_verified_101'
    });

    await rejectReentryService.processRejectReentry({
      caseId,
      mode: 'reentry',
      reasonCategory: 'INCOMPLETE_MEASUREMENTS',
      requiredFields: ['spo2', 'temperature'],
      doctorNote: 'Essential SpO2 and body temperature omitted from initial intake questionnaire.',
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile,
      db,
      metadata: { ip: '41.233.10.4', userAgent: 'HealthVibeClinicWeb/3.0' }
    });

    const auditSnapshot = await db.collection('audit_logs').get();
    assert.strictEqual(auditSnapshot.size, 1);
    const auditDoc = auditSnapshot.docs[0].data();

    assert.strictEqual(auditDoc.eventType, 'CASE_REJECTED_REENTRY_REQUESTED');
    assert.strictEqual(auditDoc.action, 'INTAKE_REJECT_REENTRY');
    assert.strictEqual(auditDoc.caseId, caseId);
    assert.strictEqual(auditDoc.performedBy.uid, verifiedDoctorUser.uid);
    assert.strictEqual(auditDoc.performedBy.license, 'EG-MED-44829');
    assert.strictEqual(auditDoc.details.mode, 'reentry');
    assert.strictEqual(auditDoc.details.reasonCategory, 'INCOMPLETE_MEASUREMENTS');
    assert.deepStrictEqual(auditDoc.details.requiredFields, ['spo2', 'temperature']);
    assert.strictEqual(auditDoc.ipAddress, '41.233.10.4');
    assert.ok(auditDoc.timestamp);
  });

  // 8. Patient Notification Dispatch
  await runTest('Notification Dispatch: Dispatches structured notification to patient inbox', async () => {
    const db = new MockFirestoreDb();
    const caseId = 'CASE-NOTIF-VERIFY';
    await db.collection('cases').doc(caseId).set({
      id: caseId,
      status: 'under_review',
      patientId: 'patient_salma_334',
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_verified_101'
    });

    await rejectReentryService.processRejectReentry({
      caseId,
      mode: 'reentry',
      reasonCategory: 'UNREADABLE_ATTACHMENTS',
      requiredFields: ['attachments'],
      doctorNote: 'The uploaded CBC lab photo is too blurry to read platelet count. Please re-upload in bright lighting.',
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile,
      db,
      metadata: { lang: 'ar' }
    });

    const notifSnapshot = await db.collection('notifications').get();
    assert.strictEqual(notifSnapshot.size, 1);
    const notifDoc = notifSnapshot.docs[0].data();

    assert.strictEqual(notifDoc.recipientId, 'patient_salma_334');
    assert.strictEqual(notifDoc.type, 'intake_reentry_requested');
    assert.strictEqual(notifDoc.caseId, caseId);
    assert.strictEqual(notifDoc.title, 'مطلوب إعادة إدخال بيانات التقييم المبدئي');
    assert.ok(notifDoc.body.includes('CBC'));
    assert.deepStrictEqual(notifDoc.requiredFields, ['attachments']);
    assert.strictEqual(notifDoc.read, false);
    assert.strictEqual(notifDoc.isReentryRequest, true);
    assert.ok(notifDoc.createdAt);
  });

  // 9. Status Inspection & Telemetry Endpoint Handler
  await runTest('Status Inspection: getCaseRejectReentryStatus returns structured case rejection data', async () => {
    const db = new MockFirestoreDb();
    const caseId = 'CASE-INSPECT-01';
    await db.collection('cases').doc(caseId).set({
      id: caseId,
      status: 'more_info_requested',
      isReentryRequest: true,
      reentryMode: 'reentry',
      rejectionCategory: 'CONTRADICTORY_VITALS',
      rejectionReason: 'Vitals require re-measurement by patient.',
      requiredFields: ['spo2'],
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_verified_101'
    });

    const inspection = await rejectReentryService.getCaseRejectReentryStatus(caseId, {
      db,
      user: verifiedDoctorUser,
      doctorProfile: verifiedDoctorProfile
    });

    assert.strictEqual(inspection.success, true);
    assert.strictEqual(inspection.caseId, caseId);
    assert.strictEqual(inspection.status, 'more_info_requested');
    assert.strictEqual(inspection.isReentryRequest, true);
    assert.strictEqual(inspection.reentryMode, 'reentry');
    assert.strictEqual(inspection.reasonCategory, 'CONTRADICTORY_VITALS');
    assert.deepStrictEqual(inspection.requiredFields, ['spo2']);
  });

  // 10. DoctorService Client API Integration
  await runTest('DoctorService Client API: rejectOrRequestReentry validates parameters and processes request', async () => {
    assert.strictEqual(typeof DoctorService.rejectOrRequestReentry, 'function');
    assert.strictEqual(typeof DoctorService.getCaseRejectReentryStatus, 'function');

    // Missing caseId
    await assert.rejects(
      async () => {
        await DoctorService.rejectOrRequestReentry({
          caseId: '',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Valid note for clinical testing'
        });
      },
      /caseId is required/
    );

    // Short note
    await assert.rejects(
      async () => {
        await DoctorService.rejectOrRequestReentry({
          caseId: 'CASE-CLIENT-TEST',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Short'
        });
      },
      /must be at least 10 characters/
    );

    // Successful standalone execution
    const res = await DoctorService.rejectOrRequestReentry({
      caseId: 'CASE-CLIENT-TEST',
      mode: 'reentry',
      reasonCategory: 'INCOMPLETE_MEASUREMENTS',
      requiredFields: ['spo2', 'temperature'],
      doctorNote: 'Please re-measure temperature and SpO2 with resting protocol.'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.mode, 'reentry');
    assert.strictEqual(res.targetStatus, 'more_info_requested');
    assert.strictEqual(res.reentryRecord.reasonCategory, 'INCOMPLETE_MEASUREMENTS');
    assert.deepStrictEqual(res.reentryRecord.requiredFields, ['spo2', 'temperature']);
  });

  // Final Test Summary
  console.log('\n================================================================================');
  console.log(`RESULTS: ${passedCount}/${totalCount} TESTS PASSED (${Math.round((passedCount / totalCount) * 100)}% SUCCESS)`);
  console.log('================================================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
})();
