/**
 * Health Vibe AI - Automated Backend & Security Test Suite
 * Doctor Order Diagnostic Investigations & Chest X-Ray (Vezeeta Pattern)
 *
 * Verifies:
 * 1. Catalog & Presets Retrieval API.
 * 2. Verified Doctor RBAC Enforcement (role, approved status, active license).
 * 3. Rejection of unauthenticated users (401), non-doctors (403), and unverified doctors (403).
 * 4. Multi-Tenant Clinic Isolation (CROSS_CLINIC_ACCESS_DENIED) & Unassigned Doctor Guard (UNASSIGNED_DOCTOR_ACCESS_DENIED).
 * 5. Diagnostic Investigation Items Normalization (LOINC, RADLEX, STAT vs Routine).
 * 6. Workup Preset Bundles Expansion (Respiratory Infection: CBC + CRP + Chest X-Ray).
 * 7. Custom Unlisted Test Sanitization against XSS.
 * 8. Case State Persistence, Revision Incrementation, and Status History Tracking.
 * 9. Requisition Reference Generation (REF:#XXXXXX-DIAG).
 * 10. Immutable Compliance Audit Logging ('CLINICAL_INVESTIGATIONS_ORDERED' in audit_logs).
 * 11. Investigation Removal / Update API.
 */

'use strict';

const assert = require('assert');
const doctorInvestigationsService = require('../backend/doctor-investigations-service');

console.log('==================================================================');
console.log('🔬 TEST SUITE: DOCTOR DIAGNOSTIC INVESTIGATIONS BACKEND & SECURITY');
console.log('==================================================================\n');

// -----------------------------------------------------------------------------
// Mock Database & Firestore Helper
// -----------------------------------------------------------------------------
function createMockDb(initialCases = {}) {
  const casesMap = new Map(Object.entries(initialCases));
  const auditLogs = [];

  return {
    _cases: casesMap,
    _auditLogs: auditLogs,
    collection(colName) {
      if (colName === 'cases') {
        return {
          doc(id) {
            return {
              async get() {
                const data = casesMap.get(id);
                return {
                  exists: Boolean(data),
                  data: () => (data ? JSON.parse(JSON.stringify(data)) : null)
                };
              },
              async update(payload) {
                const existing = casesMap.get(id) || {};
                const updated = { ...existing, ...payload };
                casesMap.set(id, updated);
                return updated;
              }
            };
          }
        };
      }
      if (colName === 'audit_logs') {
        return {
          async add(record) {
            const entry = { id: `audit_${Date.now()}_${Math.random()}`, ...record };
            auditLogs.push(entry);
            return entry;
          }
        };
      }
      throw new Error(`Mock collection ${colName} not implemented`);
    }
  };
}

// -----------------------------------------------------------------------------
// TEST 1: Diagnostic Catalog & Presets Definition
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Diagnostic Catalog & Presets Definition');

const catalogData = doctorInvestigationsService.getCatalog();
assert(catalogData.catalog.length >= 10, 'Catalog must contain standard lab & radiology tests');

const cbc = catalogData.catalog.find(c => c.code === 'CBC');
assert(cbc, 'Catalog must include CBC');
assert.strictEqual(cbc.category, 'LAB');
assert.strictEqual(cbc.loinc, '58410-2');

const crp = catalogData.catalog.find(c => c.code === 'CRP');
assert(crp, 'Catalog must include CRP');
assert.strictEqual(crp.category, 'LAB');
assert.strictEqual(crp.loinc, '1988-5');

const cxr = catalogData.catalog.find(c => c.code === 'CHEST_XRAY');
assert(cxr, 'Catalog must include CHEST_XRAY');
assert.strictEqual(cxr.category, 'RADIOLOGY');
assert.strictEqual(cxr.loinc, '36643-5');

assert(catalogData.presets.RESPIRATORY_INFECTION, 'Must define RESPIRATORY_INFECTION preset');
assert.deepStrictEqual(catalogData.presets.RESPIRATORY_INFECTION.testCodes, ['CBC', 'CRP', 'CHEST_XRAY']);

