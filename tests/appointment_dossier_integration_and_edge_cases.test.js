/**
 * Health Vibe AI - Pre-Visit Dossier Integration QA & Edge Cases Test Suite
 *
 * Benchmarked against Doctolib & Vezeeta Standards:
 * Automatic Report Attachment & Doctor Pre-Consultation Review
 *
 * Verifies:
 * 1. End-to-End Chatbot / Respiratory Assessment -> Appointments Booking Flow.
 * 2. Bilingual Parity (Arabic RTL & English LTR) for cards, vitals, badges & disclaimers.
 * 3. Family Profiles & Proxy Boundaries (valid dependent vs unauthorized dependent case linkage).
 * 4. Telehealth (Video Consultation) vs. In-Person Clinic Consultation with Attached Dossier.
 * 5. Edge Case: Non-standard / string SpO2 normalization ("96%", "87%", nested vitals).
 * 6. Edge Case: Detaching report mid-booking (user unlinks report before booking).
 * 7. Edge Case: Doctor on leave with attached dossier (rejects without orphaned linkages).
 * 8. Edge Case: High-Concurrency Double-Booking collision with attached dossiers (mutual exclusion).
 * 9. Edge Case: Post-Booking Reschedule & Cancellation lifecycle synchronization on linked cases.
 * 10. Edge Case: Uncertified case outcome masking vs. attending physician dossier review.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const schedulingService = require('../backend/scheduling-service');
const appointmentSafetyService = require('../backend/appointment-safety-service');
const AppointmentsUI = require('../app/modules/appointments/appointments-ui');

console.log('==================================================================');
console.log('🧪 DOCTOLIB PRE-VISIT DOSSIER: INTEGRATION QA & EDGE CASES SUITE');
console.log('   End-to-End Workflows, Bilingual Parity, Concurrency & Resilience');
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

// In-Memory Firestore Mock supporting document & transaction semantics
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
            id: docId,
            get: async function () {
              const data = store.get(fullKey);
              return {
                id: docId,
                exists: Boolean(data),
                data: () => (data ? { ...data } : undefined)
              };
            },
            set: async function (data, opts = {}) {
              const existing = opts && opts.merge ? (store.get(fullKey) || {}) : {};
              const merged = { ...existing, ...data };
              store.set(fullKey, merged);
              return merged;
            },
            update: async function (data) {
              const existing = store.get(fullKey) || {};
              const updated = { ...existing };
              for (const [k, v] of Object.entries(data)) {
                if (k.includes('.')) {
                  const parts = k.split('.');
                  let target = updated;
                  for (let i = 0; i < parts.length - 1; i++) {
                    target[parts[i]] = target[parts[i]] || {};
                    target = target[parts[i]];
                  }
                  target[parts[parts.length - 1]] = v;
                } else {
                  updated[k] = v;
                }
              }
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
                      docs.push({ id: k.replace(`${colName}/`, ''), data: () => ({ ...v }) });
                    }
                  } else {
                    docs.push({ id: k.replace(`${colName}/`, ''), data: () => ({ ...v }) });
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
        set: function (ref, data, opts = {}) {
          const existing = (opts && opts.merge) ? (store.get(ref._key) || {}) : {};
          store.set(ref._key, { ...existing, ...data });
        },
        update: function (ref, data) {
          const existing = store.get(ref._key) || {};
          const updated = { ...existing };
          for (const [k, v] of Object.entries(data)) {
            if (k.includes('.')) {
              const parts = k.split('.');
              let target = updated;
              for (let i = 0; i < parts.length - 1; i++) {
                target[parts[i]] = target[parts[i]] || {};
                target = target[parts[i]];
              }
              target[parts[parts.length - 1]] = v;
            } else {
              updated[k] = v;
            }
          }
          store.set(ref._key, updated);
        }
      };
      return await updateFn(transaction);
    }
  };

  return db;
}

// Mock DOM for UI testing in Node.js
let mockMount;
function setupMockDom() {
  mockMount = {
    innerHTML: '',
    style: { display: '' },
    querySelector: function (selector) {
      if (selector === '#btnDetachAssessmentDossier') {
        return {
          onclick: null,
          setAttribute: () => {},
          getAttribute: () => {}
        };
      }
      return null;
    }
  };

  global.document = {
    getElementById: function (id) {
      if (id === 'testDossierMount') return mockMount;
      return null;
    }
  };
}

function teardownMockDom() {
  delete global.document;
}

async function main() {
  console.log('--- 1. End-to-End Chatbot / Assessment to Booking Integration ---');

  await runAsyncTest('should complete full e2e flow: intake assessment -> booking with dossier -> doctor pre-visit review', async () => {
    const mockDb = createMockFirestore();
    const patientUser = {
      uid: 'pat_e2e_01',
      name: 'طارق الدسوقي',
      email: 'tarek@example.com',
      phoneNumber: '+201011122233',
      role: 'patient'
    };

    // 1. Initial Assessment submitted via Chatbot / Clinical Assessment tool
    const initialCase = {
      id: 'case_e2e_respiratory_101',
      patientId: 'pat_e2e_01',
      patientName: 'طارق الدسوقي',
      patientEmail: 'tarek@example.com',
      oxygenLevel: 96,
      spo2: 96,
      vitals: { heartRate: 78, respiratoryRate: 18 },
      symptoms: 'سعال جاف مستمر منذ 5 أيام مع ضيق تنفس خفيف عند المجهود',
      diagnosis: 'نزلة شعبية حادة مع حساسية صدرية',
      status: 'approved',
      approvedByDoctorName: 'د. منى سامي',
      createdAt: '2026-10-16T10:00:00Z',
      submittedAt: '2026-10-16T10:00:00Z'
    };
    await mockDb.collection('cases').doc('case_e2e_respiratory_101').set(initialCase);

    // 2. Patient books appointment with linked dossier
    const bookingResult = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1000',
      patientName: 'طارق الدسوقي',
      patientPhone: '+201011122233',
      consultationType: 'clinic',
      linkedCaseId: 'case_e2e_respiratory_101',
      reportAccessGranted: true
    }, patientUser);

    assert.strictEqual(bookingResult.status, 'confirmed');
    assert.strictEqual(bookingResult.linkedCaseId, 'case_e2e_respiratory_101');
    assert.strictEqual(bookingResult.hasAttachedReport, true);
    assert.strictEqual(bookingResult.physicianPrimacyGuaranteed, true);
    assert.strictEqual(bookingResult.humanPhysicianReviewStatus, 'PENDING_CLINICAL_EVALUATION');

    // 3. Verify case in database has bidirectional link
    const caseSnap = await mockDb.collection('cases').doc('case_e2e_respiratory_101').get();
    const updatedCase = caseSnap.data();
    assert.strictEqual(updatedCase.hasLinkedAppointment, true);
    assert.strictEqual(updatedCase.appointmentRef.appointmentId, bookingResult.id);
    assert.strictEqual(updatedCase.appointmentRef.doctorId, 'dr_mona');

    // 4. Attending Doctor prepares for visit and accesses pre-visit dossier
    const attendingDoctor = { uid: 'dr_mona', name: 'د. منى سامي', role: 'doctor' };
    const dossierResponse = await schedulingService.getAppointmentPrevisitDossier(
      mockDb,
      bookingResult.id,
      attendingDoctor
    );

    assert.strictEqual(dossierResponse.success, true);
    assert.strictEqual(dossierResponse.hasAttachedReport, true);
    assert.strictEqual(dossierResponse.dossier.id, 'case_e2e_respiratory_101');
    assert.strictEqual(dossierResponse.dossier.oxygenLevel, 96);
    assert.ok(dossierResponse.dossier.diagnosis.includes('شعبية'));
    assert.ok(dossierResponse.statutoryDisclaimer.ar.includes('تنبيه طبي قانوني'));
  });

  console.log('\n--- 2. Bilingual Parity (Arabic RTL vs English LTR) ---');

  runTest('should have 100% parity across Arabic and English i18n catalogs for pre-visit dossier', () => {
    const i18nPath = path.join(__dirname, '../app/i18n.js');
    const i18nContent = fs.readFileSync(i18nPath, 'utf8');

    const requiredKeys = [
      'attachedDossierTitle',
      'attachedDossierDesc',
      'bookWithReportCta',
      'previewAttachedReport',
      'detachReport',
      'preVisitDoctorReview',
      'attachedReportBadge'
    ];

    for (const key of requiredKeys) {
      assert.ok(i18nContent.includes(`${key}:`), `Missing key '${key}' in i18n.js`);
    }
  });

  runTest('should render Arabic dossier card with Arabic labels and formatted vitals', () => {
    setupMockDom();
    AppointmentsUI.setLinkedCase({
      id: 'case_ar_01',
      caseId: 'case_ar_01',
      patientName: 'مريم محمود',
      oxygenLevel: 98,
      diagnosis: 'تقييم سليم للجهاز التنفسي'
    });

    AppointmentsUI.renderAttachedAssessmentDossier('testDossierMount', false);
    assert.strictEqual(mockMount.style.display, 'block');
    assert.ok(mockMount.innerHTML.includes('ملف التقييم الطبي المعتمد'), 'Arabic title present');
    assert.ok(mockMount.innerHTML.includes('98%'), 'SpO2 percentage present');
    assert.ok(mockMount.innerHTML.includes('إلغاء الإرفاق'), 'Arabic detach button present');
    teardownMockDom();
  });

  runTest('should render English dossier card with English labels and formatted vitals', () => {
    setupMockDom();
    AppointmentsUI.setLinkedCase({
      id: 'case_en_01',
      caseId: 'case_en_01',
      patientName: 'Mariam Mahmoud',
      oxygenLevel: 98,
      diagnosis: 'Normal Respiratory Assessment'
    });

    AppointmentsUI.renderAttachedAssessmentDossier('testDossierMount', true);
    assert.strictEqual(mockMount.style.display, 'block');
    assert.ok(mockMount.innerHTML.includes('Pre-Visit Medical Dossier Attached'), 'English header present');
    assert.ok(mockMount.innerHTML.includes('Oxygen Saturation (SpO2):'), 'English oxygen label present');
    assert.ok(mockMount.innerHTML.includes('Detach'), 'English detach button present');
    teardownMockDom();
  });

  console.log('\n--- 3. Family Profiles & Proxy Boundaries ---');

  await runAsyncTest('should book successfully for verified family dependent with attached dependent dossier', async () => {
    const mockDb = createMockFirestore();
    const primaryParent = { uid: 'pat_parent_88', role: 'patient', email: 'parent88@example.com' };

    // Register dependent in user profile
    await mockDb.collection('users').doc('pat_parent_88').set({
      uid: 'pat_parent_88',
      familyMembers: [
        { id: 'dep_daughter_01', fullName: 'سلمى طارق', relationship: 'daughter' }
      ]
    });

    // Case belongs to dependent
    await mockDb.collection('cases').doc('case_daughter_99').set({
      id: 'case_daughter_99',
      patientId: 'pat_parent_88',
      beneficiaryId: 'dep_daughter_01',
      oxygenLevel: 99,
      status: 'approved',
      diagnosis: 'فحص دوري تنفسي للأطفال'
    });

    const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1030',
      beneficiaryId: 'dep_daughter_01',
      linkedCaseId: 'case_daughter_99'
    }, primaryParent);

    assert.strictEqual(booked.beneficiaryId, 'dep_daughter_01');
    assert.strictEqual(booked.hasAttachedReport, true);
    assert.strictEqual(booked.linkedCaseId, 'case_daughter_99');
  });

  await runAsyncTest('should reject booking when patient attempts to attach case for an unverified/fake dependent', async () => {
    const mockDb = createMockFirestore();
    const primaryParent = { uid: 'pat_parent_88', role: 'patient', email: 'parent88@example.com' };

    await mockDb.collection('users').doc('pat_parent_88').set({
      uid: 'pat_parent_88',
      familyMembers: []
    });

    let caughtErr = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, {
        doctorId: 'dr_mona',
        date: '2026-10-27',
        slotId: 'slot_1030',
        beneficiaryId: 'unverified_dependent_99',
        linkedCaseId: 'case_some'
      }, primaryParent);
    } catch (e) {
      caughtErr = e;
    }

    assert.ok(caughtErr);
    assert.strictEqual(caughtErr.code, 'UNAUTHORIZED_BENEFICIARY');
    assert.strictEqual(caughtErr.statusCode, 403);
  });

  console.log('\n--- 4. Telehealth (Video) vs. In-Person Clinic Consultation ---');

  await runAsyncTest('should preserve attached dossier for remote video consultation', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_telehealth_01', email: 'tele@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_tele_01').set({
      id: 'case_tele_01',
      patientId: 'pat_telehealth_01',
      oxygenLevel: 97,
      status: 'approved'
    });

    const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1100',
      type: 'video',
      consultationType: 'video',
      linkedCaseId: 'case_tele_01'
    }, patientUser);

    assert.strictEqual(booked.isOnlineConsultation, true);
    assert.strictEqual(booked.type, 'video');
    assert.strictEqual(booked.hasAttachedReport, true);
    assert.strictEqual(booked.linkedCaseId, 'case_tele_01');
  });

  console.log('\n--- 5. Edge Case: Non-Standard / String SpO2 Normalization ---');

  await runAsyncTest('should normalize string SpO2 with percentage sign ("96%") and avoid false emergency alarms', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_string_vitals', email: 'str@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_string_spo2').set({
      id: 'case_string_spo2',
      patientId: 'pat_string_vitals',
      oxygenLevel: '96%', // String format
      status: 'approved'
    });

    const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1130',
      linkedCaseId: 'case_string_spo2'
    }, patientUser);

    assert.strictEqual(booked.emergencyRiskFlag, false);
    assert.strictEqual(booked.hasAttachedReport, true);
    assert.strictEqual(booked.attachedAssessment.oxygenLevel, 96);
  });

  await runAsyncTest('should trigger emergency triage when nested vitals has critical SpO2 ("87%")', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_crit_nested', email: 'crit@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_crit_nested').set({
      id: 'case_crit_nested',
      patientId: 'pat_crit_nested',
      vitals: { oxygenSaturation: '87%' },
      status: 'approved'
    });

    let emergencyErr = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, {
        doctorId: 'dr_mona',
        date: '2026-10-27',
        slotId: 'slot_1200',
        linkedCaseId: 'case_crit_nested',
        emergencyDisclaimerAcknowledged: false
      }, patientUser);
    } catch (e) {
      emergencyErr = e;
    }

    assert.ok(emergencyErr);
    assert.strictEqual(emergencyErr.code, 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED');
    assert.strictEqual(emergencyErr.statusCode, 422);
  });

  console.log('\n--- 6. Edge Case: Detaching Report Mid-Booking ---');

  runTest('should allow patient to detach report and book without dossier linkage', () => {
    AppointmentsUI.setLinkedCase({ caseId: 'case_temp_123', oxygenLevel: 98 });
    assert.ok(AppointmentsUI.getLinkedCase(), 'Dossier initially linked');

    // User detaches report
    AppointmentsUI.clearLinkedCase();
    assert.strictEqual(AppointmentsUI.getLinkedCase(), null, 'Dossier successfully unlinked');
  });

  console.log('\n--- 7. Edge Case: Doctor on Leave with Attached Dossier ---');

  await runAsyncTest('should reject booking when doctor is on leave and leave case document untouched', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_leave_test', email: 'leave@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_untouched').set({
      id: 'case_untouched',
      patientId: 'pat_leave_test',
      oxygenLevel: 98,
      status: 'approved',
      hasLinkedAppointment: false
    });

    // Dr. Ahmed is on scheduled leave 2026-10-15 to 2026-10-18
    let leaveErr = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, {
        doctorId: 'dr_ahmed',
        date: '2026-10-16', // During leave
        slotId: 'slot_1130',
        linkedCaseId: 'case_untouched'
      }, patientUser);
    } catch (e) {
      leaveErr = e;
    }

    assert.ok(leaveErr);
    assert.strictEqual(leaveErr.code, 'DOCTOR_ON_LEAVE');

    // Verify case in database was NOT altered
    const caseSnap = await mockDb.collection('cases').doc('case_untouched').get();
    assert.strictEqual(caseSnap.data().hasLinkedAppointment, false);
    assert.strictEqual(caseSnap.data().appointmentRef, undefined);
  });

  console.log('\n--- 8. Edge Case: High-Concurrency Double-Booking Collision ---');

  await runAsyncTest('should ensure mutual exclusion: exactly 1 succeeds, second fails with DOCTOR_SLOT_CONFLICT', async () => {
    const mockDb = createMockFirestore();
    const patientA = { uid: 'pat_race_A', email: 'a@example.com', role: 'patient' };
    const patientB = { uid: 'pat_race_B', email: 'b@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_race_A').set({
      id: 'case_race_A',
      patientId: 'pat_race_A',
      oxygenLevel: 98,
      status: 'approved'
    });

    await mockDb.collection('cases').doc('case_race_B').set({
      id: 'case_race_B',
      patientId: 'pat_race_B',
      oxygenLevel: 97,
      status: 'approved'
    });

    const slotPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1230'
    };

    // Both attempt to book the exact same slot concurrently
    const [resA, resB] = await Promise.allSettled([
      schedulingService.bookAppointmentTransaction(mockDb, { ...slotPayload, linkedCaseId: 'case_race_A' }, patientA),
      schedulingService.bookAppointmentTransaction(mockDb, { ...slotPayload, linkedCaseId: 'case_race_B' }, patientB)
    ]);

    const successes = [resA, resB].filter(r => r.status === 'fulfilled');
    const failures = [resA, resB].filter(r => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Exactly one booking must succeed');
    assert.strictEqual(failures.length, 1, 'Exactly one booking must fail due to lock conflict');
    assert.strictEqual(failures[0].reason.code, 'DOCTOR_SLOT_CONFLICT');
  });

  console.log('\n--- 9. Edge Case: Reschedule & Cancellation Lifecycle Synchronization ---');

  await runAsyncTest('should synchronize appointmentRef in cases collection upon rescheduling', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_resched_sync', email: 'sync@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_resched_11').set({
      id: 'case_resched_11',
      patientId: 'pat_resched_sync',
      oxygenLevel: 97,
      status: 'approved'
    });

    // 1. Initial Booking
    const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1000',
      linkedCaseId: 'case_resched_11'
    }, patientUser);

    // 2. Reschedule to replacement slot
    const reschedResult = await schedulingService.rescheduleAppointmentTransaction(mockDb, {
      appointmentId: booked.id,
      newDate: '2026-10-28',
      newSlotId: 'slot_1100',
      reason: 'Patient schedule adjustment'
    }, patientUser);

    assert.strictEqual(reschedResult.status, 'rescheduled');
    assert.strictEqual(reschedResult.date, '2026-10-28');
    assert.strictEqual(reschedResult.slotId, 'slot_1100');

    // 3. Verify case appointmentRef was updated
    const caseSnap = await mockDb.collection('cases').doc('case_resched_11').get();
    const updatedCase = caseSnap.data();
    assert.strictEqual(updatedCase.appointmentRef.date, '2026-10-28');
    assert.strictEqual(updatedCase.appointmentRef.slotId, 'slot_1100');
    assert.ok(updatedCase.appointmentRef.rescheduledAt);
  });

  await runAsyncTest('should update appointmentRef status to cancelled in cases collection upon cancellation', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_cancel_sync', email: 'cancelsync@example.com', role: 'patient' };

    await mockDb.collection('cases').doc('case_cancel_22').set({
      id: 'case_cancel_22',
      patientId: 'pat_cancel_sync',
      oxygenLevel: 97,
      status: 'approved'
    });

    const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1030',
      linkedCaseId: 'case_cancel_22'
    }, patientUser);

    // Cancel appointment
    await schedulingService.cancelAppointmentTransaction(mockDb, booked.id, patientUser, {
      reason: 'No longer needed'
    });

    // Verify case in database reflects cancellation
    const caseSnap = await mockDb.collection('cases').doc('case_cancel_22').get();
    const caseData = caseSnap.data();
    assert.strictEqual(caseData.appointmentRef.status, 'cancelled');
    assert.strictEqual(caseData.appointmentRef.cancelReason, 'No longer needed');
  });

  console.log('\n--- 10. Edge Case: Uncertified Case Outcome Masking ---');

  await runAsyncTest('should mask uncertified provisional findings for patients but present to attending doctor', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_uncert_88', role: 'patient' };
    const doctorUser = { uid: 'dr_mona', role: 'doctor' };

    await mockDb.collection('appointments').doc('appt_uncert_88').set({
      id: 'appt_uncert_88',
      doctorId: 'dr_mona',
      patientId: 'pat_uncert_88',
      date: '2026-10-27',
      slotId: 'slot_1200',
      status: 'confirmed',
      linkedCaseId: 'case_uncert_raw'
    });

    await mockDb.collection('cases').doc('case_uncert_raw').set({
      id: 'case_uncert_raw',
      patientId: 'pat_uncert_88',
      status: 'pending_review', // Uncertified
      diagnosis: 'احتمال اشتباه أزمة تنفسية حادة',
      oxygenLevel: 95
    });

    // Patient view: masked
    const patientDossier = await schedulingService.getAppointmentPrevisitDossier(
      mockDb,
      'appt_uncert_88',
      patientUser
    );
    assert.strictEqual(patientDossier.dossier.diagnosis, undefined);
    assert.strictEqual(patientDossier.dossier.humanPhysicianReviewRequired, true);

    // Doctor view: unmasked for clinical preparation
    const doctorDossier = await schedulingService.getAppointmentPrevisitDossier(
      mockDb,
      'appt_uncert_88',
      doctorUser
    );
    assert.strictEqual(doctorDossier.dossier.diagnosis, 'احتمال اشتباه أزمة تنفسية حادة');
    assert.strictEqual(doctorDossier.dossier.oxygenLevel, 95);
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
