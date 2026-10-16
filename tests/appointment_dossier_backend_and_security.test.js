/**
 * Health Vibe AI - Appointment Assessment Dossier Backend & Security Test Suite
 *
 * Verifies:
 * 1. ACID transactional booking with certified respiratory report linkage.
 * 2. Case ownership boundary enforcement & anti-tampering (zero cross-patient case leakage).
 * 3. Bidirectional database reference updating (appointment -> case & case -> appointmentRef).
 * 4. Multi-channel notification dispatching to attending physician (in-app + email notification).
 * 5. Pre-Visit Dossier retrieval endpoint (GET /api/appointments/:id/previsit-dossier) with RBAC.
 * 6. Doctor clinical pre-consultation access vs. unapproved patient outcome masking.
 * 7. Post-booking dossier linkage (POST /api/appointments/link-case-dossier) with audit trail.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const schedulingService = require('../backend/scheduling-service');

console.log('==================================================================');
console.log('🔒 DOCTOLIB PRE-VISIT DOSSIER: BACKEND & SECURITY SUITE');
console.log('   Data Integrity, RBAC, Anti-Tampering, Notifications & Audit');
console.log('==================================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

// In-Memory Firestore Mock
function createMockFirestore() {
  const store = new Map();

  const db = {
    _store: store,
    collection: function (colName) {
      return {
        doc: function (docId) {
          const fullKey = `${colName}/${docId}`;
          return {
            _key: fullKey,
            get: async function () {
              const data = store.get(fullKey);
              return { exists: Boolean(data), data: () => data, id: docId };
            },
            set: async function (data, options = {}) {
              const existing = options && options.merge ? (store.get(fullKey) || {}) : {};
              const merged = { ...existing, ...data };
              store.set(fullKey, merged);
              return merged;
            },
            update: async function (data) {
              const existing = store.get(fullKey) || {};
              const updated = { ...existing, ...data };
              store.set(fullKey, updated);
              return updated;
            }
          };
        },
        add: async function (data) {
          const id = data.id || `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const fullKey = `${colName}/${id}`;
          store.set(fullKey, { ...data, id });
          return { id };
        },
        where: function (field, op, val) {
          return {
            where: function () { return this; },
            get: async function () {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
                  if (field && val !== undefined) {
                    if (v[field] === val) {
                      docs.push({ id: k.replace(`${colName}/`, ''), data: () => v });
                    }
                  } else {
                    docs.push({ id: k.replace(`${colName}/`, ''), data: () => v });
                  }
                }
              }
              return { docs, forEach: fn => docs.forEach(fn), empty: docs.length === 0, size: docs.length };
            }
          };
        }
      };
    },
    runTransaction: async function (updateFn) {
      const transaction = {
        get: async function (ref) { return await ref.get(); },
        set: function (ref, data) {
          const existing = store.get(ref._key) || {};
          store.set(ref._key, { ...existing, ...data });
        },
        update: function (ref, data) {
          const existing = store.get(ref._key) || {};
          store.set(ref._key, { ...existing, ...data });
        }
      };
      return await updateFn(transaction);
    }
  };

  return db;
}

async function main() {
  console.log('--- 1. Case Ownership Verification & Anti-Tampering ---');

  await runAsyncTest('should allow patient to attach their own certified respiratory case', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'patient_tarek', email: 'tarek@example.com', role: 'patient' };

    // Seed patient case in Firestore
    await mockDb.collection('cases').doc('case_tarek_01').set({
      id: 'case_tarek_01',
      patientId: 'patient_tarek',
      oxygenLevel: 96,
      diagnosis: 'حساسية صدرية خفيفة',
      status: 'approved',
      clinicalNotes: 'فحص سريري يظهر وظائف رئة مستقرة.'
    });

    const bookingPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true,
      linkedCaseId: 'case_tarek_01'
    };

    const result = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);
    assert.ok(result, 'Booking succeeded');
    assert.strictEqual(result.linkedCaseId, 'case_tarek_01');
    assert.strictEqual(result.hasAttachedReport, true);
    assert.strictEqual(result.attachedAssessment.oxygenLevel, 96);
  });

  await runAsyncTest('should reject patient attempting to attach another patient\'s medical case', async () => {
    const mockDb = createMockFirestore();
    const attackerUser = { uid: 'attacker_bob', email: 'bob@example.com', role: 'patient' };

    // Seed someone else's case
    await mockDb.collection('cases').doc('case_victim_99').set({
      id: 'case_victim_99',
      patientId: 'victim_alice',
      patientEmail: 'alice@example.com',
      oxygenLevel: 88,
      diagnosis: 'نقص أكسجين حاد واشتباه ربو متفاقم',
      status: 'approved'
    });

    const maliciousPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true,
      linkedCaseId: 'case_victim_99'
    };

    let errorThrown = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, maliciousPayload, attackerUser);
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Must throw error on cross-patient attachment');
    assert.strictEqual(errorThrown.code, 'UNAUTHORIZED_CASE_ATTACHMENT');
    assert.strictEqual(errorThrown.statusCode, 403);
  });

  console.log('\n--- 2. Bidirectional Database Linkage (Atomic Updates) ---');

  await runAsyncTest('should update appointmentRef on cases document atomically', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_omar', email: 'omar@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_omar_88').set({
      id: 'case_omar_88',
      patientId: 'pat_omar',
      oxygenLevel: 94,
      status: 'approved'
    });

    const bookingPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true,
      linkedCaseId: 'case_omar_88'
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);

    // Verify case document now has appointmentRef
    const updatedCaseSnap = await mockDb.collection('cases').doc('case_omar_88').get();
    const updatedCase = updatedCaseSnap.data();

    assert.ok(updatedCase.hasLinkedAppointment, 'Case marked with hasLinkedAppointment');
    assert.ok(updatedCase.appointmentRef, 'Case has appointmentRef');
    assert.strictEqual(updatedCase.appointmentRef.appointmentId, appt.id);
    assert.strictEqual(updatedCase.appointmentRef.doctorId, 'dr_mona');
    assert.strictEqual(updatedCase.appointmentRef.date, '2026-10-25');
  });

  console.log('\n--- 3. Multi-Channel Physician Notification Dispatching ---');

  await runAsyncTest('should dispatch in-app and email notification to attending doctor upon dossier attachment', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_notif_01', email: 'notif@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_notif_01').set({
      id: 'case_notif_01',
      patientId: 'pat_notif_01',
      oxygenLevel: 93,
      status: 'approved'
    });

    const bookingPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true,
      linkedCaseId: 'case_notif_01'
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);

    // Check user_notifications for doctor notification
    let doctorInAppNotif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'dr_mona') {
        doctorInAppNotif = v;
        break;
      }
    }

    assert.ok(doctorInAppNotif, 'Doctor must receive in-app notification');
    assert.strictEqual(doctorInAppNotif.type, 'previsit_dossier_attached');
    assert.strictEqual(doctorInAppNotif.category, 'clinical_dossier');
    assert.strictEqual(doctorInAppNotif.linkedCaseId, 'case_notif_01');
    assert.ok(doctorInAppNotif.body.includes('93%'), 'Doctor notification body highlights SpO2 vitals');

    // Check email_notifications for doctor
    let doctorEmailNotif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('email_notifications/') && v.type === 'previsit_dossier_attached') {
        doctorEmailNotif = v;
        break;
      }
    }

    assert.ok(doctorEmailNotif, 'Doctor email notification record must be generated');
    assert.strictEqual(doctorEmailNotif.linkedCaseId, 'case_notif_01');
  });

  console.log('\n--- 4. Pre-Visit Dossier Retrieval API (getAppointmentPrevisitDossier) ---');

  await runAsyncTest('should allow attending doctor to access full pre-visit clinical findings', async () => {
    const mockDb = createMockFirestore();
    const doctorUser = { uid: 'dr_mona', role: 'doctor' };

    await mockDb.collection('appointments').doc('appt_previsit_01').set({
      id: 'appt_previsit_01',
      doctorId: 'dr_mona',
      patientId: 'pat_yasser',
      patientName: 'ياسر كمال',
      date: '2026-10-26',
      slotId: 'slot_1000',
      status: 'confirmed',
      linkedCaseId: 'case_yasser_01',
      hasAttachedReport: true
    });

    await mockDb.collection('cases').doc('case_yasser_01').set({
      id: 'case_yasser_01',
      patientId: 'pat_yasser',
      oxygenLevel: 95,
      diagnosis: 'التهاب رئوي بكتيري مع استجابة للعلاج',
      status: 'approved',
      clinicalNotes: 'مراجعة سريرية متكاملة تشير لتحسن ملحوظ بالأصوات التنفسية.',
      approvedByDoctorName: 'د. منى سامي'
    });

    const res = await schedulingService.getAppointmentPrevisitDossier(mockDb, 'appt_previsit_01', doctorUser);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.hasAttachedReport, true);
    assert.strictEqual(res.linkedCaseId, 'case_yasser_01');
    assert.ok(res.dossier, 'Dossier object present');
    assert.strictEqual(res.dossier.oxygenLevel, 95);
    assert.strictEqual(res.dossier.diagnosis, 'التهاب رئوي بكتيري مع استجابة للعلاج');
  });

  await runAsyncTest('should block unauthorized doctor from viewing appointment dossier (RBAC)', async () => {
    const mockDb = createMockFirestore();
    const otherDoctor = { uid: 'dr_other_stranger', role: 'doctor' };

    await mockDb.collection('appointments').doc('appt_previsit_02').set({
      id: 'appt_previsit_02',
      doctorId: 'dr_mona',
      patientId: 'pat_salma',
      linkedCaseId: 'case_salma_02'
    });

    let errorThrown = null;
    try {
      await schedulingService.getAppointmentPrevisitDossier(mockDb, 'appt_previsit_02', otherDoctor);
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Unauthorized doctor must be rejected');
    assert.strictEqual(errorThrown.code, 'ACCESS_DENIED');
    assert.strictEqual(errorThrown.statusCode, 403);
  });

  await runAsyncTest('should mask unapproved outcomes if patient accesses dossier prior to certification', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_unapproved', role: 'patient' };

    await mockDb.collection('appointments').doc('appt_unapproved_01').set({
      id: 'appt_unapproved_01',
      doctorId: 'dr_mona',
      patientId: 'pat_unapproved',
      linkedCaseId: 'case_unapproved_01',
      hasAttachedReport: true
    });

    await mockDb.collection('cases').doc('case_unapproved_01').set({
      id: 'case_unapproved_01',
      patientId: 'pat_unapproved',
      oxygenLevel: 91,
      diagnosis: 'حالة غير معتمدة - تشخيص تمهيدي سري',
      status: 'pending_doctor_review'
    });

    const res = await schedulingService.getAppointmentPrevisitDossier(mockDb, 'appt_unapproved_01', patientUser);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.dossier.status, 'pending_review');
    assert.strictEqual(res.dossier.diagnosis, undefined, 'Unapproved diagnosis must be masked from patient');
  });

  console.log('\n--- 5. Post-Booking Dossier Linkage (linkAppointmentCaseDossier) ---');

  await runAsyncTest('should allow linking a certified report to an existing appointment and record audit history', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_post_link', email: 'post@example.com', role: 'patient' };

    await mockDb.collection('appointments').doc('appt_existing_77').set({
      id: 'appt_existing_77',
      doctorId: 'dr_mona',
      patientId: 'pat_post_link',
      date: '2026-10-27',
      slotId: 'slot_1000',
      status: 'confirmed',
      history: []
    });

    await mockDb.collection('cases').doc('case_existing_99').set({
      id: 'case_existing_99',
      patientId: 'pat_post_link',
      oxygenLevel: 97,
      diagnosis: 'فحص تنفسي سليم ومعتمد',
      status: 'approved'
    });

    const linkResult = await schedulingService.linkAppointmentCaseDossier(mockDb, {
      appointmentId: 'appt_existing_77',
      caseId: 'case_existing_99'
    }, patientUser);

    assert.strictEqual(linkResult.success, true);
    assert.strictEqual(linkResult.linkedCaseId, 'case_existing_99');

    // Verify appointment was updated
    const apptSnap = await mockDb.collection('appointments').doc('appt_existing_77').get();
    const updatedAppt = apptSnap.data();
    assert.strictEqual(updatedAppt.hasAttachedReport, true);
    assert.strictEqual(updatedAppt.linkedCaseId, 'case_existing_99');
    assert.strictEqual(updatedAppt.history[0].action, 'PREVISIT_DOSSIER_ATTACHED');

    // Verify case was updated with appointmentRef
    const caseSnap = await mockDb.collection('cases').doc('case_existing_99').get();
    const updatedCase = caseSnap.data();
    assert.strictEqual(updatedCase.appointmentRef.appointmentId, 'appt_existing_77');
  });

  console.log('\n--- 6. Server Routes & Rate Limiting Contract ---');

  runTest('should include endpoints in backend/server.js', () => {
    const serverJs = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');
    assert.ok(serverJs.includes('/api/appointments/:id/previsit-dossier'), 'server.js exposes GET /api/appointments/:id/previsit-dossier');
    assert.ok(serverJs.includes('/api/appointments/link-case-dossier'), 'server.js exposes POST /api/appointments/link-case-dossier');
    assert.ok(serverJs.includes("'/api/appointments/link-case-dossier'"), 'Rate limiter includes link-case-dossier');
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('==================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