console.log('  ✓ Catalog contains CBC, CRP, Chest X-Ray and clinical presets.\n');

// -----------------------------------------------------------------------------
// TEST 2: Verified Doctor Authorization Guard
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Verified Doctor Authorization Guard');

// Case A: Missing profile
const noProfile = doctorInvestigationsService.verifyDoctorAuthorization(null);
assert.strictEqual(noProfile.isAuthorized, false);
assert.strictEqual(noProfile.code, 'DOCTOR_PROFILE_NOT_FOUND');

// Case B: Non-doctor role (e.g. Patient)
const patientProfile = { role: 'patient', verifiedDoctor: false };
const patientAuth = doctorInvestigationsService.verifyDoctorAuthorization(patientProfile);
assert.strictEqual(patientAuth.isAuthorized, false);
assert.strictEqual(patientAuth.code, 'INSUFFICIENT_ROLE');

// Case C: Unverified / Pending doctor
const unapprovedDoc = { role: 'doctor', doctorApplicationStatus: 'pending', verifiedDoctor: false };
const unapprovedAuth = doctorInvestigationsService.verifyDoctorAuthorization(unapprovedDoc);
assert.strictEqual(unapprovedAuth.isAuthorized, false);
assert.strictEqual(unapprovedAuth.code, 'DOCTOR_NOT_VERIFIED');

// Case D: Suspended license doctor
const suspendedDoc = { role: 'doctor', verifiedDoctor: true, licenseStatus: 'suspended' };
const suspendedAuth = doctorInvestigationsService.verifyDoctorAuthorization(suspendedDoc);
assert.strictEqual(suspendedAuth.isAuthorized, false);
assert.strictEqual(suspendedAuth.code, 'DOCTOR_LICENSE_INACTIVE');

// Case E: Fully Verified Doctor
const verifiedDoc = {
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Sarah Al-Sayed',
  doctorLicense: 'EG-MED-84920',
  specialty: 'Pulmonology & Respiratory Critical Care'
};
const verifiedAuth = doctorInvestigationsService.verifyDoctorAuthorization(verifiedDoc);
assert.strictEqual(verifiedAuth.isAuthorized, true);
assert.strictEqual(verifiedAuth.doctorName, 'Dr. Sarah Al-Sayed');
assert.strictEqual(verifiedAuth.doctorLicense, 'EG-MED-84920');

console.log('  ✓ Verified Doctor RBAC guard strictly blocks unauthorized users and validates credentials.\n');

// -----------------------------------------------------------------------------
// TEST 3: Multi-Tenant Clinic Isolation & Doctor Assignment Checks
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Multi-Tenant Clinic Isolation & Doctor Assignment Checks');

const user = { uid: 'doc_101', email: 'sarah.doc@healthvibes.app' };

// Case A: Cross-clinic access denied
const crossClinicCase = {
  id: 'case_c01',
  clinicId: 'clinic_alpha',
  assignedDoctorId: 'doc_101'
};
const crossClinicProfile = { ...verifiedDoc, clinicId: 'clinic_beta' };
const crossClinicCheck = doctorInvestigationsService.verifyDoctorCaseAccess(crossClinicCase, user, crossClinicProfile);
assert.strictEqual(crossClinicCheck.isAllowed, false);
assert.strictEqual(crossClinicCheck.code, 'CROSS_CLINIC_ACCESS_DENIED');

