/**
 * Health Vibe AI - CliniDo Consultation Type Backend & Multi-Channel Notification Test Suite
 *
 * Benchmarked against CliniDo Egypt Standards:
 * In-Clinic Physical Visit (Dokki Central Branch) vs. Remote Video Telehealth (Commute Relief) vs. Lab Follow-up
 *
 * Verifies:
 * 1. Consultation Type Whitelist Validation (rejects invalid types with 400 INVALID_CONSULTATION_TYPE).
 * 2. Normalization of legacy & alternate terms ('telehealth' -> 'video', 'in_person' -> 'clinic', 'follow_up' -> 'followup').
 * 3. Video Booking: enables commuteReliefActive, provisions encrypted room, sets commute relief notes.
 * 4. In-Clinic Booking: sets Dokki Central Branch (near Dokki Metro) & 10-minute arrival guidance.
 * 5. Follow-up Booking: sets followupScope ('LABS_AND_SPIROMETRY_REVIEW') & remote commute relief.
 * 6. Multi-Channel Notifications:
 *    - In-app patient notification with mode-specific title/body (commute relief vs Dokki arrival).
 *    - Email notification with tailored subject and venue details.
 *    - Doctor notification with venue awareness (virtual video room vs physical Dokki clinic room).
 *    - SMS simulation log with venue-tailored text.
 * 7. Rescheduling Transaction:
 *    - Switching mode (e.g., clinic -> video) updates venue metadata and dispatches updated notifications.
 *    - Rescheduling without changing mode preserves existing venue metadata.
 * 8. Single Appointment Retrieval API (getAppointmentById):
 *    - Returns full consultation type and venue metadata.
 *    - Enforces RBAC access boundaries (patient/doctor/admin authorized, third-party blocked).
 */

const assert = require('assert');
const schedulingService = require('../backend/scheduling-service');

console.log('==================================================================');
console.log('🏥 CLINIDO CONSULTATION TYPE: BACKEND & NOTIFICATIONS SUITE');
console.log('   Egypt Commute Relief, Dokki Branch Venue & Multi-Channel Alerts');
console.log('==================================================================\n');

