/**
 * Health Vibe AI - Pre-Visit Dossier Safety, Privacy & Physician Primacy Test Suite
 *
 * Verifies:
 * 1. Calendar Slot Privacy & Data Minimization: Zero leakage of linked dossier or vitals in public slots.
 * 2. Physician Primacy & Anti-Circumvention: Non-clinicians / patients / bots cannot inject diagnoses or prescriptions.
 * 3. Human Clinical Evaluation Lifecycle: Transitions from PENDING_CLINICAL_EVALUATION to EVALUATED_BY_PHYSICIAN.
 * 4. Emergency Red-Flag Screening on Attached Dossiers: SpO2 < 90% triggers statutory 123 emergency escalation.
 * 5. Family Account Privacy & Proxy Boundaries: Enforces dependent case ownership and prevents cross-patient leakage.
 * 6. Statutory Medical Disclaimers: Enforces MoH & international medical disclaimers on all outputs.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const schedulingService = require('../backend/scheduling-service');
const appointmentSafetyService = require('../backend/appointment-safety-service');

console.log('==================================================================');
console.log('🛡️ PRE-VISIT DOSSIER SAFETY, PRIVACY & PHYSICIAN PRIMACY SUITE');
console.log('   Doctolib Safety Guardrails, Anti-Circumvention & Privacy');
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
          const key = `${colName}/${docId}`;
          return {
            id: docId,
            get: async function () {
              const data = store.get(key);
              return {
                id: docId,
                exists: data !== undefined,
                data: () => (data ? { ...data } : undefined)
              };
            },
            set: async function (val) {
              store.set(key, { ...val });
              return true;
            },
            update: async function (val) {
              const existing = store.get(key) || {};
              store.set(key, { ...existing, ...val });
              return true;
            }
          };
        },
        where: function () {
          return {
            get: async function () {
              return {
                empty: true,
                size: 0,
                forEach: () => {}
              };
            }
          };
        }
      };
    },
    runTransaction: async function (updateFn) {
      const transaction = {
        get: async function (docRef) {
          return docRef.get();
        },
        set: function (docRef, data) {
          store.set(`${docRef._col || 'unknown'}/${docRef.id}`, { ...data });
          const key = Array.from(store.keys()).find(k => k.endsWith(`/${docRef.id}`));
          if (key) {
            store.set(key, { ...data });
          } else {
            store.set(`generic/${docRef.id}`, { ...data });
          }
        },
        update: function (docRef, data) {
          for (const [k, v] of store.entries()) {
            if (k.endsWith(`/${docRef.id}`)) {
              store.set(k, { ...v, ...data });
              return;
            }
          }
        }
      };
      return updateFn(transaction);
    }
  };

  return db;
}

async function main() {
  console.log('--- 1. Calendar Slot Privacy & Data Minimization ---');

  runTest('should strictly sanitize linked dossier and clinical vitals for public / other patients', () => {
    const rawSlot = {
      id: 'slot_1000',
      startTime: '10:00',
      endTime: '10:30',
      timeAr: '10:00 ص',
      timeEn: '10:00 AM',
      isBooked: true,
      status: 'booked',
      patientId: 'patient_sensitive_123',
      patientName: 'أحمد محمود',
      patientEmail: 'ahmed@example.com',
      patientPhone: '+201012345678',
      beneficiaryId: 'dep_01',
      beneficiaryName: 'طفل أحمد',
      linkedCaseId: 'case_sensitive_999',
      linkedAssessmentId: 'asm_999',
      hasAttachedReport: true,
      attachedAssessment: {
        diagnosis: 'التهاب شعبي حاد',
        oxygenLevel: 88,
        spo2: 88,
        prescriptions: ['Amoxicillin 500mg']
      },
      reportAccessGranted: true,
      emergencyRiskFlag: true,
      triageUrgency: 'CRITICAL_EMERGENCY',
      detectedRedFlags: ['severe_hypoxemia'],
      oxygenLevel: 88,
      spo2: 88
    };

    const publicViewer = { uid: 'other_patient_999', role: 'patient' };
    const sanitized = appointmentSafetyService.sanitizeCalendarSlotForPrivacy(rawSlot, publicViewer, 'dr_mona');

    // Basic booking availability status is preserved
    assert.strictEqual(sanitized.id, 'slot_1000');
    assert.strictEqual(sanitized.isBooked, true);
    assert.strictEqual(sanitized.status, 'booked');

    // PII and dossier metadata are completely stripped
    assert.strictEqual(sanitized.patientId, null);
    assert.strictEqual(sanitized.patientName, null);
    assert.strictEqual(sanitized.patientEmail, null);
    assert.strictEqual(sanitized.patientPhone, null);
    assert.strictEqual(sanitized.beneficiaryId, null);
    assert.strictEqual(sanitized.beneficiaryName, null);

    // Clinical dossier & vitals must be completely null/false
    assert.strictEqual(sanitized.linkedCaseId, null);
    assert.strictEqual(sanitized.linkedAssessmentId, null);
    assert.strictEqual(sanitized.hasAttachedReport, false);
    assert.strictEqual(sanitized.attachedAssessment, null);
    assert.strictEqual(sanitized.reportAccessGranted, false);
    assert.strictEqual(sanitized.emergencyRiskFlag, null);
    assert.strictEqual(sanitized.triageUrgency, null);
    assert.strictEqual(sanitized.detectedRedFlags, null);
    assert.strictEqual(sanitized.oxygenLevel, null);
    assert.strictEqual(sanitized.spo2, null);
  });

  runTest('should retain full clinical dossier information for the assigned doctor', () => {
    const rawSlot = {
      id: 'slot_1000',
      startTime: '10:00',
      endTime: '10:30',
      isBooked: true,
      patientId: 'patient_sensitive_123',
      patientName: 'أحمد محمود',
      linkedCaseId: 'case_sensitive_999',
      hasAttachedReport: true,
      attachedAssessment: { oxygenLevel: 96 }
    };

    const assignedDoctor = { uid: 'dr_mona', role: 'doctor' };
    const doctorView = appointmentSafetyService.sanitizeCalendarSlotForPrivacy(rawSlot, assignedDoctor, 'dr_mona');

    assert.strictEqual(doctorView.linkedCaseId, 'case_sensitive_999');
    assert.strictEqual(doctorView.hasAttachedReport, true);
    assert.strictEqual(doctorView.patientName, 'أحمد محمود');
  });

  console.log('\n--- 2. Physician Primacy & Anti-Circumvention Controls ---');

  runTest('should reject non-physicians attempting to inject prescriptions into attached assessment', () => {
    const patientUser = { uid: 'pat_tamper', role: 'patient' };
    const forgedPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1000',
      attachedAssessment: {
        diagnosis: 'Pneumonia',
        prescriptions: ['Levofloxacin 500mg daily for 7 days']
      }
    };

    assert.throws(
      () => {
        appointmentSafetyService.enforcePhysicianRoleBoundaries(forgedPayload, patientUser);
      },
      (err) => {
        assert.strictEqual(err.code, 'CLINICIAN_ROLE_PROTECTED');
        assert.strictEqual(err.statusCode, 403);
        assert.ok(err.message.includes('licensed human physicians'));
        return true;
      }
    );
  });

  runTest('should reject non-physicians attempting to inject treatmentPlan or ICD-10 into attached assessment', () => {
    const patientUser = { uid: 'pat_tamper', role: 'patient' };
    const forgedPayload = {
      attachedAssessment: {
        treatmentPlan: 'Start patient on high-flow oxygen and nebulized bronchodilators.'
      }
    };

    assert.throws(
      () => {
        appointmentSafetyService.enforcePhysicianRoleBoundaries(forgedPayload, patientUser);
      },
      (err) => {
        assert.strictEqual(err.code, 'CLINICIAN_ROLE_PROTECTED');
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );
  });

  await runAsyncTest('should enforce physician primacy metadata on newly booked appointment with linked dossier', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_primacy_01', email: 'primacy@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_safe_01').set({
      id: 'case_safe_01',
      patientId: 'pat_primacy_01',
      oxygenLevel: 98,
      status: 'approved',
      diagnosis: 'تقييم تنفسي معتمد'
    });

    const bookedAppt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1000',
      linkedCaseId: 'case_safe_01'
    }, patientUser);

    assert.strictEqual(bookedAppt.physicianPrimacyGuaranteed, true);
    assert.strictEqual(bookedAppt.clinicalEvaluationRequired, true);
    assert.strictEqual(bookedAppt.humanPhysicianReviewStatus, 'PENDING_CLINICAL_EVALUATION');
    assert.ok(bookedAppt.statutoryMedicalDisclaimer.includes('لا تعد تشخيصاً طبياً مستقلاً'));
  });

  await runAsyncTest('should transition status to EVALUATED_BY_PHYSICIAN when doctor conducts evaluation', async () => {
    const mockDb = createMockFirestore();
    const doctorUser = {
      uid: 'dr_mona',
      name: 'د. منى زكي',
      role: 'doctor',
      licenseNumber: 'EGY-MED-994821',
      specialty: 'أمراض الصدر والحساسية'
    };

    const apptId = 'appt_eval_test_01';
    await mockDb.collection('appointments').doc(apptId).set({
      id: apptId,
      doctorId: 'dr_mona',
      patientId: 'pat_eval_01',
      date: '2026-10-27',
      slotId: 'slot_1000',
      status: 'confirmed',
      physicianPrimacyGuaranteed: true,
      clinicalEvaluationRequired: true,
      humanPhysicianReviewStatus: 'PENDING_CLINICAL_EVALUATION',
      history: []
    });

    const evalResult = await appointmentSafetyService.recordDoctorClinicalEvaluation(mockDb, {
      appointmentId: apptId,
      diagnosis: 'التهاب شعبي تحسسي حاد',
      icd10Code: 'J20.9',
      prescriptions: [{ medication: 'Budesonide 200mcg', dosage: '2 puffs BID', duration: '14 days' }],
      treatmentPlan: 'متابعة بعد أسبوعين مع قياس وظائف التنفس',
      status: 'completed'
    }, doctorUser);

    assert.strictEqual(evalResult.success, true);
    assert.strictEqual(evalResult.clinicalEvaluation.doctorLicense, 'EGY-MED-994821');

    const apptSnap = await mockDb.collection('appointments').doc(apptId).get();
    const updated = apptSnap.data();
    assert.strictEqual(updated.status, 'completed');
    assert.strictEqual(updated.humanPhysicianReviewStatus, 'EVALUATED_BY_PHYSICIAN');
    assert.strictEqual(updated.clinicalEvaluationRequired, false);
    assert.strictEqual(updated.evaluatedByDoctorId, 'dr_mona');
  });

  console.log('\n--- 3. Acute Respiratory Emergency Red-Flag Triage on Dossier ---');

  await runAsyncTest('should halt booking and trigger emergency escalation if dossier has SpO2 < 90% without disclaimer acknowledgement', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_critical_hypoxemia', email: 'hypox@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_critical_86').set({
      id: 'case_critical_86',
      patientId: 'pat_critical_hypoxemia',
      oxygenLevel: 86, // Severe hypoxemia (< 90%)
      status: 'approved',
      diagnosis: 'أزمة ربو حادة مع نقص أكسجين'
    });

    let errorThrown = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, {
        doctorId: 'dr_mona',
        date: '2026-10-27',
        slotId: 'slot_1030',
        linkedCaseId: 'case_critical_86',
        emergencyDisclaimerAcknowledged: false
      }, patientUser);
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Should throw an error for critical hypoxemia');
    assert.strictEqual(errorThrown.code, 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED');
    assert.strictEqual(errorThrown.statusCode, 422);
    assert.ok(errorThrown.message.includes('123'), 'Includes 123 Ambulance instructions');
    assert.strictEqual(errorThrown.details.isEmergency, true);
    assert.strictEqual(errorThrown.details.detectedRedFlags[0].key, 'severe_hypoxemia');
  });

  await runAsyncTest('should allow booking if critical hypoxemia disclaimer is explicitly acknowledged', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_critical_ack', email: 'ack@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_ack_88').set({
      id: 'case_ack_88',
      patientId: 'pat_critical_ack',
      oxygenLevel: 88,
      status: 'approved'
    });

    const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1100',
      linkedCaseId: 'case_ack_88',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    assert.strictEqual(booked.emergencyRiskFlag, true);
    assert.strictEqual(booked.triageUrgency, 'CRITICAL_EMERGENCY');
    assert.ok(booked.detectedRedFlags.some(f => f.key === 'severe_hypoxemia'));
  });

  await runAsyncTest('should halt post-booking linkage if linked case has SpO2 < 90% without disclaimer', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_post_crit', email: 'postcrit@example.com', role: 'patient' };

    await mockDb.collection('appointments').doc('appt_post_crit').set({
      id: 'appt_post_crit',
      doctorId: 'dr_mona',
      patientId: 'pat_post_crit',
      date: '2026-10-27',
      slotId: 'slot_1130',
      status: 'confirmed',
      history: []
    });

    await mockDb.collection('cases').doc('case_crit_spo2').set({
      id: 'case_crit_spo2',
      patientId: 'pat_post_crit',
      oxygenLevel: 85,
      status: 'approved'
    });

    let linkError = null;
    try {
      await schedulingService.linkAppointmentCaseDossier(mockDb, {
        appointmentId: 'appt_post_crit',
        caseId: 'case_crit_spo2',
        emergencyDisclaimerAcknowledged: false
      }, patientUser);
    } catch (e) {
      linkError = e;
    }

    assert.ok(linkError, 'Should reject linking critical case without disclaimer');
    assert.strictEqual(linkError.code, 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED');
  });

  console.log('\n--- 4. Family Account Privacy & Proxy Boundaries ---');

  await runAsyncTest('should allow primary patient to attach case belonging to verified family beneficiary', async () => {
    const mockDb = createMockFirestore();
    const primaryUser = { uid: 'pat_parent_01', email: 'parent@example.com', role: 'patient' };

    await mockDb.collection('users').doc('pat_parent_01').set({
      uid: 'pat_parent_01',
      familyMembers: [
        { id: 'dep_child_01', fullName: 'يوسف أحمد', relationship: 'son' }
      ]
    });

    await mockDb.collection('cases').doc('case_child_01').set({
      id: 'case_child_01',
      patientId: 'pat_parent_01',
      beneficiaryId: 'dep_child_01',
      oxygenLevel: 97,
      status: 'approved',
      diagnosis: 'فحص طفل سليم'
    });

    const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1200',
      beneficiaryId: 'dep_child_01',
      linkedCaseId: 'case_child_01'
    }, primaryUser);

    assert.strictEqual(booked.beneficiaryId, 'dep_child_01');
    assert.strictEqual(booked.hasAttachedReport, true);
    assert.strictEqual(booked.linkedCaseId, 'case_child_01');
  });

  await runAsyncTest('should reject patient attempting to attach an unrelated stranger case', async () => {
    const mockDb = createMockFirestore();
    const patientA = { uid: 'pat_a', email: 'a@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_b').set({
      id: 'case_b',
      patientId: 'pat_b_stranger',
      oxygenLevel: 98,
      status: 'approved'
    });

    let rejectedErr = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, {
        doctorId: 'dr_mona',
        date: '2026-10-27',
        slotId: 'slot_1230',
        linkedCaseId: 'case_b'
      }, patientA);
    } catch (err) {
      rejectedErr = err;
    }

    assert.ok(rejectedErr);
    assert.strictEqual(rejectedErr.code, 'UNAUTHORIZED_CASE_ATTACHMENT');
    assert.strictEqual(rejectedErr.statusCode, 403);
  });

  await runAsyncTest('should mask unapproved outcomes and enforce physician primacy notice for patients', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_unapproved_view', email: 'unapp@example.com', role: 'patient' };

    await mockDb.collection('appointments').doc('appt_unapp_view').set({
      id: 'appt_unapp_view',
      doctorId: 'dr_mona',
      patientId: 'pat_unapproved_view',
      date: '2026-10-27',
      slotId: 'slot_1300',
      status: 'confirmed',
      linkedCaseId: 'case_unapp_999'
    });

    await mockDb.collection('cases').doc('case_unapp_999').set({
      id: 'case_unapp_999',
      patientId: 'pat_unapproved_view',
      status: 'pending_review',
      diagnosis: 'تخمين غير معتمد لذكاء اصطناعي'
    });

    const result = await schedulingService.getAppointmentPrevisitDossier(mockDb, 'appt_unapp_view', patientUser);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.physicianPrimacyGuaranteed, true);
    assert.strictEqual(result.dossier.humanPhysicianReviewRequired, true);
    assert.ok(result.dossier.notice.includes('المراجعة السريرية'));
    assert.strictEqual(result.dossier.diagnosis, undefined, 'Uncertified diagnosis must NOT be leaked to patient');
    assert.ok(result.statutoryDisclaimer.ar.includes('تنبيه طبي قانوني'));
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
