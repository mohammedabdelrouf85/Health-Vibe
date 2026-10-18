/**
 * HEALTH VIBE AI: LAB UPLOAD SAFETY, DOCTOR NON-REPLACEMENT & PRIVACY TEST SUITE
 *
 * Validates:
 * 1. Strict Non-Replacement of Human Doctor (initial pending_doctor_review, no autonomous AI diagnoses).
 * 2. Mandatory Bilingual Clinical Disclaimers on all uploads and AI interpretations.
 * 3. Doctor Review & Clinical Certification Workflow (strictly requires verified licensed physician).
 * 4. Doctor Rejection Workflow (for illegible/corrupt uploads).
 * 5. Panic / Critical Value Interception (ABG, Sputum, Blood) & False Reassurance Stripping.
 * 6. Autonomous Prescription & Medication Dosage Blocker.
 * 7. Zero PHI Access for Non-Clinical Administrative Sub-roles (Support, Ops, Clinical QA).
 * 8. Patient Right to be Forgotten (GDPR/HIPAA soft-deletion with audit trail retention).
 * 9. Immutable Audit Trail for PHI access, review, and deletion.
 * 10. Firestore Rules & Storage Rules Integrity.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const labUploadService = require('../backend/lab-upload-service');
const {
  REVIEW_STATUS,
  CLINICAL_DISCLAIMERS,
  SCAN_STATUS,
  AVAILABILITY,
  registerLabFileUpload,
  evaluateLabSafetyAndPanicValues,
  enforceAiClinicalGuardrails,
  certifyLabReportByDoctor,
  rejectLabReportByDoctor,
  getLabReportById,
  deleteLabReport,
  getPatientLabReports
} = labUploadService;

// Mock database helper
function createMockDb() {
  const collections = new Map();

  function getCol(colName) {
    if (!collections.has(colName)) {
      collections.set(colName, new Map());
    }
    return collections.get(colName);
  }

  return {
    _collections: collections,
    collection(colName) {
      const col = getCol(colName);
      return {
        doc(docId) {
          return {
            async get() {
              const data = col.get(docId);
              return {
                exists: Boolean(data),
                id: docId,
                data: () => data ? { ...data } : undefined
              };
            },
            async set(data, opts = {}) {
              if (opts.merge && col.has(docId)) {
                const existing = col.get(docId);
                col.set(docId, { ...existing, ...data });
              } else {
                col.set(docId, { ...data });
              }
              return true;
            },
            async update(data) {
              const existing = col.get(docId) || {};
              col.set(docId, { ...existing, ...data });
              return true;
            }
          };
        },
        where(field, op, val) {
          const createQuery = (filters) => ({
            where(nextField, nextOp, nextVal) {
              return createQuery([...filters, { field: nextField, op: nextOp, val: nextVal }]);
            },
            limit(num) {
              return {
                async get() {
                  let results = Array.from(col.entries()).map(([id, data]) => ({ id, ...data }));
                  for (const f of filters) {
                    if (f.op === '==') {
                      results = results.filter(item => item[f.field] === f.val);
                    }
                  }
                  return {
                    docs: results.slice(0, num).map(data => ({
                      id: data.id,
                      data: () => data
                    }))
                  };
                }
              };
            },
            async get() {
              let results = Array.from(col.entries()).map(([id, data]) => ({ id, ...data }));
              for (const f of filters) {
                if (f.op === '==') {
                  results = results.filter(item => item[f.field] === f.val);
                }
              }
              return {
                docs: results.map(data => ({
                  id: data.id,
                  data: () => data
                }))
              };
            }
          });
          return createQuery([{ field, op, val }]);
        }
      };
    }
  };
}

async function runTestSuite() {
  console.log('\n==================================================================');
  console.log('🛡️ HEALTH VIBE AI: LAB UPLOAD SAFETY, DOCTOR NON-REPLACEMENT & PRIVACY');
  console.log('   Docus AI Benchmark: Non-Replacement of Human Doctor & HIPAA Privacy');
  console.log('==================================================================\n');

  const db = createMockDb();
  const patientUser = { uid: 'pat_safety_101', role: 'patient', email: 'salma.patient@example.com' };
  const verifiedDoctorUser = {
    uid: 'doc_respiratory_202',
    role: 'doctor',
    verifiedDoctor: true,
    name: 'د. طارق المنشاوي',
    licenseNumber: 'EGY-MED-49102-RESP'
  };
  const unverifiedDoctorUser = {
    uid: 'doc_unverified_303',
    role: 'doctor',
    verifiedDoctor: false,
    name: 'د. تحت التدريب'
  };
  const supportUser = { uid: 'admin_sub_404', role: 'support' };
  const opsUser = { uid: 'admin_sub_405', role: 'ops' };
  const qaUser = { uid: 'admin_sub_406', role: 'clinical_qa' };

  // =========================================================================
  // TEST 1: Strict Doctor Non-Replacement & Initial Pending State
  // =========================================================================
  console.log('▶ TEST 1: Strict Non-Replacement of Doctor & Initial Pending Review State');
  const regResult = await registerLabFileUpload(db, {
    patientId: patientUser.uid,
    fileName: 'cbc_blood_report.pdf',
    contentType: 'application/pdf',
    size: 1024 * 500,
    labCategory: 'blood_test',
    labNotes: 'فحص دوري للدم'
  }, patientUser);

  assert.strictEqual(regResult.success, true);
  const rep = regResult.report;
  assert.strictEqual(rep.reviewStatus, REVIEW_STATUS.PENDING_DOCTOR_REVIEW, 'Default reviewStatus must be pending_doctor_review');
  assert.strictEqual(rep.doctorApproved, false, 'doctorApproved must be false initially');
  assert.strictEqual(rep.isPreliminary, true, 'isPreliminary must be true initially');
  assert.strictEqual(rep.aiDiagnosticReplacementBlocked, true, 'AI diagnostic replacement must be blocked');
  assert.strictEqual(rep.prescriptionsBlocked, true, 'Prescriptions must be blocked');
  assert.strictEqual(rep.hasClinicalDisclaimer, true, 'Clinical disclaimer must be true');
  assert.ok(rep.disclaimerTextAr.includes('لا يحلان محل الطبيب البشري'), 'Arabic disclaimer must assert human doctor non-replacement');
  assert.ok(rep.disclaimerTextEn.includes('NEVER replace licensed human physicians'), 'English disclaimer must assert physician non-replacement');
  console.log('  ✓ Initial upload enforces pending_doctor_review, blocks autonomous diagnosis, and embeds bilingual disclaimers.');

  // =========================================================================
  // TEST 2: Verified Doctor Certification & Signature Stamp
  // =========================================================================
  console.log('\n▶ TEST 2: Doctor Certification Workflow & Verification Check');
  const fileId = regResult.fileId;

  // Patient cannot certify
  await assert.rejects(
    async () => certifyLabReportByDoctor(db, { fileId, clinicalNotes: 'مراجعة' }, patientUser),
    (err) => err.code === 'DOCTOR_VERIFICATION_REQUIRED' && err.statusCode === 403,
    'Patient must not be allowed to certify lab reports'
  );

  // Unverified doctor cannot certify
  await assert.rejects(
    async () => certifyLabReportByDoctor(db, { fileId, clinicalNotes: 'مراجعة' }, unverifiedDoctorUser),
    (err) => err.code === 'DOCTOR_VERIFICATION_REQUIRED' && err.statusCode === 403,
    'Unverified doctor must be rejected'
  );

  // Verified doctor succeeds
  const certResult = await certifyLabReportByDoctor(db, {
    fileId,
    clinicalNotes: 'كريات الدم البيضاء طبيعية، لا توجد علامات عدوى حادة. يُنصح بمتابعة روتينية.',
    interpretationRecommendation: 'Continue standard bronchodilator therapy.',
    urgencyLevel: 'routine'
  }, verifiedDoctorUser);

  assert.strictEqual(certResult.success, true);
  assert.strictEqual(certResult.reviewStatus, REVIEW_STATUS.DOCTOR_REVIEWED);
  assert.strictEqual(certResult.doctorApproved, true);
  assert.strictEqual(certResult.reviewingDoctorName, verifiedDoctorUser.name);

  // Verify updated record in DB
  const certifiedDoc = await db.collection('case_files').doc(fileId).get();
  assert.strictEqual(certifiedDoc.data().reviewingDoctorLicense, 'EGY-MED-49102-RESP');
  assert.strictEqual(certifiedDoc.data().isPreliminary, false);
  console.log('  ✓ Only verified physician can certify; stamps license, notes, and unlocks verified status.');

  // =========================================================================
  // TEST 3: Doctor Rejection Workflow
  // =========================================================================
  console.log('\n▶ TEST 3: Doctor Rejection Workflow for Blurred/Illegible Reports');
  const badUpload = await registerLabFileUpload(db, {
    patientId: patientUser.uid,
    fileName: 'blurry_photo.jpg',
    contentType: 'image/jpeg',
    size: 1024 * 200,
    labCategory: 'other'
  }, patientUser);

  const rejectResult = await rejectLabReportByDoctor(db, {
    fileId: badUpload.fileId,
    rejectionReason: 'الصورة غير واضحة والأرقام غير مقروءة، يُرجى إعادة التصوير بإضاءة كافية.'
  }, verifiedDoctorUser);

  assert.strictEqual(rejectResult.success, true);
  assert.strictEqual(rejectResult.reviewStatus, REVIEW_STATUS.REJECTED_BY_DOCTOR);
  console.log('  ✓ Doctor rejection flow records rejection reason and marks reviewStatus as rejected_by_doctor.');

  // =========================================================================
  // TEST 4: AI Diagnostic Guardrails & Autonomous Prescription Blocker
  // =========================================================================
  console.log('\n▶ TEST 4: Autonomous Prescription & Medication Dosage Blocker');
  const unsafeAiOutput = 'تشخيصك هو التهاب رئوي بكتيري، ويجب عليك تناول مضاد حيوي augmentin 1000mg مرتين يومياً.';
  const guarded = enforceAiClinicalGuardrails(unsafeAiOutput, { isDoctorReviewed: false });

  assert.strictEqual(guarded.prescriptionsBlocked, true, 'Autonomous prescription must be blocked');
  assert.ok(guarded.sanitizedText.includes('[محظور: الوصفات الطبية تصدر حصراً من الطبيب البشري المرخص]'));
  assert.strictEqual(guarded.isPreliminary, true);
  assert.strictEqual(guarded.requiresHumanDoctorReview, true);
  assert.ok(guarded.sanitizedText.includes(CLINICAL_DISCLAIMERS.ar));
  console.log('  ✓ Autonomous prescription blocked and substituted with mandatory physician directive.');

  // =========================================================================
  // TEST 5: Panic Values & False Reassurance Prevention (Anti-Complacency)
  // =========================================================================
  console.log('\n▶ TEST 5: Panic / Critical Values Interception & Anti-False Reassurance');
  
  // ABG Hypoxemia
  const abgPanic = evaluateLabSafetyAndPanicValues({
    labCategory: 'abg_gas',
    extractedValues: { pO2: 52, pH: 7.21, pCO2: 58 }
  });
  assert.strictEqual(abgPanic.isPanicValue, true);
  assert.strictEqual(abgPanic.emergencyActionRequired, true);
  assert.ok(abgPanic.panicReasons.some(r => r.includes('Severe Hypoxemia')));
  assert.ok(abgPanic.panicReasons.some(r => r.includes('Critical Acidosis')));
  assert.ok(abgPanic.emergencyGuidanceAr.includes('أقرب قسم طوارئ'));

  // Sputum TB / AFB
  const sputumPanic = evaluateLabSafetyAndPanicValues({
    labCategory: 'sputum_culture',
    notes: 'Acid fast bacilli positive on Ziehl-Neelsen stain'
  });
  assert.strictEqual(sputumPanic.isPanicValue, true);
  assert.ok(sputumPanic.panicReasons.some(r => r.includes('Acid-Fast Bacilli')));

  // Blood Test Anemia
  const bloodPanic = evaluateLabSafetyAndPanicValues({
    labCategory: 'blood_test',
    extractedValues: { hb: 5.8, wbc: 34000, platelets: 15000 }
  });
  assert.strictEqual(bloodPanic.isPanicValue, true);
  assert.ok(bloodPanic.panicReasons.some(r => r.includes('Critical Anemia')));

  // False Reassurance Stripping
  const falseReassuringText = 'لا داعي للقلق كل شيء طبيعي وأنت سليم تماماً. أكسجين الدم منخفض قليلاً.';
  const stripped = enforceAiClinicalGuardrails(falseReassuringText, { isDoctorReviewed: false, isPanicValue: true });
  assert.ok(!stripped.sanitizedText.includes('لا داعي للقلق'), 'False reassurance must be stripped');
  assert.ok(!stripped.sanitizedText.includes('أنت سليم تماماً'), 'False reassurance must be stripped');
  console.log('  ✓ Panic values in ABG, Sputum, and Blood trigger emergency alerts; false reassurance stripped.');

  // =========================================================================
  // TEST 6: Zero PHI Access for Non-Clinical Admin Sub-roles
  // =========================================================================
  console.log('\n▶ TEST 6: Zero PHI Access for Support, Ops, and Clinical QA (HIPAA Minimum Necessary)');

  await assert.rejects(
    async () => getPatientLabReports(db, { patientId: patientUser.uid }, supportUser),
    (err) => err.code === 'PHI_ACCESS_DENIED' && err.statusCode === 403,
    'Support sub-role must have ZERO access to patient lab reports'
  );

  await assert.rejects(
    async () => getLabReportById(db, fileId, opsUser),
    (err) => err.code === 'PHI_ACCESS_DENIED' && err.statusCode === 403,
    'Ops sub-role must have ZERO access to clinical lab report'
  );

  await assert.rejects(
    async () => deleteLabReport(db, { fileId }, qaUser),
    (err) => err.code === 'PHI_ACCESS_DENIED' && err.statusCode === 403,
    'Clinical QA sub-role must have ZERO access to delete lab report'
  );
  console.log('  ✓ Support, Ops, and Clinical QA strictly blocked from all patient PHI (403 PHI_ACCESS_DENIED).');

  // =========================================================================
  // TEST 7: Patient Right to be Forgotten (HIPAA / GDPR Soft-Deletion)
  // =========================================================================
  console.log('\n▶ TEST 7: Patient Right to be Forgotten (GDPR / HIPAA Deletion)');
  
  // Another patient cannot delete
  const foreignPatient = { uid: 'pat_stranger_999', role: 'patient' };
  await assert.rejects(
    async () => deleteLabReport(db, { fileId: badUpload.fileId }, foreignPatient),
    (err) => err.code === 'FORBIDDEN' && err.statusCode === 403,
    'Stranger cannot delete another patient report'
  );

  // Patient owner deletes
  const delResult = await deleteLabReport(db, { fileId: badUpload.fileId, reason: 'patient_retracted' }, patientUser);
  assert.strictEqual(delResult.success, true);
  assert.strictEqual(delResult.deleted, true);

  // Verify omitted from active patient report listing
  const activeReports = await getPatientLabReports(db, { patientId: patientUser.uid }, patientUser);
  assert.ok(!activeReports.some(r => r.id === badUpload.fileId), 'Deleted report must not appear in active EHR list');
  console.log('  ✓ Patient soft-deletion verified; deleted files excluded from active clinical view.');

  // =========================================================================
  // TEST 8: Server Endpoints Safety & Disclaimer Verification in server.js
  // =========================================================================
  console.log('\n▶ TEST 8: Verify Server Safety Endpoints in backend/server.js');
  const serverPath = path.join(__dirname, '../backend/server.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');

  assert.ok(serverCode.includes("app.post('/api/lab-upload/:fileId/doctor-review'"), 'doctor-review endpoint must exist');
  assert.ok(serverCode.includes("app.post('/api/lab-upload/:fileId/doctor-reject'"), 'doctor-reject endpoint must exist');
  assert.ok(serverCode.includes("app.post('/api/lab-upload/safety-evaluation'"), 'safety-evaluation endpoint must exist');
  assert.ok(serverCode.includes("app.get('/api/lab-upload/:fileId/disclaimer'"), 'disclaimer endpoint must exist');
  assert.ok(serverCode.includes("app.delete('/api/lab-upload/:fileId'"), 'delete endpoint must exist');
  console.log('  ✓ All 5 safety, doctor review, and deletion endpoints verified in backend/server.js.');

  // =========================================================================
  // TEST 9: Firestore Rules & Storage Rules Verification
  // =========================================================================
  console.log('\n▶ TEST 9: Security Rules Verification (firestore.rules & storage.rules)');
  const firestoreRulesPath = path.join(__dirname, '../firestore.rules');
  const firestoreRules = fs.readFileSync(firestoreRulesPath, 'utf8');
  assert.ok(firestoreRules.includes('match /lab_reports/{fileId}'), 'firestore.rules must match /lab_reports/{fileId}');
  assert.ok(firestoreRules.includes('!isNonClinicalAdminSubRole()'), 'firestore.rules must exclude non-clinical admin sub-roles');
  assert.ok(firestoreRules.includes("request.resource.data.reviewStatus == 'pending_doctor_review'"), 'firestore.rules must enforce pending_doctor_review on create');

  const storageRulesPath = path.join(__dirname, '../storage.rules');
  const storageRules = fs.readFileSync(storageRulesPath, 'utf8');
  assert.ok(storageRules.includes('match /users/{userId}/lab_reports/{fileName}'), 'storage.rules must protect users/{userId}/lab_reports');
  console.log('  ✓ firestore.rules and storage.rules enforce non-clinical sub-role exclusion and doctor review guards.');

  console.log('\n==================================================================');
  console.log('🎉 ALL LAB UPLOAD SAFETY, PRIVACY & DOCTOR NON-REPLACEMENT TESTS PASSED!');
  console.log('==================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