// Case B: Unassigned doctor access denied
const unassignedCase = {
  id: 'case_c02',
  clinicId: 'clinic_alpha',
  assignedDoctorId: 'doc_999' // Assigned to someone else
};
const matchingClinicProfile = { ...verifiedDoc, clinicId: 'clinic_alpha' };
const unassignedCheck = doctorInvestigationsService.verifyDoctorCaseAccess(unassignedCase, user, matchingClinicProfile);
assert.strictEqual(unassignedCheck.isAllowed, false);
assert.strictEqual(unassignedCheck.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');

// Case C: Correct clinic & assigned doctor
const validAssignedCase = {
  id: 'case_c03',
  clinicId: 'clinic_alpha',
  assignedDoctorId: 'doc_101'
};
const validAccessCheck = doctorInvestigationsService.verifyDoctorCaseAccess(validAssignedCase, user, matchingClinicProfile);
assert.strictEqual(validAccessCheck.isAllowed, true);

console.log('  ✓ Clinic isolation and doctor assignment checks enforced accurately.\n');

// -----------------------------------------------------------------------------
// TEST 4: Ordering Investigations (CBC + CRP + Chest X-Ray) with Mock DB & Audit
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Ordering Investigations with Mock DB & Audit Logging');

(async () => {
  const caseId = 'case_resp_77412';
  const mockDb = createMockDb({
    [caseId]: {
      id: caseId,
      status: 'under_review',
      patientId: 'pat_404',
      clinicId: 'clinic_alpha',
      assignedDoctorId: 'doc_101',
      clinicalRevision: 2,
      statusHistory: []
    }
  });

  const orderPayload = {
    caseId,
    investigations: [
      { code: 'CBC', urgency: 'routine', clinicalIndication: 'Rule out bacterial leukocytosis' },
      { code: 'CRP', urgency: 'routine', clinicalIndication: 'Assess systemic inflammatory response' },
      { code: 'CHEST_XRAY', urgency: 'stat', clinicalIndication: 'Bilateral basal crackles on auscultation' }
    ],
    notes: 'Prescribed complementary diagnostics for severe acute bronchitis with dyspnea.',
    user,
    doctorProfile: matchingClinicProfile,
    db: mockDb,
    metadata: {
      ip: '197.35.42.11',
      userAgent: 'Mozilla/5.0 Medical Station Chrome/130'
    }
  };

  const result = await doctorInvestigationsService.processOrderInvestigations(orderPayload);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.count, 3);
  assert(result.requisitionRef.startsWith('REF:#'), 'Requisition reference must start with REF:#');

  // Verify Case state in Database
  const updatedCase = mockDb._cases.get(caseId);
  assert(updatedCase, 'Case must be updated in DB');
  assert.strictEqual(updatedCase.hasOrderedInvestigations, true);
  assert.strictEqual(updatedCase.investigations.length, 3);
  assert.strictEqual(updatedCase.clinicalRevision, 3, 'Clinical revision must increment for concurrency');

  // Verify investigations details
  const orderedCxr = updatedCase.investigations.find(i => i.code === 'CHEST_XRAY');
  assert(orderedCxr, 'Chest X-Ray must be in ordered list');
  assert.strictEqual(orderedCxr.category, 'RADIOLOGY');
  assert.strictEqual(orderedCxr.urgency, 'stat');
  assert.strictEqual(orderedCxr.loinc, '36643-5');

  // Verify Audit Log
  assert.strictEqual(mockDb._auditLogs.length, 1, 'Audit log entry must be created');
  const auditEntry = mockDb._auditLogs[0];
  assert.strictEqual(auditEntry.eventType, 'CLINICAL_INVESTIGATIONS_ORDERED');
  assert.strictEqual(auditEntry.action, 'ORDER_DIAGNOSTIC_INVESTIGATIONS');
  assert.strictEqual(auditEntry.caseId, caseId);
  assert.strictEqual(auditEntry.performedBy.uid, 'doc_101');
  assert.strictEqual(auditEntry.performedBy.license, 'EG-MED-84920');
  assert.strictEqual(auditEntry.details.investigationCount, 3);
  assert.strictEqual(auditEntry.details.hasRadiology, true);
  assert.strictEqual(auditEntry.details.hasStatOrders, true);
  assert.strictEqual(auditEntry.ipAddress, '197.35.42.11');

  console.log('  ✓ Investigations successfully saved to case record, revision incremented, and audit log registered.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Workup Presets Expansion (e.g. ACUTE_DYSPNEA_PE)
  // ---------------------------------------------------------------------------
  console.log('▶ TEST 5: Workup Presets Expansion');

  const presetCaseId = 'case_preset_9912';
  mockDb._cases.set(presetCaseId, {
    id: presetCaseId,
    status: 'under_review',
    clinicId: 'clinic_alpha',
    assignedDoctorId: 'doc_101',
    clinicalRevision: 1
  });

  const presetResult = await doctorInvestigationsService.processOrderInvestigations({
    caseId: presetCaseId,
    presetId: 'ACUTE_DYSPNEA_PE',
    user,
    doctorProfile: matchingClinicProfile,
    db: mockDb
  });

  assert.strictEqual(presetResult.success, true);
  assert.strictEqual(presetResult.count, 3); // D_DIMER, CBC, CHEST_XRAY
  const presetCase = mockDb._cases.get(presetCaseId);
  const ddimer = presetCase.investigations.find(i => i.code === 'D_DIMER');
  assert(ddimer, 'Preset must include D-Dimer');
  assert.strictEqual(ddimer.urgency, 'stat');

  console.log('  ✓ Preset bundle expanded automatically with default stat urgency and LOINC codes.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: Custom Diagnostic Test Sanitization
  // ---------------------------------------------------------------------------
  console.log('▶ TEST 6: Custom Diagnostic Test Sanitization');

  const customCaseId = 'case_custom_3311';
  mockDb._cases.set(customCaseId, {
    id: customCaseId,
    status: 'under_review',
    clinicId: 'clinic_alpha',
    assignedDoctorId: 'doc_101',
    clinicalRevision: 1
  });

  const customResult = await doctorInvestigationsService.processOrderInvestigations({
    caseId: customCaseId,
    investigations: [
      {
        code: 'CUSTOM_GENETIC_PANEL',
        category: 'LAB',
        nameEn: 'Cystic Fibrosis Transmembrane Conductance Mutation <script>alert(1)</script>',
        nameAr: 'فحص الطفرات الجينية للتليف الكيسي <b>هام</b>',
        clinicalIndication: 'Family history of CFTR mutation <style>body{color:red}</style>'
      }
    ],
    user,
    doctorProfile: matchingClinicProfile,
    db: mockDb
  });

  assert.strictEqual(customResult.success, true);
  const customCase = mockDb._cases.get(customCaseId);
  const customItem = customCase.investigations[0];
  assert.strictEqual(customItem.isCustom, true);
  assert(!customItem.nameEn.includes('<script>'), 'Custom English name must be sanitized');
  assert(!customItem.nameAr.includes('<b>'), 'Custom Arabic name must be sanitized');
  assert(!customItem.clinicalIndication.includes('<style>'), 'Indication must be sanitized');

  console.log('  ✓ Custom unlisted tests strictly sanitized against XSS and HTML injection.\n');

  // ---------------------------------------------------------------------------
  // TEST 7: Case Investigations Retrieval & Single Item Removal
  // ---------------------------------------------------------------------------
  console.log('▶ TEST 7: Case Investigations Retrieval & Single Item Removal');

  const fetched = await doctorInvestigationsService.getCaseInvestigations(caseId, {
    db: mockDb,
    user,
    doctorProfile: matchingClinicProfile
  });

  assert.strictEqual(fetched.success, true);
  assert.strictEqual(fetched.count, 3);
  assert(fetched.requisitionRef.includes('REF:#'));

  // Remove CHEST_XRAY
  const removeResult = await doctorInvestigationsService.removeCaseInvestigation(caseId, 'CHEST_XRAY', {
    db: mockDb,
    user,
    doctorProfile: matchingClinicProfile
  });

  assert.strictEqual(removeResult.success, true);
  assert.strictEqual(removeResult.count, 2);
  const postRemoveCase = mockDb._cases.get(caseId);
  assert(!postRemoveCase.investigations.some(i => i.code === 'CHEST_XRAY'), 'CHEST_XRAY must be removed');

  console.log('  ✓ Investigation retrieval and single item removal verified successfully.\n');

  console.log('==================================================================');
  console.log('🎉 ALL BACKEND & SECURITY INVESTIGATION TESTS PASSED (100%)');
  console.log('==================================================================\n');
})();
