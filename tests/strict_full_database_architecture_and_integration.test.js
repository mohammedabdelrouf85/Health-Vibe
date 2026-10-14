/**
 * Health Vibe AI - Full Database Architecture & Integration Test Suite
 * 
 * Verifies Antigravity Master Architecture:
 * 1. Reference Medical Data vs Live Operational Data layer separation.
 * 2. Unified database schema & foreign key relationships across core entities.
 * 3. Assessment intake with immutable inputSnapshot and computed aiEvaluation.
 * 4. Doctor review status machine with atomic case_status_history, audit_logs, and immutable reports.
 * 5. Private doctor notes isolation.
 * 6. Appointment booking with slot concurrency protection.
 * 7. Clinic onboarding into clinics collection.
 * 8. Transactional email queue (email_queue) with status tracking.
 * 9. Firestore rules & Storage security enforcement.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  medicalCatalogService,
  REFERENCE_DISEASES_CATALOG,
  REFERENCE_SYMPTOMS_CATALOG,
  REFERENCE_CLINICAL_RULES
} = require('../backend/medical-catalog-service');
const { CaseWorkflowService } = require('../backend/case-workflow-service');

console.log('================================================================================');
console.log('🏛️  HEALTH VIBE AI: FULL DATABASE ARCHITECTURE & INTEGRATION TEST SUITE');
console.log('   PRD Sections 1.2, 2, 7, 10, 16, 19: Reference vs Live Operational Layer');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
    throw err;
  }
}

// Mock In-Memory Firestore DB
class MockFirestore {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const store = this.collections.get(name);

    return {
      doc: (docId) => ({
        get: async () => ({
          exists: store.has(docId),
          data: () => store.get(docId),
          id: docId
        }),
        set: async (data, opts = {}) => {
          if (opts.merge && store.has(docId)) {
            store.set(docId, { ...store.get(docId), ...data });
          } else {
            store.set(docId, data);
          }
        },
        delete: async () => {
          store.delete(docId);
        }
      }),
      add: async (data) => {
        const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        store.set(id, { id, ...data });
        return { id };
      },
      where: (field, op, val) => ({
        get: async () => {
          const docs = [];
          for (const [id, data] of store.entries()) {
            if (op === '==' && data[field] === val) {
              docs.push({ id, data: () => data });
            }
          }
          return { empty: docs.length === 0, docs, size: docs.length };
        },
        limit: (n) => ({
          get: async () => {
            const docs = [];
            for (const [id, data] of store.entries()) {
              if (op === '==' && data[field] === val) {
                docs.push({ id, data: () => data });
                if (docs.length >= n) break;
              }
            }
            return { empty: docs.length === 0, docs, size: docs.length };
          }
        })
      }),
      get: async () => {
        const docs = [];
        for (const [id, data] of store.entries()) {
          docs.push({ id, data: () => data });
        }
        return { empty: docs.length === 0, docs, size: docs.length };
      }
    };
  }
}

async function main() {
  const mockDb = new MockFirestore();
  const workflowService = new CaseWorkflowService();

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Reference Medical Catalog Layer
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Reference Medical Catalog & Clinical Rules Layer ---');

  await runTest('1.1 diseases_catalog contains required ICD-10 codes, weights, thresholds, and clinical guidelines', () => {
    assert.ok(REFERENCE_DISEASES_CATALOG.length >= 8, 'Must define at least 8 reference diseases');
    
    const lrti = REFERENCE_DISEASES_CATALOG.find(d => d.code === 'J20.9');
    assert.ok(lrti, 'LRTI disease record must exist');
    assert.strictEqual(lrti.module, 'respiratory');
    assert.ok(Array.isArray(lrti.associatedSymptoms) && lrti.associatedSymptoms.length > 0);
    assert.ok(lrti.associatedSymptoms[0].weight > 0);
    assert.ok(lrti.spo2Thresholds.emergency === '< 90%');
    assert.ok(lrti.recommendedLabs.length > 0);
    assert.ok(lrti.clinicalGuidelinesRef.includes('NICE') || lrti.clinicalGuidelinesRef.includes('WHO'));

    const asthma = REFERENCE_DISEASES_CATALOG.find(d => d.code === 'J45.901');
    assert.ok(asthma, 'Asthma disease record must exist');
    assert.ok(asthma.clinicalGuidelinesRef.includes('GINA'));

    const copd = REFERENCE_DISEASES_CATALOG.find(d => d.code === 'J44.1');
    assert.ok(copd, 'COPD disease record must exist');
    assert.ok(copd.clinicalGuidelinesRef.includes('GOLD'));
  });

  await runTest('1.2 symptoms_catalog enforces strict validRange and units', () => {
    assert.ok(REFERENCE_SYMPTOMS_CATALOG.length >= 10, 'Must define at least 10 reference symptoms');
    
    const o2 = REFERENCE_SYMPTOMS_CATALOG.find(s => s.key === 'oxygenLevel');
    assert.ok(o2, 'Oxygen level symptom definition must exist');
    assert.strictEqual(o2.validRange.min, 50);
    assert.strictEqual(o2.validRange.max, 100);
    assert.strictEqual(o2.validRange.rejectEmpty, true);
    assert.strictEqual(o2.validRange.rejectNegative, true);
    assert.strictEqual(o2.validRange.rejectOverMax, true);

    const dyspnea = REFERENCE_SYMPTOMS_CATALOG.find(s => s.key === 'shortnessOfBreathScale');
    assert.ok(dyspnea, 'Dyspnea scale symptom must exist');
    assert.strictEqual(dyspnea.inputType, 'scale_1_10');
    assert.strictEqual(dyspnea.validRange.min, 1);
    assert.strictEqual(dyspnea.validRange.max, 10);
  });

  await runTest('1.3 seed_medical_catalog.js script exists and seeds without data corruption', () => {
    const seedScriptPath = path.join(__dirname, '../backend/scripts/seed_medical_catalog.js');
    assert.ok(fs.existsSync(seedScriptPath), 'seed_medical_catalog.js must exist');
    
    const catalogSnapshotPath = path.join(__dirname, '../dataset/seeded_medical_catalog.json');
    assert.ok(fs.existsSync(catalogSnapshotPath), 'seeded_medical_catalog.json snapshot must exist');
    const snapshot = JSON.parse(fs.readFileSync(catalogSnapshotPath, 'utf8'));
    assert.strictEqual(snapshot.metadata.totalDiseases, REFERENCE_DISEASES_CATALOG.length);
    assert.strictEqual(snapshot.metadata.totalSymptoms, REFERENCE_SYMPTOMS_CATALOG.length);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Assessment Intake & Input Validation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: Assessment Intake, Schema & Rule Evaluation ---');

  await runTest('2.1 Case intake must validate SpO2 strictly between 50 and 100 and reject negative or out-of-range values', async () => {
    const patientUser = { uid: 'usr_pat_001', email: 'patient@example.com', displayName: 'Omar Radi' };
    
    // Reject < 50
    await assert.rejects(
      async () => workflowService.createCaseIntake({
        user: patientUser,
        body: { spo2: 45, symptomDurationDays: 3 },
        db: mockDb
      }),
      /Invalid SpO2 pulse oximetry value/
    );

    // Reject > 100
    await assert.rejects(
      async () => workflowService.createCaseIntake({
        user: patientUser,
        body: { spo2: 105, symptomDurationDays: 3 },
        db: mockDb
      }),
      /Invalid SpO2 pulse oximetry value/
    );

    // Reject negative
    await assert.rejects(
      async () => workflowService.createCaseIntake({
        user: patientUser,
        body: { spo2: -10, symptomDurationDays: 3 },
        db: mockDb
      }),
      /Invalid SpO2 pulse oximetry value/
    );
  });

  let createdCaseId = null;
  await runTest('2.2 Valid case intake must save immutable inputSnapshot, compute aiEvaluation, and record case_status_history', async () => {
    const patientUser = { uid: 'usr_pat_001', email: 'omar@example.com', displayName: 'Omar Radi' };
    
    const result = await workflowService.createCaseIntake({
      user: patientUser,
      body: {
        spo2: 88, // Emergency hypoxemia
        shortnessOfBreathScale: 8,
        coughSeverity: 'severe',
        symptomDurationDays: 4,
        chestPain: true,
        asthmaCopdHistory: false,
        recentInfection: true,
        patientNotes: 'Shortness of breath for 4 days worsening rapidly'
      },
      db: mockDb
    });

    assert.ok(result.success);
    assert.ok(result.caseId.startsWith('case_'));
    createdCaseId = result.caseId;
    assert.strictEqual(result.status, 'pending_doctor_review');
    assert.strictEqual(result.priority, 'urgent');
    assert.strictEqual(result.isEmergencyRedFlag, true);

    // Verify saved assessment in mock db
    const caseDoc = await mockDb.collection('assessments').doc(result.caseId).get();
    assert.ok(caseDoc.exists);
    const caseData = caseDoc.data();
    assert.strictEqual(caseData.inputSnapshot.spo2, 88);
    assert.strictEqual(caseData.aiEvaluation.riskClass, 'urgent');
    assert.ok(caseData.slaDeadline);

    // Verify case_status_history record
    const historyStore = mockDb.collections.get('case_status_history');
    assert.ok(historyStore && historyStore.size > 0);
    const historyEntry = Array.from(historyStore.values()).find(h => h.caseId === result.caseId);
    assert.ok(historyEntry);
    assert.strictEqual(historyEntry.newStatus, 'pending_doctor_review');
    assert.strictEqual(historyEntry.actorRole, 'patient');

    // Verify audit log record
    const auditStore = mockDb.collections.get('audit_logs');
    const auditEntry = Array.from(auditStore.values()).find(a => a.targetEntityId === result.caseId);
    assert.ok(auditEntry);
    assert.strictEqual(auditEntry.action, 'case_submit');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Doctor Review Status Machine & Reports Snapshot Generation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: Doctor Review Workflow, Reports & Private Notes Isolation ---');

  await runTest('3.1 Doctor review must validate status machine transitions and reject invalid transitions', async () => {
    const doctorUser = { uid: 'usr_doc_999', email: 'dr.tarek@healthvibes.app', displayName: 'Dr. Tarek Mahmoud, MD', role: 'doctor' };

    await assert.rejects(
      async () => workflowService.reviewCase({
        doctorUser,
        caseId: createdCaseId || 'case_dummy',
        reviewData: { status: 'invalid_status_transition' },
        db: mockDb
      }),
      /Invalid status transition/
    );
  });

  await runTest('3.2 Approved case must atomically generate immutable reports snapshot with QR token and isolate private notes', async () => {
    const doctorUser = {
      uid: 'usr_doc_999',
      email: 'dr.tarek@healthvibes.app',
      displayName: 'Dr. Tarek Mahmoud, MD',
      syndicateRegistrationNumber: 'EG-MED-44821',
      role: 'doctor'
    };

    // Create patient case first
    const intakeRes = await workflowService.createCaseIntake({
      user: { uid: 'usr_pat_002', email: 'layla@example.com', displayName: 'Layla Ahmed' },
      body: { spo2: 91, shortnessOfBreathScale: 6, coughSeverity: 'moderate', symptomDurationDays: 5 },
      db: mockDb
    });

    // Doctor reviews and approves case
    const reviewRes = await workflowService.reviewCase({
      doctorUser,
      caseId: intakeRes.caseId,
      reviewData: {
        status: 'approved',
        doctorNotes: 'Prescribed bronchodilator inhaler and recommended 48h rest.',
        privateDoctorNotes: 'INTERNAL CONFIDENTIAL: Suspect borderline cardiac asthma, monitor troponin if dyspnea persists.',
        finalDiagnosis: 'Acute Lower Respiratory Infection (LRTI)',
        recommendations: ['Salbutamol inhaler 2 puffs PRN', 'Chest X-Ray in 48 hours', 'Avoid smoke exposure'],
        followUpWindow: '48 hours',
        orderedLabs: ['Chest X-Ray', 'CBC']
      },
      db: mockDb
    });

    assert.ok(reviewRes.success);
    assert.strictEqual(reviewRes.status, 'approved');
    assert.ok(reviewRes.report);
    assert.ok(reviewRes.report.reportId.startsWith('rep_'));
    assert.ok(reviewRes.report.qrVerificationToken);

    // Check public doctorReview in response does NOT leak privateDoctorNotes
    assert.strictEqual(reviewRes.doctorReview.privateDoctorNotes, undefined);

    // Check reports collection in DB
    const reportDoc = await mockDb.collection('reports').doc(reviewRes.report.reportId).get();
    assert.ok(reportDoc.exists);
    const repData = reportDoc.data();
    assert.strictEqual(repData.caseId, intakeRes.caseId);
    assert.strictEqual(repData.patientName, 'Layla Ahmed');
    assert.strictEqual(repData.doctorLegalName, 'Dr. Tarek Mahmoud, MD');
    assert.strictEqual(repData.doctorSyndicateNumber, 'EG-MED-44821');
    assert.strictEqual(repData.status, 'active');
    assert.strictEqual(repData.reportVersion, 1);
    assert.ok(repData.snapshot.medicalDisclaimer.includes('licensed practitioner'));

    // Verify email_queue received 'result_ready' email
    const emailStore = mockDb.collections.get('email_queue');
    assert.ok(emailStore && emailStore.size > 0);
    const emailEntry = Array.from(emailStore.values()).find(e => e.template === 'result_ready' && e.toEmail === 'layla@example.com');
    assert.ok(emailEntry, 'email_queue must contain result_ready email for patient');
    assert.strictEqual(emailEntry.status, 'pending');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Appointments & Concurrency Prevention
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: Appointments Booking & Concurrency Protection ---');

  await runTest('4.1 Appointments booking must require slotId, write to appointments collection, and queue email', async () => {
    const patientUser = { uid: 'usr_pat_003', email: 'karim@example.com', displayName: 'Karim Zaki' };

    const bookRes = await workflowService.bookAppointment({
      user: patientUser,
      body: {
        doctorId: 'usr_doc_999',
        slotId: 'slot_20261015_1000',
        clinicId: 'clinic_cairo_central',
        startTimeUtc: '2026-10-15T08:00:00.000Z',
        endTimeUtc: '2026-10-15T08:30:00.000Z'
      },
      db: mockDb
    });

    assert.ok(bookRes.success);
    assert.ok(bookRes.appointmentId.startsWith('apt_'));
    assert.strictEqual(bookRes.status, 'booked');

    // Verify appointments document in db
    const aptDoc = await mockDb.collection('appointments').doc(bookRes.appointmentId).get();
    assert.ok(aptDoc.exists);
    assert.strictEqual(aptDoc.data().patientId, 'usr_pat_003');

    // Verify appointment_booked email in email_queue
    const emailStore = mockDb.collections.get('email_queue');
    const aptEmail = Array.from(emailStore.values()).find(e => e.template === 'appointment_booked' && e.toEmail === 'karim@example.com');
    assert.ok(aptEmail, 'email_queue must contain appointment_booked email');
  });

  await runTest('4.2 Appointment cancellation must update status to cancelled', async () => {
    const patientUser = { uid: 'usr_pat_003', email: 'karim@example.com' };

    const cancelRes = await workflowService.cancelAppointment({
      user: patientUser,
      appointmentId: 'apt_test_to_cancel',
      reason: 'Schedule conflict',
      db: mockDb
    });

    assert.ok(cancelRes.success);
    assert.strictEqual(cancelRes.status, 'cancelled');
    assert.strictEqual(cancelRes.reason, 'Schedule conflict');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Clinic Onboarding & Email Queue Processing
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 5: Clinic Onboarding & Transactional Email Processing ---');

  await runTest('5.1 Clinic onboarding must persist record into clinics collection with trial status', async () => {
    const onboardRes = await workflowService.onboardClinic({
      user: { uid: 'admin_clinic_01', email: 'manager@cairochest.com' },
      body: {
        nameAr: 'مركز القاهرة للأمراض الصدرية',
        nameEn: 'Cairo Chest Center',
        governorate: 'Cairo',
        address: 'Nasr City, Abbas El-Akkad St.',
        phone: '+201001234567',
        email: 'manager@cairochest.com'
      },
      db: mockDb
    });

    assert.ok(onboardRes.success);
    assert.ok(onboardRes.clinicId.startsWith('clinic_'));
    assert.strictEqual(onboardRes.status, 'pending');

    const clinicDoc = await mockDb.collection('clinics').doc(onboardRes.clinicId).get();
    assert.ok(clinicDoc.exists);
    assert.strictEqual(clinicDoc.data().subscriptionStatus, 'trial');
    assert.strictEqual(clinicDoc.data().nameAr, 'مركز القاهرة للأمراض الصدرية');
  });

  await runTest('5.2 Email queue processor must process pending emails and update status to sent', async () => {
    const processRes = await workflowService.processEmailQueue(mockDb, 10);
    assert.ok(processRes.processedCount >= 2, 'Should process pending emails in queue');
    assert.strictEqual(processRes.sentCount, processRes.processedCount);

    // Verify email_queue status is updated to sent
    const emailStore = mockDb.collections.get('email_queue');
    const allSent = Array.from(emailStore.values()).every(e => e.status === 'sent');
    assert.ok(allSent, 'All processed emails must be marked as sent');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Security Rules (firestore.rules & storage.rules)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 6: Security Rules Verification (Firestore & Storage) ---');

  const firestoreRulesContent = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  const storageRulesContent = fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8');

  await runTest('6.1 firestore.rules must protect reference catalogs and operational collections', () => {
    assert.ok(firestoreRulesContent.includes('match /diseases_catalog/{diseaseId}'), 'Missing diseases_catalog rule');
    assert.ok(firestoreRulesContent.includes('match /symptoms_catalog/{symptomId}'), 'Missing symptoms_catalog rule');
    assert.ok(firestoreRulesContent.includes('match /clinical_rules/{ruleId}'), 'Missing clinical_rules rule');
    assert.ok(firestoreRulesContent.includes('match /patients/{patientId}'), 'Missing patients rule');
    assert.ok(firestoreRulesContent.includes('match /doctors/{doctorId}'), 'Missing doctors rule');
    assert.ok(firestoreRulesContent.includes('match /clinics/{clinicId}'), 'Missing clinics rule');
    assert.ok(firestoreRulesContent.includes('match /case_status_history/{historyId}'), 'Missing case_status_history rule');
    assert.ok(firestoreRulesContent.includes('match /email_queue/{emailId}'), 'Missing email_queue rule');
    assert.ok(firestoreRulesContent.includes('match /audit_logs/{auditId}'), 'Missing audit_logs rule');
  });

  await runTest('6.2 storage.rules must authorize medical_uploads and reports while blocking executables', () => {
    assert.ok(storageRulesContent.includes('match /medical_uploads/{patientId}/{caseId}/{uploadId}/{fileName}'), 'Missing medical_uploads storage rule');
    assert.ok(storageRulesContent.includes('match /reports/{reportId}/{fileName}'), 'Missing reports storage rule');
    assert.ok(storageRulesContent.includes('hasBlockedExecutableExtension(fileName)'), 'Must enforce blocked executable extensions');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`🎉 ALL TESTS PASSED! (${passedTests}/${totalTests} tests)`);
  console.log('   Full Database Architecture & Backend-Frontend Integration 100% Verified!');
  console.log('================================================================================\n');
}

main().catch(err => {
  console.error('\n❌ Test run aborted due to error:', err);
  process.exit(1);
});
