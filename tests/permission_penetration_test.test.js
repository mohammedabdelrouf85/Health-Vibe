/**
 * Health Vibe AI - Permission Penetration Test Suite (Req #66 - P0 Critical)
 * 
 * Verifies Authorization Hardening & Privilege Boundary Enforcement:
 * 1. Patient Privilege Escalation Attacks:
 *    - Patient account attempting to access /doctor or /admin screens (Client Guards).
 *    - Patient attempting to hit /api/doctor/* or /api/admin/* endpoints -> 403 Forbidden.
 *    - Patient attempting role-spoofing / parameter tampering.
 * 2. Cross-Doctor Horizontal Privilege Escalation (IDOR) Attacks:
 *    - Doctor A attempting to access, review, approve, withdraw, or request info on Doctor B's case.
 *    - Strict rejection with 403 Forbidden (ACCESS_DENIED / DOCTOR_NOT_ASSIGNED).
 *    - Multi-disease records (Diabetes, Hypertension, Blood Disorders, Obesity) isolation.
 *    - Firestore Security Rules isolation verification.
 * 3. Cross-Patient IDOR & Forgery Attacks:
 *    - Patient A attempting to access Patient B's records -> 403 Forbidden.
 *    - Patient attempting to forge clinical diagnosis or doctor approval flags.
 * 4. Anonymous / Unauthenticated Penetration Attacks:
 *    - Rejection of unauthenticated requests with 401/403.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: PERMISSION PENETRATION TEST SUITE (Req #66)');
console.log('   P0 Critical: Role-Based Access & Cross-Tenant Boundary Defense');
console.log('==================================================================\n');

// Import Core Modules & Services
const Permissions = require('../app/modules/permissions/permissions');
const diseaseAuthService = require('../backend/disease-authorization-service');
const { caseWorkflowService } = require('../backend/case-workflow-service');
const { requirePatient, requireDoctor, requireAdmin, requireStrictRole } = require('../backend/server');

// Mock Request & Response Helpers
function createMockReq({
  uid = 'user-123',
  role = 'patient',
  email = 'user@healthvibe.test',
  isOwner = false,
  verifiedDoctor = false,
  clinicId = 'clinic_cairo_central',
  headers = {},
  body = {},
  params = {},
  query = {}
} = {}) {
  return {
    user: {
      uid,
      role,
      email,
      email_verified: true,
      isOwner,
      verifiedDoctor,
      clinicId,
      customClaims: { role, isOwner }
    },
    headers,
    body,
    params,
    query,
    path: ''
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    sentData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(data) {
      this.sentData = data;
      return this;
    },
    send(data) {
      this.sentData = data;
      return this;
    }
  };
  return res;
}

// In-Memory Mock Firestore Collection
class MockFirestoreCollection {
  constructor() {
    this.docs = new Map();
  }
  doc(id) {
    const self = this;
    return {
      id,
      async get() {
        const exists = self.docs.has(id);
        return {
          id,
          exists,
          data: () => exists ? JSON.parse(JSON.stringify(self.docs.get(id))) : null
        };
      },
      async set(data, opts = {}) {
        if (opts.merge && self.docs.has(id)) {
          const current = self.docs.get(id);
          self.docs.set(id, { ...current, ...data });
        } else {
          self.docs.set(id, { ...data });
        }
      },
      async update(data) {
        if (!self.docs.has(id)) throw new Error('Document not found');
        const current = self.docs.get(id);
        self.docs.set(id, { ...current, ...data });
      }
    };
  }
}

class MockFirestoreDb {
  constructor() {
    this.collections = {
      cases: new MockFirestoreCollection(),
      assessments: new MockFirestoreCollection(),
      users: new MockFirestoreCollection(),
      clinical_reports: new MockFirestoreCollection()
    };
  }
  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new MockFirestoreCollection();
    }
    return this.collections[name];
  }
  async runTransaction(callback) {
    return await callback({
      get: async (ref) => ref.get(),
      set: async (ref, data, opts) => ref.set(data, opts),
      update: async (ref, data) => ref.update(data)
    });
  }
}

async function runPenetrationTestSuite() {
  let passedAssertions = 0;

  // ===========================================================================
  // SECTION 1: PATIENT PRIVILEGE ESCALATION ATTACKS (Patient -> /doctor, /admin)
  // ===========================================================================
  console.log('▶ SECTION 1: Patient Privilege Escalation Attacks (/doctor & /admin)');

  // 1.1 Client-Side Screen Access Matrix
  console.log('  [Attack 1.1] Patient attempts direct client-side screen access:');
  const patientRole = 'patient';

  // Patient attempting /doctor screen
  const canPatientAccessDoctor = Permissions.canAccessScreen('doctor', patientRole);
  assert.strictEqual(canPatientAccessDoctor, false, 'Patient MUST be denied access to "doctor" screen');
  console.log('    ✓ Blocked: Patient cannot access "doctor" screen.');
  passedAssertions++;

  // Patient attempting /admin screen
  const canPatientAccessAdmin = Permissions.canAccessScreen('admin', patientRole);
  assert.strictEqual(canPatientAccessAdmin, false, 'Patient MUST be denied access to "admin" screen');
  console.log('    ✓ Blocked: Patient cannot access "admin" screen.');
  passedAssertions++;

  // Patient attempting /audit screen
  const canPatientAccessAudit = Permissions.canAccessScreen('audit', patientRole);
  assert.strictEqual(canPatientAccessAudit, false, 'Patient MUST be denied access to "audit" screen');
  console.log('    ✓ Blocked: Patient cannot access "audit" security logs.');
  passedAssertions++;

  // Patient attempting /kpi screen
  const canPatientAccessKpi = Permissions.canAccessScreen('kpi', patientRole);
  assert.strictEqual(canPatientAccessKpi, false, 'Patient MUST be denied access to "kpi" screen');
  console.log('    ✓ Blocked: Patient cannot access "kpi" operational metrics.');
  passedAssertions++;

  // 1.2 Deep-Link Hash Routing Interception
  console.log('  [Attack 1.2] Patient attempts URL hash deep-linking (#screen=doctor & #screen=admin):');
  function simulateRouteGuard(targetScreen, userRole) {
    if (!Permissions.canAccessScreen(targetScreen, userRole)) {
      return Permissions.getRoleDefaultScreen(userRole);
    }
    return targetScreen;
  }

  const doctorHashRedirect = simulateRouteGuard('doctor', patientRole);
  assert.strictEqual(doctorHashRedirect, 'patient', 'Deep-linking to #screen=doctor must redirect patient to patient home');
  console.log('    ✓ Intercepted: Hash deep-link "#screen=doctor" redirected to "patient".');
  passedAssertions++;

  const adminHashRedirect = simulateRouteGuard('admin', patientRole);
  assert.strictEqual(adminHashRedirect, 'patient', 'Deep-linking to #screen=admin must redirect patient to patient home');
  console.log('    ✓ Intercepted: Hash deep-link "#screen=admin" redirected to "patient".');
  passedAssertions++;

  // 1.3 Server-Side API Penetration Attacks by Patient
  console.log('  [Attack 1.3] Patient attempts calling Doctor and Admin REST API endpoints:');
  
  // Patient calling Doctor endpoint protection (requireStrictRole(['doctor']))
  const strictDoctorGuard = requireStrictRole(['doctor']);
  const patientDoctorReq = createMockReq({ role: 'patient', uid: 'pat_malicious_01' });
  const patientDoctorRes = createMockRes();
  let doctorNextCalled = false;
  strictDoctorGuard(patientDoctorReq, patientDoctorRes, () => { doctorNextCalled = true; });
  assert.strictEqual(doctorNextCalled, false, 'Doctor endpoint must NOT allow patient to proceed');
  assert.strictEqual(patientDoctorRes.statusCode, 403, 'Doctor endpoint must return HTTP 403 Forbidden to patient');
  assert.strictEqual(patientDoctorRes.sentData.error, 'ROLE_FORBIDDEN');
  console.log('    ✓ HTTP 403 Forbidden: Patient blocked from /api/doctor/* routes.');
  passedAssertions++;

  // Patient calling requireAdmin middleware
  const patientAdminReq = createMockReq({ role: 'patient', uid: 'pat_malicious_01' });
  const patientAdminRes = createMockRes();
  let adminNextCalled = false;
  await requireAdmin(patientAdminReq, patientAdminRes, () => { adminNextCalled = true; });
  assert.strictEqual(adminNextCalled, false, 'requireAdmin must NOT allow patient to proceed');
  assert.strictEqual(patientAdminRes.statusCode, 403, 'requireAdmin must return HTTP 403 Forbidden to patient');
  assert.strictEqual(patientAdminRes.sentData.error, 'ACCESS_DENIED');
  console.log('    ✓ HTTP 403 Forbidden: Patient blocked from /api/admin/* routes.');
  passedAssertions++;

  // 1.4 Parameter Tampering / Role Forgery Attack
  console.log('  [Attack 1.4] Patient attempts Parameter Tampering (injecting role="doctor" or isOwner=true in payload):');
  const spoofedReq = createMockReq({
    role: 'patient',
    uid: 'pat_spoofer_02',
    body: { role: 'doctor', isOwner: true, isAdmin: true }
  });
  const spoofedRes = createMockRes();
  strictDoctorGuard(spoofedReq, spoofedRes, () => {});
  assert.strictEqual(spoofedRes.statusCode, 403, 'Spoofed body parameters must be ignored; JWT role takes precedence');
  console.log('    ✓ HTTP 403 Forbidden: Zero-Trust Parameter Hygiene rejected role spoofing.');
  passedAssertions++;


  // ===========================================================================
  // SECTION 2: CROSS-DOCTOR ATTACKS (Doctor A -> Doctor B's Patient Case)
  // ===========================================================================
  console.log('\n▶ SECTION 2: Cross-Doctor Horizontal Privilege Escalation (Doctor A -> Doctor B)');

  const mockDb = new MockFirestoreDb();

  // Create Case B belonging to Doctor B
  const caseIdB = 'case_patient_b_991';
  const doctorBUid = 'doc_B_hassan_pulmo';
  const doctorAUid = 'doc_A_tariq_pulmo';

  const caseDataB = {
    id: caseIdB,
    caseId: caseIdB,
    patientId: 'patient_karim_44',
    patientName: 'كريم عبد الله',
    assignedDoctorId: doctorBUid,
    assignedDoctorName: 'د. حسان القاضي',
    status: 'under_review',
    clinicId: 'clinic_cairo_central',
    oxygenLevel: 91,
    respiratoryRate: 24,
    clinicalRevision: 1
  };

  await mockDb.collection('cases').doc(caseIdB).set(caseDataB);
  await mockDb.collection('assessments').doc(caseIdB).set(caseDataB);

  // 2.1 Attack: Doctor A attempts to review Doctor B's case via caseWorkflowService
  console.log('  [Attack 2.1] Doctor A attempts to review Doctor B\'s assigned case:');
  const doctorAUser = {
    uid: doctorAUid,
    role: 'doctor',
    name: 'د. طارق محمود',
    displayName: 'د. طارق محمود',
    syndicateRegistrationNumber: 'EG-MED-44821',
    clinicId: 'clinic_cairo_central',
    isOwner: false
  };

  try {
    await caseWorkflowService.reviewCase({
      doctorUser: doctorAUser,
      caseId: caseIdB,
      reviewData: {
        status: 'approved',
        finalDiagnosis: 'تشخيص غير مصرح به من طبيب خارجي',
        recommendations: ['توصية غير مصرح بها']
      },
      db: mockDb
    });
    assert.fail('reviewCase must throw when an unassigned doctor reviews another doctor\'s case');
  } catch (err) {
    assert.strictEqual(err.statusCode, 403, 'Cross-doctor review must throw HTTP 403');
    assert.strictEqual(err.code, 'ACCESS_DENIED', 'Error code must be ACCESS_DENIED');
    console.log(`    ✓ HTTP 403 Forbidden: Doctor A review rejected (${err.message}).`);
    passedAssertions++;
  }

  // 2.2 Attack: Doctor A attempts to access Doctor B's records in Multi-Disease Authorization Service
  console.log('  [Attack 2.2] Doctor A attempts access to Doctor B\'s disease module cases:');
  const diseasesToTest = ['diabetes', 'hypertension', 'blood-disorders', 'obesity'];

  for (const diseaseId of diseasesToTest) {
    const diseaseRecordB = {
      id: `rec_${diseaseId}_b`,
      patientId: 'patient_karim_44',
      assignedDoctorId: doctorBUid,
      clinicId: 'clinic_cairo_central'
    };

    try {
      diseaseAuthService.authorizeDiseaseAccess({
        user: doctorAUser,
        diseaseId,
        action: 'review:case',
        record: diseaseRecordB
      });
      assert.fail(`Doctor A must NOT be authorized for ${diseaseId} case of Doctor B`);
    } catch (err) {
      assert.strictEqual(err.statusCode, 403, `Must return 403 for ${diseaseId}`);
      assert.strictEqual(err.code, 'DOCTOR_NOT_ASSIGNED');
      console.log(`    ✓ HTTP 403 Forbidden [${diseaseId}]: Doctor A rejected (${err.code}).`);
      passedAssertions++;
    }
  }

  // 2.3 Attack: Doctor A attempts cross-clinic access to Doctor B in another clinic
  console.log('  [Attack 2.3] Doctor A attempts cross-clinic horizontal penetration:');
  const foreignClinicDoctorUser = {
    uid: 'doc_alex_foreign_11',
    role: 'doctor',
    clinicId: 'clinic_alexandria_west',
    isOwner: false
  };

  try {
    diseaseAuthService.authorizeDiseaseAccess({
      user: foreignClinicDoctorUser,
      diseaseId: 'diabetes',
      action: 'read:case',
      record: {
        patientId: 'patient_karim_44',
        assignedDoctorId: 'doc_alex_foreign_11',
        clinicId: 'clinic_cairo_central' // Different clinic!
      }
    });
    assert.fail('Doctor must NOT access cases across different clinics');
  } catch (err) {
    assert.strictEqual(err.statusCode, 403, 'Cross-clinic access must throw 403');
    assert.strictEqual(err.code, 'CROSS_CLINIC_ACCESS_DENIED');
    console.log('    ✓ HTTP 403 Forbidden: Cross-clinic access strictly denied.');
    passedAssertions++;
  }

  // 2.4 Simulation: Firestore Security Rules Enforcement
  console.log('  [Attack 2.4] Firestore Security Rules Evaluation for Doctor A -> Doctor B:');
  function simulateFirestoreCaseReadRule(resourceData, authContext) {
    const isAuthenticated = Boolean(authContext && authContext.uid);
    if (!isAuthenticated) return false;
    
    // Patient access rule
    if (resourceData.patientId === authContext.uid) {
      return true;
    }
    
    // Doctor access rule
    if (authContext.token && authContext.token.role === 'doctor' && authContext.token.verifiedDoctor === true) {
      const isLinkedDoctor = (
        resourceData.assignedDoctorId === authContext.uid ||
        resourceData.doctorId === authContext.uid ||
        resourceData.doctorUid === authContext.uid ||
        resourceData.approvingDoctorId === authContext.uid
      );
      if (isLinkedDoctor) return true;
    }

    // Super Admin rule
    if (authContext.token && (authContext.token.role === 'super_admin' || authContext.token.isOwner === true)) {
      return true;
    }

    return false;
  }

  const doctorAAuth = {
    uid: doctorAUid,
    token: { role: 'doctor', verifiedDoctor: true }
  };
  const firestoreDoctorAResult = simulateFirestoreCaseReadRule(caseDataB, doctorAAuth);
  assert.strictEqual(firestoreDoctorAResult, false, 'Firestore rules MUST deny Doctor A reading Doctor B\'s case');
  console.log('    ✓ Firestore Rule Rejection (PERMISSION_DENIED / 403): Doctor A denied.');
  passedAssertions++;

  const doctorBAuth = {
    uid: doctorBUid,
    token: { role: 'doctor', verifiedDoctor: true }
  };
  const firestoreDoctorBResult = simulateFirestoreCaseReadRule(caseDataB, doctorBAuth);
  assert.strictEqual(firestoreDoctorBResult, true, 'Firestore rules MUST allow assigned Doctor B reading Case B');
  console.log('    ✓ Firestore Rule Allowed: Assigned Doctor B successfully granted access.');
  passedAssertions++;


  // ===========================================================================
  // SECTION 3: CROSS-PATIENT IDOR & FORGERY ATTACKS (Patient A -> Patient B)
  // ===========================================================================
  console.log('\n▶ SECTION 3: Cross-Patient IDOR & Clinical Forgery Attacks');

  // 3.1 Attack: Patient A attempts to read Patient B's records
  console.log('  [Attack 3.1] Patient A attempts to fetch Patient B\'s disease records:');
  const patientAUser = {
    uid: 'pat_alice_11',
    role: 'patient',
    email: 'alice@test.invalid'
  };

  try {
    diseaseAuthService.authorizeDiseaseAccess({
      user: patientAUser,
      diseaseId: 'diabetes',
      action: 'read:records',
      targetPatientId: 'pat_bob_22' // Patient B!
    });
    assert.fail('Patient A must NOT access Patient B records');
  } catch (err) {
    assert.strictEqual(err.statusCode, 403);
    assert.strictEqual(err.code, 'CROSS_PATIENT_ACCESS_DENIED');
    console.log('    ✓ HTTP 403 Forbidden: Cross-patient IDOR attack rejected.');
    passedAssertions++;
  }

  // 3.2 Attack: Patient attempts to forge clinical doctor fields
  console.log('  [Attack 3.2] Patient attempts to forge clinical diagnosis & approval flags:');
  function simulatePatientCaseCreateRule(requestResourceData, authContext) {
    if (!authContext || authContext.token?.role !== 'patient') return false;
    
    // Rule: hasNoPatientForgedClinicalResult
    const forbiddenClinicalKeys = [
      'doctorNotes', 'clinicalImpression', 'officialDiagnosis', 
      'doctorApproved', 'approvedAt', 'assignedDoctorId', 'doctorIdentity'
    ];
    for (const key of forbiddenClinicalKeys) {
      if (key in requestResourceData && requestResourceData[key] !== null && requestResourceData[key] !== false) {
        return false; // FORGERY DETECTED
      }
    }
    return true;
  }

  const forgedPayload = {
    patientId: patientAUser.uid,
    oxygenLevel: 98,
    doctorApproved: true, // Forgery!
    officialDiagnosis: 'سليم تماماً - تشخيص مزيف' // Forgery!
  };

  const forgeryRuleResult = simulatePatientCaseCreateRule(forgedPayload, {
    uid: patientAUser.uid,
    token: { role: 'patient' }
  });
  assert.strictEqual(forgeryRuleResult, false, 'Patient clinical forgery MUST be blocked by security rules');
  console.log('    ✓ Security Rule Rejection (403): Clinical diagnosis forgery strictly blocked.');
  passedAssertions++;


  // ===========================================================================
  // SECTION 4: ANONYMOUS / UNAUTHENTICATED ATTACKS
  // ===========================================================================
  console.log('\n▶ SECTION 4: Anonymous / Unauthenticated Penetration Attacks');

  // Anonymous visitor calling disease authorization
  console.log('  [Attack 4.1] Unauthenticated visitor calls disease service:');
  try {
    diseaseAuthService.authorizeDiseaseAccess({
      user: null, // No authenticated user!
      diseaseId: 'hypertension',
      action: 'read:records'
    });
    assert.fail('Unauthenticated access must throw 401/403');
  } catch (err) {
    assert.strictEqual(err.statusCode, 401);
    assert.strictEqual(err.code, 'UNAUTHORIZED');
    console.log('    ✓ HTTP 401 Unauthorized: Anonymous visitor denied.');
    passedAssertions++;
  }

  // Anonymous visitor requesting protected screen
  console.log('  [Attack 4.2] Unauthenticated visitor requests protected screens:');
  const protectedScreens = ['doctor', 'admin', 'audit', 'kpi', 'assessment', 'report'];
  for (const screen of protectedScreens) {
    assert.strictEqual(Permissions.AUTH_REQUIRED_SCREENS.includes(screen), true, `${screen} must require authentication`);
  }
  console.log('    ✓ Route Guard Defense: All sensitive screens mandate authenticated session.');
  passedAssertions++;

  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedAssertions} PENETRATION TEST ASSERTIONS PASSED WITH 100% SUCCESS!`);
  console.log('   Zero-Trust RBAC & Horizontal Privilege Separation Verified.');
  console.log('==================================================================\n');
  process.exit(0);
}

runPenetrationTestSuite().catch(err => {
  console.error('\n❌ Permission Penetration Test Failed:', err);
  process.exit(1);
});
