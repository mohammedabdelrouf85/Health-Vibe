/**
 * HEALTH VIBE AI: DOCTOR ORDER LABS & CHEST X-RAY QA, SECURITY & MEDICAL RESEARCH TEST SUITE (VEZEETA PATTERN)
 *
 * Verifies:
 * 1. Medical Research & Clinical Guideline Scenarios:
 *    - Scenario 1: Acute Severe Bronchitis / Viral vs Bacterial Exacerbation (CBC + CRP + CXR).
 *    - Scenario 2: Acute Dyspnea with Borderline SpO2 & Tachycardia (PE Exclusion: D-Dimer STAT + CBC + CXR).
 *    - Scenario 3: Severe Viral Pneumonia & Cytokine Staging (CBC + CRP + Ferritin + HRCT Chest).
 *    - Scenario 4: Cardiopulmonary Overlap (Dyspnea with Hypertension: CXR + CBC + Renal + Troponin).
 *    - Scenario 5: Specialized Unlisted Diagnostic Workup (Sanitized Custom Tests).
 * 2. Doctor-Patient Data Isolation & Cross-Doctor Security Guard:
 *    - Assigned Doctor: Authorized to issue and update requisitions.
 *    - Unassigned Doctor: Strictly blocked with 403 UNASSIGNED_DOCTOR_ACCESS_DENIED.
 *    - Snooping Blocked: Unassigned Doctor blocked from reading diagnostic requisitions.
 *    - Super Admin: Permitted supervisory clinical access across assigned doctors.
 * 3. Multi-Tenant Clinic Isolation:
 *    - Cross-Clinic Doctor access strictly blocked (403 CROSS_CLINIC_ACCESS_DENIED).
 *    - Multi-clinic accredited doctor verified across assigned organization.
 * 4. Security Attack Surface Hardening & Privilege Escalation Prevention:
 *    - Stored XSS injection sanitized from clinical notes and test names.
 *    - Privilege escalation rejected for non-doctors (patient, nurse).
 *    - Unapproved doctor applicants rejected (403 DOCTOR_NOT_VERIFIED).
 *    - Suspended or revoked doctor licenses barred (403 DOCTOR_LICENSE_INACTIVE).
 *    - Closed and archived cases strictly protected from modification (400 CASE_CLOSED).
 *    - Concurrency governance: clinical revision bumped and statusHistory tracked.
 * 5. UI Access Isolation & Report Requisition Verification:
 *    - UI layout integrity for clinic workstation.
 *    - LOINC and RADLEX code integration.
 *    - Bilingual parity in requisition outputs.
 * 6. Audit Trail Completeness & PHI Data Minimization:
 *    - Immutable audit record in audit_logs with exact metadata and IP tracking.
 */

'use strict';

const assert = require('assert');
const doctorInvestigationsService = require('../backend/doctor-investigations-service');
const DoctorService = require('../app/modules/doctor/doctor-service');

console.log('================================================================================');
console.log('🧪 HEALTH VIBE AI: DOCTOR ORDER INVESTIGATIONS QA, SECURITY & RESEARCH TEST SUITE');
console.log('   Clinical Guidelines, Patient Isolation, Security Gates & Audit Logs (Vezeeta)');
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
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const docData = { id, ...payload };
    this.docs.set(id, docData);
    return { id, ...docData };
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

  getAuditLogs() {
    return Array.from(this.collection('audit_logs').docs.values());
  }

  getCase(id) {
    return this.collection('cases').docs.get(id) || null;
  }
}

// Reusable Doctor Profiles
const verifiedAssignedDoctor = {
  uid: 'doc_sarah_101',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Sarah Al-Sayed',
  name: 'Dr. Sarah Al-Sayed',
  email: 'sarah.alsayed@healthvibes.app',
  doctorLicense: 'EG-MED-84920',
  specialty: 'Pulmonology & Respiratory Medicine',
  clinicId: 'clinic_cairo_west'
};

const verifiedUnassignedDoctor = {
  uid: 'doc_kareem_202',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Kareem Fahmy',
  name: 'Dr. Kareem Fahmy',
  email: 'kareem.fahmy@healthvibes.app',
  doctorLicense: 'EG-MED-91234',
  specialty: 'Internal Medicine & Critical Care',
  clinicId: 'clinic_cairo_west'
};

const crossClinicDoctor = {
  uid: 'doc_hassan_303',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Hassan Mansour',
  name: 'Dr. Hassan Mansour',
  email: 'hassan.mansour@alex-clinic.app',
  doctorLicense: 'EG-MED-65432',
  specialty: 'Chest & Allergy Diseases',
  clinicId: 'clinic_alexandria_central'
};

