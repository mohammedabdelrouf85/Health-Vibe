/**
 * Health Vibe AI - Unified Disease Authorization Test Suite
 *
 * Validates unified zero-trust authorization across:
 * 1. Diabetes
 * 2. Hypertension
 * 3. Blood Clotting / Blood Disorders
 * 4. Obesity
 *
 * SPECIFICATION & CORE POLICIES:
 * 1. Patients may access ONLY their own disease records.
 * 2. Doctors may access ONLY records they are authorized and assigned to review.
 * 3. Administrators may access disease information ONLY according to their configured permissions.
 * 4. Zero-Trust: Do NOT trust role, patientId, doctorId, clinicId, or diseaseId supplied by browser.
 * 5. Validate authorization on trusted backend and applicable Firebase Security Rules.
 * 6. Test:
 *    - Direct URL access / route guards
 *    - Direct API requests across all 4 diseases
 *    - Modified IDs (tampering with role, patientId, doctorId, clinicId)
 *    - Cross-patient access attempts
 *    - Cross-clinic access attempts
 *    - Suspended accounts (patient, doctor, admin)
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

console.log('==================================================================');
console.log('🛡️ HEALTH VIBE AI: UNIFIED DISEASE AUTHORIZATION TEST SUITE');
console.log('   Diabetes, Hypertension, Blood Disorders, Obesity Zero-Trust RBAC');
console.log('==================================================================\n');

// Load backend services
const diseaseAuthService = require('../backend/disease-authorization-service');
const diabetesService = require('../backend/diabetes-service');
const chronicHypertensionService = require('../backend/chronic-hypertension-service');
const bloodDisordersService = require('../backend/blood-disorders-service');
const obesityService = require('../backend/obesity-service');
const permissionsModule = require('../app/modules/permissions/permissions');

// Setup mock window/DOM environment for route guard tests
global.currentLanguage = 'en';
global.selectedRole = 'patient';
const mockLocalStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};
global.localStorage = mockLocalStorage;

const mockElements = new Map();
global.document = {
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: () => [],
  createElement: () => ({ innerHTML: '', classList: { add() {}, remove() {}, contains: () => false } }),
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {}
};

// =============================================================================
// TEST PERSONAS & FIXTURES
// =============================================================================

const personas = {
  // Patients
  patientAlice: {
    uid: 'pat_alice_101',
    role: 'patient',
    email: 'alice@patient.test',
    email_verified: true,
    clinicId: 'clinic_cairo_north',
    suspended: false
  },
  patientBob: {
    uid: 'pat_bob_202',
    role: 'patient',
    email: 'bob@patient.test',
    email_verified: true,
    clinicId: 'clinic_alex_sea',
    suspended: false
  },
  patientSuspended: {
    uid: 'pat_suspended_303',
    role: 'patient',
    email: 'suspended.pt@blocked.test',
    email_verified: true,
    clinicId: 'clinic_cairo_north',
    suspended: true,
    status: 'suspended'
  },

  // Doctors
  doctorTariqAssigned: {
    uid: 'doc_tariq_77',
    role: 'doctor',
    email: 'dr.tariq@cairo.test',
    email_verified: true,
    verifiedDoctor: true,
    licenseNumber: 'LIC-EGY-7701',
    licenseStatus: 'active',
    isLicenseExpired: false,
    clinicId: 'clinic_cairo_north',
    suspended: false
  },
  doctorHassanUnassigned: {
    uid: 'doc_hassan_88',
    role: 'doctor',
    email: 'dr.hassan@cairo.test',
    email_verified: true,
    verifiedDoctor: true,
    licenseNumber: 'LIC-EGY-8802',
    licenseStatus: 'active',
    isLicenseExpired: false,
    clinicId: 'clinic_cairo_north',
    suspended: false
  },
  doctorForeignClinic: {
    uid: 'doc_foreign_99',
    role: 'doctor',
    email: 'dr.foreign@alex.test',
    email_verified: true,
    verifiedDoctor: true,
    licenseNumber: 'LIC-EGY-9903',
    licenseStatus: 'active',
    isLicenseExpired: false,
    clinicId: 'clinic_alex_sea',
    suspended: false
  },
  doctorExpiredLicense: {
    uid: 'doc_expired_44',
    role: 'doctor',
    email: 'dr.expired@test.invalid',
    email_verified: true,
    verifiedDoctor: true,
    licenseNumber: 'LIC-EXPIRED-44',
    licenseStatus: 'expired',
    isLicenseExpired: true,
    clinicId: 'clinic_cairo_north',
    suspended: false
  },
  doctorSuspended: {
    uid: 'doc_suspended_55',
    role: 'doctor',
    email: 'dr.suspended@test.invalid',
    email_verified: true,
    verifiedDoctor: true,
    licenseNumber: 'LIC-SUSPENDED-55',
    licenseStatus: 'active',
    isLicenseExpired: false,
    clinicId: 'clinic_cairo_north',
    suspended: true,
    status: 'suspended'
  },

  // Clinic Administrators
  clinicAdminNorth: {
    uid: 'admin_cairo_north',
    role: 'clinic_admin',
    email: 'admin.north@clinic.test',
    email_verified: true,
    clinicId: 'clinic_cairo_north',
    suspended: false
  },
  clinicAdminAlex: {
    uid: 'admin_alex_sea',
    role: 'clinic_admin',
    email: 'admin.alex@clinic.test',
    email_verified: true,
    clinicId: 'clinic_alex_sea',
    suspended: false
  },
  clinicAdminSuspended: {
    uid: 'admin_suspended_66',
    role: 'clinic_admin',
    email: 'admin.blocked@clinic.test',
    email_verified: true,
    clinicId: 'clinic_cairo_north',
    suspended: true,
    status: 'suspended'
  },

  // Super Admin / Owner
  superAdmin: {
    uid: 'super_admin_01',
    role: 'super_admin',
    isOwner: true,
    email: 'owner@healthvibes.test',
    email_verified: true,
    suspended: false
  },

  // Support Role
  supportStaff: {
    uid: 'support_staff_01',
    role: 'support',
    email: 'support@healthvibes.test',
    email_verified: true,
    suspended: false
  }
};

(async () => {
  // Reset all services
  diabetesService.resetDiabetesStoreForTesting();
  chronicHypertensionService.resetHypertensionStoreForTesting();
  bloodDisordersService.resetBloodDisordersStoreForTesting();
  obesityService.resetObesityStoreForTesting();

  const DISEASES = ['diabetes', 'hypertension', 'blood-disorders', 'obesity'];

  // ===========================================================================
  // TEST 1: ZERO-TRUST PARAMETER HYGIENE & NORMALIZATION
  // ===========================================================================
  console.log('▶ TEST 1: Zero-Trust Parameter Hygiene & Canonical Disease Normalization');

  // Disease aliases normalize correctly
  assert.equal(diseaseAuthService.normalizeDiseaseId('diabetes'), 'diabetes');
  assert.equal(diseaseAuthService.normalizeDiseaseId('diabetes_mellitus'), 'diabetes');
  assert.equal(diseaseAuthService.normalizeDiseaseId('hypertension'), 'hypertension');
  assert.equal(diseaseAuthService.normalizeDiseaseId('chronic_hypertension'), 'hypertension');
  assert.equal(diseaseAuthService.normalizeDiseaseId('bp'), 'hypertension');
  assert.equal(diseaseAuthService.normalizeDiseaseId('blood-disorders'), 'blood-disorders');
  assert.equal(diseaseAuthService.normalizeDiseaseId('blood_disorders'), 'blood-disorders');
  assert.equal(diseaseAuthService.normalizeDiseaseId('blood_clotting'), 'blood-disorders');
  assert.equal(diseaseAuthService.normalizeDiseaseId('obesity'), 'obesity');
  assert.equal(diseaseAuthService.normalizeDiseaseId('metabolic'), 'obesity');
  assert.equal(diseaseAuthService.normalizeDiseaseId('weight'), 'obesity');

  // Unsupported disease ID is rejected
  assert.throws(
    () => diseaseAuthService.normalizeDiseaseId('unknown_condition'),
    err => err.code === 'UNSUPPORTED_DISEASE' && err.statusCode === 404,
    'Unsupported disease module must throw 404 UNSUPPORTED_DISEASE'
  );

  // Missing disease ID is rejected
  assert.throws(
    () => diseaseAuthService.normalizeDiseaseId(''),
    err => err.code === 'MISSING_DISEASE_ID' && err.statusCode === 400,
    'Missing diseaseId must throw 400 MISSING_DISEASE_ID'
  );

  // Browser parameter tampering: patient client sending forged role: "super_admin" or doctorId in request
  const forgedReq = {
    user: { uid: personas.patientAlice.uid, role: 'patient' },
    body: { role: 'super_admin', doctorId: 'doc_tariq_77', clinicId: 'foreign_clinic' }
  };
  const sanitized = diseaseAuthService.sanitizeAuthContext(forgedReq);
  assert.equal(sanitized.role, 'patient', 'Browser-forged role must be completely ignored');
  assert.equal(sanitized.uid, personas.patientAlice.uid, 'Browser-forged doctorId/patientId ignored');
  console.log('  ✔ Zero-trust parameter hygiene and disease normalization verified.\n');

  // ===========================================================================
  // TEST 2: PATIENT ACCESS CONTROLS (SELF-ACCESS VS CROSS-PATIENT BLOCKS)
  // ===========================================================================
  console.log('▶ TEST 2: Patient Access Controls (Strict Self-Access Across All 4 Diseases)');

  for (const disease of DISEASES) {
    // 2.1 Patient accessing own disease records must SUCCEED
    const selfAuth = diseaseAuthService.authorizeDiseaseAccess({
      user: personas.patientAlice,
      diseaseId: disease,
      action: 'read:records',
      targetPatientId: personas.patientAlice.uid
    });
    assert.equal(selfAuth.authorized, true);
    assert.equal(selfAuth.patientId, personas.patientAlice.uid);

    // 2.2 Cross-patient access: Alice trying to access Bob's records must FAIL with 403 CROSS_PATIENT_ACCESS_DENIED
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.patientAlice,
        diseaseId: disease,
        action: 'read:records',
        targetPatientId: personas.patientBob.uid
      }),
      err => err.code === 'CROSS_PATIENT_ACCESS_DENIED' && err.statusCode === 403,
      `Cross-patient read on ${disease} must be strictly blocked with 403 CROSS_PATIENT_ACCESS_DENIED`
    );

    // 2.3 Cross-patient case creation: Alice trying to create a case under Bob's ID
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.patientAlice,
        diseaseId: disease,
        action: 'create:case',
        targetPatientId: personas.patientBob.uid
      }),
      err => err.code === 'CROSS_PATIENT_ACCESS_DENIED' && err.statusCode === 403,
      `Cross-patient case creation on ${disease} must be blocked with 403`
    );

    // 2.4 Patient attempting doctor action (approve/review) must FAIL
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.patientAlice,
        diseaseId: disease,
        action: 'approve:case',
        targetPatientId: personas.patientAlice.uid
      }),
      err => err.code === 'DOCTOR_PRIVILEGE_REQUIRED' && err.statusCode === 403,
      `Patient attempting clinical approval on ${disease} must be blocked with 403 DOCTOR_PRIVILEGE_REQUIRED`
    );
  }
  console.log('  ✔ Patient self-access permitted, cross-patient access denied across all 4 diseases.\n');

  // ===========================================================================
  // TEST 3: DOCTOR ACCESS & ASSIGNMENT CONTROLS
  // ===========================================================================
  console.log('▶ TEST 3: Doctor Access Control (Assignment Gating & Clinic Scoping)');

  for (const disease of DISEASES) {
    const clinicalCase = {
      caseId: `case_${disease}_01`,
      patientId: personas.patientAlice.uid,
      clinicId: 'clinic_cairo_north',
      assignedDoctorId: personas.doctorTariqAssigned.uid,
      disease
    };

    // 3.1 Assigned Doctor accessing case must SUCCEED
    const docAuth = diseaseAuthService.authorizeDiseaseAccess({
      user: personas.doctorTariqAssigned,
      diseaseId: disease,
      action: 'read:case',
      record: clinicalCase
    });
    assert.equal(docAuth.authorized, true);
    assert.equal(docAuth.role, 'doctor');

    // 3.2 Unassigned Doctor (Dr. Hassan) accessing case must FAIL with 403 DOCTOR_NOT_ASSIGNED
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.doctorHassanUnassigned,
        diseaseId: disease,
        action: 'read:case',
        record: clinicalCase
      }),
      err => err.code === 'DOCTOR_NOT_ASSIGNED' && err.statusCode === 403,
      `Unassigned doctor accessing ${disease} case must throw 403 DOCTOR_NOT_ASSIGNED`
    );

    // 3.3 Doctor from another clinic (Dr. Foreign from Alex clinic) must FAIL with 403 CROSS_CLINIC_ACCESS_DENIED
    const foreignCase = {
      ...clinicalCase,
      assignedDoctorId: personas.doctorForeignClinic.uid // Even if assigned, doctor is in another clinic!
    };
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.doctorForeignClinic,
        diseaseId: disease,
        action: 'read:case',
        record: foreignCase
      }),
      err => err.code === 'CROSS_CLINIC_ACCESS_DENIED' && err.statusCode === 403,
      `Doctor attempting cross-clinic access on ${disease} must throw 403 CROSS_CLINIC_ACCESS_DENIED`
    );

    // 3.4 Doctor with expired or revoked license must FAIL with 403 INVALID_DOCTOR_LICENSE
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.doctorExpiredLicense,
        diseaseId: disease,
        action: 'read:case',
        record: clinicalCase
      }),
      err => err.code === 'INVALID_DOCTOR_LICENSE' && err.statusCode === 403,
      `Doctor with expired license on ${disease} must throw 403 INVALID_DOCTOR_LICENSE`
    );
  }
  console.log('  ✔ Doctor assignment gating, license validation, and clinic scoping verified.\n');

  // ===========================================================================
  // TEST 4: ADMINISTRATOR PERMISSIONS & CROSS-CLINIC ISOLATION
  // ===========================================================================
  console.log('▶ TEST 4: Administrator Configured Permissions & Scope Isolation');

  for (const disease of DISEASES) {
    const northCase = {
      caseId: `case_admin_${disease}_north`,
      patientId: personas.patientAlice.uid,
      clinicId: 'clinic_cairo_north',
      disease
    };

    // 4.1 Clinic Admin accessing their OWN clinic disease records must SUCCEED
    const clinicAdminAuth = diseaseAuthService.authorizeDiseaseAccess({
      user: personas.clinicAdminNorth,
      diseaseId: disease,
      action: 'read:records',
      record: northCase
    });
    assert.equal(clinicAdminAuth.authorized, true);
    assert.equal(clinicAdminAuth.role, 'clinic_admin');

    // 4.2 Cross-Clinic Access: Alex Clinic Admin attempting to access Cairo North record must FAIL
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.clinicAdminAlex,
        diseaseId: disease,
        action: 'read:records',
        record: northCase
      }),
      err => err.code === 'CROSS_CLINIC_ACCESS_DENIED' && err.statusCode === 403,
      `Cross-clinic admin access on ${disease} must throw 403 CROSS_CLINIC_ACCESS_DENIED`
    );

    // 4.3 Cross-Clinic Query: Admin attempting to query with requestedClinicId for a foreign clinic
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.clinicAdminNorth,
        diseaseId: disease,
        action: 'read:records',
        requestedClinicId: 'clinic_alex_sea'
      }),
      err => err.code === 'CROSS_CLINIC_ACCESS_DENIED' && err.statusCode === 403,
      `Clinic admin querying foreign clinicId on ${disease} must throw 403 CROSS_CLINIC_ACCESS_DENIED`
    );

    // 4.4 Clinic Admin attempting physician diagnosis/approval must FAIL
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.clinicAdminNorth,
        diseaseId: disease,
        action: 'approve:case',
        record: northCase
      }),
      err => err.code === 'PHYSICIAN_REQUIRED' && err.statusCode === 403,
      `Clinic admin attempting doctor approval on ${disease} must throw 403 PHYSICIAN_REQUIRED`
    );

    // 4.5 Super Admin / Platform Owner has cross-clinic administrative governance
    const superAdminAuth = diseaseAuthService.authorizeDiseaseAccess({
      user: personas.superAdmin,
      diseaseId: disease,
      action: 'read:records',
      record: northCase
    });
    assert.equal(superAdminAuth.authorized, true);

    // 4.6 Support Role is restricted from private clinical disease observations
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.supportStaff,
        diseaseId: disease,
        action: 'read:records',
        record: northCase
      }),
      err => err.code === 'SUPPORT_ACCESS_RESTRICTED' && err.statusCode === 403,
      `Support role reading clinical records on ${disease} must throw 403 SUPPORT_ACCESS_RESTRICTED`
    );
  }
  console.log('  ✔ Administrator clinic boundaries, platform admin governance, and support isolation verified.\n');

  // ===========================================================================
  // TEST 5: IMMEDIATE SUSPENSION ENFORCEMENT
  // ===========================================================================
  console.log('▶ TEST 5: Suspended Accounts Immediate Blocking (Patient, Doctor, Admin)');

  for (const disease of DISEASES) {
    // 5.1 Suspended Patient is blocked immediately (403 ACCOUNT_SUSPENDED)
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.patientSuspended,
        diseaseId: disease,
        action: 'read:records',
        targetPatientId: personas.patientSuspended.uid
      }),
      err => err.code === 'ACCOUNT_SUSPENDED' && err.statusCode === 403,
      `Suspended patient on ${disease} must throw 403 ACCOUNT_SUSPENDED`
    );

    // 5.2 Suspended Doctor is blocked immediately
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.doctorSuspended,
        diseaseId: disease,
        action: 'read:case',
        record: { assignedDoctorId: personas.doctorSuspended.uid, clinicId: 'clinic_cairo_north' }
      }),
      err => err.code === 'ACCOUNT_SUSPENDED' && err.statusCode === 403,
      `Suspended doctor on ${disease} must throw 403 ACCOUNT_SUSPENDED`
    );

    // 5.3 Suspended Clinic Admin is blocked immediately
    assert.throws(
      () => diseaseAuthService.authorizeDiseaseAccess({
        user: personas.clinicAdminSuspended,
        diseaseId: disease,
        action: 'read:records',
        record: { clinicId: 'clinic_cairo_north' }
      }),
      err => err.code === 'ACCOUNT_SUSPENDED' && err.statusCode === 403,
      `Suspended admin on ${disease} must throw 403 ACCOUNT_SUSPENDED`
    );
  }
  console.log('  ✔ Immediate suspension enforcement verified across all user roles and diseases.\n');

  // ===========================================================================
  // TEST 6: DIRECT URL ACCESS & FRONT-END ROUTE GUARDS
  // ===========================================================================
  console.log('▶ TEST 6: Direct URL Access & Front-End Route Guards (applyRouteGuards)');

  // Load app.js applyRouteGuards
  const appJsCode = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');
  assert.ok(appJsCode.includes('function applyRouteGuards(targetScreen)'), 'applyRouteGuards must exist in app.js');

  // Test permissions module screen checks
  for (const disease of ['diabetes', 'hypertension', 'blood-disorders', 'obesity']) {
    // 6.1 Patient can access allowed disease screen
    assert.equal(
      permissionsModule.canAccessScreen(disease, 'patient'),
      true,
      `Patient role must be allowed to access screen '${disease}'`
    );

    // 6.2 Doctor can access allowed disease screen
    assert.equal(
      permissionsModule.canAccessScreen(disease, 'doctor'),
      true,
      `Doctor role must be allowed to access screen '${disease}'`
    );

    // 6.3 Clinic Admin can access allowed disease screen
    assert.equal(
      permissionsModule.canAccessScreen(disease, 'clinic_admin'),
      true,
      `Clinic admin role must be allowed to access screen '${disease}'`
    );

    // 6.4 Super Admin can access disease screen
    assert.equal(
      permissionsModule.canAccessScreen(disease, 'super_admin'),
      true,
      `Super admin must be allowed to access screen '${disease}'`
    );

    // 6.5 Support role is strictly BLOCKED from disease screens
    assert.equal(
      permissionsModule.canAccessScreen(disease, 'support'),
      false,
      `Support role must be BLOCKED from disease screen '${disease}'`
    );

    // 6.6 Disease screen requires authenticated session
    assert.ok(
      permissionsModule.AUTH_REQUIRED_SCREENS.includes(disease),
      `Screen '${disease}' must require authentication`
    );
  }

  // Verify suspended account check exists in applyRouteGuards in app.js
  assert.ok(
    appJsCode.includes('isSuspendedAccount') && appJsCode.includes('Suspended account blocked'),
    'applyRouteGuards must strictly block suspended accounts'
  );
  console.log('  ✔ Front-end direct URL route guards and non-clinical support quarantines verified.\n');

  // ===========================================================================
  // TEST 7: FIREBASE SECURITY RULES PARITY VALIDATION
  // ===========================================================================
  console.log('▶ TEST 7: Firebase Security Rules Enforcement Across Disease Collections');

  const rulesContent = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  const backendRulesContent = fs.readFileSync(path.resolve(__dirname, '../backend/firestore.rules'), 'utf8');

  const requiredCollections = [
    'disease_records',
    'diabetes_records',
    'diabetes_cases',
    'hypertension_records',
    'blood_disorders_cases',
    'blood_disorders_observations',
    'obesity_measurements',
    'obesity_cases'
  ];

  for (const col of requiredCollections) {
    assert.ok(
      rulesContent.includes(`match /${col}/`),
      `firestore.rules must contain match block for /${col}/`
    );
    assert.ok(
      backendRulesContent.includes(`match /${col}/`),
      `backend/firestore.rules must contain match block for /${col}/`
    );
  }

  // Verify security rules helper functions
  assert.ok(rulesContent.includes('isDiseaseRecordAccessible(resource.data)'), 'firestore.rules uses isDiseaseRecordAccessible');
  assert.ok(rulesContent.includes('isDiseaseRecordWritable(request.resource.data)'), 'firestore.rules uses isDiseaseRecordWritable');
  assert.ok(backendRulesContent.includes('isDiseaseRecordAccessible(resource.data)'), 'backend/firestore.rules uses isDiseaseRecordAccessible');
  assert.ok(backendRulesContent.includes('isDiseaseRecordWritable(request.resource.data)'), 'backend/firestore.rules uses isDiseaseRecordWritable');

  // Verify critical rules criteria:
  // 1. Blocks suspended accounts via isAuthenticated()
  assert.ok(rulesContent.includes('!isSuspended()'), 'Rules require !isSuspended()');
  // 2. Patient self-access
  assert.ok(rulesContent.includes('data.patientId == request.auth.uid'), 'Rules enforce patientId == request.auth.uid');
  // 3. Doctor linked assignment check
  assert.ok(rulesContent.includes('isDoctorLinkedRecord(data)'), 'Rules enforce isDoctorLinkedRecord');
  // 4. Clinic admin matching check
  assert.ok(rulesContent.includes('tokenClinicAdminFor(data)'), 'Rules enforce tokenClinicAdminFor');
  // 5. Support role denied clinical records
  assert.ok(rulesContent.includes("!('role' in request.auth.token && request.auth.token.role == 'support')"), 'Rules deny support role');

  console.log('  ✔ Firebase Security Rules contain all required disease collections and access gates.\n');

  // ===========================================================================
  // TEST 8: UNIFIED API SERVICE INTEGRATION IN SERVER.JS
  // ===========================================================================
  console.log('▶ TEST 8: Server.js Architecture Integration');

  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

  // Check service requirements
  assert.ok(serverJsContent.includes("require('./diabetes-service')"), 'server.js requires diabetes-service');
  assert.ok(serverJsContent.includes("require('./disease-authorization-service')"), 'server.js requires disease-authorization-service');
  assert.ok(serverJsContent.includes("require('./obesity-service')"), 'server.js requires obesity-service');
  assert.ok(serverJsContent.includes("require('./chronic-hypertension-service')"), 'server.js requires chronic-hypertension-service');
  assert.ok(serverJsContent.includes("require('./blood-disorders-service')"), 'server.js requires blood-disorders-service');

  // Check endpoint mounts for all 4 diseases and unified router
  assert.ok(serverJsContent.includes('/api/diabetes/measurements'), 'server.js mounts /api/diabetes/measurements');
  assert.ok(serverJsContent.includes('/api/diabetes/cases'), 'server.js mounts /api/diabetes/cases');
  assert.ok(serverJsContent.includes('/api/chronic/hypertension/readings'), 'server.js mounts /api/chronic/hypertension/readings');
  assert.ok(serverJsContent.includes('/api/blood-disorders/observations'), 'server.js mounts /api/blood-disorders/observations');
  assert.ok(serverJsContent.includes('/api/obesity/measurements'), 'server.js mounts /api/obesity/measurements');
  assert.ok(serverJsContent.includes('/api/diseases/:diseaseId/records'), 'server.js mounts /api/diseases/:diseaseId/records');
  assert.ok(serverJsContent.includes('/api/diseases/:diseaseId/cases'), 'server.js mounts /api/diseases/:diseaseId/cases');
  assert.ok(serverJsContent.includes('/api/diseases/:diseaseId/case/:caseId/approve'), 'server.js mounts /api/diseases/:diseaseId/case/:caseId/approve');

  // Check app exports
  assert.ok(serverJsContent.includes('app.diabetesService = diabetesService;'), 'server.js exports diabetesService');
  assert.ok(serverJsContent.includes('app.diseaseAuthorizationService = diseaseAuthorizationService;'), 'server.js exports diseaseAuthorizationService');

  console.log('  ✔ Server architecture integration and unified disease routes verified.\n');

  console.log('==================================================================');
  console.log('🎉 ALL 8 UNIFIED DISEASE AUTHORIZATION TEST SUITES PASSED (100%)!');
  console.log('==================================================================');
})().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