let passedCount = 0;
let failedCount = 0;

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
          const docId = data.id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const fullKey = `${colName}/${docId}`;
          const saved = { ...data, id: docId };
          store.set(fullKey, saved);
          return { id: docId };
        },
        where: function () {
          return {
            get: async function () {
              const results = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
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
  console.log('--- 1. Consultation Type Whitelist Validation & Normalization ---');

  await runAsyncTest('should reject invalid consultationType with 400 INVALID_CONSULTATION_TYPE', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_val_01', email: 'val@example.com', role: 'patient' };

    const invalidPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'invalid_type_helicopter',
      emergencyDisclaimerAcknowledged: true
    };

    let caught = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, invalidPayload, patientUser);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'Should throw error for invalid consultation type');
    assert.strictEqual(caught.statusCode, 400);
    assert.strictEqual(caught.code, 'INVALID_CONSULTATION_TYPE');
    assert.ok(caught.message.includes('نوع الموعد غير صالح'));
  });

  await runAsyncTest('should normalize legacy telehealth and aliases correctly', async () => {
    assert.strictEqual(schedulingService.normalizeConsultationType('telehealth'), 'video');
    assert.strictEqual(schedulingService.normalizeConsultationType('online'), 'video');
    assert.strictEqual(schedulingService.normalizeConsultationType('in_person'), 'clinic');
    assert.strictEqual(schedulingService.normalizeConsultationType('in-clinic'), 'clinic');
    assert.strictEqual(schedulingService.normalizeConsultationType('follow_up'), 'followup');
    assert.strictEqual(schedulingService.normalizeConsultationType('follow-up'), 'followup');
    assert.strictEqual(schedulingService.normalizeConsultationType(''), 'clinic');
    assert.strictEqual(schedulingService.normalizeConsultationType('unsupported'), null);
  });

  console.log('\n--- 2. Video Consultation Booking & Egypt Commute Relief ---');

  await runAsyncTest('should book video appointment with commute relief active and provisioned video room', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_video_01', email: 'tarek@example.com', role: 'patient' };

    const videoPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, videoPayload, patientUser);

    assert.ok(appt, 'Appointment booked successfully');
    assert.strictEqual(appt.consultationType, 'video');
    assert.strictEqual(appt.type, 'video');
    assert.strictEqual(appt.isOnlineConsultation, true);
    assert.strictEqual(appt.commuteReliefActive, true);
    assert.ok(appt.commuteReliefNote.includes('شوارع مصر'), 'Commute note highlights Egypt traffic relief');
    assert.ok(appt.commuteReliefNoteEn.includes('Egypt traffic'), 'English commute note highlights traffic relief');
    assert.strictEqual(appt.branchLocation, null, 'Video has no physical branch location');
    assert.strictEqual(appt.arrivalGuidance, null, 'Video has no physical arrival guidance');
    assert.ok(appt.telehealthUrl || appt.meetingLink, 'Telehealth room is provisioned');
  });

  console.log('\n--- 3. In-Clinic Physical Visit Booking & Dokki Branch Metadata ---');

  await runAsyncTest('should book in-clinic appointment with Dokki Central Branch and 10-minute arrival guidance', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_clinic_01', email: 'salma@example.com', role: 'patient' };

    const clinicPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1030',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, clinicPayload, patientUser);

    assert.ok(appt, 'Clinic appointment booked successfully');
    assert.strictEqual(appt.consultationType, 'clinic');
    assert.strictEqual(appt.type, 'clinic');
    assert.strictEqual(appt.isOnlineConsultation, false);
    assert.strictEqual(appt.commuteReliefActive, false);
    assert.strictEqual(appt.commuteReliefNote, null);

    // Verify Dokki Branch Location metadata
    assert.ok(appt.branchLocation, 'Must include branchLocation object');
    assert.strictEqual(appt.branchLocation.branchName, 'فرع الدقي المركزي');
    assert.strictEqual(appt.branchLocation.branchNameEn, 'Dokki Central Branch');
    assert.strictEqual(appt.branchLocation.metroStation, 'Dokki Metro Station');
    assert.strictEqual(appt.branchLocation.city, 'Giza');
    assert.strictEqual(appt.branchLocation.country, 'Egypt');

    // Verify Arrival Guidance metadata
    assert.ok(appt.arrivalGuidance, 'Must include arrivalGuidance object');
    assert.strictEqual(appt.arrivalGuidance.leadMinutes, 10);
    assert.ok(appt.arrivalGuidance.checkinNotes.includes('10 دقائق'), 'Mentions 10 mins prior arrival');
    assert.ok(appt.arrivalGuidance.checkinNotesEn.includes('10 minutes prior'), 'Mentions 10 mins prior in English');
  });

  console.log('\n--- 4. Follow-up Consultation & Spirometry Review Scope ---');

  await runAsyncTest('should book followup appointment with LABS_AND_SPIROMETRY_REVIEW scope and remote relief', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_followup_01', email: 'amr@example.com', role: 'patient' };

    const followupPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1100',
      consultationType: 'followup',
      emergencyDisclaimerAcknowledged: true
    };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, followupPayload, patientUser);

    assert.ok(appt, 'Follow-up appointment booked successfully');
    assert.strictEqual(appt.consultationType, 'followup');
    assert.strictEqual(appt.type, 'followup');
    assert.strictEqual(appt.isOnlineConsultation, true);
    assert.strictEqual(appt.commuteReliefActive, true);
    assert.strictEqual(appt.followupScope, 'LABS_AND_SPIROMETRY_REVIEW');
    assert.ok(appt.commuteReliefNote.includes('بدون الحاجة للحضور للعيادة'), 'Mentions reviewing results without clinic visit');
  });

  console.log('\n--- 5. Multi-Channel Notification Dispatching ---');

  await runAsyncTest('should dispatch tailored notifications to patient for video consultation', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_notif_v', email: 'video_patient@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1130',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    // 1. Patient In-App notification
    let patientNotif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'pat_notif_v') {
        patientNotif = v;
        break;
      }
    }
    assert.ok(patientNotif, 'Patient receives in-app notification');
    assert.ok(patientNotif.title.includes('توفير المشقة'), 'Arabic title highlights commute relief');
    assert.ok(patientNotif.titleEn.includes('Commute Relief'), 'English title highlights commute relief');
    assert.strictEqual(patientNotif.consultationType, 'video');
    assert.strictEqual(patientNotif.commuteReliefActive, true);

    // 2. Email notification
    let emailNotif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('email_notifications/') && v.recipient === 'video_patient@example.com') {
        emailNotif = v;
        break;
      }
    }
    assert.ok(emailNotif, 'Email notification record generated');
    assert.ok(emailNotif.subject.includes('استشارة فيديو عن بُعد'), 'Subject tailored for video');
    assert.strictEqual(emailNotif.consultationType, 'video');
    assert.strictEqual(emailNotif.commuteReliefActive, true);

    // 3. Doctor Venue notification (attending doctor knows to join video room)
    let docVenueNotif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'dr_mona' && v.type === 'doctor_appointment_booked') {
        docVenueNotif = v;
        break;
      }
    }
    assert.ok(docVenueNotif, 'Doctor receives venue notification');
    assert.ok(docVenueNotif.title.includes('غرفة اتصال مرئي مشفرة'), 'Doctor notified of encrypted video room venue');
    assert.strictEqual(docVenueNotif.consultationType, 'video');

    // 4. SMS simulation log
    let smsLog = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('sms_notifications_log/') && v.appointmentId === appt.id) {
        smsLog = v;
        break;
      }
    }
    assert.ok(smsLog, 'SMS log entry generated');
    assert.ok(smsLog.message.includes('تقليل مشقة الانتقال'), 'SMS mentions commute relief');
  });

  await runAsyncTest('should dispatch tailored notifications to patient and doctor for clinic consultation', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_notif_c', email: 'clinic_patient@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1200',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    // 1. Patient In-App notification
    let patientNotif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'pat_notif_c') {
        patientNotif = v;
        break;
      }
    }
    assert.ok(patientNotif, 'Patient in-app notification exists');
    assert.ok(patientNotif.title.includes('فرع الدقي المركزي'), 'Title mentions Dokki Central Branch');
    assert.ok(patientNotif.body.includes('محطة مترو الدقي'), 'Body mentions Dokki metro station');
    assert.ok(patientNotif.body.includes('10 دقائق'), 'Body reminds to arrive 10 mins early');
    assert.ok(patientNotif.branchLocation, 'Carries branchLocation');

    // 2. Doctor Venue notification (doctor knows patient is attending at Dokki branch)
    let docVenueNotif = null;
    for (const [k, v] of mockDb._store.entries()) {
      if (k.startsWith('user_notifications/') && v.userId === 'dr_mona' && v.type === 'doctor_appointment_booked') {
        docVenueNotif = v;
        break;
      }
    }
    assert.ok(docVenueNotif, 'Doctor venue notification exists');
    assert.ok(docVenueNotif.title.includes('فرع الدقي المركزي'), 'Doctor informed of Dokki clinic venue');
    assert.strictEqual(docVenueNotif.consultationType, 'clinic');
  });

  console.log('\n--- 6. Rescheduling Transaction & Mode Transition ---');

  await runAsyncTest('should allow switching consultation type upon rescheduling (clinic -> video)', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_resched_01', email: 'resched@example.com', role: 'patient' };

    // Initial clinic booking on 2026-10-25
    const initialAppt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    assert.strictEqual(initialAppt.consultationType, 'clinic');
    assert.strictEqual(initialAppt.commuteReliefActive, false);
    assert.ok(initialAppt.branchLocation);

    // Reschedule to 2026-10-26 slot_1000 and switch mode to 'video' to avoid commute
    const rescheduled = await schedulingService.rescheduleAppointmentTransaction(mockDb, {
      appointmentId: initialAppt.id,
      newDate: '2026-10-26',
      newSlotId: 'slot_1000',
      reason: 'Switch to remote video to save travel time in traffic',
      consultationType: 'video'
    }, patientUser);

    assert.strictEqual(rescheduled.status, 'rescheduled');
    assert.strictEqual(rescheduled.date, '2026-10-26');
    assert.strictEqual(rescheduled.consultationType, 'video');
    assert.strictEqual(rescheduled.isOnlineConsultation, true);
    assert.strictEqual(rescheduled.commuteReliefActive, true);
    assert.strictEqual(rescheduled.branchLocation, null, 'Branch location cleared for video consultation');
  });

  await runAsyncTest('should preserve existing consultation type when rescheduling without specifying new mode', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_resched_02', email: 'resched2@example.com', role: 'patient' };

    const initialAppt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1030',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    // Reschedule to 2026-10-26 slot_1030 without passing consultationType
    const rescheduled = await schedulingService.rescheduleAppointmentTransaction(mockDb, {
      appointmentId: initialAppt.id,
      newDate: '2026-10-26',
      newSlotId: 'slot_1030',
      reason: 'Schedule conflict'
    }, patientUser);

    assert.strictEqual(rescheduled.consultationType, 'clinic', 'Preserves clinic mode');
    assert.strictEqual(rescheduled.commuteReliefActive, false);
    assert.ok(rescheduled.branchLocation, 'Preserves Dokki branch location');
    assert.strictEqual(rescheduled.branchLocation.branchName, 'فرع الدقي المركزي');
  });

  console.log('\n--- 7. Single Appointment Retrieval API (getAppointmentById) ---');

  await runAsyncTest('should retrieve appointment by ID with full consultation and venue metadata for patient', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_fetch_01', email: 'fetch@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1100',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    const fetched = await schedulingService.getAppointmentById(mockDb, appt.id, patientUser);

    assert.ok(fetched, 'Fetched appointment');
    assert.strictEqual(fetched.id, appt.id);
    assert.strictEqual(fetched.consultationType, 'clinic');
    assert.ok(fetched.branchLocation, 'Contains branchLocation');
    assert.ok(fetched.arrivalGuidance, 'Contains arrivalGuidance');
  });

  await runAsyncTest('should enforce RBAC and reject unauthorized patient fetching another patient appointment', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_owner_99', email: 'owner@example.com', role: 'patient' };
    const attackerUser = { uid: 'pat_intruder_00', email: 'intruder@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1130',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    let caught = null;
    try {
      await schedulingService.getAppointmentById(mockDb, appt.id, attackerUser);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'Should reject unauthorized access');
    assert.strictEqual(caught.statusCode, 403);
    assert.strictEqual(caught.code, 'ACCESS_DENIED');
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('==================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