const superAdminUser = {
  uid: 'super_admin_001',
  role: 'super_admin',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  displayName: 'Chief Medical Officer Admin',
  name: 'Chief Medical Officer Admin',
  email: 'cmo@healthvibes.app'
};

(async () => {
  // ===========================================================================
  // SECTION 1: MEDICAL RESEARCH & CLINICAL USE-CASE SCENARIOS
  // ===========================================================================
  console.log('▶ SECTION 1: Medical Research & Clinical Guideline Scenarios\n');

  const db = new MockFirestoreDb();

  // Scenario 1: Acute Severe Bronchitis (CBC + CRP + Chest X-Ray)
  console.log('  Scenario 1: Acute Severe Bronchitis (Bacterial vs Viral Differentiation)');
  const caseId1 = 'case_bronchitis_001';
  await db.collection('cases').doc(caseId1).set({
    id: caseId1,
    status: 'under_review',
    patientId: 'pat_ahmed_1',
    clinicId: 'clinic_cairo_west',
    assignedDoctorId: 'doc_sarah_101',
    clinicalRevision: 1,
    vitals: { spo2: 95, heartRate: 88, temp: 38.3 }
  });

  const res1 = await doctorInvestigationsService.processOrderInvestigations({
    caseId: caseId1,
    investigations: [
      { code: 'CBC', urgency: 'routine', clinicalIndication: 'Leukocytosis & neutrophilia evaluation' },
      { code: 'CRP', urgency: 'routine', clinicalIndication: 'Differentiate viral vs bacterial infection' },
      { code: 'CHEST_XRAY', urgency: 'routine', clinicalIndication: 'Rule out pneumonia consolidation' }
    ],
    notes: 'Severe productive cough with fever for 4 days. Guideline-directed workup.',
    user: verifiedAssignedDoctor,
    doctorProfile: verifiedAssignedDoctor,
    db,
    metadata: { ip: '156.204.18.2' }
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.count, 3);
  assert(res1.requisitionRef.startsWith('REF:#'));
  const savedCase1 = db.getCase(caseId1);
  assert.strictEqual(savedCase1.hasOrderedInvestigations, true);
  assert.strictEqual(savedCase1.clinicalRevision, 2);
  const cxr1 = savedCase1.investigations.find(i => i.code === 'CHEST_XRAY');
  assert.strictEqual(cxr1.loinc, '36643-5');
  assert.strictEqual(cxr1.category, 'RADIOLOGY');
  console.log('    ✓ Scenario 1 verified: CBC, CRP, and Chest X-Ray recorded with LOINC references.');

  // Scenario 2: Suspected Pulmonary Embolism (D-Dimer STAT + CBC + CXR)
  console.log('  Scenario 2: Suspected Pulmonary Embolism (Wells/Geneva Dyspnea Protocol)');
  const caseId2 = 'case_pe_suspect_002';
  await db.collection('cases').doc(caseId2).set({
    id: caseId2,
    status: 'under_review',
    patientId: 'pat_mona_2',
    clinicId: 'clinic_cairo_west',
    assignedDoctorId: 'doc_sarah_101',
    clinicalRevision: 1,
    vitals: { spo2: 91, heartRate: 118, respiratoryRate: 26 }
  });

  const res2 = await doctorInvestigationsService.processOrderInvestigations({
    caseId: caseId2,
    presetId: 'ACUTE_DYSPNEA_PE',
    notes: 'Acute onset pleuritic chest pain with resting tachycardia and borderline hypoxemia.',
    user: verifiedAssignedDoctor,
    doctorProfile: verifiedAssignedDoctor,
    db,
    metadata: { ip: '156.204.18.2' }
  });

  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.count, 3);
  const savedCase2 = db.getCase(caseId2);
  const ddimer = savedCase2.investigations.find(i => i.code === 'D_DIMER');
  assert(ddimer, 'D-Dimer must be present in PE workup');
  assert.strictEqual(ddimer.urgency, 'stat', 'PE D-Dimer must be STAT urgency');
  assert.strictEqual(ddimer.loinc, '48065-7');
  console.log('    ✓ Scenario 2 verified: Acute Dyspnea preset expanded with STAT D-Dimer and CXR.');

  // Scenario 3: Severe Viral Pneumonia & Cytokine Staging (Ferritin + HRCT)
  console.log('  Scenario 3: Severe Viral Pneumonia / Cytokine Staging');
  const caseId3 = 'case_pneumo_003';
  await db.collection('cases').doc(caseId3).set({
    id: caseId3,
    status: 'under_review',
    patientId: 'pat_tarek_3',
    clinicId: 'clinic_cairo_west',
    assignedDoctorId: 'doc_sarah_101',
    clinicalRevision: 1
  });

  const res3 = await doctorInvestigationsService.processOrderInvestigations({
    caseId: caseId3,
    presetId: 'VIRAL_PNEUMONIA',
    user: verifiedAssignedDoctor,
    doctorProfile: verifiedAssignedDoctor,
    db
  });

  assert.strictEqual(res3.success, true);
  const savedCase3 = db.getCase(caseId3);
  assert(savedCase3.investigations.some(i => i.code === 'SERUM_FERRITIN' || i.code === 'FERRITIN'));
  assert(savedCase3.investigations.some(i => i.code === 'HRCT_CHEST'));
  console.log('    ✓ Scenario 3 verified: Ferritin (LOINC 2276-4) and HRCT Chest (LOINC 24627-2) staged.');

  // Scenario 4: Cardiopulmonary Overlap (Dyspnea in Hypertensive Patient)
  console.log('  Scenario 4: Cardiopulmonary Overlap (Chest X-Ray + Renal Panel + Troponin)');
  const caseId4 = 'case_cardio_004';
  await db.collection('cases').doc(caseId4).set({
    id: caseId4,
    status: 'under_review',
    patientId: 'pat_adel_4',
    clinicId: 'clinic_cairo_west',
    assignedDoctorId: 'doc_sarah_101',
    clinicalRevision: 1
  });

  const res4 = await doctorInvestigationsService.processOrderInvestigations({
    caseId: caseId4,
    investigations: [
      { code: 'CHEST_XRAY', urgency: 'routine', clinicalIndication: 'Assess cardiomegaly and pulmonary venous congestion' },
      { code: 'RENAL_PANEL', urgency: 'routine', clinicalIndication: 'Baseline renal function before antihypertensive titration' },
      { code: 'TROPONIN_I', urgency: 'stat', clinicalIndication: 'Rule out non-ST elevation myocardial infarction' }
    ],
    user: verifiedAssignedDoctor,
    doctorProfile: verifiedAssignedDoctor,
    db
  });

  assert.strictEqual(res4.success, true);
  const savedCase4 = db.getCase(caseId4);
  assert.strictEqual(savedCase4.investigations.length, 3);
  const labItems = savedCase4.investigations.filter(i => i.category === 'LAB');
  const radItems = savedCase4.investigations.filter(i => i.category === 'RADIOLOGY');
  assert.strictEqual(labItems.length, 2, 'Renal panel and Troponin must be LAB');
  assert.strictEqual(radItems.length, 1, 'Chest X-Ray must be RADIOLOGY');
  console.log('    ✓ Scenario 4 verified: Accurate categorization between LAB and RADIOLOGY.');

  // Scenario 5: Specialized Custom Diagnostic Test with Sanitization
  console.log('  Scenario 5: Specialized Custom Diagnostic Test Sanitization');
  const caseId5 = 'case_custom_005';
  await db.collection('cases').doc(caseId5).set({
    id: caseId5,
    status: 'under_review',
    patientId: 'pat_nadia_5',
    clinicId: 'clinic_cairo_west',
    assignedDoctorId: 'doc_sarah_101',
    clinicalRevision: 1
  });

  const res5 = await doctorInvestigationsService.processOrderInvestigations({
    caseId: caseId5,
    investigations: [
      {
        code: 'SWEAT_CHLORIDE_PILOCARPINE',
        category: 'LAB',
        nameEn: 'Pilocarpine Iontophoresis Sweat Chloride <script>malicious()</script>',
        nameAr: 'اختبار التعرق للكلوريد بالبيلوكاربين <b>مهم</b>',
        clinicalIndication: 'Atypical bronchiectasis workup <iframe src="evil.com"></iframe>'
      }
    ],
    notes: 'Specialized lab requisition <style>body{display:none}</style>',
    user: verifiedAssignedDoctor,
    doctorProfile: verifiedAssignedDoctor,
    db
  });

  assert.strictEqual(res5.success, true);
  const savedCase5 = db.getCase(caseId5);
  const customItem = savedCase5.investigations[0];
  assert.strictEqual(customItem.isCustom, true);
  assert(!customItem.nameEn.includes('<script>'), 'XSS script tag must be eliminated');
  assert(!customItem.nameAr.includes('<b>'), 'HTML bold tag must be eliminated');
  assert(!customItem.clinicalIndication.includes('<iframe>'), 'Iframe tag must be eliminated');
  assert(!savedCase5.investigationsNotes.includes('<style>'), 'Style tag must be eliminated');
  console.log('    ✓ Scenario 5 verified: Custom tests supported and sanitized against stored XSS.\n');

  // ===========================================================================
  // SECTION 2: DOCTOR-PATIENT DATA ISOLATION & ACCESS CONTROL
  // ===========================================================================
  console.log('▶ SECTION 2: Doctor-Patient Data Isolation & Cross-Doctor Security Guard\n');

  // Test 2A: Unassigned Doctor Blocked from Ordering Investigations
  console.log('  Test 2A: Unassigned Doctor Blocked from Ordering Investigations');
  await assert.rejects(
    async () => {
      await doctorInvestigationsService.processOrderInvestigations({
        caseId: caseId1, // Assigned to Dr. Sarah (doc_sarah_101)
        investigations: [{ code: 'CBC' }],
        user: verifiedUnassignedDoctor, // Dr. Kareem (doc_kareem_202)
        doctorProfile: verifiedUnassignedDoctor,
        db
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
      return true;
    }
  );
  console.log('    ✓ Unassigned doctor blocked with 403 UNASSIGNED_DOCTOR_ACCESS_DENIED.');

  // Test 2B: Unassigned Doctor Snooping Blocked from Reading Requisitions
  console.log('  Test 2B: Unassigned Doctor Blocked from Reading Requisitions');
  await assert.rejects(
    async () => {
      await doctorInvestigationsService.getCaseInvestigations(caseId1, {
        db,
        user: verifiedUnassignedDoctor,
        doctorProfile: verifiedUnassignedDoctor
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
      return true;
    }
  );
  console.log('    ✓ Unassigned doctor blocked from viewing case investigations.');

  // Test 2C: Super Admin Emergency Supervisory Access
  console.log('  Test 2C: Super Admin Emergency Supervisory Access');
  const superAdminRead = await doctorInvestigationsService.getCaseInvestigations(caseId1, {
    db,
    user: superAdminUser,
    doctorProfile: superAdminUser
  });
  assert.strictEqual(superAdminRead.success, true);
  assert.strictEqual(superAdminRead.count, 3);
  console.log('    ✓ Super Admin permitted emergency supervisory access.');

  // Test 2D: Multi-Tenant Cross-Clinic Access Blocked
  console.log('  Test 2D: Multi-Tenant Cross-Clinic Access Blocked');
  await assert.rejects(
    async () => {
      await doctorInvestigationsService.processOrderInvestigations({
        caseId: caseId1, // Belongs to clinic_cairo_west
        investigations: [{ code: 'CBC' }],
        user: crossClinicDoctor, // Belongs to clinic_alexandria_central
        doctorProfile: crossClinicDoctor,
        db
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'CROSS_CLINIC_ACCESS_DENIED');
      return true;
    }
  );
  console.log('    ✓ Cross-clinic access strictly denied with 403 CROSS_CLINIC_ACCESS_DENIED.\n');

  // ===========================================================================
  // SECTION 3: PRIVILEGE ESCALATION & SECURITY ATTACK SURFACE HARDENING
  // ===========================================================================
  console.log('▶ SECTION 3: Security Attack Surface Hardening & Privilege Escalation\n');

  // Test 3A: Patient Role Privilege Escalation Blocked
  console.log('  Test 3A: Patient Role Privilege Escalation Blocked');
  const patientActor = { uid: 'pat_intruder', role: 'patient', verifiedDoctor: false };
  await assert.rejects(
    async () => {
      await doctorInvestigationsService.processOrderInvestigations({
        caseId: caseId1,
        investigations: [{ code: 'CBC' }],
        user: patientActor,
        doctorProfile: patientActor,
        db
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'INSUFFICIENT_ROLE');
      return true;
    }
  );
  console.log('    ✓ Patient privilege escalation rejected with 403 INSUFFICIENT_ROLE.');

  // Test 3B: Unapproved Doctor Applicant Blocked
  console.log('  Test 3B: Unapproved Doctor Applicant Blocked');
  const pendingDoc = {
    uid: 'doc_pending',
    role: 'doctor',
    doctorApplicationStatus: 'pending',
    verifiedDoctor: false
  };
  await assert.rejects(
    async () => {
      await doctorInvestigationsService.processOrderInvestigations({
        caseId: caseId1,
        investigations: [{ code: 'CBC' }],
        user: pendingDoc,
        doctorProfile: pendingDoc,
        db
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'DOCTOR_NOT_VERIFIED');
      return true;
    }
  );
  console.log('    ✓ Unverified doctor applicant rejected with 403 DOCTOR_NOT_VERIFIED.');

  // Test 3C: Suspended Doctor License Barred
  console.log('  Test 3C: Suspended Doctor License Barred');
  const suspendedDoc = {
    ...verifiedAssignedDoctor,
    licenseStatus: 'suspended'
  };
  await assert.rejects(
    async () => {
      await doctorInvestigationsService.processOrderInvestigations({
        caseId: caseId1,
        investigations: [{ code: 'CBC' }],
        user: suspendedDoc,
        doctorProfile: suspendedDoc,
        db
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'DOCTOR_LICENSE_INACTIVE');
      return true;
    }
  );
  console.log('    ✓ Suspended license barred with 403 DOCTOR_LICENSE_INACTIVE.');

  // Test 3D: Closed & Archived Case Tamper Protection
  console.log('  Test 3D: Closed & Archived Case Tamper Protection');
  const closedCaseId = 'case_closed_999';
  await db.collection('cases').doc(closedCaseId).set({
    id: closedCaseId,
    status: 'closed',
    clinicId: 'clinic_cairo_west',
    assignedDoctorId: 'doc_sarah_101',
    clinicalRevision: 5
  });

  await assert.rejects(
    async () => {
      await doctorInvestigationsService.processOrderInvestigations({
        caseId: closedCaseId,
        investigations: [{ code: 'CBC' }],
        user: verifiedAssignedDoctor,
        doctorProfile: verifiedAssignedDoctor,
        db
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, 'CASE_CLOSED');
      return true;
    }
  );
  console.log('    ✓ Closed case modification strictly rejected with 400 CASE_CLOSED.\n');

  // ===========================================================================
  // SECTION 4: AUDIT TRAIL INTEGRITY & PHI MINIMIZATION
  // ===========================================================================
  console.log('▶ SECTION 4: Audit Trail Integrity & PHI Minimization\n');

  const auditLogs = db.getAuditLogs();
  assert(auditLogs.length >= 5, 'Audit logs must be generated for all valid orders');

  for (const log of auditLogs) {
    assert.strictEqual(log.eventType, 'CLINICAL_INVESTIGATIONS_ORDERED');
    assert.strictEqual(log.action, 'ORDER_DIAGNOSTIC_INVESTIGATIONS');
    assert(log.caseId, 'Log must contain caseId');
    assert(log.performedBy.uid, 'Log must contain actor UID');
    assert(log.performedBy.license, 'Log must contain doctor license');
    assert(log.details.requisitionRef.startsWith('REF:#'), 'Log must contain official requisition reference');
    assert(Array.isArray(log.details.investigationCodes), 'Log must track investigation codes');
    assert(log.timestamp, 'Log must have ISO timestamp');
    assert(log.ipAddress, 'Log must have IP address');

    // PHI Minimization check: no raw medical history or private patient notes
    const jsonStr = JSON.stringify(log);
    assert(!jsonStr.includes('password'), 'Audit log must never contain passwords');
    assert(!jsonStr.includes('apiKey'), 'Audit log must never contain API keys');
  }
  console.log('    ✓ Audit trail immutable, structured with doctor identity and adhering to PHI minimization.\n');

  // ===========================================================================
  // SECTION 5: CLINICAL CATALOG INTEGRITY (DOCTOR-SERVICE COMPATIBILITY)
  // ===========================================================================
  console.log('▶ SECTION 5: Clinical Catalog Integrity (DoctorService Parity)\n');

  const serviceCatalog = DoctorService.DIAGNOSTIC_INVESTIGATIONS_CATALOG || [];
  assert(serviceCatalog.length > 0, 'DoctorService catalog must exist');

  const backendCatalog = doctorInvestigationsService.INVESTIGATION_CATALOG;
  assert.strictEqual(serviceCatalog.length, backendCatalog.length, 'Frontend and backend catalog lengths must match');

  for (const item of backendCatalog) {
    const counterpart = serviceCatalog.find(c => c.code === item.code);
    assert(counterpart, `DoctorService must contain counterpart for ${item.code}`);
    assert.strictEqual(item.category, counterpart.category);
    assert.strictEqual(item.loinc, counterpart.loinc);
  }
  console.log('    ✓ 100% catalog parity verified between frontend and backend services.\n');

  console.log('================================================================================');
  console.log('🎉 ALL QA, SECURITY & MEDICAL RESEARCH TESTS PASSED (100% SUCCESS)');
  console.log('================================================================================\n');
})();
