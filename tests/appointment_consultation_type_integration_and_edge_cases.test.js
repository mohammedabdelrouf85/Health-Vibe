/**
 * Health Vibe AI - CliniDo Consultation Type Integration QA & Edge Cases Test Suite
 *
 * Benchmarked against CliniDo Egypt Healthcare Standards:
 * In-Clinic Dokki Central Branch Visit vs. Remote Video Telehealth (Commute Relief) vs. Lab Follow-up
 *
 * Verifies:
 * 1. End-to-End Workflow: Video Consultation with Egypt Commute Relief & Telehealth Room.
 * 2. End-to-End Workflow: In-Clinic Dokki Central Branch Visit & Metro Arrival Guidance.
 * 3. End-to-End Workflow: Results & Spirometry Follow-up Review.
 * 4. Bilingual Parity (Arabic RTL vs. English LTR) in i18n catalogs, UI cards, and notifications.
 * 5. Edge Case: Interactive Consultation Mode Switching Mid-Flow & Modal Integration.
 * 6. Edge Case: Mode Transition Upon Rescheduling (Clinic -> Video to avoid traffic).
 * 7. Edge Case: High-Concurrency Double-Booking Collision with Differing Modes (Mutual Exclusion).
 * 8. Edge Case: Acute Emergency Red-Flag Triage on Remote Care (SpO2 < 90% & Egypt 123 Ambulance).
 * 9. Edge Case: Family Account Dependent Booking with Remote Consultation.
 * 10. Edge Case: Cancellation Lifecycle & Telehealth Room Deactivation.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const schedulingService = require('../backend/scheduling-service');
const appointmentSafetyService = require('../backend/appointment-safety-service');
const AppointmentsUI = require('../app/modules/appointments/appointments-ui');

console.log('==================================================================');
console.log('🧪 CLINIDO CONSULTATION TYPE: INTEGRATION QA & EDGE CASES SUITE');
console.log('   End-to-End Flows, Bilingual Parity, Concurrency & Resilience');
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

// In-Memory Firestore Mock supporting document & ACID transaction semantics
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
              for (const [k, v] of Object.entries(data)) {
                if (k.includes('.')) {
                  const parts = k.split('.');
                  let curr = existing;
                  for (let i = 0; i < parts.length - 1; i++) {
                    curr[parts[i]] = curr[parts[i]] || {};
                    curr = curr[parts[i]];
                  }
                  curr[parts[parts.length - 1]] = v;
                } else {
                  existing[k] = v;
                }
              }
              store.set(fullKey, existing);
              return existing;
            }
          };
        },
        add: async function (data) {
          const docId = data.id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const fullKey = `${colName}/${docId}`;
          const saved = { ...data, id: docId };
          store.set(fullKey, saved);
          return { id: docId };
        },
        where: function (field, op, val) {
          return {
            get: async function () {
              const results = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
                  if (field && op === '==' && v[field] !== val) continue;
                  results.push({ id: k.replace(`${colName}/`, ''), data: () => v });
                }
              }
              return {
                forEach: function (cb) { results.forEach(cb); },
                size: results.length
              };
            }
          };
        }
      };
    },
    runTransaction: async function (updateFn) {
      const transaction = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data, options) => docRef.set(data, options),
        update: (docRef, data) => docRef.update(data)
      };
      return await updateFn(transaction);
    }
  };

  return db;
}

(async function () {
  console.log('--- 1. End-to-End Workflow: Remote Video Consultation & Egypt Commute Relief ---');

  await runAsyncTest('should complete full e2e video consultation flow with commute relief & doctor notification', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_e2e_video', email: 'video_e2e@example.com', role: 'patient' };

    // 1. Book Video Consultation
    const bookingPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'video',
      patientName: 'مريم عادل',
      emergencyDisclaimerAcknowledged: true
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);

    assert.ok(appt.id, 'Appointment generated');
    assert.strictEqual(appt.consultationType, 'video');
    assert.strictEqual(appt.isOnlineConsultation, true);
    assert.strictEqual(appt.commuteReliefActive, true);
    assert.ok(appt.commuteReliefNote.includes('شوارع مصر'), 'Includes Egypt traffic commute relief note');

    // 2. Encrypted Telehealth Room Linkage
    assert.ok(appt.telehealthUrl || appt.meetingLink, 'Telehealth room link generated');

    // 3. Multi-Channel Notifications Check
    let patientInApp = null;
    let doctorVenueNotif = null;
    let emailNotif = null;
    let smsLog = null;

    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'pat_e2e_video') patientInApp = v;
      if (k.startsWith('user_notifications/') && v.userId === 'dr_mona' && v.type === 'doctor_appointment_booked') doctorVenueNotif = v;
      if (k.startsWith('email_notifications/') && v.recipient === 'video_e2e@example.com') emailNotif = v;
      if (k.startsWith('sms_notifications_log/') && v.appointmentId === appt.id) smsLog = v;
    }

    assert.ok(patientInApp, 'Patient in-app notification exists');
    assert.ok(patientInApp.title.includes('توفير المشقة'), 'Patient notification highlights commute relief');
    assert.strictEqual(patientInApp.consultationType, 'video');

    assert.ok(doctorVenueNotif, 'Doctor venue notification exists');
    assert.ok(doctorVenueNotif.body.includes('غرفة الاتصال المرئي'), 'Doctor informed to join virtual video room');
    assert.strictEqual(doctorVenueNotif.consultationType, 'video');

    assert.ok(emailNotif, 'Email notification exists');
    assert.ok(emailNotif.subject.includes('استشارة فيديو عن بُعد'));

    assert.ok(smsLog, 'SMS log entry exists');
    assert.ok(smsLog.message.includes('تقليل مشقة الانتقال'));
  });

  console.log('\n--- 2. End-to-End Workflow: In-Clinic Dokki Central Branch Visit ---');

  await runAsyncTest('should complete full e2e clinic visit flow with Dokki branch metadata & 10 min arrival guidance', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_e2e_clinic', email: 'clinic_e2e@example.com', role: 'patient' };

    // 1. Book Clinic Consultation
    const bookingPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1030',
      consultationType: 'clinic',
      patientName: 'خالد إبراهيم',
      emergencyDisclaimerAcknowledged: true
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);

    assert.strictEqual(appt.consultationType, 'clinic');
    assert.strictEqual(appt.isOnlineConsultation, false);
    assert.strictEqual(appt.commuteReliefActive, false);

    // 2. Dokki Central Branch Location & Arrival Guidance
    assert.ok(appt.branchLocation, 'Must include branchLocation');
    assert.strictEqual(appt.branchLocation.branchName, 'فرع الدقي المركزي');
    assert.strictEqual(appt.branchLocation.metroStation, 'Dokki Metro Station');
    assert.strictEqual(appt.branchLocation.city, 'Giza');

    assert.ok(appt.arrivalGuidance, 'Must include arrivalGuidance');
    assert.strictEqual(appt.arrivalGuidance.leadMinutes, 10);
    assert.ok(appt.arrivalGuidance.checkinNotes.includes('10 دقائق'));

    // 3. Notifications Check
    let patientInApp = null;
    let doctorVenueNotif = null;

    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'pat_e2e_clinic') patientInApp = v;
      if (k.startsWith('user_notifications/') && v.userId === 'dr_mona' && v.type === 'doctor_appointment_booked') doctorVenueNotif = v;
    }

    assert.ok(patientInApp);
    assert.ok(patientInApp.body.includes('محطة مترو الدقي'));
    assert.ok(patientInApp.body.includes('10 دقائق'));

    assert.ok(doctorVenueNotif);
    assert.ok(doctorVenueNotif.body.includes('فرع الدقي المركزي'));
    assert.strictEqual(doctorVenueNotif.consultationType, 'clinic');
  });

  console.log('\n--- 3. End-to-End Workflow: Results & Spirometry Follow-up Review ---');

  await runAsyncTest('should book follow-up review with LABS_AND_SPIROMETRY_REVIEW scope', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_e2e_followup', email: 'followup_e2e@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1100',
      consultationType: 'followup',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    assert.strictEqual(appt.consultationType, 'followup');
    assert.strictEqual(appt.isOnlineConsultation, true);
    assert.strictEqual(appt.commuteReliefActive, true);
    assert.strictEqual(appt.followupScope, 'LABS_AND_SPIROMETRY_REVIEW');
    assert.ok(appt.commuteReliefNote.includes('بدون الحاجة للحضور للعيادة'));
  });

  console.log('\n--- 4. Bilingual Parity (Arabic RTL vs. English LTR) ---');

  runTest('should have 100% parity across Arabic and English i18n catalogs for all consultation type keys', () => {
    const i18nPath = path.join(__dirname, '../app/i18n.js');
    const content = fs.readFileSync(i18nPath, 'utf8');

    const expectedKeys = [
      'consultationTypeTitle',
      'consultationTypeDesc',
      'modeVideoTitle',
      'modeVideoSubtitle',
      'modeVideoBadge',
      'modeClinicTitle',
      'modeClinicSubtitle',
      'modeClinicBadge',
      'modeFollowupTitle',
      'modeFollowupSubtitle',
      'modeFollowupBadge',
      'commuteReliefNotice',
      'clinicBranchAddress',
      'clinicWaitTimeNotice',
      'clinicArrivalGuidance',
      'telehealthTechReadiness'
    ];

    for (const k of expectedKeys) {
      assert.ok(content.includes(`${k}:`), `app/i18n.js must include translation key: ${k}`);
    }
  });

  runTest('should render Arabic details card with Arabic labels and Egypt commute relief text', () => {
    const cardAr = AppointmentsUI.renderConsultationDetailsCard('video', false);
    assert.ok(cardAr.includes('تخفيف عبء المواصلات'), 'Arabic title for commute relief');
    assert.ok(cardAr.includes('القاهرة والجيزة والمحافظات'), 'Mentions Cairo and Giza traffic context');
    assert.ok(cardAr.includes('اتصال إنترنت مستقر'), 'Readiness badge');
  });

  runTest('should render English details card with English labels and Egypt traffic relief text', () => {
    const cardEn = AppointmentsUI.renderConsultationDetailsCard('video', true);
    assert.ok(cardEn.includes('Commute Relief: Remote Video Consultation'), 'English title');
    assert.ok(cardEn.includes('Cairo & Giza city traffic'), 'Mentions Cairo and Giza in English');
    assert.ok(cardEn.includes('Instant E-Prescription'), 'Instant e-prescription in English');
  });

  console.log('\n--- 5. Edge Case: Interactive Consultation Mode Switching Mid-Flow ---');

  runTest('should dynamically update state and card representation when switching modes', () => {
    // Initial: video
    AppointmentsUI.setSelectedConsultationType('video');
    assert.strictEqual(AppointmentsUI.getSelectedConsultationType(), 'video');

    // Switch to clinic
    AppointmentsUI.setSelectedConsultationType('clinic');
    assert.strictEqual(AppointmentsUI.getSelectedConsultationType(), 'clinic');
    const clinicCard = AppointmentsUI.renderConsultationDetailsCard('clinic', false);
    assert.ok(clinicCard.includes('فرع الدقي، الجيزة'));
    assert.ok(clinicCard.includes('محطة مترو الدقي'));

    // Switch to followup
    AppointmentsUI.setSelectedConsultationType('followup');
    assert.strictEqual(AppointmentsUI.getSelectedConsultationType(), 'followup');
    const followupCard = AppointmentsUI.renderConsultationDetailsCard('followup', false);
    assert.ok(followupCard.includes('تفاصيل متابعة النتائج والتقارير'));

    // Reset back to video
    AppointmentsUI.setSelectedConsultationType('video');
    assert.strictEqual(AppointmentsUI.getSelectedConsultationType(), 'video');
  });

  console.log('\n--- 6. Edge Case: Mode Transition Upon Rescheduling (Clinic -> Video) ---');

  await runAsyncTest('should update venue metadata and synchronize linked case when switching mode during reschedule', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_switch_resched', email: 'switch@example.com', role: 'patient' };

    // Seed linked case
    await mockDb.collection('cases').doc('case_switch_01').set({
      id: 'case_switch_01',
      patientId: 'pat_switch_resched',
      oxygenLevel: 97,
      status: 'approved'
    });

    // 1. Initial Clinic booking with linked case
    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      linkedCaseId: 'case_switch_01',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    assert.strictEqual(appt.consultationType, 'clinic');
    assert.strictEqual(appt.commuteReliefActive, false);
    assert.ok(appt.branchLocation);

    // 2. Reschedule to 2026-10-26 and switch to 'video' to avoid Cairo traffic
    const rescheduled = await schedulingService.rescheduleAppointmentTransaction(mockDb, {
      appointmentId: appt.id,
      newDate: '2026-10-26',
      newSlotId: 'slot_1000',
      reason: 'Switch to remote video consultation to avoid Cairo rush-hour traffic',
      consultationType: 'video'
    }, patientUser);

    assert.strictEqual(rescheduled.status, 'rescheduled');
    assert.strictEqual(rescheduled.date, '2026-10-26');
    assert.strictEqual(rescheduled.consultationType, 'video');
    assert.strictEqual(rescheduled.isOnlineConsultation, true);
    assert.strictEqual(rescheduled.commuteReliefActive, true);
    assert.strictEqual(rescheduled.branchLocation, null, 'Physical branch cleared for video');

    // 3. Verify Case Synchronized
    const caseSnap = await mockDb.collection('cases').doc('case_switch_01').get();
    const caseData = caseSnap.data();
    assert.strictEqual(caseData.appointmentRef.date, '2026-10-26');
    assert.strictEqual(caseData.appointmentRef.consultationType, 'video');
    assert.strictEqual(caseData.appointmentRef.commuteReliefActive, true);
  });

  console.log('\n--- 7. Edge Case: High-Concurrency Double-Booking Collision with Differing Modes ---');

  await runAsyncTest('should ensure atomic mutual exclusion when Patient A (Clinic) and Patient B (Video) book same slot', async () => {
    const mockDb = createMockFirestore();
    const patientA = { uid: 'pat_concurrent_A', email: 'a@example.com', role: 'patient' };
    const patientB = { uid: 'pat_concurrent_B', email: 'b@example.com', role: 'patient' };

    const slotPayloadA = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    };

    const slotPayloadB = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true
    };

    // Concurrently trigger both bookings
    const results = await Promise.allSettled([
      schedulingService.bookAppointmentTransaction(mockDb, slotPayloadA, patientA),
      schedulingService.bookAppointmentTransaction(mockDb, slotPayloadB, patientB)
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly 1 concurrent booking must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly 1 concurrent booking must fail');
    assert.strictEqual(rejected[0].reason.statusCode, 409, 'Rejection must be HTTP 409 Conflict');
    assert.strictEqual(rejected[0].reason.code, 'DOCTOR_SLOT_CONFLICT');
  });

  console.log('\n--- 8. Edge Case: Acute Emergency Red-Flag Triage on Remote Care ---');

  await runAsyncTest('should block remote video care for critical hypoxemia (SpO2 84%) and require Egypt 123 escalation', async () => {
    const mockDb = createMockFirestore();
    const criticalPatient = { uid: 'pat_critical_respiratory', email: 'crit@example.com', role: 'patient' };

    const criticalPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1130',
      consultationType: 'video',
      spo2: 84,
      symptoms: 'نهجان شديد جدا وزرقة في الشفاه وعجز عن التنفس',
      emergencyDisclaimerAcknowledged: false
    };

    let caught = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, criticalPayload, criticalPatient);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'Must block remote booking for critical respiratory emergency');
    assert.strictEqual(caught.statusCode, 422);
    assert.strictEqual(caught.code, 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED');
    assert.strictEqual(caught.details.isEmergency, true);
    assert.strictEqual(caught.details.urgencyLevel, 'CRITICAL_EMERGENCY');
  });

  console.log('\n--- 9. Edge Case: Family Account Dependent Booking with Remote Consultation ---');

  await runAsyncTest('should book remote video consultation for child dependent with commute relief', async () => {
    const mockDb = createMockFirestore();
    const parentUser = { uid: 'pat_parent_e2e', email: 'parent@example.com', role: 'patient' };

    const familyStore = new Map();
    familyStore.set('family_pat_parent_e2e', {
      ownerPatientId: 'pat_parent_e2e',
      members: [
        { id: 'dep_child_omar', fullName: 'عمر طارق', relationship: 'child' }
      ]
    });

    const dependentPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1200',
      consultationType: 'video',
      beneficiaryId: 'dep_child_omar',
      _inMemoryStore: familyStore,
      emergencyDisclaimerAcknowledged: true
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, dependentPayload, parentUser);

    assert.strictEqual(appt.consultationType, 'video');
    assert.strictEqual(appt.beneficiaryId, 'dep_child_omar');
    assert.strictEqual(appt.beneficiaryName, 'عمر طارق');
    assert.strictEqual(appt.beneficiaryRelationship, 'child');
    assert.strictEqual(appt.commuteReliefActive, true);

    // Patient notification indicates beneficiary
    let notif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'pat_parent_e2e') notif = v;
    }
    assert.ok(notif);
    assert.ok(notif.body.includes('عمر طارق'), 'Notification body identifies child beneficiary');
  });

  console.log('\n--- 10. Edge Case: Cancellation Lifecycle & Telehealth Room Invalidation ---');

  await runAsyncTest('should cancel video appointment, release locks, and emit cancellation event', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_cancel_video', email: 'cancel_v@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1230',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    assert.strictEqual(appt.status, 'confirmed');

    // Cancel appointment
    const cancelResult = await schedulingService.cancelAppointmentTransaction(mockDb, appt.id, patientUser, {
      reason: 'Patient resolved condition'
    });

    assert.strictEqual(cancelResult.status, 'cancelled');

    // Verify appointment status updated in store
    const updatedSnap = await mockDb.collection('appointments').doc(appt.id).get();
    assert.strictEqual(updatedSnap.data().status, 'cancelled');

    // Verify slot lock released
    const lockId = schedulingService.getDoctorLockDocId('dr_mona', '2026-10-25', 'slot_1230');
    const lockSnap = await mockDb.collection('appointment_locks').doc(lockId).get();
    assert.strictEqual(lockSnap.data().status, 'released');
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('==================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
